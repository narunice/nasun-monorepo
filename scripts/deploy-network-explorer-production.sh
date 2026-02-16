#!/bin/bash
# ==============================================================================
# network-explorer 프로덕션 배포 스크립트
# ==============================================================================
# 대상: explorer.nasun.io/devnet
# 빌드: pnpm build (base: /devnet/)
# AWS 프로필: nasun-prod
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="network-explorer"
APP_DIR="$MONOREPO_ROOT/apps/network-explorer"

# EC2 설정 (Production - nasun-prod)
PEM_KEY_PATH="$HOME/.ssh/nasun-prod-key.pem"
EC2_USER="ec2-user"
EC2_HOST="43.200.67.52"
REMOTE_DIR="/var/www/explorer.nasun.io/devnet/"
BACKUP_DIR="/var/www/explorer.nasun.io/backups"
HEALTH_CHECK_URL="https://explorer.nasun.io/devnet/"

TOTAL_STEPS=7
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
      echo "사용법: ./scripts/deploy-network-explorer-production.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run    배포 없이 빌드만 수행"
      echo "  --force      확인 프롬프트 건너뛰기"
      echo "  --rollback   이전 백업으로 롤백"
      echo "  --help, -h   도움말 표시"
      exit 0
      ;;
  esac
done

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Network Explorer 프로덕션 배포                            ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}explorer.nasun.io/devnet${CYAN}                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# --- 롤백 모드 ---
if [ "$ROLLBACK" = true ]; then
  log_step 1 2 "롤백 준비"

  PEM_KEY_EXPANDED=$(verify_ssh_key "$PEM_KEY_PATH")
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"

  echo ""
  log_info "사용 가능한 백업 목록:"
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "ls -lt ${BACKUP_DIR}/ 2>/dev/null || echo '백업이 없습니다'"
  echo ""

  read -p "롤백할 백업 디렉토리명을 입력하세요 (예: backup_20260128_120000): " BACKUP_NAME

  if [ -z "$BACKUP_NAME" ]; then
    log_error "백업 이름이 입력되지 않았습니다"
  fi

  log_step 2 2 "롤백 실행"

  log_info "백업 복원 중: $BACKUP_NAME"
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo cp -r ${BACKUP_DIR}/${BACKUP_NAME}/* ${REMOTE_DIR}/"

  log_info "Nginx 재시작 중..."
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"

  health_check "$HEALTH_CHECK_URL"

  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  롤백 완료!                                                ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- 프로덕션 배포 확인 ---
if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
  echo -e "${YELLOW}프로덕션 배포를 진행하시겠습니까?${NC}"
  echo -e "계속하려면 '${RED}deploy${NC}'를 입력하세요: "
  read confirm
  if [ "$confirm" != "deploy" ]; then
    log_warning "배포가 취소되었습니다."
    exit 1
  fi
fi

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

if [ "$DRY_RUN" = false ]; then
  test_ec2_connection "$PEM_KEY_EXPANDED" "$EC2_USER" "$EC2_HOST"
fi

# --- Phase 2: TypeScript 타입 체크 ---
log_step 2 $TOTAL_STEPS "TypeScript 타입 체크"

cd "$MONOREPO_ROOT"

log_info "TypeScript 타입 체크 중..."
if ! pnpm --filter @nasun/network-explorer exec tsc --noEmit 2>&1; then
  log_error "TypeScript 타입 체크 실패!"
fi
log_success "TypeScript 타입 체크 통과"

# --- Phase 3: 프로덕션 빌드 ---
log_step 3 $TOTAL_STEPS "프로덕션 빌드"

log_info "프로덕션 모드로 빌드 중 (base: /devnet/)..."

if ! pnpm --filter @nasun/network-explorer exec vite build 2>&1; then
  log_error "빌드 실패!"
fi

if [ ! -d "$APP_DIR/dist" ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다"
fi

BUILD_SIZE=$(du -sh "$APP_DIR/dist" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

# 드라이런 모드면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  드라이런 완료!                                            ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$APP_DIR/dist${GREEN}${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- Phase 4: 백업 생성 ---
log_step 4 $TOTAL_STEPS "백업 생성"

BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
log_info "백업 생성 중: $BACKUP_NAME"

ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "
  sudo mkdir -p ${BACKUP_DIR}
  if [ -d ${REMOTE_DIR} ] && [ \"\$(ls -A ${REMOTE_DIR} 2>/dev/null)\" ]; then
    sudo cp -r ${REMOTE_DIR} ${BACKUP_DIR}/${BACKUP_NAME}
    echo '백업 완료'
    # 최근 5개 백업만 유지
    cd ${BACKUP_DIR} && ls -t | tail -n +6 | xargs -r sudo rm -rf
    echo '오래된 백업 정리 완료'
  else
    echo '백업할 파일이 없습니다 (첫 배포)'
  fi
"

log_success "백업 완료"

# --- Phase 5: rsync 배포 ---
log_step 5 $TOTAL_STEPS "파일 배포"

log_info "원격 디렉토리 확인 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown -R ${EC2_USER}:${EC2_USER} /var/www/explorer.nasun.io"

log_info "rsync로 파일 동기화 중..."
rsync -avz -e "ssh -i $PEM_KEY_EXPANDED" --delete "$APP_DIR/dist/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}"

log_success "파일 동기화 완료"

# --- Phase 5.5: Nginx security headers 동기화 ---
NGINX_SNIPPET="$APP_DIR/nginx/explorer-security-headers.conf"
if [ -f "$NGINX_SNIPPET" ]; then
  log_info "Nginx security headers 동기화 중..."
  scp -i "$PEM_KEY_EXPANDED" "$NGINX_SNIPPET" "${EC2_USER}@${EC2_HOST}:/tmp/explorer-security-headers.conf"
  ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo cp /tmp/explorer-security-headers.conf /etc/nginx/snippets/explorer-security-headers.conf && rm /tmp/explorer-security-headers.conf"
  log_success "Nginx security headers 동기화 완료"
fi

# --- Phase 6: Nginx 재시작 ---
log_step 6 $TOTAL_STEPS "Nginx 재시작"

log_info "Nginx 설정 테스트 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo nginx -t"
log_success "Nginx 설정 테스트 통과"

log_info "Nginx 재시작 중..."
ssh -i "$PEM_KEY_EXPANDED" "${EC2_USER}@${EC2_HOST}" "sudo systemctl reload nginx"
log_success "Nginx 재시작 완료"

# --- Phase 7: 헬스 체크 ---
log_step 7 $TOTAL_STEPS "헬스 체크"

health_check "$HEALTH_CHECK_URL"

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  프로덕션 배포 완료!                                       ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL: ${CYAN}https://explorer.nasun.io/devnet${GREEN}                    ║${NC}"
echo -e "${GREEN}║  백업: ${CYAN}${BACKUP_NAME}${GREEN}${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${GREEN}${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
