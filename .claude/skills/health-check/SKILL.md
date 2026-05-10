---
name: health-check
description: |
  nasun-website, network-explorer, pado, gostop.app의 프로덕션 인프라 헬스를 체크합니다.
  CloudFront CDN, Lambda API, EC2 nginx, Explorer API, Chat Server, AWS 서비스를 점검합니다.
  "헬스체크", "상태 확인", "health check", "사이트 상태" 등의 요청에 사용합니다.
  인자: quick | full | website | explorer | pado | gostop
---

# Health Check: Nasun Production 웹 인프라

> Scope: 웹 애플리케이션 계층. 블록체인 노드 심층 점검(fullnode/indexer/DB)은 nasun-devnet `/health-check` 위임.

## 인프라 참조

### EC2
| 용도 | IP | 사용자 | SSH 키 |
|------|-----|--------|--------|
| Production (web origin) | 43.200.67.52 | ec2-user | `~/.ssh/.awskey/nasun-prod-key` |
| Staging (dev + Umami) | 15.165.19.180 | ubuntu | `~/.ssh/.awskey/naru_seoul.pem` |
| Node-3 (Explorer API) | 54.180.61.196 | ubuntu | `~/.ssh/.awskey/nasun-devnet-key.pem` |

### CloudFront
| 도메인 | Distribution ID | Region | Origin | CustomErrorResp qty (expected) |
|--------|----------------|--------|--------|--------------------------------|
| nasun.io | E362CCGDH7WA7C | ap-northeast-2 | EC2 43.200.67.52 | 7 (403/404 SPA + 5xx pass-through, TTL=0) |
| explorer.nasun.io | E31QOCW4WNY9FL | ap-northeast-2 | EC2 43.200.67.52 | 11 (4xx/5xx pass-through, TTL=0) |
| pado.finance | E35SWPQEJB8HHE | ap-northeast-2 | EC2 43.200.67.52 | 11 (4xx/5xx pass-through, TTL=0) |
| gostop.app | EPRUC29V8YRN3 | **us-east-1** | S3 gostop-site-466841130170 | 11 (4xx SPA + 5xx pass-through, TTL=0) |

> **Cascade 차단 정책 (2026-05-05 사고 후)**: 모든 prod distribution은 4xx/5xx ErrorCachingMinTTL=0이어야 함. qty가 위 표보다 적거나 TTL>0이면 한 사용자의 일시 에러가 edge cache로 다른 사용자에게 cascade. 검증 명령은 5단계 5b 참조.

### AWS 프로필
- 기본: `--profile nasun-prod --region ap-northeast-2`
- gostop CloudFront/ACM: `--profile nasun-prod --region us-east-1`

---

## $ARGUMENTS 처리

| 인자 | 실행 범위 |
|------|----------|
| (없음) / `full` | 전체 (5a/5b/5c/5d 포함) |
| `quick` | 1단계 + 5a + 5c + 5d (SSH/AWS는 5c/5d만 필요) |
| `website` | 1a-d,1f-g + 2a,2b + 2.5 + 3 + 5a,5b,5c,5d + 6W,A,B,S,WF |
| `explorer` | 1a-e + 2c + 3 + 4 + 5a,5b,5c,5d + 6E,A,S,WF |
| `pado` | 1a-d,1h + 2a,2b + 2.5 + 3e + 5a,5b,5c,5d + 6P,A,B,S,WF |
| `gostop` | 1a,1b,1c + 3e(gostop only) + 5a,5b,5c (gostop only) + 6GS,S,WF |

---

## 실행 절차

### 1단계: 외부 엔드포인트 (최대한 병렬 실행)

#### 1a. Frontend CDN

```bash
for url in "https://nasun.io" "https://staging.nasun.io" "https://explorer.nasun.io/devnet" \
  "https://pado.finance" "https://staging.pado.finance" \
  "https://gostop.app" "https://www.gostop.app"; do
  echo "=== $url ==="
  curl -sI -m 10 "$url" -w "\nHTTP:%{http_code}|TIME:%{time_total}|SSL:%{ssl_verify_result}\n" 2>/dev/null \
    | grep -iE "^HTTP/|x-cache|x-amz-cf-pop|content-encoding|location:|HTTP:"
done
```

- 200/301=OK, `x-cache: Error`=CRITICAL, ssl_verify_result!=0=CRITICAL, time>5s=WARNING
- staging.nasun.io / staging.pado.finance 401=OK (Basic Auth)
- explorer.nasun.io/devnet 301→/devnet/=OK (trailing slash)
- gostop.app: S3 origin, 403/404→index.html SPA fallback 정상

#### 1b. SSL 만료 확인

```bash
for domain in nasun.io staging.nasun.io explorer.nasun.io rpc.devnet.nasun.io \
  faucet.devnet.nasun.io analytics.nasun.io pado.finance staging.pado.finance \
  gostop.app www.gostop.app; do
  expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain":443 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  days=$(( ($(date -d "$expiry" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400 ))
  echo "$domain: expires=$expiry days_left=$days"
done
```

- >30일=OK, 7-30일=WARNING, <7일/만료=CRITICAL

#### 1c. DNS 해석

