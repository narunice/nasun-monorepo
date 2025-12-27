#!/bin/bash
# =============================================================================
# 프로덕션 OAuth 2.0 토큰 수동 갱신 스크립트
#
# 사용 시점:
#   - Refresh Token이 만료되었을 때 (6개월)
#   - Refresh Token이 revoked 되었을 때
#   - 새로운 OAuth 2.0 인증이 필요할 때
#
# 사용법:
#   cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
#   bash scripts/refresh-prod-token.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 프로덕션 OAuth 2.0 설정 (.env.production에서)
CLIENT_ID="Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ"
CLIENT_SECRET="RcHQOdpn9t07L9YGav4nL8QUFJzweK5HZlajYDPUU2w1UrlRIh"
REDIRECT_URI="https://nasun.io/callback"
SCOPE="tweet.read%20users.read%20follows.read%20offline.access%20like.read%20list.read"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       프로덕션 OAuth 2.0 토큰 수동 갱신 스크립트             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠️  주의: 이 스크립트는 @GenSol_io 계정의 OAuth 2.0 토큰을 갱신합니다.${NC}"
echo -e "${YELLOW}   브라우저에서 @GenSol_io 계정으로 로그인해야 합니다.${NC}"
echo ""

# AWS 프로필 확인
echo -e "${CYAN}🔐 AWS 자격 증명 확인 중...${NC}"
CURRENT_ACCOUNT=$(aws sts get-caller-identity --profile nasun-prod --query Account --output text 2>/dev/null || echo "ERROR")

if [[ "$CURRENT_ACCOUNT" == "ERROR" ]]; then
    echo -e "${RED}❌ AWS 자격 증명 실패${NC}"
    echo "   'nasun-prod' 프로필이 ~/.aws/credentials에 설정되어 있는지 확인하세요."
    exit 1
fi

if [[ "$CURRENT_ACCOUNT" != "466841130170" ]]; then
    echo -e "${RED}❌ AWS 계정 불일치!${NC}"
    echo "   현재: $CURRENT_ACCOUNT"
    echo "   예상: 466841130170 (프로덕션)"
    exit 1
fi

echo -e "${GREEN}✅ AWS 자격 증명 확인 완료 (Account: $CURRENT_ACCOUNT)${NC}"
echo ""

# Step 1: PKCE 파라미터 생성
echo -e "${CYAN}📝 Step 1: PKCE 파라미터 생성${NC}"
CODE_VERIFIER=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 64)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 16)

echo "  CODE_VERIFIER: $CODE_VERIFIER"
echo ""

# Step 2: Authorization URL 생성
echo -e "${CYAN}📝 Step 2: Authorization URL 생성${NC}"
AUTH_URL="https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}🔗 아래 URL을 브라우저에서 열고 @GenSol_io 계정으로 인증하세요:${NC}"
echo ""
echo -e "${GREEN}$AUTH_URL${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Authorization Code 입력
echo -e "${CYAN}📝 Step 3: Redirect 후 URL에서 'code' 파라미터 값을 복사하세요${NC}"
echo "   예: https://nasun.io/callback?state=xxx&code=CODE_HERE"
echo ""
read -p "Authorization Code 입력: " AUTH_CODE

if [[ -z "$AUTH_CODE" ]]; then
    echo -e "${RED}❌ Authorization Code가 입력되지 않았습니다.${NC}"
    exit 1
fi

# Step 4: Token Exchange
echo ""
echo -e "${CYAN}📝 Step 4: Token 교환 중...${NC}"

RESPONSE=$(curl -s -X POST 'https://api.twitter.com/2/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "code=${AUTH_CODE}" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "redirect_uri=${REDIRECT_URI}" \
  --data-urlencode "code_verifier=${CODE_VERIFIER}" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}")

# 응답 확인
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${RED}❌ Token 교환 실패:${NC}"
    echo "$RESPONSE" | jq .
    exit 1
fi

NEW_ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
NEW_REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token')
EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in')

if [[ "$NEW_ACCESS_TOKEN" == "null" ]] || [[ -z "$NEW_ACCESS_TOKEN" ]]; then
    echo -e "${RED}❌ Token 교환 실패 - 응답에 access_token이 없습니다:${NC}"
    echo "$RESPONSE" | jq .
    exit 1
fi

echo -e "${GREEN}✅ Token 교환 성공!${NC}"
echo "  Access Token: ${NEW_ACCESS_TOKEN:0:30}..."
echo "  Refresh Token: ${NEW_REFRESH_TOKEN:0:30}..."
echo "  Expires In: ${EXPIRES_IN}초"
echo ""

# Step 5: Secrets Manager 업데이트
echo -e "${CYAN}📝 Step 5: Secrets Manager 업데이트 중...${NC}"

EXPIRES_AT=$(($(date +%s) * 1000 + EXPIRES_IN * 1000))
LAST_REFRESHED=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# 현재 시크릿 가져오기
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id nasun-twitter-tokens-prod \
  --profile nasun-prod \
  --region ap-northeast-2 \
  --query 'SecretString' \
  --output text)

if [[ -z "$CURRENT_SECRET" ]]; then
    echo -e "${RED}❌ 현재 시크릿을 가져올 수 없습니다.${NC}"
    exit 1
fi

# 새 시크릿 생성 (jq로 oauth2 필드만 업데이트)
NEW_SECRET=$(echo "$CURRENT_SECRET" | jq \
  --arg access "$NEW_ACCESS_TOKEN" \
  --arg refresh "$NEW_REFRESH_TOKEN" \
  --arg expires "$EXPIRES_AT" \
  --arg lastRefreshed "$LAST_REFRESHED" \
  '.oauth2.userAccessToken = $access |
   .oauth2.refreshToken = $refresh |
   .oauth2.expiresAt = ($expires | tonumber) |
   .oauth2.lastRefreshed = $lastRefreshed |
   .lastUpdated = $lastRefreshed |
   .version = "3.0-manual-refresh"')

# Secrets Manager 업데이트
aws secretsmanager put-secret-value \
  --secret-id nasun-twitter-tokens-prod \
  --secret-string "$NEW_SECRET" \
  --profile nasun-prod \
  --region ap-northeast-2

echo -e "${GREEN}✅ Secrets Manager 업데이트 완료!${NC}"
echo ""

# Step 6: 검증
echo -e "${CYAN}📝 Step 6: 토큰 검증${NC}"
aws secretsmanager get-secret-value \
  --secret-id nasun-twitter-tokens-prod \
  --profile nasun-prod \
  --region ap-northeast-2 \
  --query 'SecretString' \
  --output text | jq '{
    version: .version,
    lastRefreshed: .oauth2.lastRefreshed,
    expiresAt: .oauth2.expiresAt,
    tokenPrefix: .oauth2.userAccessToken[0:30]
  }'

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✅ 프로덕션 토큰 갱신 완료!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 다음 단계: 프로덕션 배포${NC}"
echo "   cd /home/naru/my_apps/nasun-apps/nasun-website/cdk"
echo "   ./deploy.sh prod"
echo ""
