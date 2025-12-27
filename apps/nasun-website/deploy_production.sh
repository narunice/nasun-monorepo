#!/bin/bash

# ==============================================================================
# nasun-website 프로덕션 배포 스크립트
# ==============================================================================
# 기능:
# 1. 프로덕션 환경 사전 검증 (SSH 키, TypeScript, 환경 변수)
# 2. frontend 프로젝트를 'production' 모드로 빌드
# 3. 현재 배포본 자동 백업 (롤백 지원)
# 4. rsync를 사용하여 빌드 결과물을 EC2 서버에 동기화
# 5. Nginx 설정 테스트 및 재시작
# 6. 헬스 체크로 배포 성공 확인
#
# 사용법:
#   ./deploy_production.sh           # 일반 배포 (확인 프롬프트 포함)
#   ./deploy_production.sh --dry-run # 드라이런 (배포 없이 빌드만)
#   ./deploy_production.sh --force   # 확인 없이 즉시 배포
#   ./deploy_production.sh --rollback # 이전 버전으로 롤백
#
# 안전 기능:
#   - 배포 전 확인 프롬프트 (실수 방지)
#   - TypeScript 타입 체크 (빌드 전 에러 검출)
#   - 자동 백업 (롤백 가능)
#   - 헬스 체크 (배포 후 검증)
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
PEM_KEY_PATH="$HOME/.ssh/<your-prod-key>.pem"

# EC2 인스턴스 정보 (Production 환경)
EC2_USER="ec2-user"
EC2_HOST="__PROD_EC2_HOST__"

# EC2 서버 경로
REMOTE_DIR="/var/www/nasun/dist"
BACKUP_DIR="/var/www/nasun/backups"

# 로컬 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# 헬스 체크 설정
HEALTH_CHECK_URL="https://nasun.io"
HEALTH_CHECK_USER="GenSol"
HEALTH_CHECK_PASS="GenSol2025"

# 타임스탬프 (백업용)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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
}

