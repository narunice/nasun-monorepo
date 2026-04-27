#!/bin/bash
# ==============================================================================
# GoStop Bot 배포 스크립트
# ==============================================================================
# 대상: 프로덕션 EC2 (43.200.67.52, /home/ec2-user/gostop-bots)
# 기능: lottery-keeper 코드 동기화 및 PM2로 시작/재시작
# 단일 인스턴스 원칙: AdminCap owned object LockConflict 방지를 위해
#   prod에만 배포. staging에는 띄우지 않는다.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="gostop-bots"
APP_DIR="$MONOREPO_ROOT/apps/gostop/bots"

# Production EC2 (Pado 봇과 동일 인스턴스, 별도 디렉토리/PM2 프로세스)
PEM_KEY="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_DIR="/home/ec2-user/gostop-bots"

ACTION="deploy"
for arg in "$@"; do
  case $arg in
    --status)  ACTION="status";  shift ;;
    --logs)    ACTION="logs";    shift ;;
    --stop)    ACTION="stop";    shift ;;
    --restart) ACTION="restart"; shift ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-gostop-bots.sh [액션]"
      echo ""
      echo "액션:"
      echo "  (없음)        코드 배포 및 PM2 시작/재시작"
      echo "  --status      PM2 상태 확인"
      echo "  --logs        gostop-lottery-keeper 로그 tail"
      echo "  --stop        봇 중지"
      echo "  --restart     봇 재시작"
      exit 0
      ;;
  esac
done

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY")
test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🎰 GoStop Bot 배포 (Production)                           ║${NC}"
echo -e "${CYAN}║  액션: ${YELLOW}${ACTION}${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

case $ACTION in
  status)
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
      "pm2 describe gostop-lottery-keeper 2>/dev/null || echo '봇이 실행되지 않고 있습니다'"
    ;;

  logs)
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
      "pm2 logs gostop-lottery-keeper --lines 80"
    ;;

  stop)
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
      "pm2 stop gostop-lottery-keeper 2>/dev/null || echo 'not running'"
    log_success "봇 중지됨"
    ;;

  restart)
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      cd ${REMOTE_DIR}
      if [ -f .env ]; then
        set -a; source .env; set +a
      fi
      pm2 startOrRestart ecosystem.config.cjs
      pm2 save
    "
    log_success "봇 재시작됨"
    ;;

  deploy)
    START_TIME=$(date +%s)

    log_step 1 4 "코드 동기화"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "mkdir -p ${REMOTE_DIR}"
    rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" \
      --exclude 'node_modules' \
      --exclude '.env' \
      --exclude '.env.*' \
      --exclude 'logs' \
      --exclude '*.log' \
      "$APP_DIR/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

    # devnet-ids.json은 lib/lottery-config.ts에서 ../../devnet-ids.json 경로로 읽으므로
    # REMOTE_DIR의 부모(/home/ec2-user/)에 함께 동기화
    rsync -avz -e "ssh -i $PEM_KEY_EXPANDED" \
      "$MONOREPO_ROOT/apps/gostop/devnet-ids.json" \
      "${EC2_USER}@${EC2_HOST}:$(dirname ${REMOTE_DIR})/devnet-ids.json"
    log_success "코드 동기화 완료"

    log_step 2 4 "의존성 설치"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
      "cd ${REMOTE_DIR} && pnpm install --prod"
    log_success "의존성 설치 완료"

    log_step 3 4 "환경변수 확인"
    ENV_CHECK=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      if [ ! -f ${REMOTE_DIR}/.env ]; then
        echo 'NO_ENV'; exit 0
      fi
      if grep -q '^LOTTERY_ADMIN_KEY=' ${REMOTE_DIR}/.env; then
        echo 'OK'
      else
        echo 'MISSING:LOTTERY_ADMIN_KEY'
      fi
    ")

    if [ "$ENV_CHECK" = "OK" ]; then
      log_success "LOTTERY_ADMIN_KEY 확인됨"
    elif [ "$ENV_CHECK" = "NO_ENV" ]; then
      log_warning ".env 파일이 없습니다."
      echo ""
      echo -e "${YELLOW}서버에서 직접 설정하세요:${NC}"
      echo "  ssh -i $PEM_KEY_EXPANDED ${EC2_USER}@${EC2_HOST}"
      echo "  cat > ${REMOTE_DIR}/.env << 'EOF'"
      echo "  LOTTERY_ADMIN_KEY=<admin-hex-or-suiprivkey>"
      echo "  EOF"
      echo "  chmod 600 ${REMOTE_DIR}/.env"
      echo ""
      log_warning "설정 후 --restart 로 봇을 시작하세요"
      exit 0
    else
      log_error "필수 환경변수 누락: ${ENV_CHECK#MISSING:}"
    fi

    log_step 4 4 "PM2 시작/재시작"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      cd ${REMOTE_DIR}
      if [ -f .env ]; then
        set -a; source .env; set +a
      fi
      pm2 startOrRestart ecosystem.config.cjs
      pm2 save
    "
    log_success "gostop-lottery-keeper 시작됨"

    echo ""
    log_info "현재 상태:"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
      "pm2 describe gostop-lottery-keeper | head -30"

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  🎉 GoStop 봇 배포 완료                                    ║${NC}"
    echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
    echo -e "${GREEN}║  로그: ${CYAN}pnpm deploy:gostop:bots:prod -- --logs${NC}"
    echo -e "${GREEN}║  상태: ${CYAN}pnpm deploy:gostop:bots:prod -- --status${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    ;;
esac
