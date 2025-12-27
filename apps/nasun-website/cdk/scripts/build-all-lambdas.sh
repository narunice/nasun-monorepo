#!/bin/bash
# Build script for all Lambda functions that require compilation
# Run this before deploying with CDK

set -e

echo "🚀 Building all Lambda functions..."
echo ""

# Track build status
BUILD_SUCCESS=()
BUILD_FAILED=()

# Build auth-twitter Lambda
echo "================================"
echo "Building: auth-twitter"
echo "================================"
if (cd lambda-src/auth-twitter && bash build.sh); then
  BUILD_SUCCESS+=("auth-twitter")
else
  BUILD_FAILED+=("auth-twitter")
fi
echo ""

# Build link-account Lambda
echo "================================"
echo "Building: link-account"
echo "================================"
if (cd lambda-src/link-account && npm run build); then
  BUILD_SUCCESS+=("link-account")
else
  BUILD_FAILED+=("link-account")
fi
echo ""

# Build x-leaderboard Lambda
echo "================================"
echo "Building: x-leaderboard"
echo "================================"
if (cd lambda-src/x-leaderboard && npm run build); then
  BUILD_SUCCESS+=("x-leaderboard")
else
  BUILD_FAILED+=("x-leaderboard")
fi
echo ""

# Print summary
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
  echo "❌ Failed builds (${#BUILD_FAILED[@]}):"
  for lambda in "${BUILD_FAILED[@]}"; do
    echo "   ✗ $lambda"
  done
  echo ""
  exit 1
fi

echo ""
echo "🎉 All Lambda functions built successfully!"