```bash
for domain in nasun.io explorer.nasun.io pado.finance staging.pado.finance \
  rpc.devnet.nasun.io analytics.nasun.io staging.nasun.io faucet.devnet.nasun.io \
  gostop.app www.gostop.app; do
  result=$(getent hosts "$domain" 2>/dev/null)
  echo "$domain: ${result:-FAILED}"
done
```

- FAILED=CRITICAL

#### 1d. Shared Infrastructure (RPC/Faucet/zkLogin)

```bash
curl -s -m 10 -X POST https://rpc.devnet.nasun.io -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'
echo ""
curl -s -m 10 -X POST https://rpc.devnet.nasun.io -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}'
echo ""
curl -s -m 10 -o /dev/null -w "faucet:%{http_code}" https://faucet.devnet.nasun.io; echo ""
curl -s -m 10 -X POST -H "Content-Type: application/json" -d '{}' \
  -o /dev/null -w "zkprover:%{http_code}" https://rpc.devnet.nasun.io/zkprover/v1; echo ""
```

- chain ID 기대: `272218f1`. faucet 200/405=OK. zkprover 400/500=OK (도달 가능)

#### 1e. Explorer API Health (SSH 경유)

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@54.180.61.196 "curl -s -m 5 http://localhost:3200/api/v1/health"
```

- `chainResetDetected: true`=CRITICAL. `latestCheckpoint` 기록 (4단계 lag 비교용)

#### 1f. Lambda APIs (GET only - 부작용 방지)

```bash
declare -A APIS=(
  ["Price API"]="https://06hg1n9i3h.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Backup Price"]="https://7vtmrjor8i.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Random Image"]="https://y6davo1om2.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["User Profile"]="https://aanboqet5i.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["User Count"]="https://mwhyuu1k51.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Wallet API"]="https://6pnnb6hcrd.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Link Account"]="https://33j69j7lpg.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Deactivate User"]="https://tz8yw7w72d.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["AWS Credentials"]="https://x20xq2yvk4.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Twitter Auth"]="https://br30jspm8j.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter"
  ["MetaMask Auth"]="https://gtzq164xhb.execute-api.ap-northeast-2.amazonaws.com/prod/auth/metamask"
  ["zkLogin Salt"]="https://r0thrlqqcf.execute-api.ap-northeast-2.amazonaws.com/prod/auth/zklogin/salt"
  ["Whitelist Join"]="https://shx1fpd8qi.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Whitelist Check"]="https://am4awqudsb.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Governance"]="https://4xf3e5t8zc.execute-api.ap-northeast-2.amazonaws.com/prod/config"
  ["Leaderboard V3"]="https://auzo707xql.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Battalion NFT"]="https://jrrge0lqtk.execute-api.ap-northeast-2.amazonaws.com/prod/"
  ["Admin API"]="https://doetwxms5a.execute-api.ap-northeast-2.amazonaws.com/prod/"
)
for name in "${!APIS[@]}"; do
  result=$(curl -s -m 10 -o /dev/null -w "%{http_code}|%{time_total}" "${APIS[$name]}")
  echo "$name: $result"
done
```

- 200/400/401/403/405=OK. 5xx=WARNING. timeout/0=CRITICAL. >5s=WARNING

#### 1g. Umami Analytics

```bash
curl -s -m 10 -o /dev/null -w "umami:%{http_code}|%{time_total}" https://analytics.nasun.io; echo ""
```

#### 1h. Chat Server

```bash
curl -s -m 10 -o /dev/null -w "prod_health:%{http_code}|%{time_total}" https://nasun.io/chat/health; echo ""
curl -s -m 10 -o /dev/null -w "prod_leaderboard:%{http_code}|%{time_total}" \
  "https://nasun.io/chat/api/leaderboard?period=24h&mode=volume&limit=3"; echo ""
curl -s -m 10 -o /dev/null -w "staging_health:%{http_code}|%{time_total}" \
  https://staging.nasun.io/chat/health; echo ""
```

- prod 200=OK, 502=CRITICAL. staging 401/502=OK (의도적 비활성화)

---

### 2단계: EC2 Internal (2a, 2b, 2c, 2d 병렬 실행)

#### 2a. Production EC2 (43.200.67.52)

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ec2-user@43.200.67.52 bash -s << 'EOF'
echo "=== NGINX ==="
systemctl is-active nginx
sudo nginx -t 2>&1 | tail -2
echo "=== STATIC FILES ==="
for f in /var/www/nasun/dist/index.html /var/www/explorer.nasun.io/devnet/index.html /var/www/pado.finance/index.html; do
  ls -la "$f" 2>/dev/null || echo "MISSING: $f"
  echo "  assets: $(ls "$(dirname $f)/assets" 2>/dev/null | wc -l)"
done
echo "=== PM2 ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  apps=json.load(sys.stdin)
  for a in apps:
    print(f'{a[\"name\"]}: status={a[\"pm2_env\"][\"status\"]}, restarts={a[\"pm2_env\"][\"restart_time\"]}, mem={round(a[\"monit\"][\"memory\"]/1024/1024,1)}MB, cpu={a[\"monit\"][\"cpu\"]}%')
except Exception as e: print(f'error:{e}')
"
ss -tlnp 2>/dev/null | grep -E "3101|4001" | head -5
echo "=== SYS ==="
df -h / | tail -1; free -m | grep Mem; cat /proc/loadavg
echo "=== NGINX ERRORS (10min) ==="
sudo journalctl -u nginx --since "10 minutes ago" --no-pager -p err 2>/dev/null | tail -10
echo "=== STATUS DIST (last 100) ==="
sudo tail -100 /var/log/nginx/access.log 2>/dev/null | awk '{print $9}' | sort | uniq -c | sort -rn | head -5
uptime
EOF
```

