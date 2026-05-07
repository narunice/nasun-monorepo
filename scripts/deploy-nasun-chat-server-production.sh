#!/bin/bash
# ==============================================================================
# nasun-chat-server 프로덕션 배포 스크립트
# ==============================================================================
# 대상: EC2 43.200.67.52 /home/ec2-user/nasun-chat-server
# 빌드: pnpm build (apps/nasun-website/chat-server)
# 재시작: pm2 startOrRestart ecosystem.config.cjs
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="nasun-chat-server"
CHAT_SERVER_DIR="$MONOREPO_ROOT/apps/nasun-website/chat-server"
LOCAL_DIST="$CHAT_SERVER_DIR/dist"

SSH_KEY_PATH="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_BASE="/home/ec2-user/nasun-chat-server"
REMOTE_DIST="$REMOTE_BASE/dist"
HEALTH_CHECK_URL="https://nasun.io"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)
TOTAL_STEPS=5

DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    --help|-h)
      echo "Usage: ./scripts/deploy-nasun-chat-server-production.sh [options]"
      echo "  --dry-run   Build only, no deploy"
      echo "  --force     Skip confirmation prompt"
      exit 0
      ;;
  esac
done

echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  nasun-chat-server Production Deploy               ║${NC}"
echo -e "${YELLOW}║  Target: ${CYAN}${EC2_HOST}:${REMOTE_BASE}${YELLOW}  ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

if [ ! -d "$CHAT_SERVER_DIR" ]; then
  log_error "chat-server 디렉토리를 찾을 수 없습니다: $CHAT_SERVER_DIR"
fi

SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")
log_success "SSH 키 확인됨: $SSH_KEY_PATH"

# --- Step 2: 빌드 ---
log_step 2 $TOTAL_STEPS "chat-server 빌드"

log_info "빌드 중..."
cd "$CHAT_SERVER_DIR"
if ! pnpm build 2>&1; then
  log_error "빌드 실패!"
fi
cd "$MONOREPO_ROOT"

if [ ! -d "$LOCAL_DIST" ] || [ ! -f "$LOCAL_DIST/crash/index.js" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: $LOCAL_DIST"
fi

BUILD_SIZE=$(du -sh "$LOCAL_DIST" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 배포 건너뜀"
  exit 0
fi

# --- 배포 확인 ---
if [ "$FORCE" = false ]; then
  echo ""
  read -p "프로덕션에 배포하려면 'deploy'를 입력하세요: " confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 0
  fi
fi

# --- Step 3: 백업 ---
log_step 3 $TOTAL_STEPS "원격 dist 백업"

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "if [ -d '$REMOTE_DIST' ]; then cp -r '$REMOTE_DIST' '${REMOTE_BASE}/dist.bak.${TIMESTAMP}'; echo 'Backup created: dist.bak.${TIMESTAMP}'; else echo 'No existing dist to back up'; fi"

log_success "백업 완료"

# --- Step 4: rsync ---
log_step 4 $TOTAL_STEPS "dist 배포 (rsync)"

log_info "rsync 중: $LOCAL_DIST → ${EC2_HOST}:${REMOTE_DIST}"
rsync -az --delete \
  -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_DIST/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_DIST}/"

log_success "rsync 완료"

# --- Step 5: pm2 재시작 + 헬스 체크 ---
log_step 5 $TOTAL_STEPS "pm2 재시작 + 헬스 체크"

log_info "pm2 재시작 중..."
ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "cd '$REMOTE_BASE' && pm2 startOrRestart ecosystem.config.cjs --update-env && sleep 3 && pm2 list | grep nasun-chat-server"

log_success "pm2 재시작 완료"

health_check "$HEALTH_CHECK_URL"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  nasun-chat-server 배포 완료!                      ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
