# X OAuth 2.0 Token Management Guide

## Overview

This document describes how OAuth 2.0 tokens are managed for the Nasun website backend services (e.g., follower count API, follower collection).

**Critical Requirement**: The OAuth 2.0 token MUST be authenticated as the **target account** (@Nasun_io) itself for user-context API calls.

## IMPORTANT: Cross-Environment Token Invalidation

Dev and Prod share the **same Twitter OAuth2 App** (same Client ID) and the **same user account** (@Nasun_io). This creates a critical constraint:

- **Twitter OAuth 2.0 refresh tokens are single-use.** When a refresh token is used, it is immediately invalidated and a new one is issued.
- **Running `setup-oauth2-auto.ts` for one environment may invalidate the other environment's refresh token.** Twitter may revoke previous authorization grants when a new one is created for the same App + User combination.

**Current policy:**
- **Production**: Automatic token refresh enabled (EventBridge every 70 min)
- **Development**: Automatic token refresh **disabled**. Dev uses Bearer Token (App-Only) for follower count API, which never expires.
- Dev OAuth2 tokens are only set up manually when needed for testing user-context APIs.

## Environment Configuration

### Token Storage

| Environment | Secret Name | AWS Account | Target Account | Auto-Refresh |
|-------------|-------------|-------------|----------------|--------------|
| Development | `nasun-twitter-tokens` | 135808943968 | @Nasun_io (1725466995565752320) | **Disabled** |
| Production | `nasun-twitter-tokens-prod` | 466841130170 | @Nasun_io (1725466995565752320) | Enabled (70 min) |

### Environment Files

```
apps/nasun-website/cdk/
├── .env.development    # Development config (TARGET_USER_ID=1725466995565752320)
├── .env.production     # Production config (TARGET_USER_ID=1725466995565752320)
└── .env                # Currently loaded config (symlink or copy)
```

### OAuth 2.0 Required Scopes

```
tweet.read users.read follows.read offline.access like.read list.read
```

- `like.read`: Required for Liking Users API
- `offline.access`: Required for Refresh Token

### Token Validity Periods

| Token Type | Validity | Renewal Method |
|------------|----------|----------------|
| OAuth 2.0 Access Token | **2 hours** | Auto-refresh via Refresh Token |
| OAuth 2.0 Refresh Token | **6 months** | Manual re-authentication |
| OAuth 1.0a Tokens | Permanent (until revoked) | Manual reissue |
| Bearer Token | Permanent (until app deleted) | Regenerate in X Developer Portal |

---

## Checklist: OAuth 2.0 Token Re-authentication

Use this checklist when re-authenticating OAuth 2.0 tokens.

### Before Running setup-oauth2-auto.ts

- [ ] **1. Verify current AWS account**
  ```bash
  aws sts get-caller-identity --query 'Account' --output text
  # Expected: 135808943968 (dev) or 466841130170 (prod)
  ```

- [ ] **2. Check environment variables**
  ```bash
  cd apps/nasun-website/cdk
  grep "X_TARGET_USERNAME\|TWITTER_TOKENS_SECRET_NAME" .env
  ```

- [ ] **3. Stop development server** (port 5174 conflict)
  ```bash
  # Check if port 5174 is in use
  lsof -i :5174
  # Kill if necessary
  kill <PID>
  ```

- [ ] **4. Log out of wrong X accounts in browser**
  - Open https://x.com in browser
  - Ensure logged in as **@Nasun_io** (dev) or **@Nasun_io** (prod)

### Run Authentication

```bash
cd apps/nasun-website/cdk
npx tsx setup-oauth2-auto.ts
```

### After Authentication

- [ ] **5. Verify authenticated account**
  ```bash
  npx tsx scripts/verify-oauth-token.ts              # Development only
  npx tsx scripts/verify-oauth-token.ts --env=prod   # Production only
  npx tsx scripts/verify-oauth-token.ts --all        # Both environments
  # Must show: @Nasun_io (dev) or @Nasun_io (prod)
  ```

- [ ] **6. Test Liking Users API**
  ```bash
  npx tsx scripts/verify-oauth-token.ts --all
  # Verify token works for both dev and prod environments
  ```

---

