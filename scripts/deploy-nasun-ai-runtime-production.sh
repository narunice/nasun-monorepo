#!/bin/bash
# ==============================================================================
# nasun-ai-runtime 프로덕션 배포 스크립트 (PR1.A)
# ==============================================================================
# 대상: EC2 43.200.67.52 /home/ec2-user/nasun-ai-runtime
# 실행: tsx (빌드 없음) via pm2 startOrRestart ecosystem.config.cjs
# 노드_modules: pnpm deploy로 self-contained 디렉토리 생성 후 rsync
# ==============================================================================
#
# 2026-05-21: standalone single-daemon (pm2 app name `nasun-ai-runtime`,
# was id 89) is no longer auto-started by this script. Canonical runtime
# is per-user agents (`nasun-ai-agent-*`) spawned on demand by the
# chat-server's agent-orchestrator. This script restarts whatever
# per-agent processes are currently running so they pick up the new code
# bundle. To bring the standalone back manually:
#     ssh ec2-user@<host> 'pm2 start /home/ec2-user/nasun-ai-runtime/ecosystem.config.cjs'
#
# 첫 배포 시:
#   1. 원격 .env를 수동으로 작성. --print-env-template 으로 표시.
#   2. --first-time 으로 ecosystem.config.cjs를 강제 rsync (standalone 운용
#      을 다시 부활시킬 때만 필요. per-agent만 쓸 거면 불필요).
#
# 일반 배포:
#   ./scripts/deploy-nasun-ai-runtime-production.sh
#
# 옵션:
#   --dry-run             stage 디렉토리 생성만, rsync/pm2 건너뜀
#   --force               확인 프롬프트 생략
#   --first-time          ecosystem.config.cjs도 rsync (pm2 delete + start)
#   --print-env-template  필요한 .env 항목 출력 후 종료
#   --rollback            가장 최근 백업 tarball로 롤백
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="nasun-ai-runtime"
APP_ID="nasun-ai-runtime"
AGENT_DIR="$MONOREPO_ROOT/apps/nasun-ai-runtime"
DEPLOY_STAGE_DIR="$MONOREPO_ROOT/.deploy-stage/nasun-ai-runtime"

SSH_KEY_PATH="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_BASE="/home/ec2-user/nasun-ai-runtime"
PM2_NAME="nasun-ai-runtime"
PROD_LAMBDA_HOST="zo6u8epkea.execute-api.ap-northeast-2.amazonaws.com"
DEV_LAMBDA_HOST="ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)
TOTAL_STEPS=6

DRY_RUN=false
FORCE=false
FIRST_TIME=false
PRINT_ENV_TEMPLATE=false
ROLLBACK=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    --first-time) FIRST_TIME=true ;;
    --print-env-template) PRINT_ENV_TEMPLATE=true ;;
    --rollback) ROLLBACK=true ;;
    --help|-h)
      cat <<EOF
Usage: ./scripts/deploy-nasun-ai-runtime-production.sh [options]
  --dry-run             Stage only, no rsync/pm2
  --force               Skip confirmation prompt
  --first-time          Also rsync ecosystem.config.cjs (pm2 delete + start)
  --print-env-template  Print .env template
  --rollback            Restore latest backup tarball
EOF
      exit 0
      ;;
  esac
done

if [ "$PRINT_ENV_TEMPLATE" = true ]; then
  cat <<'EOF'
# /home/ec2-user/nasun-ai-runtime/.env (PR1.A production)
PRESET=trader
INTERVAL_MINUTES=30
NODE_ENV=production
RPC_URL=https://rpc.devnet.nasun.io
WAKE_PORT=4400

# PR1.A: keep BUY/SELL demoted to HOLD until PR1.5 ships the atomic swap PTB.
PR1A_SWAP_DISABLED=true

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
# IMPORTANT: must point to the prod Lambda (zo6u8epkea), not dev (ncn10xkbfh).
# A stale dev URL is the original root cause of the 26h+ silence.
HOST_URL=https://zo6u8epkea.execute-api.ap-northeast-2.amazonaws.com/prod
BARAM_API_KEY=

# --- Shared with chat-server (identical secret values) ---
BARAM_SESSION_JWT_SECRET=
BARAM_CHAT_SERVER_HMAC_SECRET=

# --- Telegram alerting (log-watcher + dead-man scripts) ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALERT_CHAT_ID=
EOF
  exit 0
fi

