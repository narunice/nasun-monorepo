#!/usr/bin/env bash
# Build gostop frontend and deploy to S3 + invalidate CloudFront.
#
# Reads bucket + distribution id from CDK CFN outputs. Run after
# `pnpm cdk deploy` has provisioned the stack.
#
# Usage:
#   ./scripts/deploy-frontend.sh [--profile <aws-profile>]

set -euo pipefail

PROFILE="${AWS_PROFILE:-nasun-prod}"
REGION="us-east-1"
STACK="GostopSiteStack"

if [[ "${1:-}" == "--profile" && -n "${2:-}" ]]; then
  PROFILE="$2"
fi

echo "==> AWS profile: $PROFILE"
echo "==> Region:       $REGION"
echo "==> Stack:        $STACK"

# Pull stack outputs
echo "==> Reading CDK outputs..."
OUTPUTS=$(aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' \
  --output json)

BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="BucketName") | .OutputValue')
DIST_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DistributionId") | .OutputValue')

if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "ERROR: could not parse BucketName or DistributionId from $STACK outputs"
  exit 1
fi

echo "==> Bucket:           $BUCKET"
echo "==> Distribution:     $DIST_ID"

# Build frontend
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
FRONTEND_DIR="$ROOT/apps/gostop/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

echo "==> Building frontend..."
cd "$ROOT"
pnpm --filter @nasun/gostop build

if [[ ! -d "$DIST_DIR" ]]; then
  echo "ERROR: build did not produce $DIST_DIR"
  exit 1
fi

# Sync to S3.
# Hashed assets (long cache) first, then index.html (no cache) last so
# users never see a stale shell pointing at missing chunks.
echo "==> Syncing hashed assets (long cache)..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --delete \
  --exclude "index.html" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable"

echo "==> Uploading HTML (no cache)..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate"

# CloudFront invalidation. SPA fallback (/index.html for 403/404) means we
# only need to invalidate the HTML and root paths.
echo "==> Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --profile "$PROFILE" \
  --distribution-id "$DIST_ID" \
  --paths "/" "/index.html" "/*.html" \
  --query 'Invalidation.Id' \
  --output text)

echo "==> Invalidation: $INVALIDATION_ID"
echo ""
echo "Deploy complete. Site: https://gostop.app"
