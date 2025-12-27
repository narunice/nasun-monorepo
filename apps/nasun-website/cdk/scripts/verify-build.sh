#!/bin/bash
# Build verification script: Check if all required files are built
# This prevents deploying broken Lambdas that cause 502 errors

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ERRORS=0

echo "🔍 Verifying Lambda builds..."
echo "📂 CDK Root: $CDK_ROOT"
echo ""

# =============================================================================
# Verify auth-twitter build
# =============================================================================
echo "🔍 Checking auth-twitter..."

# Check main handler
if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/index.js" ]; then
  echo "  ❌ index.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ index.js found"
fi

# Check login handler
if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/src/handlers/login.js" ]; then
  echo "  ❌ src/handlers/login.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ src/handlers/login.js found"
fi

# Check callback handler
if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/src/handlers/callback.js" ]; then
  echo "  ❌ src/handlers/callback.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ src/handlers/callback.js found"
fi

# Check utils
if [ ! -f "$CDK_ROOT/lambda-src/auth-twitter/src/utils/secrets.js" ]; then
  echo "  ❌ src/utils/secrets.js not found!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ src/utils/secrets.js found"
fi

# Verify npm is used (not pnpm - symlink issue)
if [ -d "$CDK_ROOT/lambda-src/auth-twitter/node_modules/.pnpm" ]; then
  echo "  ❌ auth-twitter is using pnpm! Must use npm to avoid symlink issues!"
  echo "  💡 Run: cd lambda-src/auth-twitter && rm -rf node_modules package-lock.json && npm install"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ npm is being used (no pnpm symlinks)"
fi

echo ""

# =============================================================================
# Verify x-leaderboard build
# =============================================================================
echo "🔍 Checking x-leaderboard..."

if [ ! -d "$CDK_ROOT/lambda-src/x-leaderboard/dist" ]; then
  echo "  ❌ dist directory not found!"
  echo "  💡 Run: cd lambda-src/x-leaderboard && pnpm build"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ dist directory found"

  # Check for handler files in dist
  HANDLER_COUNT=$(find "$CDK_ROOT/lambda-src/x-leaderboard/dist" -name "*.js" | wc -l)
  if [ "$HANDLER_COUNT" -eq 0 ]; then
    echo "  ❌ No JS files found in dist directory!"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ $HANDLER_COUNT JS files found in dist"
  fi
fi

echo ""

# =============================================================================
# Final result
# =============================================================================
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Build verification failed with $ERRORS error(s)!"
  echo ""
  echo "💡 To fix, run:"
  echo "   bash scripts/pre-deploy.sh"
  echo ""
  exit 1
fi

echo "✅ All builds verified successfully!"
echo ""
echo "🚀 Ready to deploy with confidence!"
exit 0
