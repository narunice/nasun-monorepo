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
| 도메인 | Distribution ID | Region | Origin |
|--------|----------------|--------|--------|
| nasun.io | E362CCGDH7WA7C | ap-northeast-2 | EC2 43.200.67.52 |
| explorer.nasun.io | E31QOCW4WNY9FL | ap-northeast-2 | EC2 43.200.67.52 |
| pado.finance | E35SWPQEJB8HHE | ap-northeast-2 | EC2 43.200.67.52 |
| gostop.app | EPRUC29V8YRN3 | **us-east-1** | S3 gostop-site-466841130170 |

### AWS 프로필
- 기본: `--profile nasun-prod --region ap-northeast-2`
- gostop CloudFront/ACM: `--profile nasun-prod --region us-east-1`

---

## $ARGUMENTS 처리

| 인자 | 실행 범위 |
|------|----------|
| (없음) / `full` | 전체 |
| `quick` | 1단계만 (1e SSH 제외, SSH/AWS 불필요) |
| `website` | 1a-d,1f-g + 2a,2b + 2.5 + 3 + 5W + 6W,A,B,S |
| `explorer` | 1a-e + 2c + 3 + 4 + 5E + 6E,A,S |
| `pado` | 1a-d,1h + 2a,2b + 2.5 + 3e + 5P + 6P,A,B,S |
| `gostop` | 1a,1b,1c + 3e(gostop only) + 5G + 6GS,S |

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
  ["Follower Count"]="https://as05kvrlii.execute-api.ap-northeast-2.amazonaws.com/prod/"
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

### 5단계: CloudFront 캐시 분석

```bash
for url in "https://nasun.io" "https://explorer.nasun.io/devnet" "https://pado.finance" "https://gostop.app"; do
  echo "=== $url ==="
  curl -sI -m 10 "$url" | grep -iE "x-cache|x-amz-cf-pop|cache-control|content-encoding"
done
# origin direct check (EC2 apps only - gostop is S3)
curl -sI -m 10 -H "Host: nasun.io" http://43.200.67.52 -o /dev/null -w "origin_direct: HTTP %{http_code}\n"
```

- nasun.io index.html `no-cache,no-store`=OK (SPA 재배포 후 구버전 캐시 방지, 의도적)
- `x-cache: Error`=CRITICAL
- gostop.app: S3 origin이므로 origin direct 체크 없음

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

#### Explorer (E)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| E1 | explorer-api restart >10 | WARNING | `pm2 logs explorer-api --lines 50` |
| E2 | explorer-api != online | CRITICAL | `pm2 restart explorer-api` |
| E3 | node-3 nginx inactive | WARNING | `sudo systemctl restart nginx` |
| E4 | indexer lag >500 | CRITICAL | devnet `/health-check` 실행 |
| E5 | chainResetDetected=true | CRITICAL | Explorer DB 재초기화 필요 |

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
| P6 | chat-server mem >350MB / >500MB | WARNING / CRITICAL | 500MB=PM2 auto-restart |
| P7 | price-updater stopped | CRITICAL | prod 전용 단일 인스턴스. `pm2 restart price-updater` |
| P8 | lp-bot-* stopped | WARNING | `pm2 restart lp-bot-nbtc` 등 |
| P9 | tpsl-keeper stopped or port 4001 없음 | WARNING | `pm2 restart tpsl-keeper` |
| P10 | balance-watchdog stopped | WARNING | `pm2 restart balance-watchdog` |
| P11 | NASUN gas <1500 | CRITICAL | `cd /home/ec2-user/pado-bots && source .env && npx tsx scripts/prefund-bot.ts` |
| P12 | lottery-keeper stopped | WARNING | `pm2 restart lottery-keeper` |

#### gostop (GS)
| ID | 조건 | 심각도 | 조치 |
|----|------|--------|------|
| GS1 | gostop.app HTTP != 200 or `x-cache: Error` | CRITICAL | CF EPRUC29V8YRN3 상태 확인 (us-east-1), S3 버킷 점검 |
| GS2 | EPRUC29V8YRN3 Disabled or !Deployed | CRITICAL | AWS 콘솔 us-east-1 CloudFormation 확인 |
| GS3 | gostop.app SSL <30일 | WARNING | ACM 자동갱신 확인 (us-east-1) |

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

### 5. Lambda APIs (19 endpoints)
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

### 13. Detected Issues
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
