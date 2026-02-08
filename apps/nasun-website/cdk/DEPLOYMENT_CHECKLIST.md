# 🚀 Deployment Checklist

**Use this checklist every time before deploying to production.**

---

## ⭐ 황금률: 배포는 `deploy:safe`로만!

- [ ] **모든 배포에 `pnpm run deploy:safe`를 사용했습니까?**
  - 이 명령어를 사용하지 않으면, 빌드가 누락되어 심각한 오류가 발생할 수 있습니다.

---

## ✅ Pre-Deployment Checks

### 1. Build Verification

Run the build verification script:

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
bash scripts/verify-build.sh
```

**Expected output**: All checks pass with ✅

**Manual checks** (if script fails):

- [ ] `lambda-src/auth-twitter/index.js` exists
- [ ] `lambda-src/auth-twitter/src/handlers/login.js` exists
- [ ] `lambda-src/auth-twitter/src/handlers/callback.js` exists
- [ ] `lambda-src/auth-twitter/src/utils/secrets.js` exists
- [ ] `lambda-src/auth-twitter/node_modules/.pnpm` directory **does not exist** (must use npm!)

### 2. Environment Variables

Check `.env` file exists and contains:

- [ ] `OAUTH2_CLIENT_ID` is set
- [ ] `OAUTH2_CLIENT_SECRET` is set
- [ ] `VITE_COGNITO_IDENTITY_POOL_ID` is set

```bash
# Verify environment variables
cat cdk/.env | grep -E "OAUTH2_CLIENT_ID|OAUTH2_CLIENT_SECRET|VITE_COGNITO_IDENTITY_POOL_ID"
```

### 3. AWS Secrets Manager

Verify Twitter tokens secret exists:

```bash
aws secretsmanager list-secrets --region ap-northeast-2 --query 'SecretList[?Name==`nasun-twitter-tokens`]' --output table
```

**Expected**: One secret named `nasun-twitter-tokens`

- [ ] Secret `nasun-twitter-tokens` exists in AWS Secrets Manager
- [ ] Secret name matches `cdk-stack.ts` Line 181, 190

### 4. Git Status

Check for uncommitted changes:

```bash
git status
```

- [ ] All important changes are committed
- [ ] Commit message describes the changes
- [ ] No sensitive data (API keys, secrets) in git

---

## 🚀 Deployment Steps

### Option A: Safe Deployment (Recommended)

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
pnpm run deploy:safe
```

This automatically:
1. Builds all Lambdas
2. Verifies builds
3. Deploys CDK stack

### Option B: Manual Deployment

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 1. Build all Lambdas
bash scripts/pre-deploy.sh

# 2. Verify builds
bash scripts/verify-build.sh

# 3. Deploy
pnpm cdk deploy CdkStack --require-approval never
```

---

## ✅ Post-Deployment Verification

### 1. Twitter Login API Test

Test the Twitter login endpoint:

```bash
curl -s "https://crnxmtzts7.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter/login" | jq .
```

**Expected output** (should contain all three fields):
```json
{
  "authUrl": "https://twitter.com/i/oauth2/authorize?...",
  "sessionId": "...",
  "state": "..."
}
```

**Checks**:
- [ ] Response status is 200
- [ ] Response contains `authUrl` field
- [ ] Response contains `sessionId` field
- [ ] Response contains `state` field
- [ ] No error messages in response

### 2. CloudWatch Logs Check

Check for errors in recent logs:

```bash
# Check auth-twitter Lambda
aws logs tail CdkStack-TwitterAuthLambdaLogGroup6211DDBA-jLbFN6Y4JfHJ \
  --region ap-northeast-2 --since 5m --format short | grep -i error

# If no output, logs are clean ✅
```

**Checks**:
- [ ] No `ERROR` messages in last 5 minutes
- [ ] No `Runtime.ImportModuleError` messages
- [ ] No `Secrets Manager` errors
- [ ] Lambda invocations are successful

### 3. Lambda Function Configuration

Verify Lambda was updated:

```bash
aws lambda get-function-configuration \
  --function-name CdkStack-TwitterAuthLambdaEB81C7F7-Es7tUQgbCtvN \
  --region ap-northeast-2 \
  --query 'LastModified' --output text
