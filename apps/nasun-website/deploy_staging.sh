#!/bin/bash

# ==============================================================================
# nasun-website 스테이징 배포 스크립트 (개선 버전)
# ==============================================================================
# 기능:
# 1. 환경 검증 (SSH 키, EC2 연결, 환경 변수)
# 2. TypeScript 타입 체크 (빌드 전 에러 검출)
# 3. frontend 프로젝트를 'staging' 모드로 빌드
#    - .env.staging 사용 (@Naru010110 타겟, Sepolia Testnet)
# 4. rsync를 사용하여 빌드 결과물을 EC2 서버에 동기화
# 5. Nginx 설정 테스트 및 재시작
# 6. 헬스 체크로 배포 성공 확인
#
# 사용법:
#   ./deploy_staging.sh           # 일반 배포
#   ./deploy_staging.sh --dry-run # 드라이런 (배포 없이 빌드만)
#
# 참고:
# - Staging 서버(staging.nasun.io)는 Dev AWS 계정(__AWS_DEV_ACCOUNT__)을 사용합니다.
# - Production 배포는 ./deploy_production.sh를 사용하세요.
# ==============================================================================

set -e  # 에러 발생 시 즉시 중단

# --- 색상 코드 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- 설정 변수 ---

# AWS EC2 접속용 PEM 키 경로
PEM_KEY_PATH="$HOME/.ssh/<your-staging-key>.pem"

# EC2 인스턴스 정보 (Staging 환경)
EC2_USER="ubuntu"
EC2_HOST="ec2-15-165-19-180.ap-northeast-2.compute.amazonaws.com"

# EC2 서버에 배포할 디렉터리 경로
REMOTE_DIR="/var/www/staging.nasun.io/"

# 로컬 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# 헬스 체크 설정
HEALTH_CHECK_URL="https://staging.nasun.io"

# 총 단계 수
TOTAL_STEPS=6

# 시작 시간
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
      echo "사용법: ./deploy_staging.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run    배포 없이 빌드만 수행 (테스트용)"
      echo "  --help, -h   이 도움말 표시"
      echo ""
      echo "예시:"
      echo "  ./deploy_staging.sh           # 일반 배포"
      echo "  ./deploy_staging.sh --dry-run # 빌드만 테스트"
      exit 0
      ;;
    *)
      # 알 수 없는 옵션
      ;;
  esac
done

# --- 유틸리티 함수 ---

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

log_step() {
  local step=$1
  local msg=$2
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}📍 [${step}/${TOTAL_STEPS}] $msg${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

get_elapsed_time() {
  local end_time=$(date +%s)
  local elapsed=$((end_time - START_TIME))
  echo "${elapsed}초"
}

# --- 헤더 출력 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🚀 NASUN 스테이징 배포 스크립트                           ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}staging.nasun.io${CYAN}                                  ║${NC}"
echo -e "${CYAN}║  타겟: ${YELLOW}@Naru010110${CYAN} (Sepolia Testnet)                     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 빌드만 수행하고 배포는 건너뜁니다."
  TOTAL_STEPS=3
fi

# --- Phase 1: 환경 검증 ---
log_step 1 "환경 검증"

# SSH 키 존재 확인
PEM_KEY_EXPANDED="${PEM_KEY_PATH/#\~/$HOME}"
if [ ! -f "$PEM_KEY_EXPANDED" ]; then
  log_error "SSH 키 파일을 찾을 수 없습니다: $PEM_KEY_PATH"
fi
log_success "SSH 키 확인됨: $PEM_KEY_PATH"

# SSH 키 권한 확인 및 수정
KEY_PERM=$(stat -c %a "$PEM_KEY_EXPANDED" 2>/dev/null || stat -f %A "$PEM_KEY_EXPANDED" 2>/dev/null)
if [ "$KEY_PERM" != "400" ] && [ "$KEY_PERM" != "600" ]; then
  log_warning "SSH 키 권한이 너무 개방적입니다 ($KEY_PERM). 권한을 400으로 설정합니다."
  chmod 400 "$PEM_KEY_EXPANDED"
fi

# frontend 디렉토리 확인
if [ ! -d "$FRONTEND_DIR" ]; then
  log_error "frontend 디렉토리를 찾을 수 없습니다: $FRONTEND_DIR"
fi
log_success "frontend 디렉토리 확인됨"

# .env.staging 파일 확인
if [ ! -f "$FRONTEND_DIR/.env.staging" ]; then
  log_error ".env.staging 파일을 찾을 수 없습니다!"
fi
log_success ".env.staging 파일 확인됨"

# EC2 연결 테스트 (드라이런이 아닌 경우만)
if [ "$DRY_RUN" = false ]; then
  log_info "EC2 연결 테스트 중..."
  if ! ssh -i "$PEM_KEY_EXPANDED" -o ConnectTimeout=10 -o BatchMode=yes "${EC2_USER}@${EC2_HOST}" "echo 'SSH OK'" > /dev/null 2>&1; then
    log_error "EC2 서버에 연결할 수 없습니다: ${EC2_USER}@${EC2_HOST}"
  fi
  log_success "EC2 연결 성공"
fi

# --- Phase 2: TypeScript 타입 체크 ---
log_step 2 "TypeScript 타입 체크"

cd "$FRONTEND_DIR"

log_info "TypeScript 타입 체크 중..."
if ! npx tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패! 에러를 수정하고 다시 시도하세요."
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 스테이징 빌드 ---
log_step 3 "스테이징 빌드"

log_info "staging 모드로 빌드 중..."
log_info "(.env.staging 사용: @Naru010110 타겟, Sepolia Testnet)"

if ! pnpm vite build --mode staging 2>&1; then
  log_error "빌드 실패!"
fi

# 빌드 결과 확인
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: dist/index.html"
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

# 드라이런 모드면 여기서 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 드라이런 완료!                                          ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$FRONTEND_DIR/dist${GREEN}                  ║${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time)${GREEN}                                       ║${NC}"
  echo -e "${GREEN}║                                                            ║${NC}"
  echo -e "${GREEN}║  실제 배포: ${CYAN}./deploy_staging.sh${GREEN}                          ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
fi

# --- Phase 4: rsync 배포 ---
log_step 4 "파일 배포"

log_info "rsync로 파일 동기화 중..."
rsync -avz -e "ssh -i $PEM_KEY_EXPANDED" --delete dist/ "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}"

log_success "파일 동기화 완료"

# --- Phase 5: Nginx 재시작 ---
log_step 5 "Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 6: 헬스 체크 ---
log_step 6 "헬스 체크"

log_info "3초 대기 후 헬스 체크..."
sleep 3

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 30 \
  "$HEALTH_CHECK_URL" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" -eq 200 ]; then
  log_success "헬스 체크 성공 (HTTP $HTTP_STATUS)"
elif [ "$HTTP_STATUS" -eq 000 ]; then
  log_warning "헬스 체크: 연결 실패 (타임아웃 또는 DNS 문제)"
  log_info "수동으로 확인하세요: $HEALTH_CHECK_URL"
else
  log_warning "헬스 체크: HTTP $HTTP_STATUS"
  log_info "수동으로 확인하세요: $HEALTH_CHECK_URL"
fi

# --- 완료 ---
cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 스테이징 배포 완료!                                     ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://staging.nasun.io${GREEN}                            ║${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time)${GREEN}                                       ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  프로덕션 배포: ${CYAN}./deploy_production.sh${GREEN}                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
