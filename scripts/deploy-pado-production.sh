#!/bin/bash
# ==============================================================================
# Pado 프로덕션 배포 스크립트 (모노레포 버전)
# ==============================================================================
# 대상: pado.finance
# 빌드: pnpm --filter @nasun/pado exec vite build --mode production
# 기능: 백업, 롤백 지원
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="pado"
APP_DIR="$MONOREPO_ROOT/apps/pado"

# EC2 설정 (Production)
PEM_KEY_PATH="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_DIR="/var/www/pado.finance"
BACKUP_DIR="/var/www/pado.finance-backups"
BOTS_DIR="$MONOREPO_ROOT/apps/pado/bots"
BOTS_REMOTE_DIR="/home/ec2-user/pado-bots"
HEALTH_CHECK_URL="https://pado.finance"
CLOUDFRONT_DISTRIBUTION_ID="E35SWPQEJB8HHE"

TOTAL_STEPS=10
START_TIME=$(date +%s)

# --- 옵션 파싱 ---
DRY_RUN=false
FORCE=false
ROLLBACK=false
SKIP_BOTS=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    --skip-bots)
      SKIP_BOTS=true
      shift
      ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-pado-production.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run      배포 없이 빌드만 수행"
      echo "  --force        확인 프롬프트 건너뛰기"
      echo "  --rollback     이전 백업으로 롤백"
      echo "  --skip-bots    LP 봇 배포 건너뛰기"
      echo "  --help, -h     도움말 표시"
      exit 0
      ;;
  esac
done

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🚀 Pado 프로덕션 배포                                    ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}pado.finance${CYAN}                                        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# --- 롤백 모드 ---
if [ "$ROLLBACK" = true ]; then
  log_step 1 2 "롤백 준비"

  PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"

  echo ""
  log_info "사용 가능한 백업 목록:"
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "ls -lt ${BACKUP_DIR}/ 2>/dev/null || echo '백업이 없습니다'"
  echo ""

  read -p "롤백할 백업 디렉토리명을 입력하세요 (예: backup_20260204_120000): " BACKUP_NAME

  if [ -z "$BACKUP_NAME" ]; then
    log_error "백업 이름이 입력되지 않았습니다"
  fi

  log_step 2 2 "롤백 실행"

  log_info "백업 복원 중: $BACKUP_NAME"
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "sudo cp -r ${BACKUP_DIR}/${BACKUP_NAME}/* ${REMOTE_DIR}/"

  log_info "Nginx 재시작 중..."
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "sudo systemctl reload nginx"

  health_check "$HEALTH_CHECK_URL"

  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 롤백 완료!                                             ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- 프로덕션 배포 확인 ---
if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
  echo -e "${YELLOW}프로덕션 배포를 진행하시겠습니까?${NC}"
  echo -e "계속하려면 '${RED}deploy${NC}'를 입력하세요: "
  read confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 1
  fi
fi

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 빌드만 수행하고 배포는 건너뜁니다."
  TOTAL_STEPS=3
elif [ "$SKIP_BOTS" = true ]; then
  TOTAL_STEPS=8
fi

# --- Phase 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

if [ ! -d "$APP_DIR" ]; then
  log_error "앱 디렉토리를 찾을 수 없습니다: $APP_DIR"
fi
log_success "앱 디렉토리 확인됨: $APP_DIR"

if [ ! -f "$APP_DIR/.env.production" ]; then
  log_error ".env.production 파일이 없습니다. 먼저 생성해주세요."
fi
log_success ".env.production 확인됨"

if [ "$DRY_RUN" = false ]; then
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"
fi

# --- Phase 2: TypeScript 타입 체크 ---
log_step 2 $TOTAL_STEPS "TypeScript 타입 체크"

cd "$MONOREPO_ROOT"

log_info "TypeScript 타입 체크 중..."
if ! pnpm --filter @nasun/pado exec tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패!"
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 프로덕션 빌드 ---
log_step 3 $TOTAL_STEPS "프로덕션 빌드"

log_info "production 모드로 빌드 중..."

if ! pnpm --filter @nasun/pado exec vite build --mode production 2>&1; then
  log_error "빌드 실패!"
fi

