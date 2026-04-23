#!/bin/bash
# ==============================================================================
# nasun-website 프로덕션 배포 스크립트 (모노레포 버전)
# ==============================================================================
# 대상: nasun.io
# 빌드: pnpm build:nasun-website
# 기능: 백업, 롤백 지원
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="nasun-website"
APP_DIR="$MONOREPO_ROOT/apps/nasun-website"

# EC2 설정 (Production)
PEM_KEY_PATH="$HOME/.ssh/nasun-prod-key.pem"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_DIR="/var/www/nasun/dist"
BACKUP_DIR="/var/www/nasun/backups"
HEALTH_CHECK_URL="https://nasun.io"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
START_TIME=$(date +%s)

# --- 옵션 파싱 ---
DRY_RUN=false
FORCE=false
ROLLBACK=false

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
    --help|-h)
      echo "사용법: ./scripts/deploy-nasun-website-production.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run    배포 없이 빌드만 수행"
      echo "  --force      확인 프롬프트 건너뛰기"
      echo "  --rollback   이전 버전으로 롤백"
      echo "  --help, -h   도움말 표시"
      exit 0
      ;;
  esac
done

# --- 롤백 처리 ---
if [ "$ROLLBACK" = true ]; then
  log_step 1 1 "롤백 모드"

  PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

  log_info "가장 최근 백업을 찾는 중..."
  LATEST_BACKUP=$(ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "ls -t ${BACKUP_DIR} 2>/dev/null | head -1" || echo "")

  if [ -z "$LATEST_BACKUP" ]; then
    log_error "백업을 찾을 수 없습니다."
  fi

  log_info "백업 발견: ${LATEST_BACKUP}"
  echo -e "\n${YELLOW}⚠️  정말로 이 백업으로 롤백하시겠습니까?${NC}"
  read -p "계속하려면 'yes'를 입력하세요: " confirm

  if [ "$confirm" != "yes" ]; then
    log_warning "롤백이 취소되었습니다."
    exit 0
  fi

  log_info "롤백 진행 중..."
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
    "sudo rm -rf ${REMOTE_DIR}/* && \
     sudo cp -r ${BACKUP_DIR}/${LATEST_BACKUP}/* ${REMOTE_DIR}/ && \
     sudo nginx -t && sudo systemctl reload nginx"

  log_success "롤백 완료: ${LATEST_BACKUP}"
  exit 0
fi

# --- 헤더 ---
echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  🚀 NASUN Website 프로덕션 배포                            ║${NC}"
echo -e "${RED}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${RED}║  대상: ${YELLOW}nasun.io${RED}                                          ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# --- Phase 1: 환경 검증 ---
log_step 1 7 "환경 검증"

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

if [ ! -d "$APP_DIR" ]; then
  log_error "앱 디렉토리를 찾을 수 없습니다: $APP_DIR"
fi
log_success "앱 디렉토리 확인됨"

if [ ! -f "$APP_DIR/frontend/.env.production" ]; then
  log_warning ".env.production 파일이 없습니다."
fi

test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"

# --- 배포 확인 프롬프트 ---
if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
  echo ""
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  프로덕션 배포 확인                                      ║${NC}"
  echo -e "${YELLOW}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${YELLOW}║  이 작업은 프로덕션 사이트에 영향을 미칩니다.             ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -p "계속하려면 'deploy'를 입력하세요: " confirm

  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 0
  fi
fi

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 실제 배포는 수행되지 않습니다."
fi

# --- Phase 2: TypeScript 타입 체크 ---
log_step 2 7 "TypeScript 타입 체크"

cd "$MONOREPO_ROOT"

log_info "TypeScript 타입 체크 중..."
if ! pnpm --filter @nasun/nasun-website exec tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패!"
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 프로덕션 빌드 ---
log_step 3 7 "프로덕션 빌드"

log_info "프로덕션 모드로 빌드 중..."

if ! pnpm build:nasun-website 2>&1; then
  log_error "빌드 실패!"
fi

if [ ! -d "$APP_DIR/frontend/dist" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다"
fi

BUILD_SIZE=$(du -sh "$APP_DIR/frontend/dist" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

verify_env_embed "$APP_NAME" "production"

# 드라이런 모드면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  log_success "드라이런 완료!"
  log_info "빌드 결과물: $APP_DIR/frontend/dist"
  exit 0
fi

# --- Phase 4: 백업 생성 ---
log_step 4 7 "현재 배포본 백업"

BACKUP_NAME="backup_${TIMESTAMP}"

log_info "백업 생성 중: ${BACKUP_NAME}"
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "sudo mkdir -p ${BACKUP_DIR} && \
   if [ -d '${REMOTE_DIR}' ] && [ -f '${REMOTE_DIR}/index.html' ]; then \
     sudo cp -r ${REMOTE_DIR} ${BACKUP_DIR}/${BACKUP_NAME}; \
   fi"

log_success "백업 완료"

# 오래된 백업 정리
log_info "오래된 백업 정리 중 (최근 5개 유지)..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" \
  "cd ${BACKUP_DIR} && ls -t | tail -n +6 | xargs -r sudo rm -rf"

# --- Phase 5: rsync 배포 ---
log_step 5 7 "파일 배포"

log_info "rsync로 파일 동기화 중..."
rsync -avz --progress -e "ssh -i $PEM_KEY_EXPANDED" \
  --delete \
  "$APP_DIR/frontend/dist/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

log_success "파일 동기화 완료"

# --- Phase 6: Nginx 재시작 ---
log_step 6 7 "Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 7: 헬스 체크 ---
log_step 7 7 "헬스 체크"

health_check "$HEALTH_CHECK_URL" "$HTACCESS_USER" "$HTACCESS_PASS"

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 프로덕션 배포 완료!                                     ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://nasun.io${GREEN}                                    ║${NC}"
echo -e "${GREEN}║  백업: ${CYAN}${BACKUP_NAME}${GREEN}${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  롤백: ${CYAN}pnpm deploy:nasun-website:prod -- --rollback${GREEN}       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
