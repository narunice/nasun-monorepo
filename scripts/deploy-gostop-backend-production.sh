#!/bin/bash
# ==============================================================================
# gostop-backend 프로덕션 배포 스크립트
# ==============================================================================
# Target:  node-3 (54.180.61.196) /home/ubuntu/gostop-backend
# User/key: ubuntu + ~/.ssh/.awskey/nasun-devnet-key.pem
# Public:  https://api.gostop.app (Let's Encrypt, nginx proxy → 127.0.0.1:3202)
#
# Runtime split (verified 2026-05-18):
#   - gostop-backend: api, tsx-live from src/api/server.ts (port 3202)
#   - gostop-indexer: dist/indexer/index.js (compiled)
#
# Why node-3 (not prod EC2): gostop-backend is colocated with the Postgres
# instance that holds gostop schema (nasun_points DB). Zero-latency reads from
# game_round / lottery_ticket make /leaderboard + transparency queries cheap.
# Moving to prod EC2 would require opening Postgres SG / pg_hba and re-tuning
# pool sizes — keep node-3 unless that decision is taken explicitly.
#
# What gets pushed:
#   - dist/         (--delete)   indexer artifact
#   - src/          (--delete)   api tsx-live source
#   - package.json, ecosystem.config.cjs, .app-id
#   - src/db/migrations/         (no auto-apply — runbook hint only)
#
# What does NOT get pushed:
#   - .env (must be pre-provisioned on box — script aborts if missing)
#   - node_modules (use --install to run `pnpm install --frozen-lockfile`
#     on the box when deps changed)
#
# Safeties:
#   1. .app-id marker: local 'gostop-backend' must match remote .app-id.
#      Empty remote marker is allowed (first deploy after marker introduction).
#   2. FEED_ANON_SALT prod guard: src/env.ts rejects boot if salt is the dev
#      fallback / <32 chars / unset. anon_id is derived from this — never
#      rotate once any anon_id has been published.
#   3. Backup + rollback: dist/ + src/ snapshotted as dist.bak.<TS> /
#      src.bak.<TS>; --rollback restores the most recent pair and restarts pm2.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="gostop-backend"
EXPECTED_APP_ID="gostop-backend"
BACKEND_DIR="$MONOREPO_ROOT/apps/gostop/backend"
LOCAL_DIST="$BACKEND_DIR/dist"
LOCAL_SRC="$BACKEND_DIR/src"
LOCAL_APP_ID="$BACKEND_DIR/.app-id"

SSH_KEY_PATH="$HOME/.ssh/.awskey/nasun-devnet-key.pem"
EC2_USER="ubuntu"
EC2_HOST="54.180.61.196"
REMOTE_BASE="/home/ubuntu/gostop-backend"
REMOTE_DIST="$REMOTE_BASE/dist"
REMOTE_SRC="$REMOTE_BASE/src"
REMOTE_APP_ID="$REMOTE_BASE/.app-id"

# Health check probes the gostop-backend leaderboard endpoint via on-box
# loopback (port 3202 — see ecosystem.config.cjs + nginx upstream).
HEALTH_CHECK_URL="${GOSTOP_BACKEND_HEALTH_URL:-http://127.0.0.1:3202/api/gostop/leaderboard?period=24h&metric=net_pnl}"
# Public health check used after the on-box one succeeds. Tolerates failure
# (CloudFront / nginx not always reachable from operator machine).
PUBLIC_HEALTH_CHECK_URL="${GOSTOP_BACKEND_PUBLIC_HEALTH_URL:-https://api.gostop.app/api/gostop/leaderboard?period=24h&metric=net_pnl}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)
TOTAL_STEPS=6

DRY_RUN=false
FORCE=false
SKIP_BUILD=false
ROLLBACK=false
INSTALL_DEPS=false

for arg in "$@"; do
  case $arg in
    --dry-run)    DRY_RUN=true ;;
    --force)      FORCE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --rollback)   ROLLBACK=true ;;
    --install)    INSTALL_DEPS=true ;;
    --help|-h)
      cat <<'USAGE'
Usage: ./scripts/deploy-gostop-backend-production.sh [options]
  --dry-run     Build only, no deploy
  --force       Skip the interactive confirmation prompt
  --skip-build  Reuse existing dist/ (must already be present)
  --install     Run `pnpm install --frozen-lockfile` on the box after rsync
                (only needed when package.json / dependencies changed)
  --rollback    Restore the most recent dist.bak.<TS>/src.bak.<TS> pair and
                hard-restart pm2
USAGE
      exit 0
      ;;
  esac
done

echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  gostop-backend Production Deploy                  ║${NC}"
echo -e "${YELLOW}║  Target: ${CYAN}${EC2_USER}@${EC2_HOST}${YELLOW} (node-3)              ║${NC}"
echo -e "${YELLOW}║  Path:   ${CYAN}${REMOTE_BASE}${YELLOW}              ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ----- Rollback -------------------------------------------------------------
if [ "$ROLLBACK" = true ]; then
  log_step 1 1 "원격 dist + src 롤백"
  SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
    set -e
    cd '$REMOTE_BASE'
    latest_dist=\$(ls -1dt dist.bak.* 2>/dev/null | head -1 || true)
    latest_src=\$(ls -1dt src.bak.* 2>/dev/null | head -1 || true)
    if [ -z \"\$latest_dist\" ] || [ -z \"\$latest_src\" ]; then
      echo 'No dist.bak.*/src.bak.* pair found; nothing to roll back to.' >&2
      exit 1
    fi
    echo \"Rolling back dist \$latest_dist  src \$latest_src\"
    rm -rf dist src
    cp -r \"\$latest_dist\" dist
    cp -r \"\$latest_src\" src
    set -a; source .env; set +a
    pm2 startOrRestart ecosystem.config.cjs
    sleep 3
    pm2 list | grep -E 'gostop-(backend|indexer)' || true
  "
  log_success "롤백 완료"
  health_check "$HEALTH_CHECK_URL" || true
  exit 0
fi

# ----- Step 1: 환경 검증 -----------------------------------------------------
log_step 1 $TOTAL_STEPS "환경 검증"

if [ ! -d "$BACKEND_DIR" ]; then
  log_error "backend 디렉토리를 찾을 수 없습니다: $BACKEND_DIR"
fi
if [ ! -f "$LOCAL_APP_ID" ]; then
  log_error ".app-id marker 누락: $LOCAL_APP_ID  (커밋된 marker가 있어야 cross-app overwrite를 막을 수 있습니다)"
fi
LOCAL_ID_VALUE=$(tr -d '[:space:]' < "$LOCAL_APP_ID")
if [ "$LOCAL_ID_VALUE" != "$EXPECTED_APP_ID" ]; then
  log_error "로컬 .app-id 값 '$LOCAL_ID_VALUE' != 기대값 '$EXPECTED_APP_ID'"
fi
if [ ! -d "$LOCAL_SRC" ]; then
  log_error "src/ 디렉토리 누락: $LOCAL_SRC  (api는 tsx-live이므로 src/가 필수)"
fi

SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")

# ----- Step 2: 빌드 ---------------------------------------------------------
log_step 2 $TOTAL_STEPS "backend 빌드 (indexer dist 필요)"

if [ "$SKIP_BUILD" = true ]; then
  log_warning "--skip-build: 빌드 단계 건너뜀 (기존 dist 재사용)"
  if [ ! -d "$LOCAL_DIST" ] || [ ! -f "$LOCAL_DIST/indexer/index.js" ]; then
    log_error "기존 dist가 불완전합니다 ($LOCAL_DIST). --skip-build를 떼고 재실행하세요."
  fi
else
  log_info "빌드 중 (typecheck + tsc -p tsconfig.build.json)..."
  cd "$MONOREPO_ROOT"
  if ! pnpm --filter @nasun/gostop-backend typecheck 2>&1; then
    log_error "typecheck 실패"
  fi
  if ! pnpm --filter @nasun/gostop-backend build 2>&1; then
    log_error "build 실패"
  fi
  if [ ! -f "$LOCAL_DIST/indexer/index.js" ]; then
    log_error "빌드 결과물 누락: dist/indexer/index.js"
  fi
  # tsconfig.build.json은 *.test.ts를 제외하지만 회귀 방지로 한 번 더 확인.
  if find "$LOCAL_DIST" -name "*.test.*" | grep -q .; then
    log_error "dist에 테스트 파일이 포함되어 있습니다. tsconfig.build.json 확인 필요."
  fi
fi

BUILD_SIZE=$(du -sh "$LOCAL_DIST" | cut -f1)
log_success "빌드 완료 (dist 크기: $BUILD_SIZE)"

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 배포 건너뜀"
  exit 0
fi

# ----- Step 3: app-id marker 검증 (cross-app overwrite 차단) -----------------
log_step 3 $TOTAL_STEPS "app-id marker 검증"

REMOTE_APP_ID_VALUE=$(ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "cat $REMOTE_APP_ID 2>/dev/null | tr -d '[:space:]'" || true)
if [ -n "$REMOTE_APP_ID_VALUE" ] && [ "$REMOTE_APP_ID_VALUE" != "$EXPECTED_APP_ID" ]; then
  log_error "원격 $REMOTE_BASE 가 다른 앱('$REMOTE_APP_ID_VALUE')을 호스팅 중. '$EXPECTED_APP_ID' 배포를 거부합니다. 의도적 복구라면 원격 .app-id를 먼저 정리하세요."
fi
if [ -z "$REMOTE_APP_ID_VALUE" ]; then
  log_warning "원격에 .app-id 없음 (marker 도입 전 또는 첫 자동 배포). 진행하며 이번 rsync로 marker 생성됨."
else
  log_success "원격 marker 일치: $REMOTE_APP_ID_VALUE"
fi

# ----- 배포 확인 ------------------------------------------------------------
if [ "$FORCE" = false ]; then
  echo ""
  echo "원격에 .env가 이미 있어야 합니다. 누락이면 부팅 시 src/env.ts가 거부합니다."
  read -p "프로덕션에 배포하려면 'deploy'를 입력하세요: " confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 0
  fi
fi

# ----- Step 4: 원격 dist + src 백업 -----------------------------------------
log_step 4 $TOTAL_STEPS "원격 dist + src 백업"

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
  set -e
  mkdir -p '$REMOTE_BASE'
  cd '$REMOTE_BASE'
  if [ -d dist ]; then cp -r dist 'dist.bak.${TIMESTAMP}'; echo 'Backup: dist.bak.${TIMESTAMP}'; else echo 'No existing dist to back up.'; fi
  if [ -d src ];  then cp -r src  'src.bak.${TIMESTAMP}';  echo 'Backup: src.bak.${TIMESTAMP}';  else echo 'No existing src to back up.';  fi
  # Keep only 5 most-recent backups per kind to avoid disk creep.
  ls -1dt dist.bak.* 2>/dev/null | tail -n +6 | xargs -r rm -rf
  ls -1dt src.bak.*  2>/dev/null | tail -n +6 | xargs -r rm -rf
"
log_success "백업 완료"

# ----- Step 5: rsync (dist + src + marker + ecosystem + package.json) -------
log_step 5 $TOTAL_STEPS "rsync 배포"

log_info "rsync dist/ ..."
rsync -az --delete -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_DIST/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIST}/"