판정:
- nginx inactive=CRITICAL. index.html 없음=CRITICAL. assets=0=CRITICAL
- nasun-chat-server/price-updater/lp-bots online 필수. port 3101 리스닝 필수
- disk>80%=WARNING, >90%=CRITICAL. load>2.0=WARNING. nginx 5xx>5%=WARNING

#### 2b. Staging EC2 (15.165.19.180)

```bash
ssh -i ~/.ssh/.awskey/naru_seoul.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@15.165.19.180 bash -s << 'EOF'
echo "=== NGINX ==="
systemctl is-active nginx
echo "=== STATIC FILES ==="
ls -la /var/www/staging.nasun.io/index.html 2>/dev/null || echo "MISSING"
ls -la /var/www/staging.pado.finance/index.html 2>/dev/null || echo "MISSING"
echo "=== PM2 ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  apps=json.load(sys.stdin)
  for a in apps:
    print(f'{a[\"name\"]}: status={a[\"pm2_env\"][\"status\"]}, restarts={a[\"pm2_env\"][\"restart_time\"]}, mem={round(a[\"monit\"][\"memory\"]/1024/1024,1)}MB')
except Exception as e: print(f'error:{e}')
"
echo "=== UMAMI ==="
sudo docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -E "umami|postgres|NAME"
echo "=== SYS ==="
df -h / | tail -1; free -m | grep Mem; uptime
EOF
```

- 모든 staging PM2 stopped=OK (의도적). Umami Exited=WARNING

#### 2c. Node-3 (54.180.61.196)

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@54.180.61.196 bash -s << 'EOF'
echo "=== NGINX ==="
systemctl is-active nginx
echo "=== PM2 ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  apps=json.load(sys.stdin)
  for a in apps:
    print(f'{a[\"name\"]}: status={a[\"pm2_env\"][\"status\"]}, restarts={a[\"pm2_env\"][\"restart_time\"]}, mem={round(a[\"monit\"][\"memory\"]/1024/1024,1)}MB, cpu={a[\"monit\"][\"cpu\"]}%')
except Exception as e: print(f'error:{e}')
"
echo "=== EXPLORER ==="
curl -s -m 5 http://localhost:3200/api/v1/health
echo ""
curl -s -m 5 http://localhost:3200/api/v1/stats/network-summary \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('totalTx:', d.get('data',{}).get('totalTransactions','N/A'))" 2>/dev/null
echo -n "health_time: "; curl -s -m 5 -o /dev/null -w "%{time_total}s\n" http://localhost:3200/api/v1/health
df -h / | tail -1; free -m | grep Mem; uptime
EOF
```

- explorer-api online 필수. restart>10=WARNING. mem>500MB=WARNING

#### 2d. Pado Bot Gas (Watchdog Log)

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ec2-user@43.200.67.52 "tail -30 /home/ec2-user/pado-bots/logs/balance-watchdog-out.log 2>/dev/null || echo LOG_NOT_FOUND"
```

- NASUN gas: >=5000=OK, 1500-4999=WARNING, <1500=CRITICAL

#### 2d-i. Keeper Gas Watchdog Source Treasury

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ec2-user@43.200.67.52 "tail -50 /home/ec2-user/pado-bots/logs/keeper-gas-watchdog-out.log 2>/dev/null | grep 'source=' | tail -1"
```

Extract source balance from output (e.g., `source=9700000.0 | ...`):
```bash
# Alternative RPC query (direct balance check):
curl -s -m 10 -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getBalance","params":["0x4c2c6f5b4c8f3a7e2d1c9f5b8a3c7e2d1c9f5b8a3c7e2d1c9f5b8a3c7e2d1c"]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); balance=int(d.get('result',{}).get('totalBalance',0))/1e9; print(f'source_nasun={balance:.0f}')" 2>/dev/null
```

판정:
- source >= 500k NASUN=OK
- source 200k-499k NASUN=WARNING (approaching SOURCE_WARN threshold)
- source < 200k NASUN=CRITICAL (SOURCE_WARN threshold breached, super-source auto-refill should trigger)

---

### 2.5단계: 로컬 백업 검증

```bash
BACKUP_DIR="/home/naru/nasun-backups/dynamodb"
TODAY=$(date +%Y%m%d); YESTERDAY=$(date -d '1 day ago' +%Y%m%d)
for prefix in ZkLoginUsers UserProfiles UserWallets zklogin-salts leaderboard-v3-snapshots; do
  file="${BACKUP_DIR}/${prefix}-${TODAY}.json.gz"
  [ ! -f "$file" ] && file="${BACKUP_DIR}/${prefix}-${YESTERDAY}.json.gz"
  if [ -f "$file" ]; then
    size=$(stat -c%s "$file")
    age_h=$(( ($(date +%s) - $(stat -c%Y "$file")) / 3600 ))
    records=$(zcat "$file" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('Items',[])))" 2>/dev/null || echo "INVALID")
    echo "${prefix}: size=${size}bytes age=${age_h}h records=${records} file=$(basename $file)"
  else
    echo "${prefix}: MISSING"
  fi
