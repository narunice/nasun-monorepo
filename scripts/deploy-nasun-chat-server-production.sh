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
CLEAR_TURNSTILE=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    --clear-turnstile) CLEAR_TURNSTILE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: ./scripts/deploy-nasun-chat-server-production.sh [options]"
      echo "  --dry-run           Build only, no deploy"
      echo "  --force             Skip confirmation prompt"
      echo "  --clear-turnstile   Blank TURNSTILE_SECRET_KEY on remote .env"
      echo "                      and hard-restart pm2 to drop the value"
      echo "                      (delete + start, not startOrRestart)."
      echo "                      One-off helper for chat Turnstile removal."
      echo "  --skip-build        Skip the local build step (use existing dist)"
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

if [ "$SKIP_BUILD" = true ]; then
  log_warning "--skip-build: 빌드 단계 건너뜀 (기존 dist 재사용)"
  if [ ! -d "$LOCAL_DIST" ] || [ ! -f "$LOCAL_DIST/crash/index.js" ]; then
    log_error "기존 dist가 없습니다. --skip-build를 떼고 다시 실행하세요."
  fi
else
  log_info "빌드 중..."
  cd "$CHAT_SERVER_DIR"
  if ! pnpm build 2>&1; then
    log_error "빌드 실패!"
  fi
  cd "$MONOREPO_ROOT"

  if [ ! -d "$LOCAL_DIST" ] || [ ! -f "$LOCAL_DIST/crash/index.js" ]; then
    log_error "빌드 결과물을 찾을 수 없습니다: $LOCAL_DIST"
  fi
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

# Sync ecosystem.config.cjs separately (NOT under --delete from REMOTE_BASE; that
# would wipe sibling files like .env, data/, dist.bak.*). pm2 daemon parses this
# file at delete+start time, so the new copy must be on disk before Step 5.
# 2026-05-19: cron_restart added here is the source of truth for prod's daily
# 18:00 UTC restart cap on accumulated workload (pnl phase ballooning).
log_info "ecosystem.config.cjs 동기화 중..."
rsync -az \
  -e "ssh -i $SSH_KEY_EXPANDED" \
  "$CHAT_SERVER_DIR/ecosystem.config.cjs" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/ecosystem.config.cjs"

log_success "rsync 완료"

# --- Step 5a (optional): TURNSTILE_SECRET_KEY 비우기 ---
if [ "$CLEAR_TURNSTILE" = true ]; then
  log_info "원격 .env 의 TURNSTILE_SECRET_KEY 를 비우는 중..."
  # Pattern guarded: only edit a line that already starts with TURNSTILE_SECRET_KEY=.
  # Backup the file under .env.bak.<TS> before in-place edit.
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
    set -e
    cd '$REMOTE_BASE'
    if [ ! -f .env ]; then echo 'No .env on remote'; exit 1; fi
    cp .env .env.bak.${TIMESTAMP}
    if grep -q '^TURNSTILE_SECRET_KEY=' .env; then
      sed -i 's|^TURNSTILE_SECRET_KEY=.*|TURNSTILE_SECRET_KEY=|' .env
      echo 'TURNSTILE_SECRET_KEY blanked. Backup: .env.bak.${TIMESTAMP}'
    else
      echo 'TURNSTILE_SECRET_KEY line not found, nothing to clear'
    fi
    grep '^TURNSTILE_SECRET_KEY=' .env || echo '(no TURNSTILE_SECRET_KEY line after edit)'
  "
  log_success "원격 .env 갱신 완료"
fi

# --- Step 5: pm2 재시작 + 헬스 체크 ---
log_step 5 $TOTAL_STEPS "pm2 재시작 + 헬스 체크"

if [ "$CLEAR_TURNSTILE" = true ]; then
  # Hard restart: delete + start so pm2 daemon re-parses ecosystem.config.cjs
  # against the freshly edited .env. startOrRestart --update-env does NOT
  # re-evaluate ecosystem CJS, so the dropped env var would persist in the
  # daemon's cached parse (feedback_pm2_daemon_env_resolution).
  log_info "pm2 hard restart (delete + start) 중..."
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "cd '$REMOTE_BASE' && pm2 delete nasun-chat-server || true; pm2 start ecosystem.config.cjs && sleep 3 && pm2 list | grep nasun-chat-server"
else
  log_info "pm2 재시작 중..."
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "cd '$REMOTE_BASE' && pm2 startOrRestart ecosystem.config.cjs --update-env && sleep 3 && pm2 list | grep nasun-chat-server"
fi

log_success "pm2 재시작 완료"

health_check "$HEALTH_CHECK_URL"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  nasun-chat-server 배포 완료!                      ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
