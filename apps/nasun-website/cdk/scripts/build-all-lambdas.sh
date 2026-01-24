#!/bin/bash
# Build script for all Lambda functions that require compilation
# Run this before deploying with CDK

echo "🚀 Building all Lambda functions..."
echo ""

# Track build status
BUILD_SUCCESS=()
BUILD_FAILED=()

# Helper function to build a lambda
build_lambda() {
  local path=$1
  local name=$2
  
  if [ ! -d "$path" ]; then
    echo "⚠️  Skipping $name: Directory $path not found"
    return 0
  fi

  echo "================================"
  echo "Building: $name"
  echo "================================"
  
  if (cd "$path" && (npm install || true) && (npm run build || true)); then
    # dist 폴더가 생겼는지 확인하여 성공 여부 판단
    if [ -d "$path/dist" ]; then
      BUILD_SUCCESS+=("$name")
      echo "✅ $name built successfully"
      return 0
    else
      BUILD_FAILED+=("$name")
      echo "❌ $name failed (dist folder not found)"
      return 1
    fi
  else
    BUILD_FAILED+=("$name")
    echo "❌ $name failed (build command error)"
    return 1
  fi
}

# 1. Main Auth & Services
build_lambda "lambda-src/auth-twitter" "auth-twitter"
build_lambda "lambda-src/link-account" "link-account"
build_lambda "lambda-src/zklogin-salt" "zklogin-salt"
build_lambda "lambda-src/wallet-api" "wallet-api"
build_lambda "lambda-src/deactivate-user-account" "deactivate-user-account"
build_lambda "lambda-src/purge-deactivated-accounts" "purge-deactivated-accounts"
build_lambda "lambda-src/get-backup-prices" "get-backup-prices"
build_lambda "lambda-src/getSupplyCount" "get-supply-count"
build_lambda "lambda-src/get-user-count" "get-user-count"
build_lambda "lambda-src/get-follower-count" "get-follower-count"
build_lambda "lambda-src/governance-api" "governance-api"

# 2. NFT Event (Wave 1 Battalion)
build_lambda "lambda-src/nft-event/verify-eligibility" "nft-verify-eligibility"
build_lambda "lambda-src/nft-event/register-user" "nft-register-user"
build_lambda "lambda-src/nft-event/withdraw-user" "nft-withdraw-user"
build_lambda "lambda-src/nft-event/check-registration-status" "nft-check-status"
build_lambda "lambda-src/nft-event/export-csv" "nft-export-csv"

# Print summary
echo ""
echo "================================"
echo "Build Summary"
echo "================================"

if [ ${#BUILD_SUCCESS[@]} -gt 0 ]; then
  echo "✅ Successful builds (${#BUILD_SUCCESS[@]}):"
  for lambda in "${BUILD_SUCCESS[@]}"; do
    echo "   ✓ $lambda"
  done
fi

if [ ${#BUILD_FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌ Failed/Skipped builds (${#BUILD_FAILED[@]}):"
  for lambda in "${BUILD_FAILED[@]}"; do
    echo "   ✗ $lambda"
  done
  echo ""
fi

echo "🎉 Build process finished."
