#!/bin/bash
# ==============================================================================
# gostop 스테이징 배포 스크립트 (모노레포 버전)
# ==============================================================================
# 대상:   staging.gostop.app
# 계정:   nasun-dev (135808943968), us-east-1
# 방식:   S3 + CloudFront (CDK: GostopSiteStagingStack)
# 빌드:   pnpm --filter @nasun/gostop exec vite build
# ==============================================================================

set -e

# 공통 유틸리티 로드
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- 설정 변수 ---
APP_NAME="gostop"
APP_DIR="$MONOREPO_ROOT/apps/gostop"
CDK_DIR="$APP_DIR/cdk"
DIST_DIR="$APP_DIR/frontend/dist"

AWS_PROFILE_NAME="nasun-dev"
AWS_REGION="us-east-1"
STACK_NAME="GostopSiteStagingStack"
EXPECTED_ACCOUNT="135808943968"
HEALTH_CHECK_URL="https://staging.gostop.app"

TOTAL_STEPS=5
START_TIME=$(date +%s)

# --- 옵션 파싱 ---
DRY_RUN=false
SKIP_CDK=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-cdk)
      SKIP_CDK=true
      shift
      ;;
    --help|-h)
      echo "사용법: ./scripts/deploy-gostop-staging.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run    빌드만 수행하고 S3 업로드/CDK/CF 무효화 건너뜀"
      echo "  --skip-cdk   CDK diff/deploy 단계 건너뜀 (프론트엔드만 재배포)"
      echo "  --help, -h   도움말 표시"
      echo ""
      echo "참고:"
      echo "  - 최초 배포 후 Route53 apex(prod 계정)에 staging.gostop.app NS 레코드를"
      echo "    수동으로 추가해야 DNS가 동작합니다. 스택 출력의 HostedZoneNameServers 참조."
      exit 0
      ;;
  esac
done

# --- 헤더 ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🚀 GoStop 스테이징 배포                                  ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  대상: ${YELLOW}staging.gostop.app${CYAN}  (nasun-dev / us-east-1)      ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  log_warning "드라이런 모드: 빌드만 수행하고 업로드/무효화는 건너뜁니다."
  TOTAL_STEPS=2
fi

# --- Phase 1: 환경 검증 ---
log_step 1 $TOTAL_STEPS "환경 검증"

if [ ! -d "$APP_DIR" ]; then
  log_error "앱 디렉토리를 찾을 수 없습니다: $APP_DIR"
fi
log_success "앱 디렉토리 확인됨: $APP_DIR"

if [ ! -d "$CDK_DIR" ]; then
  log_error "CDK 디렉토리를 찾을 수 없습니다: $CDK_DIR"
fi

# AWS 프로필 + 계정 매칭 검증 (prod 계정에 잘못 배포되는 것 방지)
log_info "AWS 프로필 확인 중: $AWS_PROFILE_NAME"
CURRENT_ACCOUNT=$(aws sts get-caller-identity --profile "$AWS_PROFILE_NAME" --query Account --output text 2>/dev/null || echo "")
if [ -z "$CURRENT_ACCOUNT" ]; then
  log_error "AWS 프로필 '$AWS_PROFILE_NAME'로 인증할 수 없습니다. ~/.aws/credentials 확인."
