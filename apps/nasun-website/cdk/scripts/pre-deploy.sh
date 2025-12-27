#!/bin/bash
# Pre-deployment script: Build all Lambdas automatically
# This script prevents 502 errors by ensuring all TypeScript files are compiled

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔨 Pre-deployment: Building all Lambdas..."
echo "📂 CDK Root: $CDK_ROOT"
echo ""

# =============================================================================
# Build auth-twitter (TypeScript + npm - NOT pnpm!)
# =============================================================================
echo "📦 Building auth-twitter..."
cd "$CDK_ROOT/lambda-src/auth-twitter"

if [ -f "package.json" ]; then
  # Check if pnpm is being used (causes symlink issues)
  if [ -d "node_modules/.pnpm" ]; then
    echo "⚠️  pnpm detected! Converting to npm to avoid symlink issues..."
    rm -rf node_modules package-lock.json
    npm install --silent
  fi

  # Ensure npm is used (not pnpm)
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  # Build TypeScript
  echo "🔨 Compiling TypeScript..."
  npm run build

  # Verify build output
  if [ -f "index.js" ] && [ -f "src/handlers/login.js" ] && [ -f "src/handlers/callback.js" ]; then
    echo "✅ auth-twitter built successfully!"
  else
    echo "❌ auth-twitter build failed! Missing compiled files."
    exit 1
  fi
else
  echo "⚠️  No package.json found in auth-twitter"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build x-leaderboard (esbuild)
# =============================================================================
echo "📦 Building x-leaderboard..."
cd "$CDK_ROOT/lambda-src/x-leaderboard"

if [ -f "package.json" ]; then
  # Use pnpm for x-leaderboard (it's configured correctly)
  if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies with pnpm..."
    pnpm install --silent
  fi

  # Build with esbuild
  echo "🔨 Building with esbuild..."
  pnpm build

  # Verify build output
  if [ -d "dist" ]; then
    echo "✅ x-leaderboard built successfully!"
  else
    echo "❌ x-leaderboard build failed! Missing dist directory."
    exit 1
  fi
else
  echo "⚠️  No package.json found in x-leaderboard"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build wallet-api (pnpm)
# =============================================================================
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
    echo "❌ wallet-api build failed! Missing dist directory."
    exit 1
  fi
else
  echo "⚠️  No package.json found in wallet-api"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build PriceAPI (pnpm)
# =============================================================================
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
    echo "❌ PriceAPI build failed! Missing dist directory."
    exit 1
  fi
else
  echo "⚠️  No package.json found in PriceAPI"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build sync-community-members (npm)
# =============================================================================
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
    echo "❌ sync-community-members build failed! Missing compiled files."
    exit 1
  fi
else
  echo "⚠️  No package.json found in sync-community-members"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build get-backup-prices (npm + esbuild)
# =============================================================================
echo "📦 Building get-backup-prices..."
cd "$CDK_ROOT/lambda-src/get-backup-prices"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Building with esbuild..."
  npm run build

  if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo "✅ get-backup-prices built successfully!"
  else
    echo "❌ get-backup-prices build failed! Missing dist/index.js."
    exit 1
  fi
else
  echo "⚠️  No package.json found in get-backup-prices"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build get-follower-count (npm + esbuild)
# =============================================================================
echo "📦 Building get-follower-count..."
cd "$CDK_ROOT/lambda-src/get-follower-count"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Building with esbuild..."
  npm run build

  if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo "✅ get-follower-count built successfully!"
  else
    echo "❌ get-follower-count build failed! Missing dist/index.js."
    exit 1
  fi
else
  echo "⚠️  No package.json found in get-follower-count"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build get-user-count (npm + esbuild)
# =============================================================================
echo "📦 Building get-user-count..."
cd "$CDK_ROOT/lambda-src/get-user-count"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Building with esbuild..."
  npm run build

  if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo "✅ get-user-count built successfully!"
  else
    echo "❌ get-user-count build failed! Missing dist/index.js."
    exit 1
  fi
else
  echo "⚠️  No package.json found in get-user-count"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Build whitelist Lambda (TypeScript + npm)
# =============================================================================
echo "📦 Building whitelist..."
cd "$CDK_ROOT/lambda-src/whitelist"

if [ -f "package.json" ]; then
  if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📥 Installing dependencies with npm..."
    npm install --silent
  fi

  echo "🔨 Compiling TypeScript..."
  npm run build

  if [ -d "dist" ] && [ -f "dist/handlers/check.js" ]; then
    echo "✅ whitelist built successfully!"
  else
    echo "❌ whitelist build failed! Missing dist/handlers/check.js."
    exit 1
  fi
else
  echo "⚠️  No package.json found in whitelist"
fi

cd "$CDK_ROOT"
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "✅ All Lambdas built successfully!"
echo ""
echo "📋 Build Summary:"
echo "  ✅ auth-twitter: TypeScript compiled (npm)"
echo "  ✅ x-leaderboard: esbuild completed (pnpm)"
echo "  ✅ wallet-api: pnpm build completed"
echo "  ✅ PriceAPI: pnpm build completed"
echo "  ✅ sync-community-members: npm build completed"
echo "  ✅ get-backup-prices: esbuild completed (npm)"
echo "  ✅ get-follower-count: esbuild completed (npm)"
echo "  ✅ get-user-count: esbuild completed (npm)"
echo "  ✅ whitelist: TypeScript compiled (npm)"
echo ""
echo "🚀 Ready to deploy!"
