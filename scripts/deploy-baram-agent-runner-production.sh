#!/bin/bash
# ==============================================================================
# baram-agent-runner 프로덕션 배포 스크립트 (Plan D D-3)
# ==============================================================================
# 대상: EC2 43.200.67.52 /home/ec2-user/baram-agent-runner
# 실행: tsx (빌드 없음) via pm2 startOrRestart ecosystem.agent-runner.cjs
# 노드_modules: pnpm deploy로 self-contained 디렉토리 생성 후 rsync
# ==============================================================================
#
# 첫 배포 시:
#   1. 원격 .env 파일을 수동으로 작성해야 한다 (secret 미포함).
#      ./scripts/deploy-baram-agent-runner-production.sh --print-env-template
#   2. 첫 배포는 --first-time 플래그로 ecosystem cjs를 강제 rsync.
#
# 일반 배포:
#   ./scripts/deploy-baram-agent-runner-production.sh
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="baram-agent-runner"
AGENT_DIR="$MONOREPO_ROOT/apps/baram/agent-runner"
DEPLOY_STAGE_DIR="$MONOREPO_ROOT/.deploy-stage/baram-agent-runner"

SSH_KEY_PATH="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_BASE="/home/ec2-user/baram-agent-runner"
PM2_NAME="baram-trader"
WAKE_PROBE_URL="http://127.0.0.1:4400/healthz"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)
TOTAL_STEPS=5

DRY_RUN=false
FORCE=false
FIRST_TIME=false
PRINT_ENV_TEMPLATE=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    --first-time) FIRST_TIME=true ;;
    --print-env-template) PRINT_ENV_TEMPLATE=true ;;
    --help|-h)
      cat <<EOF
Usage: ./scripts/deploy-baram-agent-runner-production.sh [options]
  --dry-run             Stage and pack only, no rsync/pm2
  --force               Skip confirmation prompt
  --first-time          Also rsync ecosystem.agent-runner.cjs (cleans pm2 first)
  --print-env-template  Print .env template lines required on the remote
EOF
      exit 0
      ;;
  esac
done

if [ "$PRINT_ENV_TEMPLATE" = true ]; then
  cat <<'EOF'
# /home/ec2-user/baram-agent-runner/.env (production)
# Pair A wallet/Budget/Capability (reuse test values).
PRESET=trader
INTERVAL_MINUTES=30
NODE_ENV=production
RPC_URL=https://rpc.devnet.nasun.io
WAKE_PORT=4400

# --- Pair A onchain identity ---
AGENT_PRIVATE_KEY=
WALLET_ADDRESS=
CAPABILITY_ID=
BUDGET_ID=
ESCROW_ID=
EXECUTOR_ADDRESS=

# --- Baram packages ---
BARAM_PACKAGE_ID=
BARAM_REGISTRY_ID=
BARAM_AER_PACKAGE_ID=

# --- Coin types ---
COIN_NUSDC_TYPE=
COIN_NBTC_TYPE=

# --- Host / API ---
HOST_URL=
BARAM_API_KEY=

# --- Shared with chat-server (identical secret values) ---
BARAM_SESSION_JWT_SECRET=
BARAM_CHAT_SERVER_HMAC_SECRET=

# --- Optional Telegram notifications on AER landing ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOF
  exit 0
fi

echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  baram-agent-runner Production Deploy              ║${NC}"
echo -e "${YELLOW}║  Target: ${CYAN}${EC2_HOST}:${REMOTE_BASE}${YELLOW} ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

if [ ! -d "$AGENT_DIR" ]; then
  log_error "agent-runner 디렉토리를 찾을 수 없습니다: $AGENT_DIR"
fi
if [ ! -f "$AGENT_DIR/ecosystem.agent-runner.cjs" ]; then
  log_error "ecosystem.agent-runner.cjs를 찾을 수 없습니다."
fi

SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")

# --- Step 2: pnpm deploy로 self-contained stage 디렉토리 생성 ---
log_step 2 $TOTAL_STEPS "pnpm deploy (self-contained stage)"

log_info "기존 stage 정리: $DEPLOY_STAGE_DIR"
rm -rf "$DEPLOY_STAGE_DIR"
mkdir -p "$(dirname "$DEPLOY_STAGE_DIR")"