log_step() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}📍 $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# --- 롤백 처리 ---
if [ "$ROLLBACK" = true ]; then
  log_step "롤백 모드 시작"

  log_info "가장 최근 백업을 찾는 중..."
  LATEST_BACKUP=$(ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" \
    "ls -t ${BACKUP_DIR} 2>/dev/null | head -1" || echo "")

  if [ -z "$LATEST_BACKUP" ]; then
    log_error "백업을 찾을 수 없습니다. 롤백을 중단합니다."
    exit 1
  fi

  log_info "백업 발견: ${LATEST_BACKUP}"

  echo -e "\n${YELLOW}⚠️  정말로 이 백업으로 롤백하시겠습니까?${NC}"
  echo -e "   백업: ${CYAN}${LATEST_BACKUP}${NC}"
  read -p "계속하려면 'yes'를 입력하세요: " confirm

  if [ "$confirm" != "yes" ]; then
    log_warning "롤백이 취소되었습니다."
    exit 0
  fi

  log_info "롤백 진행 중..."
  ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" \
    "sudo rm -rf ${REMOTE_DIR}/* && \
     sudo cp -r ${BACKUP_DIR}/${LATEST_BACKUP}/* ${REMOTE_DIR}/ && \
     sudo nginx -t && sudo systemctl reload nginx"

  log_success "롤백 완료: ${LATEST_BACKUP}"
  log_info "확인 URL: ${HEALTH_CHECK_URL}"
  exit 0
fi

# --- Phase 1: 환경 설정 및 검증 ---
log_step "Phase 1/7: 환경 검증"

# SSH 키 존재 확인
if [ ! -f "$PEM_KEY_PATH" ]; then
  log_error "SSH 키 파일을 찾을 수 없습니다: $PEM_KEY_PATH"
  exit 1
fi
log_success "SSH 키 확인됨: $PEM_KEY_PATH"

# SSH 키 권한 확인
KEY_PERM=$(stat -c %a "$PEM_KEY_PATH" 2>/dev/null || stat -f %A "$PEM_KEY_PATH" 2>/dev/null)
if [ "$KEY_PERM" != "400" ] && [ "$KEY_PERM" != "600" ]; then
  log_warning "SSH 키 권한이 너무 개방적입니다. 권한을 400으로 설정합니다."
  chmod 400 "$PEM_KEY_PATH"
fi

# EC2 연결 테스트
log_info "EC2 연결 테스트 중..."
if ! ssh -i "$PEM_KEY_PATH" -o ConnectTimeout=10 -o BatchMode=yes "${EC2_USER}@${EC2_HOST}" "echo 'SSH OK'" > /dev/null 2>&1; then
  log_error "EC2 서버에 연결할 수 없습니다: ${EC2_USER}@${EC2_HOST}"
  exit 1
fi
log_success "EC2 연결 성공"

# frontend 디렉토리 확인
if [ ! -d "$FRONTEND_DIR" ]; then
  log_error "frontend 디렉토리를 찾을 수 없습니다: $FRONTEND_DIR"
  exit 1
fi
log_success "frontend 디렉토리 확인됨"

# .env.production 파일 확인
if [ ! -f "$FRONTEND_DIR/.env.production" ]; then
  log_error ".env.production 파일을 찾을 수 없습니다!"
  exit 1
fi
log_success ".env.production 파일 확인됨"

# --- 배포 전 확인 프롬프트 ---
if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
  echo ""
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  프로덕션 배포 확인                                      ║${NC}"
  echo -e "${YELLOW}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${YELLOW}║  대상: ${CYAN}https://nasun.io${YELLOW}                                  ║${NC}"
  echo -e "${YELLOW}║  서버: ${CYAN}${EC2_USER}@${EC2_HOST}${YELLOW}                         ║${NC}"
  echo -e "${YELLOW}║  경로: ${CYAN}${REMOTE_DIR}${YELLOW}                        ║${NC}"
  echo -e "${YELLOW}║                                                            ║${NC}"
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

# --- Phase 2: 빌드 전 검사 ---
log_step "Phase 2/7: 빌드 전 검사"

cd "$FRONTEND_DIR"

# TypeScript 타입 체크
log_info "TypeScript 타입 체크 중..."
if ! npx tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패! 에러를 수정하고 다시 시도하세요."
  exit 1
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 프로덕션 빌드 ---
log_step "Phase 3/7: 프로덕션 빌드"

log_info "프로덕션 모드로 빌드 중..."
log_info "(.env.production 사용: @Nasun_io 타겟, Ethereum Mainnet)"

if ! pnpm build 2>&1; then
  log_error "빌드 실패!"
  exit 1
fi

# 빌드 결과 확인
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: dist/index.html"
  exit 1
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

# 드라이런 모드면 여기서 종료
if [ "$DRY_RUN" = true ]; then
  log_step "드라이런 완료"
  log_info "빌드 결과물 위치: $FRONTEND_DIR/dist"
  log_info "실제 배포를 하려면 --dry-run 옵션 없이 실행하세요."
  exit 0
fi

# --- Phase 4: 원격 백업 생성 ---
log_step "Phase 4/7: 현재 배포본 백업"

BACKUP_NAME="backup_${TIMESTAMP}"

log_info "백업 생성 중: ${BACKUP_NAME}"
ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" \
  "sudo mkdir -p ${BACKUP_DIR} && \
   if [ -d '${REMOTE_DIR}' ] && [ -f '${REMOTE_DIR}/index.html' ]; then \
     sudo cp -r ${REMOTE_DIR} ${BACKUP_DIR}/${BACKUP_NAME}; \
     echo 'BACKUP_CREATED'; \
   else \
     echo 'NO_EXISTING_DEPLOYMENT'; \
   fi"

log_success "백업 완료: ${BACKUP_NAME}"

# 오래된 백업 정리 (최근 5개만 유지)
log_info "오래된 백업 정리 중 (최근 5개 유지)..."
ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" \
  "cd ${BACKUP_DIR} && ls -t | tail -n +6 | xargs -r sudo rm -rf"

# --- Phase 5: rsync 배포 ---
log_step "Phase 5/7: 파일 배포"

log_info "rsync로 파일 동기화 중..."
rsync -avz --progress -e "ssh -i $PEM_KEY_PATH" \
  --delete \
  dist/ "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

log_success "파일 동기화 완료"

# --- Phase 6: Nginx 재시작 ---
log_step "Phase 6/7: Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_PATH" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 7: 헬스 체크 ---
log_step "Phase 7/7: 헬스 체크"

log_info "5초 대기 후 헬스 체크..."
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -u "${HEALTH_CHECK_USER}:${HEALTH_CHECK_PASS}" \
  --max-time 30 \
  "$HEALTH_CHECK_URL" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" -eq 200 ]; then
  log_success "헬스 체크 성공 (HTTP $HTTP_STATUS)"
elif [ "$HTTP_STATUS" -eq 401 ]; then
  log_warning "헬스 체크: 인증 필요 (HTTP 401) - Basic Auth가 설정되어 있습니다."
  log_info "인증 정보로 다시 시도 중..."

  HTTP_STATUS_AUTH=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${HEALTH_CHECK_USER}:${HEALTH_CHECK_PASS}" \
    --max-time 30 \
    "$HEALTH_CHECK_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS_AUTH" -eq 200 ]; then
    log_success "헬스 체크 성공 (인증 후 HTTP $HTTP_STATUS_AUTH)"
  else
    log_error "헬스 체크 실패 (HTTP $HTTP_STATUS_AUTH)"
    log_warning "문제가 있을 수 있습니다. 수동으로 확인하세요."
    log_info "롤백 명령어: ./deploy_production.sh --rollback"
  fi
else
  log_error "헬스 체크 실패 (HTTP $HTTP_STATUS)"
  log_warning "문제가 있을 수 있습니다. 수동으로 확인하세요."
  log_info "롤백 명령어: ./deploy_production.sh --rollback"
fi

# --- 완료 ---
cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 프로덕션 배포 완료!                                     ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://nasun.io${GREEN}                                    ║${NC}"
echo -e "${GREEN}║  백업: ${CYAN}${BACKUP_NAME}${GREEN}                          ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  문제 발생 시: ${CYAN}./deploy_production.sh --rollback${GREEN}         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
