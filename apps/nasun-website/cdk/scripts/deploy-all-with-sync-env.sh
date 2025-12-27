#!/bin/bash
###############################################################################
# 통합 배포 스크립트 - 환경별 (API 엔드포인트 자동 동기화 포함)
#
# 사용법:
#   bash scripts/deploy-all-with-sync-env.sh development
#   bash scripts/deploy-all-with-sync-env.sh production
#   bash scripts/deploy-all-with-sync-env.sh development --dry-run
#   bash scripts/deploy-all-with-sync-env.sh production --dry-run
#
# 동작:
#   1. 환경 변수 로드 (.env.development 또는 .env.production)
#   2. 모든 Lambda 빌드
#   3. 빌드 검증
#   4. 모든 CDK 스택 배포 (AuthStack, CommonStack, CdkStack)
#   5. API 엔드포인트를 프론트엔드 .env 파일에 자동 동기화 (환경별)
###############################################################################

set -e  # 에러 발생 시 즉시 중단

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ================================================================
# 1. 인수 파싱
# ================================================================
ENVIRONMENT=$1
DRY_RUN=""

if [ -z "$ENVIRONMENT" ]; then
  echo -e "${RED}❌ 에러: 환경을 지정하세요.${NC}"
  echo "사용법: bash scripts/deploy-all-with-sync-env.sh [development|production] [--dry-run]"
  exit 1
fi