```

**Check**:
- [ ] `LastModified` timestamp is recent (within last 10 minutes)

### 4. Environment Variable Verification

Verify Lambda environment variables:

```bash
aws lambda get-function-configuration \
  --function-name CdkStack-TwitterAuthLambdaEB81C7F7-Es7tUQgbCtvN \
  --region ap-northeast-2 \
  --query 'Environment.Variables.SECRET_NAME' --output text
```

**Expected**: `nasun-twitter-tokens`

**Checks**:
- [ ] `SECRET_NAME` is `nasun-twitter-tokens` (not `nasun-twitter-tokens-v2`)
- [ ] `OAUTH2_CLIENT_ID` is set
- [ ] `OAUTH2_CLIENT_SECRET` is set

### 5. Frontend Test (Manual)

Visit the NASUN website and test:

- [ ] Navigate to login page
- [ ] Click "Twitter Login" button
- [ ] Button redirects to Twitter OAuth page (no 502 error)
- [ ] OAuth flow completes successfully
- [ ] User is logged in and redirected back

---

## 🔍 Troubleshooting

### If Twitter Login Returns 502

1. Check CloudWatch Logs for errors
2. Verify auth-twitter is built:
   ```bash
   ls -la lambda-src/auth-twitter/index.js
   ls -la lambda-src/auth-twitter/src/handlers/
   ```
3. Rebuild and redeploy:
   ```bash
   cd lambda-src/auth-twitter
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   cd ../..
   pnpm cdk deploy CdkStack --require-approval never
   ```

### If API Returns "Could not retrieve secrets"

1. Verify secret name:
   ```bash
   aws secretsmanager list-secrets --region ap-northeast-2 | grep twitter
   ```
2. Check `cdk-stack.ts` Line 181, 190
3. Ensure name matches: `nasun-twitter-tokens`

### If Build Verification Fails

1. Run build script:
   ```bash
   bash scripts/pre-deploy.sh
   ```
2. Check for errors in output
3. Verify builds manually:
   ```bash
   bash scripts/verify-build.sh
   ```

---

## 📋 Quick Reference

### Key Files
- **CDK Stack**: `lib/cdk-stack.ts`
- **auth-twitter Lambda**: `lambda-src/auth-twitter/`
- **Build Script**: `scripts/pre-deploy.sh`
- **Verify Script**: `scripts/verify-build.sh`

### Key Commands
```bash
# Safe deployment
pnpm run deploy:safe

# Verify builds
bash scripts/verify-build.sh

# Test Twitter login API
curl "https://crnxmtzts7.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter/login"

# Check logs
aws logs tail CdkStack-TwitterAuthLambdaLogGroup6211DDBA-jLbFN6Y4JfHJ --region ap-northeast-2 --since 5m
```

### Critical URLs
- **Twitter Auth API**: `https://crnxmtzts7.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter/login`
- **NASUN Website**: `https://nasun.io`
- **Staging**: `https://staging.nasun.io`

---

## 📝 Deployment Log Template

```
Date: YYYY-MM-DD HH:MM
Deployed by: [Your Name]
Commit: [git commit hash]

Pre-deployment checks:
- [ ] Build verified
- [ ] Environment variables checked
- [ ] Secrets verified

Deployment result:
- [ ] Deployment successful
- [ ] Twitter login API test passed
- [ ] CloudWatch logs clean
- [ ] Frontend test passed

Issues encountered:
[None / Description of issues and how they were resolved]

Notes:
[Any additional notes]
```

---

**Last Updated**: 2025-10-13
**Version**: 1.0

---

## 🎯 Success Criteria

**Deployment is considered successful when ALL of the following are true:**

1. ✅ `pnpm run deploy:safe` completes without errors
2. ✅ Twitter login API returns valid JSON with `authUrl`, `sessionId`, `state`
3. ✅ CloudWatch Logs show no errors in last 5 minutes
4. ✅ Lambda `LastModified` timestamp is recent
5. ✅ Frontend Twitter login works end-to-end

**If any check fails, DO NOT consider deployment complete. Investigate and fix before proceeding.**

---

Good luck with your deployment! 🚀
