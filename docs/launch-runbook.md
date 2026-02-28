# Launch Runbook (Global Launch 2026-03-03)

## Quick Reference

| Service | URL | Health Check |
|---------|-----|-------------|
| nasun.io | https://nasun.io | `curl -sI https://nasun.io` |
| Explorer | https://explorer.nasun.io/devnet | `curl https://explorer.nasun.io/api/v1/health` |
| RPC Node | https://rpc.devnet.nasun.io | `curl -X POST https://rpc.devnet.nasun.io -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber"}'` |

## SSH Access

```bash
# Production EC2 (nasun.io)
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52

# Node-3 (Explorer API + Indexer + Fullnode)
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
```

---

## 1. Explorer API Server (PM2)

### Check status
```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
pm2 status
pm2 logs explorer-api --lines 50
```

### Restart
```bash
pm2 restart explorer-api
```

### If OOM or unresponsive
```bash
pm2 delete explorer-api
set -a && source ~/explorer-api/.env && set +a
cd ~/explorer-api && pm2 start ecosystem.config.cjs
```

### Check memory usage
```bash
pm2 monit
```

---

## 2. Lambda Throttle / Timeout

### Check Lambda errors in CloudWatch
```bash
# Governance Lambda
aws logs tail /aws/lambda/nasun-common-governance-api \
  --profile nasun-prod --region ap-northeast-2 --since 1h --format short

# Auth Lambda
aws logs tail /aws/lambda/nasun-auth-metamask \
  --profile nasun-prod --region ap-northeast-2 --since 1h --format short
```

### If Lambda concurrent execution limit reached
```bash
# Check current limit (default: 1000)
aws lambda get-account-settings --profile nasun-prod --region ap-northeast-2

# Request limit increase via AWS Support Console if needed
```

---

## 3. RPC Node Issues

### Check if RPC is responding
```bash
curl -s -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber"}' | jq .
```

### If RPC is down — restart Fullnode
```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
sudo systemctl status sui-node
sudo systemctl restart sui-node
# Wait 30s, then check
sudo journalctl -u sui-node -f --no-pager
```

### If Indexer is behind
```bash
sudo systemctl status sui-indexer
sudo journalctl -u sui-indexer --since "10 minutes ago" --no-pager
# If stuck, restart:
sudo systemctl restart sui-indexer
```

---

## 4. CloudFront Cache Emergency Flush

```bash
# Flush index.html only (fast, free)
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C \
  --paths "/index.html" "/"

# Full cache flush (use sparingly — 1000 free/month)
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C \
  --paths "/*"

# Check invalidation status
aws cloudfront list-invalidations --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C --query "InvalidationList.Items[0]"
```

---

## 5. Frontend Rollback

### nasun-website
```bash
# 1. SSH to production
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52

# 2. List available backups (if any)
ls -la /var/www/nasun/

# 3. Quick rollback: rebuild and redeploy from local
# (on dev machine)
git stash  # save current changes
git checkout <last-known-good-commit>
pnpm --filter @nasun/nasun-website exec -- vite build
rsync -avz --delete \
  -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" \
  apps/nasun-website/frontend/dist/ \
  ec2-user@43.200.67.52:/var/www/nasun/dist/

# 4. Flush CF cache
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C \
  --paths "/index.html" "/"

# 5. Restore working branch
git checkout main
git stash pop
```

### network-explorer
```bash
# Rebuild and redeploy
pnpm build:network-explorer
rsync -avz --delete \
  -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" \
  apps/network-explorer/dist/ \
  ec2-user@43.200.67.52:/var/www/nasun/explorer/devnet/
```

---

## 6. CDK Lambda Rollback

```bash
# If a CDK deploy broke something, redeploy previous version:
cd apps/nasun-website/cdk
git stash
git checkout <last-known-good-commit>
NODE_ENV=production npx cdk deploy CommonStack --profile nasun-prod
git checkout main
git stash pop

# Verify API URLs haven't changed:
aws cloudformation describe-stacks --profile nasun-prod \
  --stack-name CommonStack --query "Stacks[0].Outputs" --output table
```

---

## 7. Monitoring Dashboard

- **URL**: https://console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#dashboards:name=NASUN-Operations-Monitoring
- **Alarms**: Price API 5xx, Price Updater failures, Governance API 5xx, Governance Lambda duration, Auth API 5xx, Leaderboard V3 API 5xx
- **SNS**: admin@nasun.io (confirm subscription in email first)

---

## 8. Emergency Contacts

| Role | Contact |
|------|---------|
| Ops | admin@nasun.io |
| AWS Account | nasun-prod (466841130170) |
| Domain Registrar | Porkbun (nasun.io) |
