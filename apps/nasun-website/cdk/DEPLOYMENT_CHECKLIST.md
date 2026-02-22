# Deployment Checklist

**Use `/deploy` skill for all deployments.** It automates pre-flight checks, account verification, stale file cleanup, and post-deployment validation.

---

## Quick Reference

```bash
# Deploy specific stack to dev
/deploy nasun-website dev NftEventStack

# Deploy all stacks to production
/deploy nasun-website prod

# Pre-flight check only (no deploy)
/deploy --check nasun-website prod
```

---

## AWS Secrets Manager Prerequisites

All sensitive credentials are stored in Secrets Manager, NOT in Lambda environment variables.
Verify these secrets exist before first deployment to a new account.

### Dev Account (135808943968)

| Secret Name | Contents | Used By |
|-------------|----------|---------|
| `nasun-twitter-tokens` | `{ bearerToken, oauth2: { clientId, clientSecret, refreshToken, accessToken } }` | auth-twitter, collect-followers, verify-eligibility |
| `nasun-wallet-proof` | `{ secret: "<64-char hex>" }` | auth-metamask, register-user, withdraw-user |

### Prod Account (466841130170, --profile nasun-prod)

| Secret Name | Contents | Used By |
|-------------|----------|---------|
| `nasun-twitter-tokens-prod` | Same structure as dev | Same Lambdas |
| `nasun-wallet-proof-prod` | Same structure as dev | Same Lambdas |

### Verify Secrets Exist

```bash
# Dev
aws secretsmanager list-secrets --region ap-northeast-2 \
  --query 'SecretList[?starts_with(Name,`nasun-`)].Name' --output table

# Prod
aws secretsmanager list-secrets --profile nasun-prod --region ap-northeast-2 \
  --query 'SecretList[?starts_with(Name,`nasun-`)].Name' --output table
```

---

## CDK Stacks

| Stack | Key Resources |
|-------|---------------|
| CommonStack | Cognito, DynamoDB (UserProfiles, Whitelist), API Gateway, price/governance Lambdas |
| AuthStack | Twitter login, MetaMask auth, zkLogin salt Lambdas |
| NftEventStack | NFT whitelist verify/register/withdraw/export/status Lambdas |
| FollowerStack | Follower collection, OAuth2 token refresh Lambdas |
| LeaderboardV3Stack | Leaderboard CRUD, admin, snapshot Lambdas |
| AdminStack | Admin API, NFT collections, authorizer Lambdas |

---

## Environment Files

| Environment | File | NODE_ENV | AWS Profile |
|-------------|------|----------|-------------|
| Dev | `.env.development` | development | default |
| Prod | `.env.production` | production | nasun-prod |

### Required Variables

- `VITE_COGNITO_IDENTITY_POOL_ID` - Cognito Identity Pool ID (different per environment)
- `AWS_ACCOUNT_ID` - AWS account number
- `TWITTER_TOKENS_SECRET_NAME` - Secrets Manager secret name for Twitter tokens
- `WALLET_PROOF_SECRET_NAME` - Secrets Manager secret name for wallet proof HMAC secret
- `X_TARGET_USERNAME` / `X_TARGET_USER_ID` - Twitter target account
- `TARGET_ACCOUNTS` - JSON array of target accounts for follower collection

---

## Known Pitfalls

| Issue | Cause | Prevention |
|-------|-------|------------|
| `cdk diff` shows no changes | Stale `.js`/`.d.ts` in `cdk/lib/` or `cdk/bin/` | `/deploy` auto-detects and deletes stale files |
| Lambda has wrong COGNITO_IDENTITY_POOL_ID | Deployed without `NODE_ENV=production` | `/deploy` enforces correct NODE_ENV |
| Prod deployed to dev account | Missing `--profile nasun-prod` | `/deploy` auto-selects profile |
| All Lambda builds use NodejsFunction | Manual `dist/` builds are obsolete | Never run manual build scripts |

---

**Last Updated**: 2026-02-22
