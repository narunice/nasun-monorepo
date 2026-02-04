#!/bin/bash
# ==============================================================================
# Pado Chat Server 배포 스크립트
# ==============================================================================
# 대상: staging.pado.finance / pado.finance
# 배포: chat-server (Node.js WebSocket + SQLite)
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="pado-chat-server"
CHAT_SERVER_DIR="$MONOREPO_ROOT/apps/pado/chat-server"
REMOTE_DIR="/var/www/pado-chat-server"
SERVICE_NAME="pado-chat"

# --- 환경별 설정 ---
ENV=""
PEM_KEY_PATH=""
EC2_USER=""
EC2_HOST=""

# --- 옵션 파싱 ---
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --env=staging)
      ENV="staging"
      PEM_KEY_PATH="$HOME/.ssh/.awskey/naru_seoul.pem"
      EC2_USER="ubuntu"
      EC2_HOST="ec2-15-165-19-180.ap-northeast-2.compute.amazonaws.com"
      shift
      ;;
    --env=production)
      ENV="production"
      PEM_KEY_PATH="$HOME/.ssh/nasun-prod-key.pem"
      EC2_USER="ec2-user"
      EC2_HOST="43.200.67.52"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-pado-chat-server.sh --env=<staging|production> [옵션]"
      echo ""
      echo "옵션:"
      echo "  --env=staging      스테이징 서버에 배포"
      echo "  --env=production   프로덕션 서버에 배포"
      echo "  --dry-run          빌드만 수행 (배포 안함)"
      echo "  --help, -h         도움말 표시"
      exit 0
      ;;
  esac
done

if [ -z "$ENV" ]; then
  log_error "--env=staging 또는 --env=production 을 지정해주세요."
fi

TOTAL_STEPS=5
if [ "$DRY_RUN" = true ]; then
  TOTAL_STEPS=2
fi

START_TIME=$(date +%s)

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🚀 Pado Chat Server 배포 (${ENV})${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  EC2: ${YELLOW}${EC2_USER}@${EC2_HOST}${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 빌드만 수행합니다."
fi

# --- Phase 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

if [ ! -d "$CHAT_SERVER_DIR" ]; then
  log_error "Chat server 디렉토리를 찾을 수 없습니다: $CHAT_SERVER_DIR"
fi
log_success "Chat server 디렉토리 확인됨"

if [ "$DRY_RUN" = false ]; then
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"
fi

# --- Phase 2: TypeScript 빌드 ---
log_step 2 $TOTAL_STEPS "Chat Server 빌드"

cd "$CHAT_SERVER_DIR"

log_info "TypeScript 컴파일 중..."
if ! npx tsc 2>&1; then
  log_error "TypeScript 컴파일 실패!"
fi

if [ ! -f "$CHAT_SERVER_DIR/dist/server.js" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: dist/server.js"
fi

log_success "Chat server 빌드 완료"

# 드라이런 모드면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 드라이런 완료!                                         ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$CHAT_SERVER_DIR/dist/${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- Phase 3: 파일 배포 ---
log_step 3 $TOTAL_STEPS "파일 배포 (rsync)"

log_info "원격 디렉토리 확인 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "sudo mkdir -p ${REMOTE_DIR}/dist ${REMOTE_DIR}/data && \
   sudo chown -R ${EC2_USER}:${EC2_USER} ${REMOTE_DIR}"

log_info "chat-server 파일 동기화 중..."

# Sync dist files
rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" --delete \
  "$CHAT_SERVER_DIR/dist/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/dist/"

# Sync package.json for npm install
rsync -avz -e "ssh -i $PEM_KEY_EXPANDED" \
  "$CHAT_SERVER_DIR/package.json" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/package.json"

log_success "파일 동기화 완료"

# --- Phase 4: npm install (native modules) ---
log_step 4 $TOTAL_STEPS "npm install (native modules)"

log_info "better-sqlite3 네이티브 빌드 중 (EC2)..."
if ! ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "cd ${REMOTE_DIR} && npm install --production 2>&1 | tail -5"; then
  log_error "npm install 실패!"
fi

log_success "npm install 완료"

# --- Phase 5: 서비스 재시작 & 헬스 체크 ---
log_step 5 $TOTAL_STEPS "서비스 재시작 & 헬스 체크"

log_info "pado-chat 서비스 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "sudo systemctl restart ${SERVICE_NAME}"

sleep 2

SERVICE_STATUS=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "systemctl is-active ${SERVICE_NAME} 2>/dev/null || echo 'inactive'")

if [ "$SERVICE_STATUS" = "active" ]; then
  log_success "pado-chat 서비스 활성화됨"
else
  log_error "pado-chat 서비스 시작 실패 (status: $SERVICE_STATUS)"
fi

log_info "헬스 체크 (localhost:3100)..."
CHAT_STATUS=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ 2>/dev/null || echo '000'")

if [ "$CHAT_STATUS" != "000" ]; then
  log_success "Chat server 응답 확인 (HTTP $CHAT_STATUS)"
else
  log_warning "Chat server 응답 없음 (포트 3100 대기 중일 수 있음)"
fi

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 Chat Server 배포 완료! (${ENV})${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  EC2: ${CYAN}${EC2_USER}@${EC2_HOST}${NC}"
echo -e "${GREEN}║  경로: ${CYAN}${REMOTE_DIR}${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
