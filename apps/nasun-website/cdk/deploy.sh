#!/bin/bash
# =============================================================================
# Nasun Website - 환경별 CDK 배포 스크립트
#
# 사용법:
#   ./deploy.sh dev               # 개발/스테이징 환경 배포
#   ./deploy.sh prod              # 프로덕션 환경 배포
#   ./deploy.sh dev --skip-build  # 빌드 건너뛰기
#   ./deploy.sh prod --stack CommonStack  # 특정 스택만 배포
#   ./deploy.sh dev --dry-run     # 실제 배포 없이 검증만
#
# 환경별 설정:
#   - dev:  AWS 계정 135808943968, @Nasun_io, nasun-twitter-tokens
#   - prod: AWS 계정 466841130170, @GenSol_io, nasun-twitter-tokens-prod
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 사용법 출력
usage() {
    echo ""
    echo -e "${BLUE}Nasun Website CDK 배포 스크립트${NC}"
    echo ""
    echo -e "${CYAN}사용법:${NC}"
    echo "  ./deploy.sh dev               개발/스테이징 환경 배포"
    echo "  ./deploy.sh prod              프로덕션 환경 배포"
    echo ""
    echo -e "${CYAN}옵션:${NC}"
    echo "  --skip-build              Lambda 빌드 건너뛰기"
    echo "  --stack <StackName>       특정 스택만 배포 (예: CommonStack, AuthStack, MonitoringStack)"
    echo "  --dry-run                 실제 배포 없이 검증만"
    echo "  --yes                     확인 프롬프트 건너뛰기"
    echo ""
    echo -e "${CYAN}예시:${NC}"
    echo "  ./deploy.sh dev                           # 개발 환경 전체 배포"
    echo "  ./deploy.sh prod --stack CommonStack      # 프로덕션 CommonStack만 배포"
    echo "  ./deploy.sh dev --skip-build --dry-run    # 빌드 없이 diff만 확인"
    echo ""
    exit 1
}

# 인자 파싱
ENV=""
SKIP_BUILD=false
STACK=""
DRY_RUN=false
AUTO_YES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        dev|development)
            ENV="development"
            shift
            ;;
        prod|production)
            ENV="production"
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --stack)
            STACK="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            echo -e "${RED}❌ 알 수 없는 옵션: $1${NC}"
            usage
            ;;
    esac
done

# 환경 필수 확인
if [[ -z "$ENV" ]]; then
    echo -e "${RED}❌ 환경을 지정해주세요 (dev 또는 prod)${NC}"
    usage
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Nasun Website CDK 배포 스크립트                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 환경 설정
if [[ "$ENV" == "production" ]]; then
    ENV_FILE=".env.production"
    AWS_PROFILE="nasun-prod"
    TARGET_ACCOUNT="@Nasun_io"
    AWS_ACCOUNT_ID="466841130170"
    PROFILE_FLAG="--profile nasun-prod"
    NODE_ENV_VAL="production"
else
    ENV_FILE=".env.development"
    AWS_PROFILE="default"
    TARGET_ACCOUNT="@Nasun_io"
    AWS_ACCOUNT_ID="135808943968"
    PROFILE_FLAG=""
    NODE_ENV_VAL="development"
fi

echo -e "${YELLOW}📋 배포 설정${NC}"
echo "  환경: $ENV"
echo "  환경 파일: $ENV_FILE"
echo "  AWS 프로필: $AWS_PROFILE"
echo "  타겟 계정: $TARGET_ACCOUNT"
echo "  AWS 계정 ID: $AWS_ACCOUNT_ID"
if [[ -n "$STACK" ]]; then
    echo "  스택: $STACK"
fi
if [[ "$SKIP_BUILD" == true ]]; then
    echo "  빌드: 건너뛰기"
fi
if [[ "$DRY_RUN" == true ]]; then
    echo "  모드: Dry Run (검증만)"
fi
echo ""

# 환경 파일 확인
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}❌ 환경 파일이 없습니다: $ENV_FILE${NC}"
    exit 1
fi