log_info "pnpm deploy --filter @nasun/baram-agent-runner --prod ..."
cd "$MONOREPO_ROOT"
if ! pnpm deploy --filter @nasun/baram-agent-runner --prod --legacy "$DEPLOY_STAGE_DIR" 2>&1; then
  log_error "pnpm deploy 실패. pnpm 버전 또는 workspace 설정 확인."
fi

# ecosystem cjs는 deploy 결과에 들어가지 않으므로 직접 복사
cp "$AGENT_DIR/ecosystem.agent-runner.cjs" "$DEPLOY_STAGE_DIR/"
log_success "stage 디렉토리 생성: $DEPLOY_STAGE_DIR"

STAGE_SIZE=$(du -sh "$DEPLOY_STAGE_DIR" | cut -f1)
log_info "stage 크기: $STAGE_SIZE"

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: rsync/pm2 건너뜀"
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

# --- Step 3: 원격 백업 + .env 보존 확인 ---
log_step 3 $TOTAL_STEPS "원격 백업 + .env 확인"

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "set -e
  mkdir -p '$REMOTE_BASE'
  if [ -d '$REMOTE_BASE/node_modules' ] || [ -d '$REMOTE_BASE/src' ]; then
    tar -C '$REMOTE_BASE' --exclude=node_modules -czf '${REMOTE_BASE}.bak.${TIMESTAMP}.tgz' . 2>/dev/null || true
    echo 'Backup created: ${REMOTE_BASE}.bak.${TIMESTAMP}.tgz'
  else
    echo 'No existing deploy; first-time deploy.'
  fi
  if [ ! -f '$REMOTE_BASE/.env' ]; then
    echo 'WARN: $REMOTE_BASE/.env 없음. 첫 배포라면 deploy 후 수동으로 .env를 작성하세요.'
    echo 'Template: ./scripts/deploy-baram-agent-runner-production.sh --print-env-template'
  fi
"

log_success "백업/사전 검증 완료"

# --- Step 4: rsync ---
log_step 4 $TOTAL_STEPS "stage → 원격 rsync"

RSYNC_EXCLUDES=(--exclude '.env' --exclude '*.bak.*' --exclude '.baram-agent-runner.sqlite' --exclude '.baram-runner-state.json')
if [ "$FIRST_TIME" = false ]; then
  # 일반 배포: ecosystem.agent-runner.cjs는 덮어쓰지 않음 (운영자 수정 보존)
  RSYNC_EXCLUDES+=(--exclude 'ecosystem.agent-runner.cjs')
fi

log_info "rsync 중: $DEPLOY_STAGE_DIR/ → ${EC2_HOST}:${REMOTE_BASE}/"
rsync -az --delete-after \
  "${RSYNC_EXCLUDES[@]}" \
  -e "ssh -i $SSH_KEY_EXPANDED" \
  "$DEPLOY_STAGE_DIR/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/"

log_success "rsync 완료"

# --- Step 5: pm2 startOrRestart + smoke ---
log_step 5 $TOTAL_STEPS "pm2 기동 + healthz smoke"

log_info "pm2 startOrRestart ecosystem.agent-runner.cjs"
ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "set -e
  cd '$REMOTE_BASE'
  if [ ! -f .env ]; then
    echo 'ERR: .env 없음. 작성 후 다시 실행하세요.'; exit 1
  fi
  export \$(grep -v '^#' .env | xargs -d '\n' -I{} echo {})
  pm2 startOrRestart ecosystem.agent-runner.cjs --update-env
  sleep 5
  pm2 list | grep -E '${PM2_NAME}|baram' || true
  echo '--- recent logs ---'
  pm2 logs ${PM2_NAME} --lines 20 --nostream || true
  echo '--- /healthz probe ---'
  curl -sS -m 5 ${WAKE_PROBE_URL} || echo '(healthz unreachable; check WAKE_PORT)'
"

log_success "pm2 기동 완료"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  baram-agent-runner 배포 완료!                     ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo "후속 점검:"
echo "  - chat-server DB baram_agent_endpoints 테이블에 row 등록 확인"
echo "  - prod EC2 CloudWatch CPUCreditBalance 1-2h 모니터링"
echo "  - 롤백: ssh ... 'tar -xzf ${REMOTE_BASE}.bak.${TIMESTAMP}.tgz -C $REMOTE_BASE && pm2 restart ${PM2_NAME}'"
