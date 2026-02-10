#!/bin/bash
# ==============================================================================
# Pado LP Bot 배포 스크립트
# ==============================================================================
# 대상: staging.pado.finance 또는 pado.finance
# 기능: LP 봇 코드 배포 및 PM2로 시작/재시작
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="pado-bots"
APP_DIR="$MONOREPO_ROOT/apps/pado/bots"

# 서버 설정 (환경별)
declare -A STAGING=(
  [PEM_KEY]="$HOME/.ssh/.awskey/naru_seoul.pem"
  [USER]="ubuntu"
  [HOST]="ec2-15-165-19-180.ap-northeast-2.compute.amazonaws.com"
  [REMOTE_DIR]="/home/ubuntu/pado-bots"
)

declare -A PRODUCTION=(
  [PEM_KEY]="$HOME/.ssh/nasun-prod-key.pem"
  [USER]="ec2-user"
  [HOST]="43.200.67.52"
  [REMOTE_DIR]="/home/ec2-user/pado-bots"
)

# --- 옵션 파싱 ---
ENV="staging"
ACTION="deploy"

for arg in "$@"; do
  case $arg in
    --staging)
      ENV="staging"
      shift
      ;;
    --production|--prod)
      ENV="production"
      shift
      ;;
    --status)
      ACTION="status"
      shift
      ;;
    --logs)
      ACTION="logs"
      shift
      ;;
    --stop)
      ACTION="stop"
      shift
      ;;
    --restart)
      ACTION="restart"
      shift
      ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-pado-bots.sh [환경] [액션]"
      echo ""
      echo "환경:"
      echo "  --staging     스테이징 배포 (기본값)"
      echo "  --production  프로덕션 배포"
      echo ""
      echo "액션:"
      echo "  (없음)        코드 배포 및 PM2 재시작"
      echo "  --status      PM2 상태 확인"
      echo "  --logs        PM2 로그 확인"
      echo "  --stop        봇 중지"
      echo "  --restart     봇 재시작"
      echo ""
      echo "예시:"
      echo "  ./scripts/deploy-pado-bots.sh --staging"
      echo "  ./scripts/deploy-pado-bots.sh --production --status"
      exit 0
      ;;
  esac
done

# 환경 설정 선택
if [ "$ENV" = "production" ]; then
  PEM_KEY="${PRODUCTION[PEM_KEY]}"
  EC2_USER="${PRODUCTION[USER]}"
  EC2_HOST="${PRODUCTION[HOST]}"
  REMOTE_DIR="${PRODUCTION[REMOTE_DIR]}"
  ENV_DISPLAY="Production (pado.finance)"
else
  PEM_KEY="${STAGING[PEM_KEY]}"
  EC2_USER="${STAGING[USER]}"
  EC2_HOST="${STAGING[HOST]}"
  REMOTE_DIR="${STAGING[REMOTE_DIR]}"
  ENV_DISPLAY="Staging (staging.pado.finance)"
fi

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🤖 Pado LP Bot 배포                                       ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  환경: ${YELLOW}${ENV_DISPLAY}${NC}"
echo -e "${CYAN}║  액션: ${YELLOW}${ACTION}${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# SSH 키 확인
PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY")
test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"

# --- 액션 실행 ---
case $ACTION in
  status)
    log_info "PM2 상태 확인 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 status 2>/dev/null || echo '봇이 실행되지 않고 있습니다'"
    ;;

  logs)
    log_info "PM2 로그 (Ctrl+C로 종료)..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 logs --lines 50"
    ;;

  stop)
    log_info "봇 중지 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 stop all 2>/dev/null || echo '봇이 실행되지 않고 있습니다'"
    log_success "봇 중지됨"
    ;;

  restart)
    log_info "봇 재시작 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 restart all"
    log_success "봇 재시작됨"
    ;;

  deploy)
    START_TIME=$(date +%s)

    # Phase 1: 봇 코드 동기화
    log_step 1 4 "봇 코드 동기화"

    log_info "원격 디렉토리 생성 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "mkdir -p ${REMOTE_DIR}"

    log_info "봇 코드 동기화 중..."
    rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude '.env.*' \
      --exclude '.lp-bot-state-*.json' \
      --exclude 'data' \
      --exclude 'logs' \
      --exclude '*.log' \
      "$APP_DIR/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

    log_success "코드 동기화 완료"

    # Phase 2: 의존성 설치
    log_step 2 4 "의존성 설치"

    log_info "pnpm install 실행 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "cd ${REMOTE_DIR} && pnpm install --prod"
    log_success "의존성 설치 완료"

    # Phase 3: 환경변수 확인
    log_step 3 4 "환경변수 확인"

    ENV_CHECK=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      if [ -f ${REMOTE_DIR}/.env ]; then
        if grep -q 'LP_PRIVATE_KEY=' ${REMOTE_DIR}/.env 2>/dev/null; then
          echo 'OK'
        else
          echo 'MISSING_KEY'
        fi
      else
        echo 'NO_ENV'
      fi
    ")

    if [ "$ENV_CHECK" = "OK" ]; then
      log_success "환경변수 확인됨 (.env 파일에 LP_PRIVATE_KEY 설정됨)"
    else
      log_warning "환경변수가 설정되지 않았습니다!"
      echo ""
      echo -e "${YELLOW}서버에서 직접 설정해주세요:${NC}"
      echo "  ssh -i $PEM_KEY_EXPANDED ${EC2_USER}@${EC2_HOST}"
      echo "  echo 'LP_PRIVATE_KEY=your_key_here' > ${REMOTE_DIR}/.env"
      echo ""
      log_warning "환경변수 설정 후 --restart로 봇을 시작하세요"
    fi

    # Phase 4: PM2로 봇 시작
    log_step 4 4 "PM2 시작/재시작"

    log_info "PM2로 봇 시작 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      cd ${REMOTE_DIR}

      # .env 파일이 있으면 로드
      if [ -f .env ]; then
        set -a
        source .env
        set +a
      fi

      # PM2로 시작 (이미 실행 중이면 재시작)
      if pm2 list | grep -q 'lp-bot-nbtc'; then
        pm2 restart ecosystem.config.cjs
      else
        pm2 start ecosystem.config.cjs
      fi

      pm2 save
    "

    log_success "LP 봇 시작됨"

    # 상태 확인
    echo ""
    log_info "현재 상태:"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 status"

    # 완료 메시지
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  🎉 LP 봇 배포 완료!                                       ║${NC}"
    echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  서버: ${CYAN}${EC2_HOST}${NC}"
    echo -e "${GREEN}║  경로: ${CYAN}${REMOTE_DIR}${NC}"
    echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
    echo -e "${GREEN}║${NC}"
    echo -e "${GREEN}║  로그 확인: ${CYAN}pnpm deploy:pado:bots:${ENV} -- --logs${NC}"
    echo -e "${GREEN}║  상태 확인: ${CYAN}pnpm deploy:pado:bots:${ENV} -- --status${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    ;;
esac
