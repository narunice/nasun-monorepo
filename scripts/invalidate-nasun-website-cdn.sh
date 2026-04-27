#!/bin/bash
# ==============================================================================
# nasun-website CloudFront 캐시 무효화 (ad-hoc)
# ==============================================================================
# 대상: nasun.io + www.nasun.io + uju.nasun.io (단일 distribution)
# 용도: 배포 외 시점에 캐시를 즉시 갱신하고 싶을 때 (e.g. CMS 변경, 긴급 수정)
# ==============================================================================

set -e

DIST_ID="E362CCGDH7WA7C"
PROFILE="nasun-prod"
PATHS="${1:-/*}"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI 가 필요합니다." >&2
  exit 1
fi

echo "🚀 CloudFront 무효화 요청"
echo "   Distribution: $DIST_ID"
echo "   Paths:        $PATHS"
echo "   Profile:      $PROFILE"
echo ""

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "$PATHS" \
  --profile "$PROFILE" \
  --query "Invalidation.Id" \
  --output text)

echo "✅ 요청됨 (ID: ${INVALIDATION_ID})"
echo "   상태 확인: aws cloudfront get-invalidation --distribution-id $DIST_ID --id $INVALIDATION_ID --profile $PROFILE --query 'Invalidation.Status'"
echo "   propagation: 보통 5~10분 (모든 엣지 반영까지 최대 15분)"
