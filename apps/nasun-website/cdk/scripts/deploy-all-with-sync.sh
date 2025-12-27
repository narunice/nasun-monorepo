#!/bin/bash
###############################################################################
# 통합 배포 스크립트 (API 엔드포인트 자동 동기화 포함)
#
# 사용법:
#   bash scripts/deploy-all-with-sync.sh
#   bash scripts/deploy-all-with-sync.sh --dry-run
#
# 동작:
#   1. 모든 Lambda 빌드
#   2. 모든 CDK 스택 배포 (AuthStack, CommonStack, CdkStack)
#   3. API 엔드포인트를 프론트엔드 .env 파일에 자동 동기화
###############################################################################

set -e  # 에러 발생 시 즉시 중단

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# DRY-RUN 모드 확인
DRY_RUN=""
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo -e "${YELLOW}🔍 DRY-RUN 모드: API 엔드포인트 동기화만 미리보기${NC}\n"
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  NASUN 통합 배포 (API 엔드포인트 자동 동기화 포함)        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

# 1. 모든 Lambda 빌드
echo -e "${BLUE}📦 Step 1/4: 모든 Lambda 함수 빌드${NC}"
bash scripts/pre-deploy.sh
echo ""

# 2. 빌드 검증
echo -e "${BLUE}✅ Step 2/4: 빌드 검증${NC}"
bash scripts/verify-build.sh
echo ""

# 3. CDK 스택 배포
if [[ -n "$DRY_RUN" ]]; then
  echo -e "${YELLOW}🔍 [DRY-RUN] Step 3/4: CDK 스택 배포 (건너뜀)${NC}\n"
else
  echo -e "${BLUE}🚀 Step 3/4: CDK 스택 배포${NC}"

  echo -e "${GREEN}   AuthStack 배포 중...${NC}"
  pnpm cdk deploy AuthStack --require-approval never
  echo ""

  echo -e "${GREEN}   CommonStack 배포 중...${NC}"
  pnpm cdk deploy CommonStack --require-approval never
  echo ""

  echo -e "${GREEN}   CdkStack 배포 중...${NC}"
  pnpm cdk deploy CdkStack --require-approval never
  echo ""
fi

# 4. API 엔드포인트 동기화
echo -e "${BLUE}🔄 Step 4/4: API 엔드포인트 동기화${NC}"
if [[ -n "$DRY_RUN" ]]; then
  node scripts/sync-api-endpoints.js --dry-run
else
  node scripts/sync-api-endpoints.js
fi
echo ""

# 완료 메시지
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
if [[ -n "$DRY_RUN" ]]; then
  echo -e "${BLUE}║  🔍 DRY-RUN 완료                                           ║${NC}"
  echo -e "${BLUE}║                                                            ║${NC}"
  echo -e "${BLUE}║  실제 배포를 원하면 --dry-run 없이 실행하세요:            ║${NC}"
  echo -e "${BLUE}║  bash scripts/deploy-all-with-sync.sh                     ║${NC}"
else
  echo -e "${BLUE}║  ✅ 배포 및 동기화 완료!                                  ║${NC}"
  echo -e "${BLUE}║                                                            ║${NC}"
  echo -e "${BLUE}║  📝 다음 단계:                                             ║${NC}"
  echo -e "${BLUE}║  1. git diff로 .env 변경사항 확인                         ║${NC}"
  echo -e "${BLUE}║  2. 프론트엔드 재빌드 및 배포                             ║${NC}"
  echo -e "${BLUE}║     cd ../frontend && npm run build                       ║${NC}"
fi
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
