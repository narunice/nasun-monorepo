#!/bin/bash
# ================================================================
# NASUN CDK Safe Deployment Script - Environment Aware
# ================================================================
# 사용법:
#   bash scripts/deploy-safe-env.sh development
#   bash scripts/deploy-safe-env.sh production
#
# 기능:
#   1. 모든 Lambda 함수 자동 빌드 (pre-deploy.sh 통합)
#   2. 빌드 결과 검증 (verify-build.sh 통합)
#   3. 환경 변수 로드 및 검증
#   4. CDK synth/diff
#   5. 안전한 배포
# ================================================================

set -e  # 에러 발생 시 즉시 종료

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ================================================================
# 1. 환경 검증
# ================================================================
ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
  echo "❌ 에러: 환경을 지정하세요."
  echo "사용법: bash scripts/deploy-safe-env.sh [development|production]"
  exit 1
fi

if [ "$ENVIRONMENT" != "development" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "❌ 에러: 잘못된 환경입니다. (development 또는 production)"
  exit 1
fi

echo "🚀 NASUN Safe CDK Deployment - $ENVIRONMENT 환경"
echo "================================================"
echo ""

# ================================================================
# 2. 환경 변수 파일 확인
# ================================================================
ENV_FILE="$CDK_ROOT/.env.$ENVIRONMENT"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 에러: $ENV_FILE 파일이 존재하지 않습니다."
  exit 1
fi

echo "✅ 환경 변수 파일: $ENV_FILE"
echo ""

# ================================================================
# 3. 모든 Lambda 빌드 (pre-deploy.sh 통합)
# ================================================================
echo "🔨 Step 1/6: 모든 Lambda 함수 빌드 중..."
echo "================================================"
echo ""

# Build auth-twitter (npm)
echo "📦 Building auth-twitter..."
cd "$CDK_ROOT/lambda-src/auth-twitter"

if [ -f "package.json" ]; then
  # pnpm symlink 문제 체크
  if [ -d "node_modules/.pnpm" ]; then
    echo "⚠️  pnpm detected! Converting to npm..."
    rm -rf node_modules package-lock.json
    npm install --silent
  fi

  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Compiling TypeScript..."
  npm run build

  if [ -f "index.js" ] && [ -f "src/handlers/login.js" ] && [ -f "src/handlers/callback.js" ]; then
    echo "✅ auth-twitter built successfully!"
  else
    echo "❌ auth-twitter build failed!"
    exit 1
  fi
else
  echo "⚠️  No package.json found in auth-twitter"
fi

cd "$CDK_ROOT"
echo ""

# Build x-leaderboard (pnpm)
echo "📦 Building x-leaderboard..."
cd "$CDK_ROOT/lambda-src/x-leaderboard"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies with pnpm..."
    pnpm install --silent
  fi

  echo "🔨 Building with esbuild..."
  pnpm build

  if [ -d "dist" ]; then
    echo "✅ x-leaderboard built successfully!"
  else
    echo "❌ x-leaderboard build failed!"
    exit 1
  fi
else
  echo "⚠️  No package.json found in x-leaderboard"
fi

cd "$CDK_ROOT"
echo ""

# Build wallet-api (pnpm)
echo "📦 Building wallet-api..."
cd "$CDK_ROOT/lambda-src/wallet-api"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies with pnpm..."
    pnpm install --silent
  fi
  echo "🔨 Building with pnpm..."
  pnpm build
  if [ -d "dist" ]; then
    echo "✅ wallet-api built successfully!"
  else
    echo "❌ wallet-api build failed!"
    exit 1
  fi
else
  echo "⚠️  No package.json found in wallet-api"
fi

cd "$CDK_ROOT"
echo ""

# Build PriceAPI (pnpm)
echo "📦 Building PriceAPI..."
cd "$CDK_ROOT/lambda-src/PriceAPI"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies with pnpm..."
    pnpm install --silent
  fi
  echo "🔨 Building with pnpm..."
  pnpm build
  if [ -d "dist" ]; then
    echo "✅ PriceAPI built successfully!"
  else
    echo "❌ PriceAPI build failed!"
    exit 1
  fi
else
  echo "⚠️  No package.json found in PriceAPI"
fi

cd "$CDK_ROOT"
echo ""

# Build sync-community-members (npm)
echo "📦 Building sync-community-members..."
cd "$CDK_ROOT/lambda-src/sync-community-members"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Compiling with build script..."
  npm run build

  if [ -d "dist" ]; then
    echo "✅ sync-community-members built successfully!"
  else
    echo "❌ sync-community-members build failed!"
    exit 1
  fi
else
  echo "⚠️  No package.json found in sync-community-members"
fi

cd "$CDK_ROOT"
echo ""

echo "✅ All Lambdas built successfully!"
echo ""

# ================================================================
# 4. 빌드 검증 (verify-build.sh 통합)
# ================================================================
echo "🔍 Step 2/6: 빌드 결과 검증 중..."
echo "================================================"
echo ""

ERRORS=0

# Verify auth-twitter
echo "🔍 Checking auth-twitter..."
if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/index.js" ]; then
  echo "  ❌ index.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ index.js found"
fi

if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/src/handlers/login.js" ]; then
  echo "  ❌ src/handlers/login.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ src/handlers/login.js found"
fi

if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/src/handlers/callback.js" ]; then
  echo "  ❌ src/handlers/callback.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ src/handlers/callback.js found"
fi

if [ -d "$CDK_ROOT/lambda-src/auth-twitter/node_modules/.pnpm" ]; then
  echo "  ❌ auth-twitter is using pnpm! Must use npm!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ npm is being used (no pnpm symlinks)"
fi

echo ""

# Verify x-leaderboard
echo "🔍 Checking x-leaderboard..."
if [ ! -d "$CDK_ROOT/lambda-src/x-leaderboard/dist" ]; then
  echo "  ❌ dist directory not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ dist directory found"
  HANDLER_COUNT=$(find "$CDK_ROOT/lambda-src/x-leaderboard/dist" -name "*.js" | wc -l)
  if [ "$HANDLER_COUNT" -eq 0 ]; then
    echo "  ❌ No JS files found in dist directory!"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ $HANDLER_COUNT JS files found in dist"
  fi
fi

echo ""

if [ $ERRORS -gt 0 ]; then
  echo "❌ 빌드 검증 실패! $ERRORS 개의 에러 발견"
  exit 1
fi

echo "✅ 빌드 검증 성공!"
echo ""

# ================================================================
# 5. 환경 변수 로드
# ================================================================
echo "🔄 Step 3/6: 환경 변수 로드 중..."
echo "================================================"
echo ""

# 기본 .env 파일 백업
if [ -f "$CDK_ROOT/.env" ]; then
  cp "$CDK_ROOT/.env" "$CDK_ROOT/.env.backup"
  echo "✅ 기존 .env 파일 백업 완료 (.env.backup)"
fi

# 환경별 설정 복사
cp "$ENV_FILE" "$CDK_ROOT/.env"
echo "✅ $ENV_FILE → .env 복사 완료"
echo ""

# ================================================================
# 6. 환경 변수 검증 + AWS 자격 증명 검증
# ================================================================
echo "🔍 Step 4/6: 환경 변수 및 AWS 자격 증명 검증 중..."
echo "================================================"
echo ""

source "$CDK_ROOT/.env"

# Pre-deployment check 실행 (환경 불일치 사전 차단)
if [ -f "$SCRIPT_DIR/pre-deployment-check.sh" ]; then
  bash "$SCRIPT_DIR/pre-deployment-check.sh" "$ENVIRONMENT"
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 환경 검증 실패!"

    # .env 복원
    if [ -f "$CDK_ROOT/.env.backup" ]; then
      mv "$CDK_ROOT/.env.backup" "$CDK_ROOT/.env"
      echo "✅ .env 파일 복원 완료"
    fi

    exit 1
  fi
  echo ""
fi

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
echo "✅ 환경: $ENVIRONMENT"
echo ""

# ================================================================
# 7. CDK Synth (검증)
# ================================================================
echo "🔍 Step 5/6: CDK Synth (검증) 중..."
echo "================================================"
if [ "$ENVIRONMENT" = "production" ]; then
  pnpm cdk synth --profile nasun-prod > /dev/null
else
  pnpm cdk synth > /dev/null
fi
echo "✅ CDK Synth 성공"
echo ""

# ================================================================
# 8. CDK Diff (변경사항 확인)
# ================================================================
echo "📊 CDK Diff (변경사항 확인)..."
echo "================================================"
if [ "$ENVIRONMENT" = "production" ]; then
  pnpm cdk diff CdkStack --profile nasun-prod || true
else
  pnpm cdk diff CdkStack || true
fi
echo ""

# ================================================================
# 9. 배포 확인
# ================================================================
read -p "⚠️  $ENVIRONMENT 환경에 배포하시겠습니까? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 배포 취소됨"

  # .env 복원
  if [ -f "$CDK_ROOT/.env.backup" ]; then
    mv "$CDK_ROOT/.env.backup" "$CDK_ROOT/.env"
    echo "✅ .env 파일 복원 완료"
  fi

  exit 1
fi

# ================================================================
# 10. CDK 배포
# ================================================================
echo ""
echo "🚀 Step 6/6: CDK 배포 시작..."
echo "================================================"

# 프로덕션 환경일 때 AWS Profile 지정
if [ "$ENVIRONMENT" = "production" ]; then
  echo "📍 AWS Profile: nasun-prod"
  pnpm cdk deploy CdkStack --profile nasun-prod --require-approval never
else
  pnpm cdk deploy CdkStack --require-approval never
fi

echo ""
echo "🎉 배포 완료!"
echo "환경: $ENVIRONMENT"
echo "타겟 계정: @$X_TARGET_USERNAME"
echo "Secret ID: $TWITTER_TOKENS_SECRET_NAME"
echo ""

# ================================================================
# 11. .env 복원 (선택)
# ================================================================
if [ -f "$CDK_ROOT/.env.backup" ]; then
  read -p "🔄 .env 파일을 원래대로 복원하시겠습니까? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    mv "$CDK_ROOT/.env.backup" "$CDK_ROOT/.env"
    echo "✅ .env 파일 복원 완료"
  else
    rm "$CDK_ROOT/.env.backup"
    echo "✅ 백업 파일 삭제됨"
  fi
fi

echo ""
echo "✅ 스크립트 완료"