## Checklist: Pipeline Debugging

Use this checklist when pipeline returns 0 likes/retweets/quotes.

### Quick Diagnosis

- [ ] **1. Check authenticated account**
  ```bash
  cd apps/nasun-website/cdk
  npx tsx scripts/verify-oauth-token.ts --all   # Check both dev and prod
  ```
  - If account mismatch: Re-authenticate with correct account

- [ ] **2. Check token expiry**
  - Script above shows expiry time
  - If expired: Run `setup-oauth2-auto.ts`

- [ ] **3. Check CloudWatch logs**
  ```bash
  aws logs filter-log-events \
    --log-group-name "/aws/lambda/nasun-collect-likes" \
    --start-time $(date -d '1 hour ago' +%s000) \
    --query 'events[*].message' --output text | grep -E "(ERROR|VALIDATION|result_count)"
  ```

### Common Error Patterns

| Log Message | Cause | Solution |
|-------------|-------|----------|
| `result_count: 0` but `public_metrics.like_count > 0` | Wrong OAuth account | Re-authenticate |
| `Token expired` | Token not refreshed | Run refresh Lambda or re-auth |
| `invalid_grant` | Refresh token rotation failed | Re-authenticate |
| `403 Forbidden` | API tier limitation | Check X Developer Portal |

---

## Checklist: CDK Deployment

Use this checklist before deploying Lambda functions.

### Pre-deployment

- [ ] **1. Set NODE_ENV explicitly**
  ```bash
  export NODE_ENV=development  # or production
  echo $NODE_ENV
  ```

- [ ] **2. Verify .env file loaded**
  ```bash
  cd apps/nasun-website/cdk
  cat .env | grep -E "ENVIRONMENT|TARGET_USER"
  ```

- [ ] **3. Verify AWS profile**
  ```bash
  aws sts get-caller-identity
  # Dev: 135808943968
  # Prod: 466841130170 (use --profile nasun-prod)
  ```

### Deployment

```bash
# Development
NODE_ENV=development npx cdk deploy CdkStack

# Production
NODE_ENV=production npx cdk deploy CdkStack --profile nasun-prod
```

### Post-deployment

- [ ] **4. Verify Lambda environment variables**
  ```bash
  aws lambda get-function-configuration \
    --function-name nasun-collect-likes \
    --query 'Environment.Variables.TARGET_USER_ID' --output text
  # Must match target account ID
  ```

---

## Token Architecture

### Secrets Manager Structure

```json
{
  "apiKey": "...",
  "apiSecret": "...",
  "accessToken": "...",
  "accessTokenSecret": "...",
  "bearerToken": "...",
  "oauth2": {
    "clientId": "...",
    "clientSecret": "...",
    "userAccessToken": "...",
    "refreshToken": "...",
    "redirectUri": "http://localhost:5174/callback",
    "expiresAt": 1736654084934,
    "lastRefreshed": "2026-01-12T01:14:44.934Z",
    "scope": "follows.read offline.access like.read users.read tweet.read"
  }
}
```

### Token Refresh Flow (Production only)

> **Note:** Token refresh is disabled in development. See "Cross-Environment Token Invalidation" above.

1. **EventBridge**: Triggers every 70 minutes (production only)
2. **Lambda** (`nasun-follower-token-refresh`): Checks if token expires within 60 minutes
3. **Twitter API**: Exchanges refresh token for new access token
4. **Secrets Manager**: Updates stored tokens atomically (5 retries with exponential backoff)

### Critical Warning: Refresh Token Rotation

Twitter issues a **new refresh token** with each access token refresh (single-use policy). The old refresh token becomes invalid immediately.

If Secrets Manager update fails after receiving new tokens:
- Old refresh token is already invalidated
- New refresh token is lost
- **Manual re-authentication required**

### Get Follower Count Token Strategy

The `get-follower-count` Lambda uses this priority order:
1. **Bearer Token (App-Only)** — preferred, never expires
2. **OAuth2 User Access Token** — fallback, requires active refresh

This ensures follower count API works in both environments regardless of OAuth2 token refresh status.

### CloudWatch Monitoring

