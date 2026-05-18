#!/bin/bash
# ==============================================================================
# gostop-backend 프로덕션 배포 스크립트
# ==============================================================================
# !!! 현 상태 경고 (2026-05-18) !!!
#   이 스크립트는 prod EC2 (43.200.67.52)에 배포하도록 작성되었지만,
#   현재 운영 중인 gostop-backend는 **node-3 (54.180.61.196)** 에 있다.
#   READ apps/gostop/backend/README.md §"Production deploy → Current runtime".
#   monorepo ecosystem.config.cjs도 prod의 실제 모드(api는 tsx-src)와 다르다.
#   reconcile PR 전에 이 스크립트를 그냥 실행하면 잘못된 호스트에 빈 디렉토리만
#   만들고 끝난다 (실 운영에는 영향 없지만 운영자 혼란 야기).
# ------------------------------------------------------------------------------
# (의도된) 대상: EC2 43.200.67.52 /home/ec2-user/gostop-backend
# (의도된) 사용자/키: ec2-user + ~/.ssh/.awskey/nasun-prod-key
# 빌드: pnpm --filter @nasun/gostop-backend build (apps/gostop/backend/dist)
# 재시작: export $(cat .env | xargs) && pm2 startOrRestart ecosystem.config.cjs
#
# 안전망:
#   1. .app-id marker: 로컬 'gostop-backend' ↔ 원격 .app-id가 다른 앱이면 abort.
#      prod EC2가 nasun-website / pado / explorer-api / chat-server 등과 공존하므로
#      rsync 한 글자 오타가 다른 앱을 덮어쓰는 사고를 차단 (2026-05-03 사고 후 도입).
#   2. FEED_ANON_SALT prod 가드: src/env.ts가 fallback 리터럴 / <32자 / 미설정 시
#      부팅 거부. 첫 배포 시 .env에 `openssl rand -hex 32` 결과를 박아야 부팅됨.
#      한 번 publish된 anon_id는 절대 회전 금지 (visibility-mask 그룹화 contract).
#   3. 백업 + 롤백: dist.bak.<TS>로 백업, --rollback 으로 직전 백업 복귀.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_NAME="gostop-backend"
EXPECTED_APP_ID="gostop-backend"
BACKEND_DIR="$MONOREPO_ROOT/apps/gostop/backend"
LOCAL_DIST="$BACKEND_DIR/dist"
LOCAL_APP_ID="$BACKEND_DIR/.app-id"

SSH_KEY_PATH="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_BASE="/home/ec2-user/gostop-backend"
REMOTE_DIST="$REMOTE_BASE/dist"
REMOTE_APP_ID="$REMOTE_BASE/.app-id"

# Health check probes the gostop-api leaderboard endpoint with a cheap
# (period=24h, no game filter) query. nginx upstream / public URL is not yet
# decided at the time of first deploy; the script defaults to the on-box
# loopback so the check still works pre-nginx.
HEALTH_CHECK_URL="${GOSTOP_BACKEND_HEALTH_URL:-http://127.0.0.1:3201/api/gostop/leaderboard?period=24h&metric=net_pnl}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
START_TIME=$(date +%s)
TOTAL_STEPS=6

DRY_RUN=false
FORCE=false
SKIP_BUILD=false
ROLLBACK=false

for arg in "$@"; do
  case $arg in
    --dry-run)    DRY_RUN=true ;;
    --force)      FORCE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --rollback)   ROLLBACK=true ;;
    --help|-h)
      cat <<'USAGE'
Usage: ./scripts/deploy-gostop-backend-production.sh [options]
  --dry-run     Build only, no deploy
  --force       Skip the interactive confirmation prompt
  --skip-build  Reuse existing dist/ (must already be present)
  --rollback    Restore the most recent dist.bak.<TS> and hard-restart pm2
USAGE
      exit 0
      ;;
  esac
done

echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  gostop-backend Production Deploy                  ║${NC}"
echo -e "${YELLOW}║  Target: ${CYAN}${EC2_HOST}:${REMOTE_BASE}${YELLOW}      ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ----- Rollback -------------------------------------------------------------
if [ "$ROLLBACK" = true ]; then
  log_step 1 1 "원격 dist 롤백"
  SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")
  ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
    set -e
    cd '$REMOTE_BASE'
    latest=\$(ls -1dt dist.bak.* 2>/dev/null | head -1 || true)
    if [ -z \"\$latest\" ]; then
      echo 'No dist.bak.* found; nothing to roll back to.' >&2
      exit 1
    fi
    echo \"Rolling back to \$latest\"
    rm -rf dist
    cp -r \"\$latest\" dist
    export \$(grep -v '^#' .env | xargs)
    pm2 startOrRestart ecosystem.config.cjs
    sleep 3
    pm2 list | grep gostop || true
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

SSH_KEY_EXPANDED=$(verify_ssh_key "$SSH_KEY_PATH")

# ----- Step 2: 빌드 ---------------------------------------------------------
log_step 2 $TOTAL_STEPS "backend 빌드"

if [ "$SKIP_BUILD" = true ]; then
  log_warning "--skip-build: 빌드 단계 건너뜀 (기존 dist 재사용)"
  if [ ! -d "$LOCAL_DIST" ] || [ ! -f "$LOCAL_DIST/api/server.js" ] || [ ! -f "$LOCAL_DIST/indexer/index.js" ]; then
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
  if [ ! -f "$LOCAL_DIST/api/server.js" ] || [ ! -f "$LOCAL_DIST/indexer/index.js" ]; then
    log_error "빌드 결과물 누락: api/server.js 또는 indexer/index.js"
  fi
  # tsconfig.build.json은 *.test.ts를 제외하지만 회귀 방지로 한 번 더 확인.
  if find "$LOCAL_DIST" -name "*.test.*" | grep -q .; then
    log_error "dist에 테스트 파일이 포함되어 있습니다. tsconfig.build.json 확인 필요."
  fi
fi

BUILD_SIZE=$(du -sh "$LOCAL_DIST" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 배포 건너뜀"
  exit 0
fi

# ----- Step 3: app-id marker 검증 (cross-app overwrite 차단) -----------------
log_step 3 $TOTAL_STEPS "app-id marker 검증"

# 원격에 .app-id가 있고 값이 다르면 abort. 첫 배포(원격 없음)는 통과.
REMOTE_APP_ID_VALUE=$(ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "cat $REMOTE_APP_ID 2>/dev/null | tr -d '[:space:]'" || true)
if [ -n "$REMOTE_APP_ID_VALUE" ] && [ "$REMOTE_APP_ID_VALUE" != "$EXPECTED_APP_ID" ]; then
  log_error "원격 $REMOTE_BASE 가 다른 앱('$REMOTE_APP_ID_VALUE')을 호스팅 중. '$EXPECTED_APP_ID' 배포를 거부합니다. 의도적 복구라면 원격 .app-id를 먼저 정리하세요."
fi
if [ -z "$REMOTE_APP_ID_VALUE" ]; then
  log_warning "원격에 .app-id 없음 (최초 배포 또는 marker 도입 전). 진행."
else
  log_success "원격 marker 일치: $REMOTE_APP_ID_VALUE"
fi

# ----- 배포 확인 ------------------------------------------------------------
if [ "$FORCE" = false ]; then
  echo ""
  echo "원격에 .env가 이미 있어야 합니다. 첫 배포라면 README §'Production deploy'의"
  echo "체크리스트(특히 FEED_ANON_SALT)를 미리 완료한 뒤 진행하세요."
  read -p "프로덕션에 배포하려면 'deploy'를 입력하세요: " confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 0
  fi
fi

# ----- Step 4: 원격 dist 백업 -----------------------------------------------
log_step 4 $TOTAL_STEPS "원격 dist 백업"

ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "set -e; if [ -d '$REMOTE_DIST' ]; then cp -r '$REMOTE_DIST' '${REMOTE_BASE}/dist.bak.${TIMESTAMP}'; echo 'Backup: dist.bak.${TIMESTAMP}'; else mkdir -p '$REMOTE_BASE'; echo 'No existing dist to back up (first deploy).'; fi"

log_success "백업 완료"

# ----- Step 5: rsync (dist + marker + ecosystem + package.json) -------------
log_step 5 $TOTAL_STEPS "rsync 배포"

# dist는 --delete로 정합, 그 외 항목은 개별 파일 단위 sync.
log_info "rsync dist/ ..."
rsync -az --delete -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_DIST/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIST}/"

log_info "rsync .app-id, ecosystem.config.cjs, package.json ..."
rsync -az -e "ssh -i $SSH_KEY_EXPANDED" \
  "$LOCAL_APP_ID" \
  "$BACKEND_DIR/ecosystem.config.cjs" \
  "$BACKEND_DIR/package.json" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/"

# Migration 파일은 별도 디렉토리에 두어 운영자가 수동 적용. 절대 자동 실행 X.
log_info "rsync src/db/migrations/ (수동 적용용) ..."
rsync -az --delete -e "ssh -i $SSH_KEY_EXPANDED" \
  "$BACKEND_DIR/src/db/migrations/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_BASE}/migrations/"

log_success "rsync 완료"

# ----- Step 6: pm2 startOrRestart + health check ----------------------------
log_step 6 $TOTAL_STEPS "pm2 재시작 + 헬스 체크"

# `export $(.env)` 패턴: pm2 daemon이 ecosystem.cjs를 parse할 때 현재 셸 env를
# 흡수하도록 강제. `--update-env`만으로는 cjs 재평가가 안 되므로 새 .env 키가
# silently dropped될 수 있다 (feedback_pm2_daemon_env_resolution).
ssh -i "$SSH_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
  set -e
  cd '$REMOTE_BASE'
  if [ ! -f .env ]; then
    echo 'ERROR: $REMOTE_BASE/.env 없음. 첫 배포 시 .env를 README 가이드대로 먼저 작성하세요.' >&2
    exit 1
  fi
  set -a; source .env; set +a
  pm2 startOrRestart ecosystem.config.cjs
  sleep 3
  pm2 list | grep -E 'gostop-(api|indexer)' || (echo 'ERROR: gostop processes not visible in pm2 list' >&2; exit 1)
"

log_success "pm2 재시작 완료"

# 헬스 체크는 nginx upstream이 아직 없을 수 있으니 실패를 fatal로 보지 않음.
if ! health_check "$HEALTH_CHECK_URL"; then
  log_warning "헬스 체크 실패: nginx upstream 미설정이거나 부팅 중일 수 있음. pm2 logs gostop-api를 직접 확인하세요."
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  gostop-backend 배포 완료!                         ║${NC}"
echo -e "${GREEN}║  소요 시간: $(get_elapsed_time $START_TIME)                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo "다음 확인:"
echo "  ssh -i $SSH_KEY_PATH ${EC2_USER}@${EC2_HOST} 'pm2 logs gostop-api --lines 50 --nostream'"
echo "  ssh -i $SSH_KEY_PATH ${EC2_USER}@${EC2_HOST} 'pm2 logs gostop-indexer --lines 50 --nostream'"
echo ""
