#!/bin/bash

###################################################################################
# Pre-Deployment Environment Check Script
#
# 배포 전 환경 설정과 AWS 자격 증명의 일치 여부를 검증합니다.
# 불일치 발견 시 배포를 중단하고 올바른 명령어를 안내합니다.
#
# Usage:
#   bash scripts/pre-deployment-check.sh [development|production]
#
# Author: Claude Code
# Last Updated: 2025-10-29
###################################################################################

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 인자로 환경 받기
EXPECTED_ENV="${1:-}"

if [[ -z "$EXPECTED_ENV" ]]; then
  echo -e "${RED}❌ 오류: 환경을 지정해주세요 (development 또는 production)${NC}"
  exit 1
fi

if [[ "$EXPECTED_ENV" != "development" && "$EXPECTED_ENV" != "production" ]]; then
  echo -e "${RED}❌ 오류: 올바른 환경을 지정해주세요 (development 또는 production)${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🔍 배포 환경 검증${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# .env 파일 존재 확인
if [[ ! -f .env ]]; then
  echo -e "${RED}❌ 오류: .env 파일이 없습니다${NC}"
  exit 1
fi

# .env 파일 환경 확인
ENV_TYPE=$(grep "^ENVIRONMENT=" .env | cut -d'=' -f2)
TARGET=$(grep "^X_TARGET_USERNAME=" .env | cut -d'=' -f2)
AWS_ACCOUNT=$(grep "^AWS_ACCOUNT_ID=" .env | cut -d'=' -f2)

echo -e "${YELLOW}📄 현재 .env 파일 설정:${NC}"
echo "  환경: $ENV_TYPE"
echo "  타겟 계정: @$TARGET"
echo "  AWS 계정: $AWS_ACCOUNT"
echo ""

# 예상 환경과 .env 파일 환경 비교
if [[ "$EXPECTED_ENV" != "$ENV_TYPE" ]]; then
  echo -e "${RED}❌ 오류: .env 파일 환경 불일치${NC}"
  echo "  예상: $EXPECTED_ENV"
  echo "  실제: $ENV_TYPE"
  echo ""
  echo -e "${YELLOW}💡 해결 방법:${NC}"
  echo "  올바른 .env 파일이 자동으로 설정됩니다."
  echo "  이 메시지는 내부 검증용이므로 무시하셔도 됩니다."
  echo ""
fi

# AWS 자격 증명 확인
echo -e "${YELLOW}🔑 AWS 자격 증명 확인:${NC}"

if [[ "$EXPECTED_ENV" == "production" ]]; then
  # 프로덕션은 --profile nasun-prod 사용 (스크립트에서 자동 지정)
  CURRENT_ACCOUNT=$(aws sts get-caller-identity --profile nasun-prod --query Account --output text 2>/dev/null || echo "NONE")
  PROFILE_INFO="nasun-prod"
else
  # 개발은 기본 자격 증명 사용
  CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "NONE")
  PROFILE_INFO="default"
fi

if [[ "$CURRENT_ACCOUNT" == "NONE" ]]; then
  echo -e "${RED}❌ 오류: AWS 자격 증명을 가져올 수 없습니다${NC}"
  echo ""
  echo -e "${YELLOW}💡 해결 방법:${NC}"
  if [[ "$EXPECTED_ENV" == "production" ]]; then
    echo "  1. AWS CLI 프로필 'nasun-prod' 설정 확인"
    echo "     aws configure --profile nasun-prod"
  else
    echo "  1. AWS CLI 기본 자격 증명 설정 확인"
    echo "     aws configure"
  fi
  exit 1
fi

echo "  계정 ID: $CURRENT_ACCOUNT"
echo "  프로필: $PROFILE_INFO"
echo ""

# 환경별 예상 계정 ID
if [[ "$EXPECTED_ENV" == "development" ]]; then
  EXPECTED_ACCOUNT="135808943968"
  EXPECTED_TARGET="Naru010110"
elif [[ "$EXPECTED_ENV" == "production" ]]; then
  EXPECTED_ACCOUNT="466841130170"
  EXPECTED_TARGET="Nasun_io"
fi

# 계정 불일치 확인
if [[ "$CURRENT_ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo -e "${RED}❌ 오류: AWS 계정 불일치${NC}"
  echo "  예상 계정 ($EXPECTED_ENV): $EXPECTED_ACCOUNT"
  echo "  현재 계정: $CURRENT_ACCOUNT"
  echo ""
  echo -e "${YELLOW}💡 해결 방법:${NC}"
  if [[ "$EXPECTED_ENV" == "production" ]]; then
    echo "  1. 프로덕션 AWS Profile 설정 확인:"
    echo "     aws configure --profile nasun-prod"
    echo ""
    echo "  2. 또는 개발 환경에 배포하려면:"
    echo "     pnpm deploy:dev"
  else
    echo "  1. 개발 계정 자격 증명 설정 확인:"
    echo "     aws configure"
    echo ""
    echo "  2. 또는 프로덕션 환경에 배포하려면:"
    echo "     pnpm deploy:prod"
  fi
  exit 1
fi

# 타겟 계정 불일치 확인 (경고만, 차단하지 않음 - deploy-safe-env.sh에서 자동 수정)
if [[ "$TARGET" != "$EXPECTED_TARGET" ]]; then
  echo -e "${YELLOW}⚠️  주의: .env 파일의 타겟 계정이 예상과 다릅니다${NC}"
  echo "  예상 타겟 ($EXPECTED_ENV): @$EXPECTED_TARGET"
  echo "  현재 타겟: @$TARGET"
  echo "  → deploy-safe-env.sh에서 자동으로 수정됩니다."
  echo ""
fi

# 검증 완료
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ 환경 검증 완료!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📦 배포 환경: ${EXPECTED_ENV}${NC}"
echo -e "${BLUE}🎯 타겟 계정: @${EXPECTED_TARGET}${NC}"
echo -e "${BLUE}☁️  AWS 계정: ${EXPECTED_ACCOUNT}${NC}"
echo ""

exit 0