if [ "$ENVIRONMENT" != "development" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo -e "${RED}❌ 에러: 잘못된 환경입니다. (development 또는 production)${NC}"
  exit 1
fi

if [[ "$2" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo -e "${YELLOW}🔍 DRY-RUN 모드: 배포는 건너뛰고 API 엔드포인트 동기화만 미리보기${NC}\n"
fi

# ================================================================
# 2. 환경 정보 표시
# ================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  NASUN 통합 배포 + API 엔드포인트 자동 동기화              ║${NC}"
echo -e "${BLUE}║  환경: ${CYAN}${ENVIRONMENT}${BLUE}                                           ║${NC}"
if [[ -n "$DRY_RUN" ]]; then
  echo -e "${BLUE}║  모드: ${YELLOW}DRY-RUN (미리보기)${BLUE}                                ║${NC}"
fi
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

# ================================================================
# 3. 환경 변수 파일 확인
# ================================================================
ENV_FILE="$CDK_ROOT/.env.$ENVIRONMENT"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ 에러: $ENV_FILE 파일이 존재하지 않습니다.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ 환경 변수 파일: $ENV_FILE${NC}\n"

# ================================================================
# 4. 환경 변수 로드
# ================================================================
if [[ -z "$DRY_RUN" ]]; then
  echo -e "${BLUE}🔄 환경 변수 로드 중...${NC}"

  # 기존 .env 파일 백업
  if [ -f "$CDK_ROOT/.env" ]; then
    cp "$CDK_ROOT/.env" "$CDK_ROOT/.env.backup"
    echo -e "${GREEN}  ✅ 기존 .env 파일 백업 완료 (.env.backup)${NC}"
  fi

  # 환경별 설정 복사
  cp "$ENV_FILE" "$CDK_ROOT/.env"
  echo -e "${GREEN}  ✅ $ENV_FILE → .env 복사 완료${NC}\n"
fi

# ================================================================
# 5. 모든 Lambda 빌드
# ================================================================
if [[ -z "$DRY_RUN" ]]; then
  echo -e "${BLUE}📦 Step 1/5: 모든 Lambda 함수 빌드${NC}"
  bash "$SCRIPT_DIR/pre-deploy.sh"
  echo ""
else
  echo -e "${YELLOW}🔍 [DRY-RUN] Step 1/5: Lambda 빌드 (건너뜀)${NC}\n"
fi

# ================================================================
# 6. 빌드 검증
# ================================================================
if [[ -z "$DRY_RUN" ]]; then
  echo -e "${BLUE}✅ Step 2/5: 빌드 검증${NC}"
  bash "$SCRIPT_DIR/verify-build.sh"
  echo ""
else
  echo -e "${YELLOW}🔍 [DRY-RUN] Step 2/5: 빌드 검증 (건너뜀)${NC}\n"
fi

# ================================================================
# 7. AWS 자격 증명 검증 (프로덕션 환경만)
# ================================================================
if [[ -z "$DRY_RUN" ]] && [ "$ENVIRONMENT" = "production" ]; then
  echo -e "${BLUE}🔐 Step 3/5: AWS 자격 증명 검증 (프로덕션)${NC}"

  if [ -f "$SCRIPT_DIR/pre-deployment-check.sh" ]; then
    bash "$SCRIPT_DIR/pre-deployment-check.sh" "$ENVIRONMENT"
    if [ $? -ne 0 ]; then
      echo -e "\n${RED}❌ 환경 검증 실패!${NC}"

      # .env 복원
      if [ -f "$CDK_ROOT/.env.backup" ]; then
        mv "$CDK_ROOT/.env.backup" "$CDK_ROOT/.env"
        echo -e "${GREEN}✅ .env 파일 복원 완료${NC}"
      fi

      exit 1
    fi
  fi
  echo ""
fi

# ================================================================
# 8. CDK 스택 배포
# ================================================================
if [[ -z "$DRY_RUN" ]]; then
  STEP_NUM="4/5"
  if [ "$ENVIRONMENT" = "production" ]; then
    STEP_NUM="4/5"
  else
    STEP_NUM="3/4"
  fi

  echo -e "${BLUE}🚀 Step $STEP_NUM: CDK 스택 배포${NC}"
  echo -e "${CYAN}  환경: $ENVIRONMENT${NC}"

  # AWS Profile 설정
  PROFILE_ARG=""
  if [ "$ENVIRONMENT" = "production" ]; then
    PROFILE_ARG="--profile nasun-prod"
    echo -e "${CYAN}  AWS Profile: nasun-prod${NC}"
  fi
  echo ""

  # AuthStack 배포
  echo -e "${GREEN}   📍 AuthStack 배포 중...${NC}"
  pnpm cdk deploy AuthStack $PROFILE_ARG --require-approval never
  echo ""

  # CommonStack 배포
  echo -e "${GREEN}   📍 CommonStack 배포 중...${NC}"
  pnpm cdk deploy CommonStack $PROFILE_ARG --require-approval never
  echo ""

  # CdkStack 배포
  echo -e "${GREEN}   📍 CdkStack 배포 중...${NC}"
  pnpm cdk deploy CdkStack $PROFILE_ARG --require-approval never
  echo ""

  # NftEventStack 배포
  echo -e "${GREEN}   📍 NftEventStack 배포 중...${NC}"
  pnpm cdk deploy NftEventStack $PROFILE_ARG --require-approval never
  echo ""

  echo -e "${GREEN}✅ 모든 스택 배포 완료!${NC}\n"
else
  echo -e "${YELLOW}🔍 [DRY-RUN] Step 3/4: CDK 스택 배포 (건너뜀)${NC}\n"
fi

# ================================================================
# 9. API 엔드포인트 동기화
# ================================================================
if [[ -z "$DRY_RUN" ]]; then
  STEP_NUM="5/5"
  if [ "$ENVIRONMENT" = "production" ]; then
    STEP_NUM="5/5"
  else
    STEP_NUM="4/4"
  fi
  echo -e "${BLUE}🔄 Step $STEP_NUM: API 엔드포인트 동기화${NC}"
else
  echo -e "${BLUE}🔄 Step 4/4: API 엔드포인트 동기화 (미리보기)${NC}"
fi

echo -e "${CYAN}  대상 환경: $ENVIRONMENT${NC}"
echo ""

# API 엔드포인트 동기화 실행
if [[ -n "$DRY_RUN" ]]; then
  node "$SCRIPT_DIR/sync-api-endpoints.js" "$ENVIRONMENT" --dry-run
else
  node "$SCRIPT_DIR/sync-api-endpoints.js" "$ENVIRONMENT"
fi
echo ""

# ================================================================
# 10. .env 복원 (선택)
# ================================================================
if [[ -z "$DRY_RUN" ]] && [ -f "$CDK_ROOT/.env.backup" ]; then
  read -p "🔄 .env 파일을 원래대로 복원하시겠습니까? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    mv "$CDK_ROOT/.env.backup" "$CDK_ROOT/.env"
    echo -e "${GREEN}✅ .env 파일 복원 완료${NC}"
  else
    rm "$CDK_ROOT/.env.backup"
    echo -e "${GREEN}✅ 백업 파일 삭제됨${NC}"
  fi
  echo ""
fi

# ================================================================
# 11. 완료 메시지
# ================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
if [[ -n "$DRY_RUN" ]]; then
  echo -e "${BLUE}║  🔍 DRY-RUN 완료                                           ║${NC}"
  echo -e "${BLUE}║                                                            ║${NC}"
  echo -e "${BLUE}║  실제 배포를 원하면 --dry-run 없이 실행하세요:            ║${NC}"
  echo -e "${BLUE}║  ${CYAN}bash scripts/deploy-all-with-sync-env.sh $ENVIRONMENT${BLUE}     ║${NC}"
else
  echo -e "${BLUE}║  ✅ 배포 및 동기화 완료!                                  ║${NC}"
  echo -e "${BLUE}║  ${CYAN}환경: $ENVIRONMENT${BLUE}                                       ║${NC}"
  echo -e "${BLUE}║                                                            ║${NC}"
  echo -e "${BLUE}║  📝 다음 단계:                                             ║${NC}"
  echo -e "${BLUE}║  1. ${GREEN}git diff${BLUE}로 .env 변경사항 확인                       ║${NC}"
  echo -e "${BLUE}║     ${CYAN}git diff ../frontend/.env.$ENVIRONMENT${BLUE}                ║${NC}"
  echo -e "${BLUE}║  2. 프론트엔드 재빌드 및 배포                             ║${NC}"
  echo -e "${BLUE}║     ${CYAN}cd ../frontend && npm run build${BLUE}                       ║${NC}"
fi
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}✅ 스크립트 완료${NC}"