log_info "rsync src/ (api tsx-live) ..."
rsync -az --delete \
  --exclude '__tests__' --exclude '*.test.ts' --exclude '*.test.tsx' \
  -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_SRC/" "${EC2_USER}@${EC2_HOST}:${REMOTE_SRC}/"

log_info "rsync .app-id, ecosystem.config.cjs, package.json, tsconfig*.json ..."
rsync -az -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_APP_ID" \
  "$BACKEND_DIR/ecosystem.config.cjs" \
  "$BACKEND_DIR/package.json" \
  "$BACKEND_DIR/tsconfig.json" \
  "$BACKEND_DIR/tsconfig.build.json" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/"

# Migration 파일은 별도 디렉토리에 두어 운영자가 수동 적용. 절대 자동 실행 X.
log_info "rsync src/db/migrations/ (수동 적용용) ..."
rsync -az --delete -e "ssh -i $SSH_KEY_EXPANDED" \
  "$BACKEND_DIR/src/db/migrations/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/migrations/"

log_success "rsync 완료"

# ----- Optional: pnpm install -----------------------------------------------
if [ "$INSTALL_DEPS" = true ]; then
  log_info "원격 pnpm install --frozen-lockfile (deps 변경 시) ..."
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
    set -e
    cd '$REMOTE_BASE'
    pnpm install --frozen-lockfile
  "
  log_success "pnpm install 완료"
fi

# ----- Step 6: pm2 startOrRestart + health check ----------------------------
log_step 6 $TOTAL_STEPS "pm2 재시작 + 헬스 체크"

# `set -a; source .env; set +a` 패턴: pm2 daemon이 ecosystem.cjs를 parse할 때
# 현재 셸 env를 흡수하도록 강제. `--update-env`만으로는 cjs 재평가가 안 되므로
# 새 .env 키가 silently dropped될 수 있다 (feedback_pm2_daemon_env_resolution).
ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
  set -e
  cd '$REMOTE_BASE'
  if [ ! -f .env ]; then
    echo 'ERROR: $REMOTE_BASE/.env 없음. .env를 먼저 작성하세요.' >&2
    exit 1
  fi
  set -a; source .env; set +a
  pm2 startOrRestart ecosystem.config.cjs
  sleep 3
  pm2 list | grep -E 'gostop-(backend|indexer)' || (echo 'ERROR: gostop processes not visible in pm2 list' >&2; exit 1)
"

log_success "pm2 재시작 완료"

# 헬스 체크 (loopback). 실패는 fatal로 보지 않음 (방금 부팅 직후 race 가능).
if ! health_check "$HEALTH_CHECK_URL"; then
  log_warning "loopback 헬스 체크 실패: 부팅 race 또는 .env 문제. pm2 logs gostop-backend를 확인."
fi

# Public 헬스 체크 (CloudFront/Let's Encrypt). 실패해도 비치명적.
if ! health_check "$PUBLIC_HEALTH_CHECK_URL"; then
  log_warning "public 헬스 체크 실패: nginx/CF/DNS 또는 edge propagation 지연 가능. 1~2분 후 재시도."
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  gostop-backend 배포 완료!                         ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo "다음 확인:"
echo "  ssh -i $SSH_KEY_PATH ${EC2_USER}@${EC2_HOST} 'pm2 logs gostop-backend --lines 50 --nostream'"
echo "  ssh -i $SSH_KEY_PATH ${EC2_USER}@${EC2_HOST} 'pm2 logs gostop-indexer --lines 50 --nostream'"
echo "  curl -s '${PUBLIC_HEALTH_CHECK_URL}' | head -c 400; echo"
echo ""