# AWS 자격 증명 확인
echo -e "${CYAN}🔐 AWS 자격 증명 확인...${NC}"
if [[ "$ENV" == "production" ]]; then
    CURRENT_ACCOUNT=$(aws sts get-caller-identity --profile nasun-prod --query Account --output text 2>/dev/null || echo "ERROR")
else
    CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "ERROR")
fi

if [[ "$CURRENT_ACCOUNT" == "ERROR" ]]; then
    echo -e "${RED}❌ AWS 자격 증명 실패${NC}"
    if [[ "$ENV" == "production" ]]; then
        echo "  프로덕션 배포를 위해 'nasun-prod' 프로필이 필요합니다."
        echo "  ~/.aws/credentials 파일을 확인해주세요."
    else
        echo "  AWS CLI 자격 증명을 확인해주세요."
    fi
    exit 1
fi

if [[ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT_ID" ]]; then
    echo -e "${RED}❌ AWS 계정 불일치!${NC}"
    echo "  현재: $CURRENT_ACCOUNT"
    echo "  예상: $AWS_ACCOUNT_ID"
    exit 1
fi

echo -e "${GREEN}✅ AWS 자격 증명 확인 완료 (Account: $CURRENT_ACCOUNT)${NC}"
echo ""

# Lambda 빌드
if [[ "$SKIP_BUILD" == false ]]; then
    echo -e "${CYAN}🔨 Lambda 빌드 시작...${NC}"
    if [[ -f "scripts/pre-deploy.sh" ]]; then
        bash scripts/pre-deploy.sh
    else
        echo -e "${YELLOW}⚠️  pre-deploy.sh 스크립트가 없습니다. 빌드 건너뛰기.${NC}"
    fi
    echo ""
else
    echo -e "${YELLOW}⏭️  Lambda 빌드 건너뛰기${NC}"
    echo ""
fi

# CDK Synth
echo -e "${CYAN}📦 CDK Synth 실행...${NC}"
NODE_ENV=$NODE_ENV_VAL pnpm cdk synth $STACK --quiet
echo -e "${GREEN}✅ CDK Synth 완료${NC}"
echo ""

# CDK Diff
echo -e "${CYAN}📊 CDK Diff 확인...${NC}"
echo ""
NODE_ENV=$NODE_ENV_VAL pnpm cdk diff $STACK $PROFILE_FLAG 2>&1 || true
echo ""

# Dry Run이면 여기서 종료
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}🏁 Dry Run 완료 (실제 배포 안 함)${NC}"
    echo ""
    exit 0
fi

# 배포 확인
if [[ "$AUTO_YES" == false ]]; then
    echo -e "${YELLOW}⚠️  위 변경사항을 배포하시겠습니까?${NC}"
    read -p "계속하려면 'yes' 입력: " CONFIRM

    if [[ "$CONFIRM" != "yes" ]]; then
        echo -e "${RED}❌ 배포 취소됨${NC}"
        exit 1
    fi
fi

# CDK 배포
echo ""
echo -e "${CYAN}🚀 CDK 배포 시작...${NC}"
START_TIME=$(date +%s)

NODE_ENV=$NODE_ENV_VAL pnpm cdk deploy $STACK --require-approval never $PROFILE_FLAG

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ 배포 완료!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 배포 요약${NC}"
echo "  환경: $ENV"
echo "  AWS 계정: $CURRENT_ACCOUNT"
echo "  타겟: $TARGET_ACCOUNT"
echo "  소요 시간: ${DURATION}초"
if [[ -n "$STACK" ]]; then
    echo "  스택: $STACK"
fi
echo ""

# 배포 후 안내
if [[ "$ENV" == "production" ]]; then
    echo -e "${YELLOW}📌 프로덕션 배포 후 체크리스트:${NC}"
    echo "  1. API 테스트: curl -s https://PROD_API_URL/prod/ | jq ."
    echo "  2. CloudWatch 로그 확인"
    echo "  3. 프론트엔드 배포 (필요 시)"
else
    echo -e "${YELLOW}📌 개발 환경 배포 후 체크리스트:${NC}"
    echo "  1. API 테스트: curl -s https://lw5tmx1pz2.execute-api.ap-northeast-2.amazonaws.com/prod/ | jq ."
    echo "  2. CloudWatch 로그 확인"
fi
echo ""