done
```

- 없음=CRITICAL. size<100=WARNING. age>48h=WARNING

---

### 3단계: AWS 서비스 (병렬)

#### 3a. CloudWatch 알람
```bash
aws cloudwatch describe-alarms --state-value ALARM --profile nasun-prod --region ap-northeast-2 \
  --query 'MetricAlarms[].{Name:AlarmName,Reason:StateReason}' --output table 2>/dev/null
```

#### 3b. EventBridge 규칙
```bash
aws events list-rules --profile nasun-prod --region ap-northeast-2 \
  --query 'Rules[?starts_with(Name,`nasun-`) || starts_with(Name,`pado-`)].{Name:Name,State:State,Schedule:ScheduleExpression}' \
  --output table 2>/dev/null
```

- `leaderboard-v3-snapshot-schedule` DISABLED=OK (의도적 일시 정지)

#### 3c. Lambda 에러 (1h)
```bash
for fn in nasun-common-governance-api nasun-common-price-api nasun-auth-twitter-login \
  nasun-auth-metamask nasun-auth-zklogin-salt nasun-leaderboard-v3-get-leaderboard \
  nasun-nft-verify-eligibility nasun-common-get-follower-count; do
  count=$(aws logs filter-log-events --log-group-name "/aws/lambda/$fn" \
    --start-time $(date -d '1 hour ago' +%s000) --filter-pattern "ERROR" \
    --profile nasun-prod --region ap-northeast-2 --query 'length(events)' --output text 2>/dev/null)
  echo "$fn: ${count:-0} errors"
done
```

- 0=OK, 1-5=WARNING, >5=CRITICAL

#### 3d. DynamoDB 테이블
```bash
for table in UserProfiles UserIdentityMap CryptoPrices CryptoBackupPrices \
  GenesisNftWhitelist nasun-nft-whitelist leaderboard-v3-posts leaderboard-v3-accounts \
  leaderboard-v3-seasons MetaMaskAuthNonces ZkLoginUsers nasun-nft-event-tasks; do
  status=$(aws dynamodb describe-table --table-name "$table" --profile nasun-prod \
    --region ap-northeast-2 --query 'Table.TableStatus' --output text 2>/dev/null)
  echo "$table: ${status:-NOT_FOUND}"
done
```

#### 3e. CloudFront 배포 상태
```bash
# ap-northeast-2 distributions
for id in E362CCGDH7WA7C E31QOCW4WNY9FL E35SWPQEJB8HHE; do
  aws cloudfront get-distribution --id "$id" --profile nasun-prod \
    --query 'Distribution.{ID:Id,Status:Status,Enabled:DistributionConfig.Enabled}' --output json 2>/dev/null
done
# gostop.app - us-east-1
aws cloudfront get-distribution --id EPRUC29V8YRN3 --profile nasun-prod \
  --query 'Distribution.{ID:Id,Status:Status,Enabled:DistributionConfig.Enabled}' --output json 2>/dev/null
```

- Deployed + Enabled=OK

#### 3f. Secrets Manager
```bash
for secret in nasun-twitter-tokens-prod nasun-wallet-proof-prod \
  nasun/governance/oracle nasun/governance/sponsor nasun-telegram-bot-token; do
  aws secretsmanager describe-secret --secret-id "$secret" --profile nasun-prod \
    --region ap-northeast-2 --query '{Name:Name,LastAccessed:LastAccessedDate}' --output json 2>/dev/null \
    || echo "MISSING: $secret"
done
```

---

### 4단계: Explorer 데이터 정합성

RPC checkpoint - Explorer latestCheckpoint = lag. <100=OK, 100-500=WARNING, >500=CRITICAL.
`totalTransactions` > 0=OK. `chainResetDetected: true`=CRITICAL.

---

### 5단계: CloudFront 캐시 + 에러 메트릭 분석

#### 5a. 캐시 헤더 (per-URL)

```bash
for url in "https://nasun.io" "https://explorer.nasun.io/devnet" "https://pado.finance" "https://gostop.app"; do
  echo "=== $url ==="
  curl -sI -m 10 "$url" | grep -iE "x-cache|x-amz-cf-pop|cache-control|content-encoding"
