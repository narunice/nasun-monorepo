#!/bin/bash
# Build script for auth-twitter Lambda function
# This Lambda requires TypeScript compilation before deployment

set -e

echo "🔨 Building auth-twitter Lambda..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found"
  echo "   Please run this script from the auth-twitter directory"
  exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Compile TypeScript
echo "⚙️  Compiling TypeScript..."
npm run build

# Verify compiled files exist
echo "✅ Verifying compiled files..."
REQUIRED_FILES=(
  "index.js"
  "src/handlers/login.js"
  "src/handlers/callback.js"
  "src/utils/secrets.js"
  "src/utils/session-manager.js"
  "src/utils/twitter-api.js"
  "src/utils/cognito.js"
  "src/utils/pkce.js"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    MISSING_FILES+=("$file")
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo "❌ Error: Missing compiled files:"
  for file in "${MISSING_FILES[@]}"; do
    echo "   - $file"
  done
  exit 1
fi

echo "✅ Build successful!"
echo ""
echo "📦 Compiled files:"
for file in "${REQUIRED_FILES[@]}"; do
  echo "   ✓ $file"
done
