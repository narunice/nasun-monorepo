#!/bin/bash
# ================================================================
# NASUN CDK Deployment Script - Environment Aware
# ================================================================
# 사용법:
#   bash scripts/deploy-env.sh development
#   bash scripts/deploy-env.sh production
# ================================================================

set -e  # 에러 발생 시 즉시 종료

# ================================================================
# 1. 환경 검증
# ================================================================
ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
  echo "❌ 에러: 환경을 지정하세요."
  echo "사용법: bash scripts/deploy-env.sh [development|production]"
  exit 1
fi

if [ "$ENVIRONMENT" != "development" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "❌ 에러: 잘못된 환경입니다. (development 또는 production)"
  exit 1
fi

echo "🚀 NASUN CDK Deployment - $ENVIRONMENT 환경"
echo "================================================"

# ================================================================
# 2. 환경 변수 파일 확인
# ================================================================
ENV_FILE=".env.$ENVIRONMENT"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 에러: $ENV_FILE 파일이 존재하지 않습니다."
  exit 1
fi

echo "✅ 환경 변수 파일: $ENV_FILE"

# ================================================================
# 3. .env 파일에 환경별 설정 로드
# ================================================================
echo "🔄 환경 변수 로드 중..."

# 기본 .env 파일 백업
if [ -f ".env" ]; then
  cp .env .env.backup
  echo "✅ 기존 .env 파일 백업 완료 (.env.backup)"
fi

# 환경별 설정 복사
cp "$ENV_FILE" .env
echo "✅ $ENV_FILE → .env 복사 완료"

# ================================================================
# 4. 환경 변수 검증
# ================================================================
echo "🔍 환경 변수 검증 중..."

source .env

if [ -z "$X_TARGET_USERNAME" ]; then
  echo "❌ 에러: X_TARGET_USERNAME이 설정되지 않았습니다."
  exit 1
fi

if [ -z "$TWITTER_TOKENS_SECRET_NAME" ]; then
  echo "❌ 에러: TWITTER_TOKENS_SECRET_NAME이 설정되지 않았습니다."
  exit 1
fi

echo "✅ 타겟 계정: @$X_TARGET_USERNAME"
echo "✅ Secret ID: $TWITTER_TOKENS_SECRET_NAME"

# ================================================================
# 5. Lambda 빌드
# ================================================================
echo "📦 Lambda 함수 빌드 중..."

cd lambda-src/x-leaderboard
npm run build
cd ../../

echo "✅ Lambda 빌드 완료"

# ================================================================
# 6. CDK Synth (검증)
# ================================================================
echo "🔍 CDK Synth (검증) 중..."
pnpm cdk synth > /dev/null
echo "✅ CDK Synth 성공"

# ================================================================
# 7. CDK Diff (변경사항 확인)
# ================================================================
echo "📊 CDK Diff (변경사항 확인)..."
pnpm cdk diff CdkStack || true
echo ""

# ================================================================
# 8. 배포 확인
# ================================================================
read -p "⚠️  $ENVIRONMENT 환경에 배포하시겠습니까? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 배포 취소됨"

  # .env 복원
  if [ -f ".env.backup" ]; then
    mv .env.backup .env
    echo "✅ .env 파일 복원 완료"
  fi

  exit 1
fi

# ================================================================
# 9. CDK 배포
# ================================================================
echo "🚀 CDK 배포 시작..."
pnpm cdk deploy CdkStack --require-approval never

echo ""
echo "🎉 배포 완료!"
echo "환경: $ENVIRONMENT"
echo "타겟 계정: @$X_TARGET_USERNAME"
echo "Secret ID: $TWITTER_TOKENS_SECRET_NAME"

# ================================================================
# 10. .env 복원 (선택)
# ================================================================
if [ -f ".env.backup" ]; then
  read -p "🔄 .env 파일을 원래대로 복원하시겠습니까? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    mv .env.backup .env
    echo "✅ .env 파일 복원 완료"
  else
    rm .env.backup
    echo "✅ 백업 파일 삭제됨"
  fi
fi

echo "✅ 스크립트 완료"
