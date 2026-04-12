#!/usr/bin/env bash
#
# Post-deploy smoke test for Creator Posts Explorer API endpoint.
#
# Verifies routing + auth + validation edge cases on a deployed Explorer API.
# Does NOT insert PG rows (uses invalid tokens / bodies throughout).
#
# Usage:
#   EXPLORER_URL=https://explorer-api.nasun.io bash e2e-smoke.sh
#   EXPLORER_URL=https://explorer-api.nasun.io API_KEY=... bash e2e-smoke.sh  # full check
#
set -u

EXPLORER_URL="${EXPLORER_URL:-https://explorer-api.nasun.io}"
ENDPOINT="$EXPLORER_URL/api/v1/points/creator-post-reward"
API_KEY="${API_KEY:-}"

PASS=0
FAIL=0
failed_cases=()

assert_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$expected" == "$actual" ]]; then
    echo "✓ $name → $actual"
    PASS=$((PASS + 1))
  else
    echo "✗ $name → expected=$expected actual=$actual body=$body"
    FAIL=$((FAIL + 1))
    failed_cases+=("$name")
  fi
}

echo "=== Health check 1: POST with invalid key → 401 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"12345","points":1}')
assert_status "invalid key → 401" "401" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Health check 2: POST missing key → 401 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"12345","points":1}')
assert_status "missing key → 401" "401" "$resp" "$(cat /tmp/smoke_body)"

if [[ -z "$API_KEY" ]]; then
  echo ""
  echo "(Set API_KEY=... env var to run authenticated validation tests)"
  echo ""
  echo "Summary: $PASS passed, $FAIL failed"
  exit $([[ $FAIL -eq 0 ]] && echo 0 || echo 1)
fi

# ==============================================================
# Authenticated validation tests (require real API_KEY)
# ==============================================================
# None of these should produce a PG row (all invalid payloads).

echo ""
echo "=== Validation 1: invalid identityId → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"not-a-valid-identity","postId":"12345","points":1}')
assert_status "bad identityId → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Validation 2: non-numeric postId → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"abc","points":1}')
assert_status "non-numeric postId → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Validation 3: short postId (<5 digits) → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"123","points":1}')
assert_status "short postId → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Validation 4: points out of range (31) → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"12345","points":31}')
assert_status "points=31 → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Validation 5: points=0 → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"12345","points":0}')
assert_status "points=0 → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Validation 6: bad wallet format (not 0x+64hex) → 400 ==="
resp=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identityId":"ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","postId":"12345","points":1,"walletAddress":"0xbad"}')
assert_status "bad wallet → 400" "400" "$resp" "$(cat /tmp/smoke_body)"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
if [[ $FAIL -gt 0 ]]; then
  echo "Failed cases:"
  printf '  - %s\n' "${failed_cases[@]}"
  exit 1
fi
exit 0