if [ "$ROLLBACK" = true ]; then
  SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")
  echo "Rolling back $APP_NAME on $EC2_HOST..."
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "set -e
    LATEST=\$(ls -t ${REMOTE_BASE}.bak.*.tgz 2>/dev/null | head -1)
    if [ -z \"\$LATEST\" ]; then echo 'No backup found.'; exit 1; fi
    echo \"Restoring from \$LATEST\"
    tar -xzf \"\$LATEST\" -C $REMOTE_BASE
    cd $REMOTE_BASE
    pm2 restart $PM2_NAME
  "
  exit 0
fi

echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  nasun-ai-runtime Production Deploy (PR1.A)        ║${NC}"
echo -e "${YELLOW}║  Target: ${CYAN}${EC2_HOST}:${REMOTE_BASE}${YELLOW}        ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

if [ ! -d "$AGENT_DIR" ]; then
  log_error "nasun-ai-runtime 디렉토리를 찾을 수 없습니다: $AGENT_DIR"
fi
if [ ! -f "$AGENT_DIR/scripts/log-watcher.sh" ] || [ ! -f "$AGENT_DIR/scripts/dead-man.sh" ]; then
  log_error "scripts/log-watcher.sh + scripts/dead-man.sh 가 필요합니다."
fi

SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")

# --- Step 2: pnpm deploy로 self-contained stage 디렉토리 생성 ---
log_step 2 $TOTAL_STEPS "pnpm deploy (self-contained stage)"

log_info "기존 stage 정리: $DEPLOY_STAGE_DIR"
rm -rf "$DEPLOY_STAGE_DIR"
mkdir -p "$(dirname "$DEPLOY_STAGE_DIR")"

log_info "pnpm deploy --filter @nasun/nasun-ai-runtime --prod ..."
cd "$MONOREPO_ROOT"
if ! pnpm --filter=@nasun/nasun-ai-runtime deploy --prod "$DEPLOY_STAGE_DIR" 2>&1; then
  log_error "pnpm deploy 실패. pnpm 버전 또는 workspace 설정 확인."
fi

# pm2 ecosystem + alarm scripts are not picked up by pnpm deploy (it stages
# package.json + dependencies + dist). Copy them explicitly. The local file
# is named ecosystem.nasun-ai-runtime.cjs to disambiguate in the monorepo;
# we copy it to the canonical `ecosystem.config.cjs` name pm2 expects.
if [ -f "$AGENT_DIR/ecosystem.config.cjs" ]; then
  cp "$AGENT_DIR/ecosystem.config.cjs" "$DEPLOY_STAGE_DIR/"
elif [ -f "$AGENT_DIR/ecosystem.nasun-ai-runtime.cjs" ]; then
  cp "$AGENT_DIR/ecosystem.nasun-ai-runtime.cjs" "$DEPLOY_STAGE_DIR/ecosystem.config.cjs"
fi
mkdir -p "$DEPLOY_STAGE_DIR/scripts"
cp "$AGENT_DIR/scripts/log-watcher.sh" "$DEPLOY_STAGE_DIR/scripts/"
cp "$AGENT_DIR/scripts/dead-man.sh" "$DEPLOY_STAGE_DIR/scripts/"
chmod +x "$DEPLOY_STAGE_DIR/scripts/log-watcher.sh" "$DEPLOY_STAGE_DIR/scripts/dead-man.sh"

# App-id marker — prevents cross-app rsync mishaps (2026-05-03 incident class).
echo "$APP_ID" > "$DEPLOY_STAGE_DIR/.app-id"

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

# --- Step 3: 원격 백업 + app-id 검증 + .env 확인 ---
log_step 3 $TOTAL_STEPS "원격 백업 + app-id 검증 + .env 확인"

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "set -e
  mkdir -p '$REMOTE_BASE'

  # App-id guard: refuse to deploy if the remote target hosts a different app.
  if [ -f '$REMOTE_BASE/.app-id' ]; then
    REMOTE_ID=\$(cat '$REMOTE_BASE/.app-id')
    if [ \"\$REMOTE_ID\" != '$APP_ID' ]; then
      echo \"FAIL: remote .app-id=\$REMOTE_ID, expected $APP_ID. Aborting.\"
      exit 1
    fi
  fi

  # Backup current deploy (excluding node_modules to keep tarball small).
  if [ -d '$REMOTE_BASE/node_modules' ] || [ -d '$REMOTE_BASE/src' ] || [ -d '$REMOTE_BASE/dist' ]; then
    tar -C '$REMOTE_BASE' --exclude=node_modules -czf '${REMOTE_BASE}.bak.${TIMESTAMP}.tgz' . 2>/dev/null || true
    echo 'Backup created: ${REMOTE_BASE}.bak.${TIMESTAMP}.tgz'
  else
    echo 'No existing deploy; first-time deploy.'
  fi

  # ecosystem backup (separate, smaller) — guards against sed mishaps below.
  if [ -f '$REMOTE_BASE/ecosystem.config.cjs' ]; then
    cp '$REMOTE_BASE/ecosystem.config.cjs' '$REMOTE_BASE/ecosystem.config.cjs.bak.${TIMESTAMP}'
  fi

  if [ ! -f '$REMOTE_BASE/.env' ]; then
    echo 'WARN: $REMOTE_BASE/.env 없음. 첫 배포라면 deploy 후 .env 작성.'
    echo 'Template: ./scripts/deploy-nasun-ai-runtime-production.sh --print-env-template'
  fi
"

log_success "백업/사전 검증 완료"

# --- Step 4: rsync ---
log_step 4 $TOTAL_STEPS "stage → 원격 rsync"

RSYNC_EXCLUDES=(--exclude '.env' --exclude '*.bak.*' --exclude '.baram-trader-state.json' --exclude '.nasun-ai-runtime-*.state')
if [ "$FIRST_TIME" = false ]; then
  # 일반 배포: ecosystem.config.cjs는 덮어쓰지 않음 (운영자 수정 보존)
  RSYNC_EXCLUDES+=(--exclude 'ecosystem.config.cjs')
fi

log_info "rsync 중: $DEPLOY_STAGE_DIR/ → ${EC2_HOST}:${REMOTE_BASE}/"
rsync -az --delete-after \
  "${RSYNC_EXCLUDES[@]}" \
  -e "ssh -i $SSH_KEY_EXPANDED" \
  "$DEPLOY_STAGE_DIR/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/"

log_success "rsync 완료"

# --- Step 5: stale HOST_URL fix + per-agent pm2 restart ---
log_step 5 $TOTAL_STEPS "HOST_URL 점검 + per-agent pm2 restart"

# Standalone single-daemon mode (legacy `nasun-ai-runtime` pm2 app, was
# id 89) was retired 2026-05-21: per-user agents spawned by chat-server's
# agent-orchestrator are the canonical runtime. This script no longer
# `startOrRestart`s ecosystem.config.cjs -- if you need the standalone for
# operator-side dogfooding, start it manually:
#     pm2 start /home/ec2-user/nasun-ai-runtime/ecosystem.config.cjs
# Per-agent processes (`nasun-ai-agent-*`) keep the OLD code in-memory
# after rsync (tsx imports src/index.ts at process boot), so we explicitly
# restart them here to pick up the new bundle.

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "set -e
  cd '$REMOTE_BASE'
  if [ ! -f .env ]; then
    echo 'ERR: .env 없음. 작성 후 다시 실행하세요.'; exit 1
  fi

  # Detect stale dev Lambda URL inside ecosystem.config.cjs or .env. The
  # 26h+ silence root cause was prod runtime still pointing at the dev
  # Lambda (which had no /infer or /execute-capability route either).
  STALE_HITS=\$( (grep -E '$DEV_LAMBDA_HOST' ecosystem.config.cjs .env 2>/dev/null || true) | wc -l)
  if [ \"\$STALE_HITS\" -gt 0 ]; then
    echo \"WARN: \$STALE_HITS reference(s) to dev Lambda ($DEV_LAMBDA_HOST) found.\"
    echo 'Auto-rewriting to prod Lambda. Backup is at ecosystem.config.cjs.bak.${TIMESTAMP}.'
    sed -i 's|$DEV_LAMBDA_HOST|$PROD_LAMBDA_HOST|g' .env ecosystem.config.cjs 2>/dev/null || true
    NEW_HITS=\$( (grep -E '$PROD_LAMBDA_HOST' ecosystem.config.cjs .env 2>/dev/null || true) | wc -l)
    if [ \"\$NEW_HITS\" -eq 0 ]; then
      echo 'FAIL: sed completed but no prod Lambda host present. Aborting.'
      exit 1
    fi
  fi

  # Sanity check: HOST_URL inside .env must contain prod Lambda host.
  if ! grep -E \"^HOST_URL=.*$PROD_LAMBDA_HOST\" .env >/dev/null 2>&1; then
    echo 'WARN: HOST_URL in .env does not match prod Lambda. Verify manually.'
  fi

  # Make sure log-watcher + dead-man are executable after rsync.
  chmod +x scripts/log-watcher.sh scripts/dead-man.sh 2>/dev/null || true

  # better-sqlite3 ABI guard. pnpm deploy stages a prebuilt binary for the
  # builder's Node ABI; the prod EC2 runs a different Node version, so the
  # binary fails to load with NODE_MODULE_VERSION mismatch. Re-download the
  # prebuilt for prod's Node ABI from the better-sqlite3 release page.
  echo '[bs3] checking better-sqlite3 ABI...'
  NODE_ABI=\$(node -p 'process.versions.modules' 2>/dev/null || echo unknown)
  BS3_VER=\$(node -p 'require(\"./node_modules/better-sqlite3/package.json\").version' 2>/dev/null || echo unknown)
  echo \"[bs3] Node ABI=\$NODE_ABI  better-sqlite3 pkg v=\$BS3_VER\"
  if node -e 'require(\"./node_modules/better-sqlite3\")(\":memory:\").prepare(\"select 1\").get()' 2>/dev/null; then
    echo '[bs3] binary loads cleanly — skipping refresh.'
  elif [ \"\$NODE_ABI\" != 'unknown' ] && [ \"\$BS3_VER\" != 'unknown' ]; then
    URL=\"https://github.com/WiseLibs/better-sqlite3/releases/download/v\${BS3_VER}/better-sqlite3-v\${BS3_VER}-node-v\${NODE_ABI}-linux-x64.tar.gz\"
    echo \"[bs3] downloading prebuilt: \$URL\"
    TMP=\$(mktemp -d)
    if curl -sSL --fail -o \"\$TMP/bs3.tgz\" \"\$URL\"; then
      mkdir -p node_modules/better-sqlite3/build/Release
      tar -xzf \"\$TMP/bs3.tgz\" -C node_modules/better-sqlite3
      echo '[bs3] binary refreshed.'
    else
      echo \"[bs3] WARN: download failed — runtime may fail to boot.\"
    fi
    rm -rf \"\$TMP\"
  else
    echo '[bs3] WARN: could not determine ABI or pkg version — skipping refresh.'
  fi

  # Enumerate currently-running per-agent processes and restart each so they
  # re-import the new src/index.ts bundle. Use pm2 jlist (JSON) for a stable
  # parse; fall back to a name-grep through 'pm2 ls' text if jq is missing.
  AGENT_NAMES=\$(pm2 jlist 2>/dev/null | (jq -r '.[].name | select(startswith(\"nasun-ai-agent-\"))' 2>/dev/null || true))
  if [ -z \"\$AGENT_NAMES\" ]; then
    # jq unavailable or jlist empty; try text-list parse.
    AGENT_NAMES=\$(pm2 ls 2>/dev/null | awk -F'│' '/nasun-ai-agent-/ {gsub(/^ +| +\$/,\"\",\$3); print \$3}')
  fi
  if [ -z \"\$AGENT_NAMES\" ]; then
    echo 'INFO: no per-agent (nasun-ai-agent-*) processes found; nothing to restart.'
    echo 'Per-user agents are spawned on demand by chat-server agent-orchestrator;'
    echo 'if you expected agents here, check that orchestrator has spawned any.'
  else
    AGENT_COUNT=\$(echo \"\$AGENT_NAMES\" | wc -l)
    echo \"[pm2] restarting \$AGENT_COUNT per-agent process(es) to load new code...\"
    # Word-split via \$IFS is fragile if a pm2 name ever contains whitespace.
    # identityIds today are URL-safe so this is defensive only. printf-pipe
    # keeps the loop POSIX-safe regardless of which shell ssh invokes.
    printf '%s\n' \"\$AGENT_NAMES\" | while IFS= read -r name; do
      [ -z \"\$name\" ] && continue
      pm2 restart \"\$name\" >/dev/null 2>&1 || echo \"WARN: pm2 restart \$name failed\"
      echo \"  restarted: \$name\"
    done
  fi
  pm2 save 2>/dev/null || true
  sleep 4

  echo '--- pm2 list (nasun-ai-*) ---'
  pm2 ls | awk -F'│' '/nasun-ai-/ || /^.+id +.+name/' || true
"

log_success "per-agent restart 완료"

# --- Step 6: cron 안내 (log-watcher + dead-man) ---
log_step 6 $TOTAL_STEPS "cron 안내"

cat <<EOF

PR1.A alarm scripts deployed to $REMOTE_BASE/scripts/. Register cron entries
once (idempotent for re-runs):

  ssh -i $SSH_KEY_PATH $EC2_USER@$EC2_HOST '
    (crontab -l 2>/dev/null | grep -v "nasun-ai-runtime/scripts/(log-watcher|dead-man)"; \
     echo "*/5 * * * * $REMOTE_BASE/scripts/log-watcher.sh"; \
     echo "5 * * * * $REMOTE_BASE/scripts/dead-man.sh") | crontab -
  '

Verify with: ssh ... 'crontab -l | grep nasun-ai-runtime'

EOF

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  nasun-ai-runtime PR1.A 배포 완료!                  ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo "후속 점검:"
echo "  - 30분 후 cycle: ssh ... 'pm2 logs $PM2_NAME --lines 80 --nostream | grep -E \"cycle|AER landed\"'"
echo "  - AER explorer에서 cognition AER tx 1건 확인"
echo "  - 롤백: $0 --rollback"
