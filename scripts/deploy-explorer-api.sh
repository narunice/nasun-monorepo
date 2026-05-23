#!/bin/bash
# ==============================================================================
# explorer-api 배포 스크립트
# ==============================================================================
# 대상: node-3 (54.180.61.196) ~/explorer-api/
# 순서: tsc build -> rsync -> npm install -> pm2 restart -> health check
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

APP_DIR="$MONOREPO_ROOT/apps/network-explorer/api-server"
PEM_KEY_PATH="$HOME/.ssh/.awskey/nasun-devnet-key.pem"
SSH_USER="ubuntu"
SSH_HOST="54.180.61.196"
REMOTE_DIR="~/explorer-api"
TOTAL_STEPS=5
START_TIME=$(date +%s)

# --- 옵션 파싱 ---
DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --force)   FORCE=true ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-explorer-api.sh [옵션]"
      echo "  --dry-run    빌드만 수행, 배포 건너뜀"
      echo "  --force      확인 프롬프트 건너뜀"
      exit 0
      ;;
  esac
done

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Explorer API 배포                                         ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}node-3 (54.180.61.196) ~/explorer-api/${CYAN}           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
  echo -e "${YELLOW}Explorer API 배포를 진행하시겠습니까?${NC}"
  echo -e "계속하려면 '${RED}deploy${NC}'를 입력하세요: "
  read confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 1
  fi
fi

if [ "$DRY_RUN" = true ]; then
  TOTAL_STEPS=2
fi

# --- Phase 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

if [ ! -d "$APP_DIR" ]; then
  log_error "API 서버 디렉토리를 찾을 수 없습니다: $APP_DIR"
fi
log_success "API 서버 디렉토리 확인됨"

if [ "$DRY_RUN" = false ]; then
  test_ec2_connection "$PEM_KEY_EXPANDED" "$SSH_USER" "$SSH_HOST"
fi

# --- Phase 2: TypeScript 빌드 ---
log_step 2 $TOTAL_STEPS "TypeScript 빌드"

cd "$APP_DIR"
log_info "tsc 빌드 중..."
if ! npx tsc 2>&1; then
  log_error "TypeScript 빌드 실패"
fi

if [ ! -f "$APP_DIR/dist/index.js" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: dist/index.js"
fi
log_success "빌드 완료"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}드라이런 완료 (소요: $(get_elapsed_time $START_TIME))${NC}"
  exit 0
fi

# --- Phase 3: rsync ---
log_step 3 $TOTAL_STEPS "파일 배포 (rsync)"

log_info "node-3으로 파일 동기화 중..."
rsync -avz \
  --exclude node_modules \
  --exclude .env \
  --exclude "*.log" \
  -e "ssh -i '$PEM_KEY_EXPANDED' -o StrictHostKeyChecking=accept-new" \
  "$APP_DIR/" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

log_success "파일 동기화 완료"

# --- Phase 4: npm install + pm2 restart ---
log_step 4 $TOTAL_STEPS "의존성 설치 및 재시작"

log_info "서버에서 npm install 및 pm2 restart 실행 중..."
ssh -i "$PEM_KEY_EXPANDED" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${SSH_HOST}" bash -s << 'REMOTE_EOF'
set -e
cd ~/explorer-api

echo "-- npm install --"
npm install --omit=dev

echo "-- dependency validation --"
node --input-type=module << 'NODEEOF'
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(join(process.cwd(), 'package.json'));
const deps = [
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/client-s3',
  '@aws-sdk/lib-dynamodb',
  'hono',
  '@hono/node-server',
  'jose',
  'postgres',
];
let allOk = true;
for (const dep of deps) {
  try {
    require.resolve(dep);
    console.log(`  OK: ${dep}`);
  } catch {
    console.error(`  MISSING: ${dep}`);
    allOk = false;
  }
}
if (!allOk) {
  console.error('Dependency validation failed. Aborting restart.');
  process.exit(1);
}
NODEEOF

echo "-- pm2 restart --"
BEFORE_RESTARTS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        if a['name'] == 'explorer-api':
            print(a['pm2_env']['restart_time'])
except: print(0)
" 2>/dev/null || echo 0)

pm2 restart explorer-api
# tier-worker runs in the same dist tree (dist/workers/tier-worker.js); restart
# so it picks up the new compiled scanners (nsi-compute, lp-position-sync, etc.)
# rather than keeping the old code in memory.
pm2 restart tier-worker 2>/dev/null || echo "(tier-worker not present, skipping)"
sleep 5

echo "-- crash loop check --"
AFTER_RESTARTS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        if a['name'] == 'explorer-api':
            print(a['pm2_env']['restart_time'])
except: print(0)
" 2>/dev/null || echo 0)
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        if a['name'] == 'explorer-api':
            print(a['pm2_env']['status'])
except: print('unknown')
" 2>/dev/null || echo unknown)

RESTART_DIFF=$((AFTER_RESTARTS - BEFORE_RESTARTS))
echo "PM2 status=$PM2_STATUS, new restarts since deploy=$RESTART_DIFF"

if [ "$PM2_STATUS" != "online" ]; then
  echo "ERROR: explorer-api is not online after restart (status=$PM2_STATUS)"
  echo "Last 20 lines of error log:"
  pm2 logs explorer-api --err --lines 20 --nostream 2>/dev/null || true
  exit 1
fi
if [ "$RESTART_DIFF" -ge 3 ]; then
  echo "ERROR: explorer-api restarted $RESTART_DIFF times in 5s - crash loop detected"
  echo "Last 20 lines of error log:"
  pm2 logs explorer-api --err --lines 20 --nostream 2>/dev/null || true
  exit 1
fi

echo "-- health check --"
curl -sf -m 5 http://localhost:3200/api/v1/health | python3 -c "
import sys, json
d = json.load(sys.stdin)
status = d.get('status')
lag = int(d.get('latestCheckpoint', 0))
chain = d.get('chainId')
print(f'status={status}, chainId={chain}, latestCheckpoint={lag}')
if status != 'ok':
    sys.exit(1)
"
REMOTE_EOF

log_success "재시작 완료"

# --- Phase 5: 외부 헬스 체크 ---
log_step 5 $TOTAL_STEPS "외부 헬스 체크"

sleep 2
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 https://explorer.nasun.io/devnet/ 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ]; then
  log_success "외부 헬스 체크 통과 (HTTP $HTTP_STATUS)"
else
  log_warning "외부 헬스 체크: HTTP $HTTP_STATUS (CDN 캐시 지연일 수 있음)"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Explorer API 배포 완료!                                   ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
