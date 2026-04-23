#!/bin/bash
# ==============================================================================
# gensol-website 스테이징 배포 스크립트 (모노레포 버전)
# ==============================================================================
# 대상: staging.gensol.io
# 빌드: pnpm build:gensol-website --mode staging
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="gensol-website"
APP_DIR="$MONOREPO_ROOT/apps/gensol-website"

# EC2 설정 (Staging)
PEM_KEY_PATH="$HOME/.ssh/.awskey/naru_seoul.pem"
EC2_USER="ubuntu"
EC2_HOST="ec2-15-165-19-180.ap-northeast-2.compute.amazonaws.com"
REMOTE_DIR="/var/www/staging.gensol.io/"
HEALTH_CHECK_URL="https://staging.gensol.io"

TOTAL_STEPS=6
START_TIME=$(date +%s)

# --- 옵션 파싱 ---
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-gensol-website-staging.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run    배포 없이 빌드만 수행"
      echo "  --help, -h   도움말 표시"
      exit 0
      ;;
  esac
done

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🚀 GENSOL Website 스테이징 배포                           ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}staging.gensol.io${CYAN}                                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 빌드만 수행하고 배포는 건너뜁니다."
  TOTAL_STEPS=3
fi

# --- Phase 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")

if [ ! -d "$APP_DIR" ]; then
  log_error "앱 디렉토리를 찾을 수 없습니다: $APP_DIR"
fi
log_success "앱 디렉토리 확인됨: $APP_DIR"

if [ ! -f "$APP_DIR/frontend/.env.staging" ]; then
  log_warning ".env.staging 파일이 없습니다. 기본 설정으로 빌드됩니다."
fi

if [ "$DRY_RUN" = false ]; then
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"
fi

# --- Phase 2: TypeScript 타입 체크 ---
log_step 2 $TOTAL_STEPS "TypeScript 타입 체크"

cd "$MONOREPO_ROOT"

log_info "TypeScript 타입 체크 중..."
if ! pnpm --filter @nasun/gensol-website exec tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패!"
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 스테이징 빌드 ---
log_step 3 $TOTAL_STEPS "스테이징 빌드"

log_info "staging 모드로 빌드 중..."

if ! pnpm --filter @nasun/gensol-website exec vite build --mode staging 2>&1; then
  log_error "빌드 실패!"
fi

if [ ! -d "$APP_DIR/frontend/dist" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다"
fi

BUILD_SIZE=$(du -sh "$APP_DIR/frontend/dist" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

verify_env_embed "$APP_NAME" "staging"

# 드라이런 모드면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 드라이런 완료!                                          ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$APP_DIR/frontend/dist${GREEN}${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- Phase 4: rsync 배포 ---
log_step 4 $TOTAL_STEPS "파일 배포"

log_info "rsync로 파일 동기화 중..."
rsync -avz -e "ssh -i $PEM_KEY_EXPANDED" --delete "$APP_DIR/frontend/dist/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}"

log_success "파일 동기화 완료"

# --- Phase 5: Nginx 재시작 ---
log_step 5 $TOTAL_STEPS "Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 6: 헬스 체크 ---
log_step 6 $TOTAL_STEPS "헬스 체크"

health_check "$HEALTH_CHECK_URL"

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 스테이징 배포 완료!                                     ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://staging.gensol.io${GREEN}                           ║${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