fi
if [ "$CURRENT_ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  log_error "계정 불일치: 예상=$EXPECTED_ACCOUNT, 실제=$CURRENT_ACCOUNT"
fi
log_success "AWS 계정 확인됨: $CURRENT_ACCOUNT (nasun-dev)"

# --- Phase 2: 프론트엔드 빌드 ---
log_step 2 $TOTAL_STEPS "프론트엔드 빌드"

log_info "gostop frontend 빌드 중..."
if ! pnpm --filter @nasun/gostop exec vite build 2>&1; then
  log_error "빌드 실패!"
fi

if [ ! -d "$DIST_DIR" ] || [ ! -f "$DIST_DIR/index.html" ]; then
  log_error "빌드 결과물을 찾을 수 없습니다: $DIST_DIR"
fi

BUILD_SIZE=$(du -sh "$DIST_DIR" | cut -f1)
log_success "빌드 완료 (크기: $BUILD_SIZE)"

# 드라이런이면 종료
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 드라이런 완료!                                         ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  빌드 결과물: ${CYAN}$DIST_DIR${NC}"
  echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi

# --- Phase 4: CDK 배포 (인프라 변경사항) ---
if [ "$SKIP_CDK" = false ]; then
  log_step 3 $TOTAL_STEPS "CDK 스택 배포"

  cd "$CDK_DIR"

  log_info "CDK diff 확인 중..."
  NODE_ENV=development AWS_PROFILE="$AWS_PROFILE_NAME" \
    npx cdk diff "$STACK_NAME" 2>&1 || true

  log_info "CDK deploy 실행 중..."
  if ! NODE_ENV=development AWS_PROFILE="$AWS_PROFILE_NAME" \
      npx cdk deploy "$STACK_NAME" --require-approval broadening 2>&1; then
    log_error "CDK 배포 실패!"
  fi
  log_success "CDK 스택 배포 완료"

  cd "$MONOREPO_ROOT"
else
  log_info "CDK 배포 건너뜀 (--skip-cdk)"
fi

# --- Phase 5: CFN 출력에서 버킷/디스트리뷰션 조회 ---
log_step 4 $TOTAL_STEPS "배포 대상 조회 + S3 업로드"

log_info "CFN 스택 출력 조회 중: $STACK_NAME"
OUTPUTS=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE_NAME" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null)

BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="BucketName") | .OutputValue')
DIST_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DistributionId") | .OutputValue')

if [ -z "$BUCKET" ] || [ "$BUCKET" = "null" ] || [ -z "$DIST_ID" ] || [ "$DIST_ID" = "null" ]; then
  log_error "스택 출력에서 BucketName/DistributionId를 찾을 수 없습니다. 먼저 CDK 배포가 성공했는지 확인하세요."
fi
log_success "버킷: $BUCKET"
log_success "배포: $DIST_ID"

# Sync hashed assets (long cache) first, then HTML (no cache) so users never
# get a stale shell pointing at missing chunks.
log_info "해시 에셋 업로드 중 (long cache)..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --profile "$AWS_PROFILE_NAME" \
  --region "$AWS_REGION" \
  --delete \
  --exclude "index.html" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable" > /dev/null

log_info "HTML 업로드 중 (no cache)..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --profile "$AWS_PROFILE_NAME" \
  --region "$AWS_REGION" \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate" > /dev/null

log_success "S3 동기화 완료"

log_info "CloudFront 캐시 무효화 중..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --profile "$AWS_PROFILE_NAME" \
  --distribution-id "$DIST_ID" \
  --paths "/" "/index.html" "/*.html" \
  --query 'Invalidation.Id' \
  --output text 2>/dev/null)
log_success "무효화 요청: $INVALIDATION_ID"

# --- Phase 6: 헬스 체크 ---
log_step 5 $TOTAL_STEPS "헬스 체크"

health_check "$HEALTH_CHECK_URL"

# --- 완료 ---
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 스테이징 배포 완료!                                    ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  URL:       ${CYAN}https://staging.gostop.app${NC}"
echo -e "${GREEN}║  Bucket:    ${CYAN}$BUCKET${NC}"
echo -e "${GREEN}║  CF Dist:   ${CYAN}$DIST_ID${NC}"
echo -e "${GREEN}║  소요 시간: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠️  최초 배포라면: prod 계정(466841130170)의 gostop.app HostedZone에${NC}"
echo -e "${YELLOW}   staging.gostop.app NS 레코드(4개) 수동 추가 필요. 아래로 조회:${NC}"
echo -e "${CYAN}   aws cloudformation describe-stacks --profile $AWS_PROFILE_NAME \\
     --region $AWS_REGION --stack-name $STACK_NAME \\
     --query 'Stacks[0].Outputs[?OutputKey==\`HostedZoneNameServers\`].OutputValue' --output text${NC}"
echo ""