**Lambda Function**: `nasun-follower-token-refresh`
- Execution: EventBridge scheduler triggers every 70 minutes (production only)
- Refresh condition: Access Token expires within 60 minutes

**Alarms**:
- `NASUN-OAuth토큰-갱신실패` (Development)
- `nasun-oauth2-token-refresh-failure` (Both)
- `nasun-oauth2-invalid-refresh-token` (Both)
- Trigger: 2 consecutive errors within 10 minutes
- Action: SNS Topic `nasun-monitoring-alerts`

**Dashboard**: `NASUN-Operations-Monitoring`
- OAuth 2.0 Token Refresh execution status
- Token refresh execution duration

---

## Troubleshooting

### "Liking Users API returns empty array"

**Symptom**: `public_metrics.like_count` shows 22, but API returns 0 users.

**Cause**: OAuth 2.0 token authenticated as wrong account.

**Solution**:
1. Run `verify-oauth-token.ts` to check current account
2. Run `setup-oauth2-auto.ts` with correct X account logged in

### "Token refresh failed: invalid_grant" or "invalid_request"

**Symptom**: Refresh Lambda fails with invalid_grant or "Value passed for the token was invalid" error.

**Cause**: Refresh token was invalidated. Common reasons:
1. `setup-oauth2-auto.ts` was run for the other environment, revoking this environment's token
2. Refresh token was rotated but Secrets Manager update failed
3. User manually revoked app access in X settings

**Solution**:
1. Run `setup-oauth2-auto.ts` to get fresh tokens for the affected environment
2. **Warning**: This may invalidate the other environment's token (see "Cross-Environment Token Invalidation")
3. Verify tokens saved to correct Secret

### "EADDRINUSE: port 5174"

**Symptom**: setup-oauth2-auto.ts fails to start callback server.

**Cause**: Development server using port 5174.

**Solution**:
```bash
# Find and kill process
lsof -i :5174
kill <PID>
# Or stop dev server in VS Code terminal
```

---

## Related Files

| File | Purpose |
|------|---------|
| `/scripts/daily-health-check.sh` | **통합 일일 점검 스크립트 (권장)** |
| `setup-oauth2-auto.ts` | OAuth 2.0 authorization flow |
| `scripts/verify-oauth-token.ts` | Token status verification |
| `.env.development` | Development environment config |
| `.env.production` | Production environment config |
| `lambda-src/get-follower-count/` | Follower count API using OAuth2 tokens |

---

## Daily Health Check

통합 일일 점검 스크립트를 사용하여 파이프라인 상태, 토큰 만료, **계정 일치 여부**를 한 번에 확인할 수 있습니다.

```bash
# 전체 시스템 점검 (개발 + 프로덕션)
/home/naru/my_apps/nasun-monorepo/scripts/daily-health-check.sh
```

이 스크립트는 다음을 점검합니다:
1. Step Functions 파이프라인 실행 상태
2. 데이터 수집량 분석 (likes, reposts, quotes, replies)
3. 리더보드 변경 사항
4. OAuth 2.0 토큰 만료 상태 (Secrets Manager)
5. **OAuth 2.0 토큰 계정 검증 (Twitter API)** - 이번에 발생한 계정 불일치 문제 감지

---

## Appendix: Quick Commands

```bash
# 전체 시스템 점검 (권장)
/home/naru/my_apps/nasun-monorepo/scripts/daily-health-check.sh

# Check token status (single environment)
cd apps/nasun-website/cdk
npx tsx scripts/verify-oauth-token.ts              # Development (default)
npx tsx scripts/verify-oauth-token.ts --env=dev   # Development
npx tsx scripts/verify-oauth-token.ts --env=prod  # Production

# Check both environments at once
npx tsx scripts/verify-oauth-token.ts --all

# Re-authenticate OAuth 2.0
npx tsx setup-oauth2-auto.ts

# Verify OAuth tokens
npx tsx scripts/verify-oauth-token.ts --all

# Check Lambda environment
aws lambda get-function-configuration --function-name nasun-collect-likes \
  --query 'Environment.Variables' --output json

# View recent logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/nasun-collect-likes" \
  --start-time $(date -d '30 minutes ago' +%s000) \
  --query 'events[*].message' --output text | head -50
```
