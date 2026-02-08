# NASUN CDK Project

CDK Infrastructure as Code for NASUN website backend services.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [⚠️ Deployment Warning](#️-deployment-warning)
- [Deployment Commands](#deployment-commands)
- [Project Structure](#project-structure)
- [Lambda Functions](#lambda-functions)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Deploy safely (recommended)
pnpm run deploy:safe

# Check build status
bash scripts/verify-build.sh
```

---

## ⚠️ Deployment Warning

### CRITICAL: Never Skip Lambda Builds!

Some Lambda functions (especially `auth-twitter`) **require TypeScript compilation** before deployment.

**❌ WRONG (causes 502 errors)**:
```bash
pnpm cdk deploy CdkStack --require-approval never
```

**✅ CORRECT (always safe)**:
```bash
pnpm run deploy:safe
```

### Why This Matters

The `auth-twitter` Lambda function:
- Is written in TypeScript
- Must be compiled to JavaScript before deployment
- Must use `npm` (not `pnpm`) to avoid symlink issues
- Will cause **502 Bad Gateway** errors if not properly built

If you skip the build step, you'll see these errors:
- `Runtime.ImportModuleError: Cannot find module './src/handlers/login'`
- `502 Bad Gateway` on Twitter login
- Twitter authentication completely broken

**The `deploy:safe` command automatically handles all of this for you.**

---

## Deployment Commands

> [!CAUTION]
> ### 🔴 모든 배포는 `pnpm run deploy:safe`를 사용하세요!
> 
> 이 프로젝트는 Lambda 함수별로 빌드 요구사항이 복잡하게 얽혀있습니다.
> 
> - **`pnpm run deploy:quick`**
> - **`pnpm cdk deploy`**
> 
> 위와 같은 명령어를 직접 사용하면, **필수 빌드 과정을 건너뛰어 심각한 런타임 오류(예: 트위터 로그인 502 에러)를 유발**할 가능성이 매우 높습니다. 전문가가 아니라면 절대 사용하지 마세요.

### Recommended: Safe Deployment

```bash
# Full safety: builds all Lambdas, verifies, then deploys all stacks
pnpm run deploy:safe
```

This command:
1. Builds all required Lambda functions (`auth-twitter`, etc.)
2. Verifies all required files exist
3. Deploys all CDK stacks (`CdkStack`, `AuthStack`, `MonitoringStack`)

### Manual Deployment (Advanced Users Only)

```bash
# Build all Lambdas
bash scripts/pre-deploy.sh

# Verify builds
bash scripts/verify-build.sh

# Deploy all stacks
pnpm cdk deploy --all --require-approval never
```

---

## 🔄 API Endpoint Synchronization (중요!)

**문제**: CDK 배포 후 API Gateway 엔드포인트가 변경되면, 프론트엔드 `.env` 파일을 수동으로 업데이트해야 합니다. 이를 잊으면 **staging 배포 시 기능이 작동하지 않습니다!**

**해결책**: 자동 동기화 스크립트

### 방법 1: 통합 배포 (권장 ⭐)

```bash
# 모든 스택 배포 + API 엔드포인트 자동 동기화
bash scripts/deploy-all-with-sync.sh

# Dry-run (미리보기)
bash scripts/deploy-all-with-sync.sh --dry-run
```

**실행 순서:**
1. ✅ 모든 Lambda 빌드
2. ✅ AuthStack, CommonStack, CdkStack 배포
3. ✅ API 엔드포인트 자동 동기화 → `.env.development`, `.env.production`, `.env.staging`

### 방법 2: 동기화만 실행

```bash
# 배포는 완료했는데 .env 파일만 업데이트하고 싶을 때
pnpm sync:endpoints

# Dry-run (변경사항 미리보기)
pnpm sync:endpoints:dry
```

### 언제 사용하나요?

- ✅ **항상 사용**: `bash scripts/deploy-all-with-sync.sh` (배포 + 동기화 한 번에)
- ✅ **개별 스택 배포 후**: `pnpm cdk deploy CommonStack` → `pnpm sync:endpoints`
- ✅ **Git에서 .env 되돌린 후**: `pnpm sync:endpoints`

**상세 가이드**: [doc/API_ENDPOINT_SYNC_GUIDE.md](../doc/API_ENDPOINT_SYNC_GUIDE.md)

---

## Project Structure

```
cdk/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
│   ├── cdk-stack.ts       # Main application stack
│   └── auth-stack.ts      # Independent authentication stack
├── lambda-src/            # Lambda function source code
│   └── auth-twitter/      # Twitter OAuth (TypeScript, npm)
├── scripts/               # Build and deployment scripts
│   ├── pre-deploy.sh     # Builds all Lambdas automatically
│   └── verify-build.sh   # Verifies builds before deployment
└── package.json          # CDK dependencies and scripts
```

---

## Lambda Functions

### auth-twitter (Twitter OAuth)

**Location**: `lambda-src/auth-twitter/`

**Build Requirements**:
- TypeScript compilation required
- Must use `npm` (not `pnpm`) - symlink issues
- Environment: Node.js 18.x

**Endpoints**:
- `GET /auth/twitter/login` - Initiate OAuth flow
- `POST /auth/twitter/callback` - Handle OAuth callback

**Environment Variables**:
- `SECRET_NAME`: `nasun-twitter-tokens` (Secrets Manager)
- `SESSIONS_TABLE_NAME`: DynamoDB table for OAuth sessions
- `USER_PROFILES_TABLE`: DynamoDB table for user profiles
- `OAUTH2_CLIENT_ID`: Twitter OAuth client ID
- `OAUTH2_CLIENT_SECRET`: Twitter OAuth client secret

**Common Issues**:
- 502 errors → TypeScript not compiled (run `pnpm run deploy:safe` or deploy `AuthStack` individually)
- Secret not found → Check `SECRET_NAME` matches AWS Secrets Manager

---

## Build Scripts

### scripts/pre-deploy.sh

Automatically builds all Lambda functions before deployment.

**What it does**:
1. Detects `auth-twitter` using pnpm → converts to npm
2. Compiles TypeScript files for `auth-twitter`
3. Builds `wallet-api` with pnpm
4. Builds `PriceAPI` with pnpm
5. Verifies all output files exist

**Usage**:
```bash
bash scripts/pre-deploy.sh
```

**Included in**: `pnpm run deploy:safe`

### scripts/verify-build.sh

Verifies that all Lambda functions are properly built before deployment.

**What it checks**:
- `auth-twitter/index.js` exists
- `auth-twitter/src/handlers/*.js` exist
- `auth-twitter/src/utils/*.js` exist
- No pnpm symlinks in auth-twitter

**Usage**:
```bash
bash scripts/verify-build.sh
```

**Exit codes**:
- `0` - All builds verified
- `1` - Build verification failed (blocks deployment)

---

## Troubleshooting

### Twitter Login 502 Error

**Symptoms**:
- Twitter login button returns 502 Bad Gateway
- CloudWatch Logs show `Runtime.ImportModuleError`
- Error: `Cannot find module './src/handlers/login'`

**Cause**: TypeScript files for `auth-twitter` lambda not compiled or deployed correctly.

**Solution**:
```bash
# Quick fix: Rebuild and deploy ONLY the AuthStack
cd lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install
npm run build
cd ../..
pnpm cdk deploy AuthStack --require-approval never

# Or use the safe deployment command for all stacks
pnpm run deploy:safe
```

### Build Verification Failed

**Symptoms**:
- `verify-build.sh` exits with error
- Missing `.js` files in auth-twitter

**Solution**:
```bash
# Rebuild everything
bash scripts/pre-deploy.sh

# Verify again
bash scripts/verify-build.sh
```

### pnpm Symlink Issues in auth-twitter

**Symptoms**:
- Lambda can't find node_modules
- Error: `Cannot find module '/var/task/node_modules/@aws/...`

**Solution**:
```bash
cd lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install  # Use npm, not pnpm!
npm run build
```

### Secrets Manager Issues

**Symptoms**:
- Error: `Secrets Manager can't find the specified secret`
- Error: `Could not retrieve secrets`

**Solution**:
1. Check `cdk-stack.ts` Line 181, 190: `nasun-twitter-tokens`
2. Verify in AWS Console:
   ```bash
   aws secretsmanager list-secrets --region ap-northeast-2 | grep twitter
   ```
3. Ensure Secret exists with name: `nasun-twitter-tokens`

### CloudWatch Logs

Check Lambda logs:
```bash
# Twitter Auth Lambda
aws logs tail CdkStack-TwitterAuthLambdaLogGroup6211DDBA-jLbFN6Y4JfHJ \
  --region ap-northeast-2 --since 1h --follow
```

---

## Environment Variables

Required in `.env` file:

```env
# Twitter OAuth
OAUTH2_CLIENT_ID=your_twitter_client_id
OAUTH2_CLIENT_SECRET=your_twitter_client_secret

# Cognito
VITE_COGNITO_IDENTITY_POOL_ID=ap-northeast-2:xxx
```

**Note**: These are automatically injected into Lambda environment variables during deployment.

---

## Best Practices

### ✅ DO

- Always use `pnpm run deploy:safe` for deployments
- Run `verify-build.sh` before manual deployments
- Keep `auth-twitter` using npm (never convert to pnpm)
- Check CloudWatch Logs after deployment
- Test critical endpoints after deployment

### ❌ DON'T

- Don't skip `pre-deploy.sh` build step
- Don't use pnpm for `auth-twitter` Lambda
- Don't deploy without verifying builds
- Don't modify Secret names without updating both CDK and AWS
- Don't commit `.env` file to git

---

## Useful CDK Commands

```bash
# Synthesize CloudFormation template
pnpm cdk synth

# Compare deployed stack with current state
pnpm cdk diff

# Destroy the stack (careful!)
pnpm cdk destroy

# List all stacks
pnpm cdk list
```

---

## Additional Resources

- [CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Twitter OAuth 2.0 Guide](https://developer.twitter.com/en/docs/authentication/oauth-2-0)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

---

## Support

If you encounter issues:

1. Check this README
2. Review CloudWatch Logs
3. Run `bash scripts/verify-build.sh`
4. Check Git history for recent changes
5. Review `auth-twitter/README.md` for Lambda-specific docs

---

**Last Updated**: 2025-10-13
**Maintainer**: NASUN Development Team