done
# origin direct check (EC2 apps only - gostop is S3)
curl -sI -m 10 -H "Host: nasun.io" http://43.200.67.52 -o /dev/null -w "origin_direct: HTTP %{http_code}\n"
# explorer api: Cache-Control: no-store 검증 (2026-05-05 적용, edge cache 차단용)
curl -sI -m 10 https://explorer.nasun.io/api/v1/health | grep -iE "^cache-control"
```

- nasun.io index.html `no-cache,no-store`=OK (SPA 재배포 후 구버전 캐시 방지, 의도적)
- explorer.nasun.io/api/v1/* `cache-control: no-store`=OK (cascade 차단). 빠지면 cascade 위험 — W11 패턴 발동
- `x-cache: Error`=CRITICAL
- gostop.app: S3 origin이므로 origin direct 체크 없음

#### 5b. Custom Error Response config 검증 (cascade 차단 정책)

```bash
declare -A EXPECTED_QTY=(
  [E362CCGDH7WA7C]=7    # nasun.io
  [E31QOCW4WNY9FL]=11   # explorer.nasun.io
  [E35SWPQEJB8HHE]=11   # pado.finance
)
for id in "${!EXPECTED_QTY[@]}"; do
  qty=$(aws cloudfront get-distribution-config --id "$id" --profile nasun-prod --region us-east-1 \
    --query 'DistributionConfig.CustomErrorResponses.Quantity' --output text 2>/dev/null)
  max_ttl=$(aws cloudfront get-distribution-config --id "$id" --profile nasun-prod --region us-east-1 \
    --query 'max(DistributionConfig.CustomErrorResponses.Items[].ErrorCachingMinTTL)' --output text 2>/dev/null)
  echo "$id: qty=$qty (expected=${EXPECTED_QTY[$id]}) max_ttl=$max_ttl"
done
# gostop us-east-1
qty=$(aws cloudfront get-distribution-config --id EPRUC29V8YRN3 --profile nasun-prod --region us-east-1 \
  --query 'DistributionConfig.CustomErrorResponses.Quantity' --output text 2>/dev/null)
max_ttl=$(aws cloudfront get-distribution-config --id EPRUC29V8YRN3 --profile nasun-prod --region us-east-1 \
  --query 'max(DistributionConfig.CustomErrorResponses.Items[].ErrorCachingMinTTL)' --output text 2>/dev/null)