if [ ! -d "$APP_DIR/frontend/dist" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다"
fi

BUILD_SIZE=$(du -sh "$APP_DIR/frontend/dist" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

verify_env_embed "$APP_NAME" "production"

verify_app_id "$APP_DIR/frontend/dist" "pado-frontend" "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "$REMOTE_DIR"

# 드라이런 모드면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 드라이런 완료!                                         ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$APP_DIR/frontend/dist${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- Phase 4: 백업 생성 ---
log_step 4 $TOTAL_STEPS "백업 생성"

BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
log_info "백업 생성 중: $BACKUP_NAME"

ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
  sudo mkdir -p ${BACKUP_DIR}
  if [ -d ${REMOTE_DIR} ] && [ \"\$(ls -A ${REMOTE_DIR} 2>/dev/null)\" ]; then
    sudo cp -r ${REMOTE_DIR} ${BACKUP_DIR}/${BACKUP_NAME}
    echo '백업 완료'
    # 최근 5개 백업만 유지
    cd ${BACKUP_DIR} && ls -t | tail -n +6 | xargs -r sudo rm -rf
    echo '오래된 백업 정리 완료'
  else
    echo '백업할 파일이 없습니다 (첫 배포)'
  fi
"

log_success "백업 완료"

# --- Phase 5: rsync 배포 ---
log_step 5 $TOTAL_STEPS "파일 배포"

log_info "원격 디렉토리 확인 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "sudo mkdir -p ${REMOTE_DIR} && sudo chown -R ${EC2_USER}:${EC2_USER} ${REMOTE_DIR}"

log_info "rsync로 파일 동기화 중..."
rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" \
  --delete \
  "$APP_DIR/frontend/dist/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

log_success "파일 동기화 완료"

# --- Phase 6: Nginx 재시작 ---
log_step 6 $TOTAL_STEPS "Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 7: 헬스 체크 ---
log_step 7 $TOTAL_STEPS "헬스 체크"

health_check "$HEALTH_CHECK_URL"

# --- Phase 8: CloudFront 캐시 무효화 ---
log_step 8 $TOTAL_STEPS "CloudFront 캐시 무효화"

if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  log_error "CLOUDFRONT_DISTRIBUTION_ID 미설정 - 파일은 배포됐지만 엣지 캐시가 구버전입니다!"
  exit 1
elif ! command -v aws >/dev/null 2>&1; then
  log_error "aws CLI 미설치 - 파일은 배포됐지만 엣지 캐시가 구버전입니다!"
  exit 1
else
  log_info "Distribution ${CLOUDFRONT_DISTRIBUTION_ID} 무효화 요청 중..."
  INVALIDATION_ERROR=""
  INVALIDATION_ID=$(aws cloudfront create-invalidation --profile nasun-prod \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" --output text 2>&1) || INVALIDATION_ERROR="$INVALIDATION_ID"
  if [ -n "$INVALIDATION_ERROR" ] || [ -z "$INVALIDATION_ID" ]; then
    log_error "CloudFront 무효화 실패 - 파일은 배포됐지만 엣지 캐시가 구버전입니다!"
    log_error "오류: ${INVALIDATION_ERROR:-empty response}"
    log_error "수동 재시도: pnpm invalidate:pado:cdn"
    exit 1
  fi
  log_success "무효화 요청됨 (ID: ${INVALIDATION_ID}) - propagation 5~10분"
fi

# --- Phase 9-10: LP 봇 배포 ---
if [ "$SKIP_BOTS" = false ]; then
  log_step 9 $TOTAL_STEPS "LP 봇 코드 동기화"

  log_info "원격 봇 디렉토리 생성 중..."
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "mkdir -p ${BOTS_REMOTE_DIR}"

  log_info "봇 코드 동기화 중..."
  rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '.lp-bot-state-*.json' \
    --exclude 'data' \
    --exclude 'logs' \
    --exclude '*.log' \
    "$BOTS_DIR/" "${EC2_USER}@${EC2_HOST}:${BOTS_REMOTE_DIR}/"

  log_success "봇 코드 동기화 완료"

  log_step 10 $TOTAL_STEPS "LP 봇 PM2 시작"

  log_info "봇 의존성 설치 중..."
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "cd ${BOTS_REMOTE_DIR} && pnpm install --prod"

  # Check .env
  ENV_CHECK=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
    if [ -f ${BOTS_REMOTE_DIR}/.env ] && grep -qE 'LP_PRIVATE_KEY=.+' ${BOTS_REMOTE_DIR}/.env 2>/dev/null; then
      echo 'OK'
    else
      echo 'MISSING'
    fi
  ")

  if [ "$ENV_CHECK" != "OK" ]; then
    log_warning "봇 .env에 LP_PRIVATE_KEY가 설정되지 않았습니다."
    log_warning "서버에서 설정 후 수동으로 PM2를 시작하세요:"
    echo "  echo 'LP_PRIVATE_KEY=your_key' > ${BOTS_REMOTE_DIR}/.env"
  else
    log_info "PM2로 봇 시작 중..."
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
      cd ${BOTS_REMOTE_DIR}
      set -a && source .env && set +a
      if pm2 list 2>/dev/null | grep -q 'lp-bot-nbtc'; then
        pm2 restart ecosystem.config.cjs
      else
        pm2 start ecosystem.config.cjs
      fi
      pm2 save
    "
    log_success "LP 봇 시작됨 (NBTC, NETH, NSOL + price-updater + tpsl-keeper)"

    echo ""
    log_info "봇 상태:"
    ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "pm2 status"
  fi
else
  log_info "LP 봇 배포 건너뜀 (--skip-bots)"
fi

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 프로덕션 배포 완료!                                    ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://pado.finance${NC}"
echo -e "${GREEN}║  백업: ${CYAN}${BACKUP_NAME}${NC}"
if [ "$SKIP_BOTS" = false ]; then
echo -e "${GREEN}║  봇: ${CYAN}PM2 (3 LP bots + price-updater + tpsl-keeper)${NC}"
fi
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
echo -e "${GREEN}║${NC}"
echo -e "${GREEN}║  롤백: ${CYAN}pnpm deploy:pado:prod -- --rollback${NC}"
echo -e "${GREEN}║  봇 로그: ${CYAN}pnpm deploy:pado:bots:prod -- --logs${NC}"
echo -e "${GREEN}║  봇 상태: ${CYAN}pnpm deploy:pado:bots:prod -- --status${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