echo "EPRUC29V8YRN3: qty=$qty (expected=11) max_ttl=$max_ttl"
```

- qty != expected = WARNING (W9 패턴). max_ttl > 0 = CRITICAL (cascade 위험 부활)

#### 5c. CloudFront 에러율 메트릭 (지난 1h, 5min 단위 spike 감지)

```bash
for id in E362CCGDH7WA7C E31QOCW4WNY9FL E35SWPQEJB8HHE EPRUC29V8YRN3; do
  echo "=== $id ==="
  for metric in 4xxErrorRate 5xxErrorRate; do
    max=$(aws cloudwatch get-metric-statistics --profile nasun-prod --region us-east-1 \
      --namespace AWS/CloudFront --metric-name $metric \
      --dimensions Name=DistributionId,Value=$id Name=Region,Value=Global \
      --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
      --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" --period 300 --statistics Average \
      --query 'max(Datapoints[].Average)' --output text 2>/dev/null)
    echo "  $metric max(5min avg, 1h)=${max:-0}%"
  done
done
```

- 4xx/5xx 각각 max < 1% = OK, 1-5% = WARNING (W12), > 5% = CRITICAL (W13). 2026-05-04 사고 시 explorer 81%까지 spike한 패턴.

#### 5d. WAF policy invariant + BlockedRequests (이중 ACL)

운영 중 ACL은 **두 개 분리**:

| ACL | Region/Scope | 부착 대상 | Expected Rule Count |
|-----|--------------|----------|---------------------|
| `nasun-cloudfront-waf` | us-east-1 / CLOUDFRONT | 4 distribution (nasun.io / explorer / pado / gostop) 전부 | **3** |
| `nasun-shared-waf` | ap-northeast-2 / REGIONAL | API Gateway (per-API rate limit) | **11** |

기대 rule 이름:
- **CloudFront ACL (3)**: `AllowTrustedIPs`, `DenyKnownScanners`, `RateLimit8000Per5Min` — 2026-05-05 사고 후 영구화 정책. 단일 cap rule + scanner deny + trusted bypass.
- **Regional ACL (11)**: `AWSManagedIPReputation`, `AWSManagedKnownBadInputs`, `RateLimit-{TwitterAuth,BugReport,MetaMaskAuth,ZkLoginAuth,SuiAuth,Referral,NftEvent,GenesisPass,LeaderboardV3}` — CDK `apps/nasun-website/cdk/lib/shared-waf-stack.ts` 정의.

```bash
# (1) CloudFront WAF (us-east-1)
cf_id=$(aws wafv2 list-web-acls --scope CLOUDFRONT --profile nasun-prod --region us-east-1 \
  --query "WebACLs[?Name=='nasun-cloudfront-waf'].Id | [0]" --output text 2>/dev/null)
cf_rules=$(aws wafv2 get-web-acl --scope CLOUDFRONT --profile nasun-prod --region us-east-1 \
  --name nasun-cloudfront-waf --id "$cf_id" --query 'WebACL.Rules[].Name' --output text 2>/dev/null)
cf_count=$(echo "$cf_rules" | tr '\t' '\n' | wc -l)
echo "cloudfront_waf: count=$cf_count (expected=3) rules=$cf_rules"

# (2) Regional WAF (ap-northeast-2)
rg_id=$(aws wafv2 list-web-acls --scope REGIONAL --profile nasun-prod --region ap-northeast-2 \
  --query "WebACLs[?Name=='nasun-shared-waf'].Id | [0]" --output text 2>/dev/null)
rg_rules=$(aws wafv2 get-web-acl --scope REGIONAL --profile nasun-prod --region ap-northeast-2 \
  --name nasun-shared-waf --id "$rg_id" --query 'WebACL.Rules[].Name' --output text 2>/dev/null)
rg_count=$(echo "$rg_rules" | tr '\t' '\n' | wc -l)
echo "regional_waf: count=$rg_count (expected=11) rules=$rg_rules"

# (3) Distribution attachment 일관성 (4개 모두 nasun-cloudfront-waf인지)
for id in E362CCGDH7WA7C E31QOCW4WNY9FL E35SWPQEJB8HHE EPRUC29V8YRN3; do
  acl=$(aws cloudfront get-distribution-config --id "$id" --profile nasun-prod --region us-east-1 \
    --query 'DistributionConfig.WebACLId' --output text 2>/dev/null)
  echo "$id: $(echo $acl | grep -oE 'webacl/[^/]+' || echo NONE)"
done

# (4) BlockedRequests 1h max — 두 ACL 각각
cf_blocked=$(aws cloudwatch get-metric-statistics --profile nasun-prod --region us-east-1 \
  --namespace AWS/WAFV2 --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=nasun-cloudfront-waf Name=Region,Value=CloudFront Name=Rule,Value=ALL \
  --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" --period 300 --statistics Sum \
  --query 'max(Datapoints[].Sum)' --output text 2>/dev/null)
rg_blocked=$(aws cloudwatch get-metric-statistics --profile nasun-prod --region ap-northeast-2 \
  --namespace AWS/WAFV2 --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=nasun-shared-waf Name=Region,Value=ap-northeast-2 Name=Rule,Value=ALL \
  --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" --period 300 --statistics Sum \
  --query 'max(Datapoints[].Sum)' --output text 2>/dev/null)
echo "blocked_max(5min sum, 1h): cloudfront=${cf_blocked:-0} regional=${rg_blocked:-0}"
```

판정:
- count != expected = WARNING (WF1). CloudFront 3 / Regional 11 invariant.
- 기대 rule 이름 중 누락 = WARNING (WF2).
- 4개 distribution이 모두 `nasun-cloudfront-waf`에 attach되어 있지 않으면 WARNING (WF5, 통일 정책 회귀).
- BlockedRequests 5min sum < 100 = OK, 100-1000 = WARNING (WF3, 봇 wave), > 1000 = CRITICAL (WF4, 잠재 collateral block 또는 진행 중인 공격). 두 ACL 합산 또는 큰 쪽 기준.

---

### 6단계: 장애 패턴 탐지

수집 데이터 기반으로 해당 패턴만 "Detected Issues" 섹션에 출력. Read-only - 조치는 제안만, 사용자 승인 후 실행.

#### Website (W)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| W1 | nginx inactive | CRITICAL | `sudo systemctl restart nginx` |
| W2 | index.html 없음 or assets=0 | CRITICAL | rsync로 재배포 |
| W3 | disk >80% / >90% | WARNING / CRITICAL | /var/log 정리 |
| W4 | `x-cache: Error from cloudfront` | CRITICAL | nginx 복구 후 CF invalidation |
| W5 | Lambda 3개+ 5xx/timeout | CRITICAL | AWS Lambda 콘솔 확인 |
| W6 | SSL 7-30일 | WARNING | `sudo certbot renew` (staging EC2) |
| W7 | SSL <7일/만료 | CRITICAL | 즉시 갱신 |
| W8 | nginx 5xx >5% / >10% | WARNING / CRITICAL | nginx error log 분석 |
| W9 | CF Custom Error Response qty != expected (5b) | WARNING | distribution config 비교, 누락 코드 추가 (cascade 차단 정책) |
| W10 | nginx error.log `proxy_buffer_size .* not enough for cache key` 누적 | WARNING | rpc-cache.conf cache key 설계 결함. `apps/nasun-website/chat-server/`의 SDK payload 증가 추적 + buffer 상향 또는 hash key |
| W11 | explorer.nasun.io/api/v1/* 응답에 `Cache-Control: no-store` 누락 | WARNING | nginx explorer.conf의 `add_header Cache-Control "no-store" always;` 복원. 없으면 429가 edge cache되어 cascade |
| W12 | CF 4xx/5xxErrorRate 5min avg 1-5% | WARNING | distribution별 추적. 일시적이면 OK, 지속이면 origin/rate-limit 점검 |
| W13 | CF 4xx/5xxErrorRate 5min avg >5% | CRITICAL | 2026-05-04 사고 패턴. nginx error.log + EC2 부하 즉시 점검. cascade 진행 중일 가능성 |

#### Explorer (E)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| E1 | explorer-api restart >10 | WARNING | `pm2 logs explorer-api --lines 50` |
| E2 | explorer-api != online | CRITICAL | `pm2 restart explorer-api` |
| E3 | node-3 nginx inactive | WARNING | `sudo systemctl restart nginx` |
| E4 | indexer lag >500 | CRITICAL | devnet `/health-check` 실행 |
| E5 | chainResetDetected=true | CRITICAL | Explorer DB 재초기화 필요 |
| E6 | nginx error.log `limiting requests, excess.*explorer_api` 1h내 50건+ | WARNING | rate-limit zone trip. 단일 IP 봇이면 차단, 정상 사용자면 zone 추가 완화 (현재 rate=5r/s burst=30, 2026-05-05 완화됨) |
| E7 | nginx error.log `limiting requests, excess.*explorer_api` 1h내 500건+ | CRITICAL | 5/4 사고 재현 가능성. CloudFront 4xx 메트릭 (5c)과 교차. cascade 진행 중일 수 있음 |

#### AWS (A)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| A1 | CloudWatch ALARM 존재 | W/C | 알람 내용별 대응 |
| A2 | EventBridge rule DISABLED (비의도적) | WARNING | 의도적 여부 확인 |
| A3 | DynamoDB != ACTIVE | CRITICAL | AWS 콘솔 확인 |
| A4 | InvalidRefreshTokenAlarm | CRITICAL | Twitter OAuth 재발급 |
| A5 | Lambda 에러 >5 (1h) | CRITICAL | CloudWatch Logs 확인 |
| A6 | Umami Docker Exited | WARNING | `cd ~/umami && sudo docker compose up -d` |

#### Pado (P)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| P1 | prod /chat/health != 200 or port 3101 없음 | CRITICAL | `pm2 restart nasun-chat-server` |
| P2 | staging /chat/health 502 | OK | 의도적 비활성화, 이상 없음 |
| P3 | prod pado index.html 없음 | CRITICAL | rsync 재배포 |
| P4 | staging pado index.html 없음 | CRITICAL | rsync 재배포 |
| P5 | chat-server restart >10 AND uptime <1h | WARNING | `pm2 logs nasun-chat-server --lines 50 --nostream` |
| P5b | chat-server error.log `[Crash] HALTED.*manual intervention required` 최근 발생 | WARNING | Crash registry stuck → 자가복구 시도 중. 1h 후에도 hot loop면 P5c |
| P5c | chat-server CPU >80% AND `crash-child.*exited` 반복 (1h내 5건+) | CRITICAL | LockConflict hot loop. Crash registry object 강제 finalize 필요. 코드 수정은 handoff `2026-05-05-outage-followup-code-fixes.md` 참고 |
| P6 | chat-server mem >350MB / >500MB | WARNING / CRITICAL | 500MB=PM2 auto-restart |
| P7 | price-updater stopped | CRITICAL | prod 전용 단일 인스턴스. `pm2 restart price-updater` |
| P8 | lp-bot-* stopped | WARNING | `pm2 restart lp-bot-nbtc` 등 |
| P9 | tpsl-keeper stopped or port 4001 없음 | WARNING | `pm2 restart tpsl-keeper` |
| P10 | balance-watchdog stopped | WARNING | `pm2 restart balance-watchdog` |
| P11 | NASUN gas <1500 | CRITICAL | `cd /home/ec2-user/pado-bots && source .env && npx tsx scripts/prefund-bot.ts` |
| P12 | lottery-keeper stopped | WARNING | `pm2 restart lottery-keeper` |
| P13 | keeper-gas-watchdog source <500k NASUN | WARNING | Check watchdog logs or RPC. If <200k, may indicate super-source refill failure |
| P14 | keeper-gas-watchdog source <200k NASUN | CRITICAL | RPC check + watchdog logs. If unrefilled, manually: `curl -X POST https://rpc.devnet.nasun.io ... (faucet transfer)` |
| P15 | prediction-keeper stopped on prod (DISABLE_PREDICTION_KEEPER 미설정인데 stopped) | WARNING | `pm2 restart prediction-keeper`. PREDICTION_RESOLVER_KEY 또는 PREDICTION_KEEPER_MARKETS 누락 시 즉시 exit하므로 .env 점검 |
| P16 | prediction-lp stopped on prod (DISABLE_PREDICTION_LP 미설정인데 stopped) | WARNING | `pm2 restart prediction-lp`. PREDICTION_LP_PRIVATE_KEY/PREDICTION_LP_MARKETS .env 점검. inventory bootstrap 미수행 시 quote 못 올림 |
| P17 | gostop-lottery-keeper stopped | WARNING | `pm2 restart gostop-lottery-keeper`. gostop.app 전용 lottery 정산 keeper |
| P18 | prediction-keeper/prediction-lp/gostop-lottery-keeper restart >10 AND uptime <1h | WARNING | `pm2 logs <name> --lines 50 --nostream` — 환경변수/RPC/지갑 잔고 점검 |

#### WAF (WF)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| WF1 | CloudFront WAF rule_count != 3 OR Regional WAF rule_count != 11 | WARNING | CDK `shared-waf-stack.ts` 정의 + CloudFront stack 비교. 정책 회귀 (cap 8000/5min + DenyKnownScanners + AllowTrustedIPs invariant) |
| WF2 | 기대 rule 이름 누락. CloudFront=AllowTrustedIPs/DenyKnownScanners/RateLimit8000Per5Min, Regional=Managed 2 + RateLimit-* 9 | WARNING | 누락 rule 추가 후 redeploy. 5/5 사고 후 영구화 정책 회귀 |
| WF3 | BlockedRequests 5min sum 100-1000 (둘 중 하나) | WARNING | 봇 wave 진행 중. 정상 사용자 collateral block 여부는 5c CF 4xx와 교차. residential ISP(KT/SKT/LGU+/SHATEL 등) 차단 금지 |
| WF4 | BlockedRequests 5min sum >1000 (둘 중 하나) | CRITICAL | 5/5 collateral block 사고 패턴 가능. CloudWatch에서 Rule별 메트릭 분리 후 어떤 rule이 trip인지 식별. cap 일시 상향 검토는 사용자 승인 필수 |
| WF5 | 4 distribution(nasun.io/explorer/pado/gostop) 중 nasun-cloudfront-waf에 attach되지 않은 것 존재 | WARNING | "4 distribution 통일" invariant 회귀. AWS 콘솔 또는 CDK로 attach 복구 |

#### gostop (GS)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| GS1 | gostop.app HTTP != 200 or `x-cache: Error` | CRITICAL | CF EPRUC29V8YRN3 상태 확인 (us-east-1), S3 버킷 점검 |
| GS2 | EPRUC29V8YRN3 Disabled or !Deployed | CRITICAL | AWS 콘솔 us-east-1 CloudFormation 확인 |
| GS3 | gostop.app SSL <30일 | WARNING | ACM 자동갱신 확인 (us-east-1) |
| GS4 | EPRUC29V8YRN3 CustomErrorResp qty != 11 or max_ttl > 0 | WARNING | 2026-05-05 적용 정책 회귀. 11개 모두 TTL=0이어야 cascade 차단 (이전 60s 캐시로 사고) |

#### Backup (B)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| B1 | 오늘+어제 파일 없음 | CRITICAL | `crontab -l` 확인, AWS CLI 인증 점검 |
| B2 | size <100bytes | WARNING | DynamoDB 접근 권한 점검 |
| B3 | age >48h | WARNING | `sudo service cron status` 확인 |

#### Shared (S)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| S1 | RPC timeout or chain ID != 272218f1 | CRITICAL | devnet `/health-check` 실행 |
| S2 | Faucet 5xx/timeout | WARNING | devnet `/health-check 1` 실행 |
| S3 | DNS FAILED | CRITICAL | Route53 확인 |

---

### 7단계: 리포트 출력

```
## Nasun Production Health Report
> Checked at: {YYYY-MM-DD HH:MM:SS KST}

### 1. Frontend & CDN
| URL | HTTP | Time | Cache | CF PoP | Status |

### 2. SSL Certificates
| Domain | Expires | Days Left | Status |

### 3. DNS Resolution
| Domain | Resolved To | Status |

### 4. Shared Infrastructure
| Service | Result | Status |

### 5. Lambda APIs (18 endpoints)
| API | HTTP | Time | Status |

### 6. EC2 Instances
| Instance | Nginx | Disk | Memory | Load | Status |

### 7. Explorer API
| Item | Value | Status |

### 8. Chat Server (nasun/pado 공용)
| Endpoint | HTTP | Time | Status |

### 9. gostop.app
| Item | Value | Status |
|------|-------|--------|
| https://gostop.app | HTTP 200 | OK |
| https://www.gostop.app | HTTP 200 | OK |
| SSL gostop.app | days_left | OK/WARN |
| CF EPRUC29V8YRN3 (us-east-1) | Deployed+Enabled | OK/CRIT |
| x-cache | Hit/Miss/Error | OK/CRIT |

### 10. Pado Bot Gas (Watchdog)
| Bot | Gas | Token | Status |

### 11. Daily Backups
| Table | Records | Size | Age | Status |

### 12. AWS Services
| Service | Status | Notes |

### 13. WAF (nasun-shared-waf, us-east-1)
| Item | Value | Status |
|------|-------|--------|
| Rule count | n / expected=11 | OK/WARN |
| BlockedRequests max(5min sum, 1h) | n | OK/WARN/CRIT |

### 14. Detected Issues
[CRITICAL/WARNING 항목별 상태 + 조치 명령어]
(문제 없으면: All systems operational.)
```

---

## 주의사항

- **Read-only**: 체크 중 재시작/설정변경 금지. 조치 명령어 제시 후 사용자 승인 대기.
- **gostop.app**: S3 origin (EC2 없음). CF는 us-east-1. SSH 체크 없음.
- **Lambda**: GET만 전송 (POST/PUT 금지).
- **pm2 jlist + Python 파서**: `pm2 env`, `printenv` 금지 (시크릿 노출).
- **CloudWatch Logs**: `length(events)`만 추출 (메시지 내용 조회 금지).
- **Secrets Manager**: 메타데이터만 확인, 값 읽기 금지.
- **devnet 위임**: RPC/fullnode 심층 점검은 nasun-devnet `/health-check` 안내.
- **AWS 리전**: gostop CF/ACM은 `--region us-east-1`, 나머지는 `--region ap-northeast-2`.
