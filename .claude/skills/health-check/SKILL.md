---
name: health-check
description: |
  nasun-website, network-explorer, pado의 프로덕션 인프라 헬스를 총체적으로 체크합니다.
  CloudFront CDN, Lambda API 20+개, EC2 nginx, Explorer API, Pado Chat Server,
  DynamoDB, EventBridge, CloudWatch 알람, SSL 인증서, DNS, Umami 등 전체 웹 인프라를 점검합니다.
  "헬스체크", "상태 확인", "health check", "사이트 상태" 등의 요청에 사용합니다.
  인자로 quick, full, website, explorer, pado를 지원합니다.
---

# Health Check: Nasun Production 웹 인프라 점검

nasun-website(nasun.io), network-explorer(explorer.nasun.io), pado(pado.finance)의 프로덕션 인프라를 총체적으로 점검합니다.
CloudFront CDN, Lambda API, EC2 nginx, Explorer API, Pado Chat Server, AWS 서비스를 다단계로 체크합니다.

> **Scope**: 웹 애플리케이션 계층에 집중합니다. 블록체인 노드 심층 점검(fullnode RSS, indexer OOM, .chk 파일, DB reinit 등)은
> nasun-devnet 워크스페이스의 `/health-check` 스킬이 담당합니다. 여기서는 devnet 인프라와 중복 점검하지 않습니다.

## 인프라 구성 참조

### EC2 인스턴스

| 용도 | IP | 사용자 | SSH 키 | 비고 |
|------|-----|--------|--------|------|
| Production (웹 origin) | 43.200.67.52 | ec2-user | `~/.ssh/.awskey/nasun-prod-key` | Amazon Linux 2023, nginx |
| Staging (dev + Umami) | 15.165.19.180 | ubuntu | `~/.ssh/.awskey/naru_seoul.pem` | Umami Analytics Docker |
| Node-3 (Explorer API) | 54.180.61.196 | ubuntu | `~/.ssh/.awskey/nasun-devnet-key.pem` | explorer-api PM2, nginx |

### CloudFront Distributions

| 도메인 | Distribution ID | Origin |
|--------|----------------|--------|
| nasun.io | E362CCGDH7WA7C | EC2 43.200.67.52:80 |
| explorer.nasun.io | E31QOCW4WNY9FL | EC2 43.200.67.52:80 |
| pado.finance | E35SWPQEJB8HHE | EC2 43.200.67.52:80 |

### AWS 프로필

- Production: `--profile nasun-prod` (Account: 466841130170)
- Region: `ap-northeast-2`

---

## $ARGUMENTS 처리

| 인자 | 동작 |
|------|------|
| (없음) 또는 `full` | 전체 실행 |
| `quick` | 1단계만 (1a~1d, 1f~1h. 1e SSH 제외. SSH/AWS CLI 불필요) |
| `website` | nasun-website 관련만 (1a-d,1f-g + 2a,2b + 2.5 + 3 + 5 + 6W,A,B,S + 7) |
| `explorer` | network-explorer 관련만 (1a-e + 2c + 3 + 4 + 5 + 6E,A,S + 7) |
| `pado` | pado.finance 관련만 (1a,1b,1c,1d,1h + 2a,2b + 2.5 + 3e만 + 5(pado CDN만) + 6P,A,B,S + 7) |

`$ARGUMENTS`를 파싱하여 해당 범위와 단계만 실행합니다. 인자가 없으면 전체 실행.

---

## 실행 절차

### 1단계: 외부 엔드포인트 검증

가능한 한 **병렬로** 실행합니다.
`quick` 모드는 이 단계(1e SSH 제외)만 수행 후 Summary로 건너뜁니다.

#### 1a. Frontend (CloudFront CDN)

각 URL에 대해 HTTP 상태코드, 응답시간, CloudFront 헤더를 확인합니다:

```bash
curl -sI -m 10 https://nasun.io -w "\n%{http_code}|%{time_total}|%{ssl_verify_result}"
```

| 대상 | URL | 기대 | 비고 |
|------|-----|------|------|
| nasun.io | `https://nasun.io` | HTTP 200 | `x-cache`, `x-amz-cf-pop` 헤더 분석 |
| staging.nasun.io | `https://staging.nasun.io` | HTTP 200 또는 401 | Basic Auth 설정 시 401 정상 |
| explorer.nasun.io | `https://explorer.nasun.io/devnet` | HTTP 200 | CloudFront 응답 확인 |
| pado.finance | `https://pado.finance` | HTTP 200 | CloudFront 응답 확인 |
| staging.pado.finance | `https://staging.pado.finance` | HTTP 200 | Staging EC2 직접 서빙 |

분석 기준:
- HTTP 200 또는 301 (trailing slash redirect) = OK
- `x-cache: Hit from cloudfront` = CDN 캐시 정상
- `x-cache: Miss from cloudfront` = OK (첫 요청 또는 TTL 만료)
- `x-cache: Error from cloudfront` = **CRITICAL** (origin 장애)
- `ssl_verify_result` != 0 = **CRITICAL** (SSL 인증서 문제)
- `time_total` > 5s = **WARNING** (느린 응답)
- explorer.nasun.io/devnet은 301→/devnet/ 리다이렉트가 정상 (trailing slash)

#### 1b. SSL 인증서 만료 확인

8개 도메인의 SSL 인증서 만료일을 확인합니다:

```bash
echo | openssl s_client -servername nasun.io -connect nasun.io:443 2>/dev/null \
  | openssl x509 -noout -enddate -checkend 2592000
```

대상 도메인:
- `nasun.io`
- `staging.nasun.io`
- `explorer.nasun.io`
- `rpc.devnet.nasun.io`
- `faucet.devnet.nasun.io`
- `analytics.nasun.io`
- `pado.finance`
- `staging.pado.finance`

판정:
- 30일 초과 = OK
- 7~30일 = **WARNING**
- 7일 미만 또는 만료 = **CRITICAL**

만료일 추출 (상세 정보용):
```bash
echo | openssl s_client -servername nasun.io -connect nasun.io:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

#### 1c. DNS 해석 확인

주요 도메인의 DNS 해석을 확인합니다. `getent hosts`를 사용합니다 (`dig`/`nslookup`은 환경에 따라 미설치):

```bash
for domain in nasun.io explorer.nasun.io pado.finance staging.pado.finance rpc.devnet.nasun.io analytics.nasun.io staging.nasun.io faucet.devnet.nasun.io; do
  result=$(getent hosts "$domain" 2>/dev/null)
  echo "$domain: ${result:-FAILED}"
done
```

판정:
- 응답 없음 (FAILED) = **CRITICAL** (DNS 장애)
- nasun.io / explorer.nasun.io가 CloudFront 주소로 해석되지 않음 = **WARNING**
- CloudFront 도메인(`cloudfront.net`) 또는 IPv6 `2600:9000:` 대역이면 정상

#### 1d. Shared Infrastructure (RPC, Faucet, zkLogin)

**RPC 체크:**
```bash
curl -s -m 10 -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'
```
- 기대값: `{"result":"272218f1"}`
- Chain ID 불일치 또는 timeout = **CRITICAL**

```bash
curl -s -m 10 -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}'
```
- 체크포인트 번호 기록 (4단계에서 인덱서 lag 비교에 사용)

**Faucet 체크:**
```bash
curl -s -m 10 -o /dev/null -w "%{http_code}" https://faucet.devnet.nasun.io
```
- HTTP 200 또는 405 = OK
- timeout 또는 5xx = **WARNING**

**zkLogin Prover 체크 (POST-only 엔드포인트):**
```bash
curl -s -m 10 -X POST -H "Content-Type: application/json" -d '{}' \
  -o /dev/null -w "%{http_code}" https://rpc.devnet.nasun.io/zkprover/v1
```
- HTTP 400/500 (빈 body 에러) = **OK** (prover 도달 가능, 응답 중)
- timeout / connection refused / HTTP 0 = **CRITICAL** (prover 다운)

> RPC/Faucet/zkLogin은 shared infrastructure입니다. 문제 발견 시 nasun-devnet의 `/health-check` 실행을 안내합니다.

#### 1e. Explorer API Health (SSH 경유)

Port 3200은 Security Group에서 Production EC2 IP에만 개방되어 직접 접근 불가합니다.
SSH로 node-3에서 localhost를 호출합니다:

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@54.180.61.196 "curl -s -m 5 http://localhost:3200/api/v1/health"
```

응답 분석:
- `status: "ok"` = 정상
- `chainResetDetected: true` = **CRITICAL** (체인 리셋 감지, DB 재초기화 필요)
- `latestCheckpoint` 값 기록 (4단계 인덱서 lag 비교용)
- timeout/error = **CRITICAL** (Explorer API 다운)

#### 1f. Lambda API Probe

20개 Lambda API의 reachability를 GET 요청으로 확인합니다.
**절대 POST/PUT을 보내지 않습니다** (부작용 방지).

```bash
curl -s -m 10 -o /dev/null -w "%{http_code}|%{time_total}" <URL>
```

**Core APIs:**

| 이름 | URL |
|------|-----|
| Price API | `https://06hg1n9i3h.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Backup Price API | `https://7vtmrjor8i.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Random Image | `https://y6davo1om2.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| User Profile | `https://aanboqet5i.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| User Count | `https://mwhyuu1k51.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Follower Count | `https://as05kvrlii.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Wallet API | `https://6pnnb6hcrd.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Link Account | `https://33j69j7lpg.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Deactivate User | `https://tz8yw7w72d.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| AWS Credentials | `https://x20xq2yvk4.execute-api.ap-northeast-2.amazonaws.com/prod/` |

**Auth APIs:**

| 이름 | URL |
|------|-----|
| Twitter Auth | `https://br30jspm8j.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter` |
| MetaMask Auth | `https://gtzq164xhb.execute-api.ap-northeast-2.amazonaws.com/prod/auth/metamask` |
| zkLogin Salt | `https://r0thrlqqcf.execute-api.ap-northeast-2.amazonaws.com/prod/auth/zklogin/salt` |

**Feature APIs:**

| 이름 | URL |
|------|-----|
| Whitelist Join | `https://shx1fpd8qi.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Whitelist Check | `https://am4awqudsb.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Governance | `https://4xf3e5t8zc.execute-api.ap-northeast-2.amazonaws.com/prod/config` |
| Leaderboard V3 | `https://auzo707xql.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Battalion NFT | `https://jrrge0lqtk.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| Admin API | `https://doetwxms5a.execute-api.ap-northeast-2.amazonaws.com/prod/` |

판정 기준:
- HTTP 200/400/401/403/405 = **OK** (API Gateway 도달 가능. 403은 "Missing Authentication Token"으로 정상. 401은 인증 필요 응답으로 정상)
- HTTP 5xx = **WARNING** (Lambda 에러, cold start 문제, 또는 설정 오류)
- Timeout / connection refused / HTTP 0 = **CRITICAL** (API Gateway 또는 Lambda 접근 불가)
- `time_total` > 5s = **WARNING** (cold start 또는 성능 이슈)

#### 1g. Umami Analytics

```bash
curl -s -m 10 -o /dev/null -w "%{http_code}" https://analytics.nasun.io
```
- HTTP 200 = OK
- timeout/5xx = **WARNING** (분석 데이터 수집 중단)

#### 1h. Unified Chat Server (nasun-chat-server)

nasun과 pado는 **nasun-chat-server를 공동 사용**합니다 (port 3101, nasun.io 도메인에서 서빙).
pado 프론트엔드는 `VITE_CHAT_HTTP_URL=https://nasun.io/chat` / `VITE_CHAT_WS_URL=wss://nasun.io/ws/chat`를 호출하므로
`pado.finance/chat/*`와 `pado.finance/ws`는 **레거시 데드 엔드포인트** (점검하지 않음).

**Prod:**
```bash
curl -s -m 10 -o /dev/null -w "HTTP:%{http_code}|TIME:%{time_total}" https://nasun.io/chat/health
curl -s -m 10 -o /dev/null -w "HTTP:%{http_code}|TIME:%{time_total}" "https://nasun.io/chat/api/leaderboard?period=24h&mode=volume&limit=3"
```

**Staging:**
```bash
curl -s -m 10 -o /dev/null -w "HTTP:%{http_code}|TIME:%{time_total}" https://staging.nasun.io/chat/health
```

판정:
- Prod `/chat/health` HTTP 200 = **OK** (nasun-chat-server 정상)
- Prod HTTP 502 = **CRITICAL** (nasun-chat-server 다운, upstream 3101 연결 불가)
- Prod timeout = **CRITICAL**
- `/chat/api/leaderboard` HTTP 200 = **OK** (leaderboard indexer 정상)
- **Staging** `/chat/health` HTTP 502 = **OK** (의도적 비활성화, 리소스 절약 목적)

> **레거시 확인(선택):** `curl -s -m 5 -o /dev/null -w "%{http_code}" https://pado.finance/chat/health` 가 502면
> pado.finance.conf에 남은 `location /chat/`, `location /ws` 블록이 아직 3100 포트(죽은 pado-chat-server)를 가리킨다는 뜻.
> 실사용자 트래픽은 nasun.io로 가므로 장애는 아니지만, 정리 대상.

---

### 2단계: EC2 Internal State (SSH)

세 개의 SSH 세션을 **병렬로** 실행합니다.
`website` 모드는 2a + 2b만, `explorer` 모드는 2c만, `pado` 모드는 2a + 2b만 실행합니다.

#### 2a. Production EC2 (43.200.67.52) — nasun-website 호스팅

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ec2-user@43.200.67.52 bash -s << 'HEALTH_EOF'
echo "=== SERVICES ==="
systemctl is-active nginx 2>/dev/null

echo "=== NGINX CONFIG ==="
sudo nginx -t 2>&1 | tail -2

echo "=== STATIC FILES ==="
echo "-- nasun-website --"
ls -la /var/www/nasun/dist/index.html 2>/dev/null || echo "MISSING"
ls /var/www/nasun/dist/assets/ 2>/dev/null | wc -l

echo "-- explorer --"
ls -la /var/www/explorer.nasun.io/devnet/index.html 2>/dev/null || echo "MISSING"
ls /var/www/explorer.nasun.io/devnet/assets/ 2>/dev/null | wc -l

echo "-- pado --"
ls -la /var/www/pado.finance/index.html 2>/dev/null || echo "MISSING"
ls /var/www/pado.finance/assets/ 2>/dev/null | wc -l

echo "=== PADO PM2 PROCESSES ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        name = a['name']
        status = a['pm2_env']['status']
        restarts = a['pm2_env']['restart_time']
        mem = round(a['monit']['memory'] / 1024 / 1024, 1)
        print(f'{name}: status={status}, restarts={restarts}, mem={mem}MB')
except: print('PM2 parse error')
" 2>/dev/null || echo "pm2 not available"
ss -tlnp 2>/dev/null | grep -E "3101|4001" | head -2

echo "=== DISK ==="
df -h / | tail -1

echo "=== MEMORY ==="
free -m | grep -E "Mem|Swap"

echo "=== CPU LOAD ==="
cat /proc/loadavg

echo "=== OPEN CONNECTIONS ==="
ss -s 2>/dev/null | head -3

echo "=== NGINX ERROR LOG (last 10min) ==="
sudo journalctl -u nginx --since "10 minutes ago" --no-pager -p err 2>/dev/null | tail -20

echo "=== NGINX ACCESS LOG ERROR RATE (last 100 requests) ==="
sudo tail -100 /var/log/nginx/access.log 2>/dev/null | awk '{print $9}' | sort | uniq -c | sort -rn | head -5

echo "=== UPTIME ==="
uptime
HEALTH_EOF
```

점검 항목:
- `nginx` 서비스 상태: inactive = **CRITICAL** (사이트 다운)
- `nginx -t` config 검증: fail = **WARNING** (reload 시 깨짐)
- `/var/www/nasun/dist/index.html` 존재: missing = **CRITICAL** (배포 깨짐)
- asset 파일 수: 0 = **CRITICAL** (빌드 아티팩트 누락)
- `/var/www/explorer.nasun.io/devnet/index.html` 존재: missing = **CRITICAL** (explorer 배포 깨짐)
- explorer asset 파일 수: 0 = **CRITICAL**
- `/var/www/pado.finance/index.html` 존재: missing = **CRITICAL** (pado 배포 깨짐)
- pado asset 파일 수: 0 = **CRITICAL**
- `nasun-chat-server` PM2 상태: stopped = **CRITICAL** (chat/leaderboard/trade API 다운 — nasun/pado 공용)
- port 3101 리스닝: 없음 = **CRITICAL** (nasun-chat-server 프로세스 다운)
- `pado-chat-server` PM2 상태: **무시/레거시** (stopped여도 정상. 실트래픽은 nasun-chat-server가 처리). 존재 자체가 정리 대상
- `lp-bot-nbtc/neth/nsol` PM2 상태: stopped = **WARNING** (LP 호가 제공 중단)
- `price-updater` PM2 상태: stopped = **CRITICAL** (오라클 가격 갱신 중단, 단일 인스턴스 필수)
- `tpsl-keeper` PM2 상태: stopped/errored = **WARNING** (TP/SL 주문 실행 중단)
- port 4001 리스닝: 없음 = **WARNING** (TP/SL API 다운)
- `balance-watchdog` PM2 상태: stopped = **WARNING** (봇 토큰/가스 자동 보충 중단)
- `lottery-keeper` PM2 상태: stopped = **WARNING** (주간 복권 사이클 자동화 중단)
- 디스크/메모리/스왑: Threshold 표 참조
- CPU load avg: > 2.0 (2 vCPU 기준) = **WARNING**
- nginx 에러 로그: 최근 10분 에러 확인
- nginx access log HTTP 상태코드 분포: 5xx 5%+ = **WARNING**, 10%+ = **CRITICAL**
- 연결 수: 비정상적으로 높으면 **WARNING**

#### 2b. Staging EC2 (15.165.19.180) — Staging + Umami Analytics

```bash
ssh -i ~/.ssh/.awskey/naru_seoul.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@15.165.19.180 bash -s << 'HEALTH_EOF'
echo "=== SERVICES ==="
systemctl is-active nginx 2>/dev/null

echo "=== STAGING STATIC FILES ==="
ls -la /var/www/staging.nasun.io/index.html 2>/dev/null || echo "MISSING"
ls -la /var/www/staging.pado.finance/index.html 2>/dev/null || echo "MISSING"

echo "=== PADO PM2 PROCESSES ==="
# Note: price-updater는 staging에서 비활성화됨 (DISABLE_PRICE_UPDATER=true, staging은 prod oracle 참조)
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        name = a['name']
        status = a['pm2_env']['status']
        restarts = a['pm2_env']['restart_time']
        mem = round(a['monit']['memory'] / 1024 / 1024, 1)
        print(f'{name}: status={status}, restarts={restarts}, mem={mem}MB')
except: print('PM2 parse error')
" 2>/dev/null || echo "pm2 not available"
ss -tlnp 2>/dev/null | grep -E "3101|4001" | head -2

echo "=== UMAMI DOCKER ==="
sudo docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -E "umami|postgres"

echo "=== DISK ==="
df -h / | tail -1

echo "=== MEMORY ==="
free -m | grep -E "Mem|Swap"

echo "=== DOCKER DISK USAGE ==="
sudo docker system df 2>/dev/null | head -5

echo "=== UPTIME ==="
uptime
HEALTH_EOF
```

점검 항목:
- nginx 상태: inactive = **WARNING**
- `staging.nasun.io/index.html` 존재: missing = **WARNING**
- `staging.pado.finance/index.html` 존재: missing = **WARNING**
- staging `nasun-chat-server` PM2 상태: stopped 또는 online이지만 port 3101 미리스닝 = **OK** (리소스 절약 + 시스템 과부하 방지 목적으로 의도적 비활성화)
- staging `pado-chat-server` PM2 상태: **무시/레거시** (stopped 정상, 실트래픽은 nasun-chat-server가 처리)
- staging LP bots (lp-bot-nbtc/neth/nsol) / tpsl-keeper / balance-watchdog / lottery-keeper PM2 상태: stopped = **OK** (리소스 절약 + 단일 인스턴스 원칙으로 의도적 비활성화)
- `price-updater` 부재는 정상 (staging은 DISABLE_PRICE_UPDATER=true, prod oracle 참조)
- Umami + PostgreSQL Docker 컨테이너: Exited = **WARNING** (분석 수집 중단)
- 디스크 (Docker 이미지/볼륨 포함): Threshold 표 참조
- 메모리/스왑

#### 2d. Pado Bot Wallet Gas Balances (Watchdog Log)

`balance-watchdog`이 60초마다 모든 봇 지갑의 가스 잔액을 기록합니다.
별도 키 파생 없이 watchdog 로그를 직접 읽어 최신 잔액을 확인합니다.

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ec2-user@43.200.67.52 \
  "tail -30 /home/ec2-user/pado-bots/logs/balance-watchdog-out.log 2>/dev/null || echo 'LOG_NOT_FOUND'"
```

로그 형식:
```
2026-04-21 00:31:49: [24:31:49] [NBTC] OK: 610.00 NBTC, 60,500,000 NUSDC, 5014 NASUN gas
2026-04-21 00:31:49: [24:31:49] [NETH] LOW: 0.00 NETH (threshold: 500), 8,720,000,000 NUSDC (threshold: 500,000)
2026-04-21 00:31:49: [24:31:49] [NETH] REFILLED: +50 NETH, +10,000,000 NUSDC (tx: ...)
2026-04-21 00:31:49: [24:31:49] [NSOL] OK: 8600.00 NSOL, 85,000,000 NUSDC, 5007 NASUN gas
```

판정:
- 로그 파일 없음 = **CRITICAL** (watchdog 로그 경로 이상, `/home/ec2-user/pado-bots/logs/` 확인)
- 마지막 로그가 5분 이상 전 = **WARNING** (watchdog이 중단됐을 가능성, PM2 상태 재확인)
- `OK:` 라인의 `NASUN gas` 값 >= 5,000 = OK (watchdog 자동보충 미발동)
- `NASUN gas` 값 1,500~4,999 = **WARNING** (watchdog이 faucet 자동보충 중)
- `NASUN gas` 값 < 1,500 = **CRITICAL** (watchdog 경고 임계값 이하, faucet 응답 불가 가능성)
- `LOW:` 라인 반복 = INFO/WARNING (토큰 잔액 부족, watchdog이 보충 시도 중)

가스 긴급 보충 (watchdog 자동보충 실패 시):
```bash
# Prod 서버 /home/ec2-user/pado-bots/ 에서:
source .env && npx tsx scripts/prefund-bot.ts
```

#### 2c. Node-3 (54.180.61.196) — Explorer 관련만

Explorer API PM2 프로세스와 nginx만 점검합니다. Fullnode/indexer/PostgreSQL 심층 점검은 devnet health-check에 위임합니다.

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@54.180.61.196 bash -s << 'HEALTH_EOF'
echo "=== NGINX ==="
systemctl is-active nginx 2>/dev/null

echo "=== PM2 STATUS ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        name = a['name']
        status = a['pm2_env']['status']
        restarts = a['pm2_env']['restart_time']
        mem = round(a['monit']['memory'] / 1024 / 1024, 1)
        cpu = a['monit']['cpu']
        print(f'{name}: status={status}, restarts={restarts}, mem={mem}MB, cpu={cpu}%')
except: print('PM2 parse error')
" 2>/dev/null || echo "pm2 not available"

echo "=== EXPLORER API RESPONSE TIME ==="
curl -s -m 5 -o /dev/null -w "%{time_total}" http://localhost:3200/api/v1/health 2>/dev/null

echo "=== EXPLORER STATS RESPONSE TIME ==="
curl -s -m 5 -o /dev/null -w "%{time_total}" http://localhost:3200/api/v1/stats/network-summary 2>/dev/null

echo "=== DISK ==="
df -h / | tail -1

echo "=== MEMORY ==="
free -m | grep -E "Mem|Swap"

echo "=== UPTIME ==="
uptime
HEALTH_EOF
```

점검 항목:
- nginx 상태: inactive = **WARNING** (API 프록시 중단)
- `explorer-api` PM2 프로세스: online 필수, stopped/errored = **CRITICAL**
- PM2 restart 횟수: > 10 = **WARNING** (crash-loop 가능)
- PM2 메모리: > 500MB = **WARNING**, > 1GB = **CRITICAL**
- `baram-aer-api` PM2 프로세스 (있는 경우): 상태 확인
- API 응답 시간 (localhost): > 1s = **WARNING** (DB 부하 가능)
- 디스크/메모리: Threshold 표 참조

---

### 2.5단계: Daily Local Backup Verification

로컬 crontab으로 DynamoDB 테이블을 매일 백업하는 자동화가 구성되어 있습니다.
백업 파일의 존재 여부, 나이(freshness), 크기를 검증합니다.

**SSH/AWS CLI 불필요 (로컬 파일시스템 점검)**

```bash
BACKUP_DIR="/home/naru/nasun-backups/dynamodb"
TODAY=$(date +%Y%m%d)
YESTERDAY=$(date -d '1 day ago' +%Y%m%d)

# Check each backup file (gzip compressed)
for prefix in "ZkLoginUsers" "UserProfiles" "UserWallets" "zklogin-salts" "leaderboard-v3-snapshots"; do
  # Try today's file first, then yesterday's (cron runs at 01:00 UTC = 10:00 KST)
  file="${BACKUP_DIR}/${prefix}-${TODAY}.json.gz"
  if [ ! -f "$file" ]; then
    file="${BACKUP_DIR}/${prefix}-${YESTERDAY}.json.gz"
  fi
  if [ -f "$file" ]; then
    size=$(stat -c%s "$file" 2>/dev/null)
    age_hours=$(( ($(date +%s) - $(stat -c%Y "$file")) / 3600 ))
    # Decompress and check JSON validity + record count
    records=$(zcat "$file" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('Items',[])))" 2>/dev/null || echo "INVALID_JSON")
    echo "${prefix}: size=${size} bytes, age=${age_hours}h, records=${records}, file=$(basename $file)"
  else
    echo "${prefix}: MISSING (no file for today or yesterday)"
  fi
done
```

판정:
- 파일 존재 + 유효한 JSON + records > 0 + 나이 < 48h = **OK**
- 파일 존재 + 크기 == 0 또는 < 100 bytes = **WARNING** (빈 백업, AWS CLI 인증 실패 가능성)
- 파일 존재 + records == INVALID_JSON = **WARNING** (손상된 백업, AWS CLI 에러 메시지가 저장되었을 가능성)
- 파일 없음 (오늘 + 어제 모두) = **CRITICAL** (cron 미실행 또는 삭제됨)
- 나이 > 48h = **WARNING** (2일 이상 미갱신)

Cron 스케줄 참조:
| 시각 (UTC) | 대상 테이블 | 파일 패턴 |
|------------|------------|-----------|
| 01:00 | ZkLoginUsers, UserProfiles, UserWallets (Tier 1) | `{table}-YYYYMMDD.json.gz` |
| 01:05 | ZkLoginUsers (salt projection) | `zklogin-salts-YYYYMMDD.json.gz` |
| 01:10 | leaderboard-v3-snapshots | `leaderboard-v3-snapshots-YYYYMMDD.json.gz` |

> 추후 백업 항목이 추가되면 위 for loop의 prefix 목록에 추가합니다.

---

### 3단계: AWS Service Health (AWS CLI)

AWS CLI로 서버리스 인프라를 점검합니다. `--profile nasun-prod --region ap-northeast-2` 사용.
`website` 모드와 `explorer` 모드 모두 이 단계를 실행합니다 (AWS 서비스는 공통).

#### 3a. CloudWatch 알람 상태

```bash
aws cloudwatch describe-alarms --state-value ALARM --profile nasun-prod --region ap-northeast-2 \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' --output table
```

- ALARM 상태 알람 없음 = OK
- ALARM 존재 = 내용에 따라 **WARNING** 또는 **CRITICAL**
- 특히 주의할 알람:
  - `InvalidRefreshTokenAlarm` — Twitter OAuth 토큰 무효화 (**CRITICAL**)
  - `SecretUpdateFailureAlarm` — Secrets Manager 갱신 실패 (**CRITICAL**)
  - `*-ServerError` — Lambda 5xx 에러 (**WARNING**)
  - `DynamoDB-Whitelist-Throttle` — DynamoDB throttling (**WARNING**)

#### 3b. EventBridge 스케줄 규칙 상태

```bash
aws events list-rules --profile nasun-prod --region ap-northeast-2 \
  --query 'Rules[?starts_with(Name, `nasun-`) || starts_with(Name, `pado-`)].{Name:Name,State:State,Schedule:ScheduleExpression}' \
  --output table
```

확인 대상:

| 규칙 | 주기 | 용도 | 예상 상태 |
|------|------|------|-----------|
| nasun-common-price-update | 1분 | NFT 가격 갱신 | ENABLED |
| nasun-common-purge-deactivated-accounts-daily | 1일 | 비활성 계정 정리 | ENABLED |
| leaderboard-v3-snapshot-schedule | 매일 00:10 UTC | 리더보드 스냅샷 | **DISABLED (의도적)** -- creators leaderboard 운영 일시 정지 중. WARN 아님 |

- State = ENABLED → OK (단, leaderboard-v3-snapshot-schedule은 예상 상태가 DISABLED이므로 ENABLED로 나오면 WARN)
- State = DISABLED → **WARNING** (의도적 비활성화인지 확인 필요. leaderboard-v3-snapshot-schedule은 예외)

#### 3c. Lambda 최근 에러 확인

주요 Lambda 함수의 최근 1시간 에러를 CloudWatch Logs에서 카운트합니다:

```bash
for fn in nasun-common-governance-api nasun-common-price-api nasun-auth-twitter-login \
  nasun-auth-metamask nasun-auth-zklogin-salt nasun-leaderboard-v3-get-leaderboard \
  nasun-nft-verify-eligibility nasun-common-get-follower-count; do
  count=$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/$fn" \
    --start-time $(date -d '1 hour ago' +%s000) \
    --filter-pattern "ERROR" \
    --profile nasun-prod --region ap-northeast-2 \
    --query 'length(events)' --output text 2>/dev/null)
  echo "$fn: ${count:-0} errors"
done
```

판정:
- 에러 0 = OK
- 에러 1-5 = **WARNING**
- 에러 > 5 = **CRITICAL** (지속적 장애)

#### 3d. DynamoDB 테이블 상태

핵심 테이블들의 상태를 일괄 확인합니다:

```bash
for table in UserProfiles UserIdentityMap CryptoPrices CryptoBackupPrices \
  GenesisNftWhitelist nasun-nft-whitelist leaderboard-v3-posts leaderboard-v3-accounts \
  leaderboard-v3-seasons MetaMaskAuthNonces ZkLoginUsers nasun-nft-event-tasks; do
  status=$(aws dynamodb describe-table --table-name "$table" --profile nasun-prod --region ap-northeast-2 \
    --query 'Table.TableStatus' --output text 2>/dev/null)
  echo "$table: ${status:-NOT_FOUND}"
done
```

판정:
- TableStatus = ACTIVE → OK
- TableStatus != ACTIVE → **CRITICAL**
- 테이블 없음 (NOT_FOUND) → **CRITICAL**

#### 3e. CloudFront Distribution 상태

```bash
aws cloudfront get-distribution --id E362CCGDH7WA7C --profile nasun-prod \
  --query 'Distribution.{Status:Status,DomainName:DomainName,Enabled:DistributionConfig.Enabled}' --output json

aws cloudfront get-distribution --id E31QOCW4WNY9FL --profile nasun-prod \
  --query 'Distribution.{Status:Status,DomainName:DomainName,Enabled:DistributionConfig.Enabled}' --output json

aws cloudfront get-distribution --id E35SWPQEJB8HHE --profile nasun-prod \
  --query 'Distribution.{Status:Status,DomainName:DomainName,Enabled:DistributionConfig.Enabled}' --output json
```

판정:
- Status = Deployed, Enabled = true → OK
- Enabled = false → **CRITICAL** (Distribution 비활성화됨)

#### 3f. Secrets Manager 시크릿 접근 가능 여부

시크릿의 **값은 절대 읽지 않습니다**. 메타데이터만 확인합니다:

```bash
for secret in "nasun-twitter-tokens-prod" "nasun-wallet-proof-prod" "nasun/governance/oracle" "nasun/governance/sponsor" "nasun-telegram-bot-token"; do
  aws secretsmanager describe-secret --secret-id "$secret" --profile nasun-prod --region ap-northeast-2 \
    --query '{Name:Name,LastAccessed:LastAccessedDate}' --output json 2>/dev/null \
    || echo "MISSING: $secret"
done
```

판정:
- 시크릿 존재 + 접근 가능 = OK
- LastAccessedDate가 7일 이상 전 = **WARNING** (사용되지 않는 시크릿?)
- 시크릿 없음 = **CRITICAL**

---

### 4단계: Explorer Data Integrity

Explorer API의 데이터 정합성을 확인합니다.
`website` 모드에서는 이 단계를 생략합니다.

#### 4a. 인덱서 지연 (Indexer Lag)

1단계에서 수집한 두 값을 비교합니다:
- RPC `sui_getLatestCheckpointSequenceNumber` 결과
- Explorer health endpoint의 `latestCheckpoint` 값

```
lag = RPC_checkpoint - Explorer_checkpoint
```

판정:
- lag < 100 = OK
- lag 100~500 = **WARNING** (인덱서 지연 중)
- lag > 500 = **CRITICAL** (인덱서가 체인을 따라가지 못함 → devnet health-check 실행 안내)

#### 4b. Explorer Stats API 응답 검증

1단계 SSH 세션에서 추가 확인 (또는 별도 SSH):

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  ubuntu@54.180.61.196 "curl -s -m 5 http://localhost:3200/api/v1/stats/network-summary"
```

판정:
- `data.totalTransactions` > 0 = OK
- `data.totalTransactions` = 0 또는 null = **CRITICAL** (데이터 없음)
- 응답 없음 = **CRITICAL**

#### 4c. Chain Reset Detection

1단계 Explorer health 응답의 `chainResetDetected` 필드:
- `false` = OK
- `true` = **CRITICAL** (체인 리셋 감지, Explorer DB 재초기화 필요 → devnet 운영 문서 참조)

---

### 5단계: CloudFront CDN Analysis

CloudFront의 캐시 상태와 origin 건강성을 분석합니다.
`explorer` 모드에서는 explorer.nasun.io만 확인합니다.

#### 5a. 응답 헤더 분석

```bash
# nasun.io 기본 페이지
curl -sI -m 10 https://nasun.io | grep -iE "x-cache|x-amz-cf-pop|age|cache-control|content-encoding"

# nasun.io asset (캐시 정책 확인)
curl -sI -m 10 "https://nasun.io/assets/" | grep -iE "x-cache|cache-control|content-encoding" || true

# explorer.nasun.io
curl -sI -m 10 https://explorer.nasun.io/devnet | grep -iE "x-cache|x-amz-cf-pop|cache-control|content-encoding"

# pado.finance
curl -sI -m 10 https://pado.finance | grep -iE "x-cache|x-amz-cf-pop|cache-control|content-encoding"
```

분석:
- `index.html`: **nasun.io는 `no-cache, no-store, must-revalidate`가 정상** (nginx `location = /index.html`에 의도적으로 설정됨. SPA 배포 후 구버전 HTML 서빙 방지 목적. `max-age=3600` 기대 금지). pado.finance는 `max-age=3600` 정상.
- assets: `cache-control`에 `immutable` 확인 (장기 캐시)
- `content-encoding: gzip` 또는 `br` 확인 (압축 활성화)
- `x-cache: Error from cloudfront` = **CRITICAL**
- CloudFront POP 위치 확인 (한국 사용자는 NRT/ICN이 이상적)

#### 5b. Origin 직접 접근 확인

CloudFront를 우회하여 origin EC2가 직접 응답하는지 확인합니다:

```bash
curl -sI -m 10 -H "Host: nasun.io" http://43.200.67.52 -o /dev/null -w "%{http_code}"
```

판정:
- HTTP 200 = origin 정상
- CloudFront OK + origin 실패 = **WARNING** (캐시만 서빙 중, 캐시 만료 시 장애 발생)
- 둘 다 실패 = **CRITICAL**

---

### 6단계: Failure Pattern Detection

수집된 데이터를 기반으로 장애 패턴을 자동 탐지합니다.

#### Website Patterns (W1-W10)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| W1 | Prod EC2 nginx 다운 | `systemctl is-active` != active | CRITICAL | `ssh ec2-user@43.200.67.52 "sudo systemctl restart nginx"` |
| W2 | 정적 파일 누락 | index.html 없음 or asset 0개 | CRITICAL | nasun-website: `rsync -avz --delete apps/nasun-website/frontend/dist/ ec2-user@43.200.67.52:/var/www/nasun/dist/` / explorer: `rsync -avz --delete apps/network-explorer/dist/ ec2-user@43.200.67.52:/var/www/explorer.nasun.io/devnet/` |
| W3 | Prod 디스크 부족 | >80% (W), >90% (C) | W/C | `/var/log` 정리, 오래된 백업 삭제 |
| W4 | CloudFront 오리진 에러 | `x-cache: Error from cloudfront` | CRITICAL | origin nginx 상태 확인 → 복구 후 CloudFront invalidation |
| W5 | Lambda API 다수 장애 | 3개 이상 5xx 또는 timeout | CRITICAL | AWS Lambda 콘솔 확인. 리전 장애 또는 IAM 이슈 가능성 |
| W6 | SSL 인증서 임박 만료 | 30일 이내 만료 | WARNING | ACM 자동 갱신 확인. ACM 인증서는 보통 자동 갱신됨 |
| W7 | SSL 인증서 만료 | 이미 만료 또는 7일 미만 | CRITICAL | 즉시 인증서 갱신 필요 |
| W8 | Lambda cold start 지연 | 5개 이상 API에서 응답 > 5s | WARNING | Provisioned Concurrency 검토 (비용 증가 고려) |
| W9 | nginx 5xx 비율 높음 | access log에서 5xx 5%+ (W), 10%+ (C) | W/C | nginx 에러 로그 분석, upstream 확인 |
| W10 | Prod EC2 CPU 과부하 | load avg > 2.0 (2 vCPU 기준) | WARNING | 프로세스 확인 (`top`), nginx worker 수 조정 |

#### Explorer Patterns (E1-E6)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| E1 | Explorer API crash-loop | PM2 restart > 10 | WARNING | `ssh ubuntu@54.180.61.196 "pm2 logs explorer-api --lines 50"` — 보통 DB 연결 이슈 |
| E2 | Explorer API 다운 | PM2 status != online | CRITICAL | `ssh ubuntu@54.180.61.196 "pm2 restart explorer-api"` |
| E3 | Node-3 nginx 다운 | systemctl is-active != active | WARNING | `ssh ubuntu@54.180.61.196 "sudo systemctl restart nginx"` — API 프록시 중단 |
| E4 | 인덱서 지연 심각 | lag > 500 | CRITICAL | nasun-devnet `/health-check 3` 실행 → 인덱서 상태 상세 확인 |
| E5 | Chain reset 감지 | chainResetDetected = true | CRITICAL | Explorer DB 재초기화 필요. nasun-devnet 운영 문서 참조 |
| E6 | Explorer API 메모리 과다 | PM2 메모리 > 500MB | WARNING | `pm2 restart explorer-api` 고려 (메모리 릭 가능성) |

#### AWS Patterns (A1-A6)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| A1 | CloudWatch 알람 발동 | ALARM 상태 알람 존재 | W/C | 알람 내용에 따라 대응 |
| A2 | EventBridge 규칙 비활성 | State != ENABLED | WARNING | 의도적 비활성화인지 확인. 특히 price-update, token-refresh 주의 |
| A3 | DynamoDB 테이블 이상 | TableStatus != ACTIVE | CRITICAL | AWS 콘솔에서 테이블 상태 확인 |
| A4 | Twitter OAuth 토큰 무효 | InvalidRefreshTokenAlarm ALARM | CRITICAL | Twitter Developer Portal에서 OAuth 토큰 재발급 |
| A5 | Lambda 에러 급증 | 1시간 내 에러 > 5 (단일 함수) | CRITICAL | CloudWatch Logs 확인 후 코드 수정 필요 |
| A6 | Umami Analytics 다운 | Docker 컨테이너 Exited | WARNING | `ssh ubuntu@15.165.19.180 "cd ~/umami && sudo docker compose up -d"` |

#### Pado Patterns (P1-P10)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| P1 | Unified Chat Server 다운 (prod) | `https://nasun.io/chat/health` HTTP != 200 또는 `nasun-chat-server` PM2 stopped/port 3101 미리스닝 | CRITICAL | `ssh ec2-user@43.200.67.52 "pm2 restart nasun-chat-server"`. env 유실 시 `cd /home/ec2-user/nasun-chat-server && pm2 delete nasun-chat-server && pm2 start ecosystem.config.cjs`. nasun/pado 공용 서버이므로 양쪽 모두 영향 |
| P2 | Unified Chat Server 다운 (staging) | `https://staging.nasun.io/chat/health` HTTP != 200 | **OK** | 의도적 비활성화 (리소스 절약 + 과부하 방지). 이상 없음으로 판정. prod 기준으로만 장애 판단 |
| P3 | Pado 정적 파일 누락 (prod) | `/var/www/pado.finance/index.html` 없음 | CRITICAL | `rsync -avz --delete apps/pado/frontend/dist/ ec2-user@43.200.67.52:/var/www/pado.finance/` |
| P4 | Pado 정적 파일 누락 (staging) | `/var/www/staging.pado.finance/index.html` 없음 | CRITICAL | `rsync -avz --delete apps/pado/frontend/dist/ ubuntu@15.165.19.180:/var/www/staging.pado.finance/` |
| P5 | Chat Server crash-loop | `nasun-chat-server` PM2 restart > 10 **AND** process uptime < 1h | WARNING | restart 수만으로 판단 금지. PM2 describe의 uptime을 반드시 함께 확인. uptime이 수 시간 이상이면 과거 누적 재시작이므로 현재는 안정 상태. RPC 503 에러가 error log에 반복되는 것은 non-fatal (Node-3 부하 downstream 증상). `pm2 logs nasun-chat-server --lines 50 --nostream`으로 실제 크래시 여부 확인. |
| P6 | Chat Server 메모리 과다 | `nasun-chat-server` PM2 메모리 > 350MB (W), > 500MB (C, auto-restart) | W/C | 500MB 초과 시 PM2가 자동 재시작 (max_memory_restart 500MB). 30분 주기 pruneStale()로 cooldownMap/pools 정리 중 |
| P7 | Price Updater 다운 | PM2 status != online | CRITICAL | 오라클 가격 미갱신으로 DEX 거래 불가. 단일 인스턴스 필수 (prod에서만 실행) |
| P8 | LP Bot 다운 | lp-bot-nbtc/neth/nsol 중 하나 이상 stopped | WARNING | LP 호가 제공 중단. `pm2 restart lp-bot-nbtc` |
| P9 | TP/SL Keeper 다운 | tpsl-keeper stopped 또는 port 4001 미리스닝 | WARNING | 사용자 TP/SL 주문 미실행. `pm2 restart tpsl-keeper`. max_restarts=10, 초과 시 `pm2 start ecosystem.config.cjs --only tpsl-keeper` |
| P10 | Balance Watchdog 다운 | balance-watchdog stopped | WARNING | 봇 토큰/가스 자동 보충 중단. `pm2 restart balance-watchdog`. 장시간 중단 시 토큰 잔액 고갈로 LP 주문 제출 불가 |
| P11 | LP Bot 가스 부족 | watchdog 로그에서 `NASUN gas` < 1,500 | WARNING/CRITICAL | watchdog이 faucet 자동보충 실패 중. `ssh ec2-user@43.200.67.52 "cd /home/ec2-user/pado-bots && source .env && npx tsx scripts/prefund-bot.ts"` 실행. < 1,000이면 봇이 이미 사이클 건너뜀 |
| P12 | Lottery Keeper 다운 | lottery-keeper stopped | WARNING | 주간 복권 사이클 자동화 중단. `pm2 restart lottery-keeper`. 복권 Round 전환/당첨자 선정 수동 개입 필요 |

#### Backup Patterns (B1-B3)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| B1 | 백업 파일 누락 | 오늘+어제 파일 모두 없음 | CRITICAL | `crontab -l`로 cron job 확인. AWS CLI 인증 (`aws sts get-caller-identity --profile nasun-prod`) 점검 |
| B2 | 빈 백업 파일 | 파일 크기 < 100 bytes | WARNING | AWS CLI 인증 만료 또는 DynamoDB 접근 권한 문제. `aws dynamodb scan --table-name ZkLoginUsers --profile nasun-prod --max-items 1`로 테스트 |
| B3 | 백업 미갱신 | 최신 파일 나이 > 48h | WARNING | cron 실행 여부 확인: `grep CRON /var/log/syslog` 또는 WSL 재시작으로 cron 중단 가능 (`sudo service cron status`) |

#### Shared Infrastructure Patterns (S1-S3)

| ID | 패턴 | 감지 조건 | 심각도 | 권장 조치 |
|----|------|-----------|--------|-----------|
| S1 | RPC 다운 | Chain ID 확인 실패/timeout | CRITICAL | Shared infra 문제 → nasun-devnet `/health-check` 실행 |
| S2 | Faucet 다운 | 5xx 또는 timeout | WARNING | Shared infra 문제 → nasun-devnet `/health-check 1` 실행 |
| S3 | DNS 해석 실패 | `getent hosts` 응답 없음 | CRITICAL | Route53 또는 DNS 레지스트라 확인 |

---

### 7단계: Summary Report

모든 데이터를 수집한 뒤 아래 형식으로 마크다운 테이블을 출력합니다.

```
## Nasun Production Health Report
> Checked at: {YYYY-MM-DD HH:MM:SS KST}

### 1. Frontend & CDN

| Item | Status | Latency | Notes |
|------|--------|---------|-------|
| nasun.io (CloudFront) | OK/WARN/CRIT | 0.2s | x-cache: Hit, POP: NRT52-C1 |
| staging.nasun.io | OK/WARN | 0.5s | HTTP 200 |
| explorer.nasun.io (CloudFront) | OK/WARN/CRIT | 0.3s | x-cache: Hit, POP: NRT52-C1 |
| analytics.nasun.io (Umami) | OK/WARN | 0.4s | HTTP 200 |
| pado.finance (CloudFront) | OK/WARN/CRIT | 0.2s | x-cache: Hit, POP: ICN57-P4 |
| staging.pado.finance | OK/WARN | 0.1s | HTTP 200 |
| Origin direct (43.200.67.52) | OK/WARN/CRIT | 0.1s | HTTP 200 |

### 2. SSL Certificates

| Domain | Status | Expires | Days Left |
|--------|--------|---------|-----------|
| nasun.io | OK | 2026-08-15 | 163 |
| staging.nasun.io | OK | 2026-08-15 | 163 |
| explorer.nasun.io | OK | 2026-08-15 | 163 |
| rpc.devnet.nasun.io | OK | 2026-07-01 | 118 |
| faucet.devnet.nasun.io | OK | 2026-07-01 | 118 |
| analytics.nasun.io | OK | 2026-08-15 | 163 |
| pado.finance | OK | 2026-08-15 | 163 |
| staging.pado.finance | OK | 2026-08-15 | 163 |

### 3. DNS Resolution

| Domain | Status | Resolves To |
|--------|--------|-------------|
| nasun.io | OK | d1b7p63gzchrkh.cloudfront.net |
| explorer.nasun.io | OK | d3950nhuogw1zy.cloudfront.net |
| rpc.devnet.nasun.io | OK | 54.180.61.196 |
| analytics.nasun.io | OK | 15.165.19.180 |
| pado.finance | OK | CloudFront (2600:9000:...) |
| staging.pado.finance | OK | 15.165.19.180 |

### 4. Shared Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| RPC (rpc.devnet.nasun.io) | OK/CRIT | Chain ID: 272218f1, checkpoint: 12345678 |
| Faucet (faucet.devnet.nasun.io) | OK/WARN | HTTP 405 |
| zkLogin Prover | OK/WARN | Responding |

### 5. Lambda APIs (nasun-website) — 19 endpoints

| API | Status | Latency | HTTP |
|-----|--------|---------|------|
| Price API | OK | 0.2s | 200 |
| Backup Price API | OK | 0.1s | 403 |
| Random Image | OK | 0.3s | 403 |
| User Profile | OK | 0.2s | 403 |
| User Count | OK | 0.1s | 200 |
| Follower Count | OK | 0.3s | 200 |
| Wallet API | OK | 0.2s | 403 |
| Link Account | OK | 0.2s | 403 |
| Deactivate User | OK | 0.2s | 403 |
| AWS Credentials | OK | 0.1s | 403 |
| Twitter Auth | OK | 0.3s | 405 |
| MetaMask Auth | OK | 0.2s | 405 |
| zkLogin Salt | OK | 0.2s | 405 |
| Whitelist Join | OK | 0.2s | 403 |
| Whitelist Check | OK | 0.1s | 200 |
| Governance | OK | 0.3s | 403 |
| Leaderboard V3 | OK | 0.2s | 403 |
| Battalion NFT | OK | 0.2s | 403 |
| Admin API | OK | 0.2s | 403 |

### 6. EC2 Instances

| Instance | Nginx | Disk | Memory | Swap | Load | Notes |
|----------|-------|------|--------|------|------|-------|
| Prod (43.200.67.52) | active | 45% | 1.2G/8G | 0% | 0.05 | index.html OK, 42 assets |
| Staging (15.165.19.180) | active | 38% | 0.8G/4G | 0% | 0.02 | Umami: running |
| Node-3 (54.180.61.196) | active | 62% | 18G/32G | 5% | 0.8 | explorer-api: online |

### 7. Explorer API

| Item | Status | Notes |
|------|--------|-------|
| Health endpoint | OK/CRIT | status: ok |
| PM2 process | online/stopped | restarts: 2, mem: 120MB, cpu: 0.5% |
| Indexer lag | OK/WARN/CRIT | lag: 15 checkpoints |
| Chain reset | No/Yes | chainResetDetected: false |
| network-summary | OK/CRIT | totalTx: 1234567 |
| API response time | OK/WARN | health: 0.05s, stats: 0.12s |

### 8. Unified Chat Server (nasun-chat-server, nasun/pado 공용)

| Item | Status | Notes |
|------|--------|-------|
| nasun.io /chat/health | OK/CRIT | HTTP 200 |
| nasun.io /chat/api/leaderboard | OK/CRIT | HTTP 200 |
| staging.nasun.io /chat/health | OK (502 정상) | 의도적 비활성화 |
| PM2 nasun-chat-server (prod) | online/stopped | restarts: 17, mem: 199MB, port 3101 |
| PM2 nasun-chat-server (staging) | OK (stopped 정상) | 의도적 비활성화 |
| PM2 pado-chat-server (legacy) | N/A | **레거시** (stopped여도 무시. 정리 대상) |
| PM2 lp-bot-nbtc (prod) | online/stopped | restarts: 0, mem: 50MB |
| PM2 lp-bot-neth (prod) | online/stopped | restarts: 0, mem: 50MB |
| PM2 lp-bot-nsol (prod) | online/stopped | restarts: 0, mem: 50MB |
| PM2 price-updater (prod) | online/stopped | restarts: 0, mem: 50MB |
| PM2 tpsl-keeper (prod) | online/waiting | restarts: 0, mem: 55MB, port 4001 |
| PM2 balance-watchdog (prod) | online/stopped | restarts: 0, mem: 50MB |
| PM2 lottery-keeper (prod) | online/stopped | restarts: 0, mem: 50MB |

### 9. Pado Bot Wallet Gas (Watchdog Log)

`/home/ec2-user/pado-bots/logs/balance-watchdog-out.log` 최근 30줄 기준:

| Market | Gas Status | NASUN Gas | Token Status | Notes |
|--------|-----------|-----------|--------------|-------|
| NBTC | OK/WARN/CRIT | 5,014 NASUN | OK / LOW | OK: 정상, LOW: 보충 중 |
| NETH | OK/WARN/CRIT | 4,999 NASUN | OK / LOW | |
| NSOL | OK/WARN/CRIT | 5,007 NASUN | OK / LOW | |

Threshold: >= 5,000 OK (watchdog 미발동) / 1,500~4,999 WARNING (faucet 자동보충 중) / < 1,500 CRITICAL
Emergency refill: `ssh ec2-user@43.200.67.52 "cd /home/ec2-user/pado-bots && source .env && npx tsx scripts/prefund-bot.ts"`

### 10. Daily Local Backups

| Backup | Status | File | Size | Age |
|--------|--------|------|------|-----|
| ZkLogin Users | OK/WARN/CRIT | ZkLoginUsers-20260408.json.gz | 1.7M | 0d |
| User Profiles | OK/WARN/CRIT | UserProfiles-20260408.json.gz | 9.7M | 0d |
| User Wallets | OK/WARN/CRIT | UserWallets-20260408.json.gz | 6.1M | 0d |
| ZkLogin Salts | OK/WARN/CRIT | zklogin-salts-20260408.json.gz | 781K | 0d |
| Leaderboard V3 Snapshots | OK/WARN/CRIT | leaderboard-v3-snapshots-20260408.json.gz | 3.2M | 0d |

### 10. AWS Services

| Service | Status | Details |
|---------|--------|---------|
| CloudWatch Alarms | OK/ALARM | No alarms in ALARM state |
| EventBridge Rules | OK/WARN | 4/4 rules ENABLED |
| DynamoDB Tables | OK/CRIT | 12/12 tables ACTIVE |
| CloudFront Distributions | OK/CRIT | 3/3 Deployed & Enabled |
| Secrets Manager | OK/WARN/CRIT | 5/5 secrets accessible |
| Lambda Errors (1h) | OK/WARN/CRIT | 0 errors across 8 functions |

### 11. Detected Issues

(장애 패턴 감지 시 각 패턴별로 출력)
#### [CRITICAL] W1: Prod EC2 Nginx Down
- **현재 상태**: nginx is inactive
- **영향**: nasun.io origin 접근 불가. CloudFront가 stale 캐시 또는 5xx 서빙
- **조치**: `ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 "sudo systemctl restart nginx"`

(전체 정상 시)
All systems operational. No issues detected.
```

---

## Threshold 표

| 메트릭 | 정상 | WARNING | CRITICAL |
|--------|------|---------|----------|
| 디스크 (prod EC2) | < 70% | 80%+ | 90%+ |
| 디스크 (staging EC2) | < 70% | 80%+ | 90%+ |
| 디스크 (node-3) | < 70% | 80%+ | 90%+ |
| 스왑 | < 50% | 70%+ | 90%+ |
| CPU load (prod, 2 vCPU) | < 1.0 | 2.0+ | 4.0+ |
| PM2 restart 횟수 | < 5 | 10+ | 50+ |
| PM2 메모리 (explorer-api) | < 200MB | 500MB+ | 1GB+ |
| 인덱서 lag | < 100 | 100-500 | 500+ |
| CloudFront 응답 | Hit/Miss | — | Error |
| Lambda 응답시간 | < 3s | 5s+ | timeout (10s) |
| SSL 인증서 잔여일 | > 30일 | 7-30일 | < 7일 / 만료 |
| Lambda 에러 (1시간) | 0 | 1-5 | 5+ |
| nginx 5xx 비율 | < 1% | 5%+ | 10%+ |
| Explorer API 응답시간 | < 0.5s | 1s+ | 5s+ |
| PM2 restart (nasun-chat-server) | < 5 | 10+ | 50+ |
| PM2 메모리 (nasun-chat-server) | < 200MB | 350MB+ | 500MB+ (auto-restart) |
| PM2 메모리 (balance-watchdog) | < 100MB | 150MB+ | 200MB+ (auto-restart) |
| PM2 메모리 (tpsl-keeper) | < 150MB | 200MB+ | 300MB+ (auto-restart) |
| PM2 메모리 (lp-bot-*) | < 200MB | 300MB+ | 500MB+ (auto-restart) |
| LP Bot 지갑 가스 (NASUN) | >= 5,000 | 1,500~4,999 (faucet 자동보충 중) | < 1,500 |

---

## 주의사항

- **Read-only**: 헬스 체크 중 절대 서비스 재시작, 설정 변경, 파일 수정 금지. 조치는 제안만 하고 사용자 승인 후 실행
- **SSH 타임아웃**: 10초 (`-o ConnectTimeout=10`). 노드 unreachable 시 hang 방지
- **curl 타임아웃**: 10초 (외부), 5초 (localhost)
- **로그 제한**: journalctl은 최근 10분, 최대 20줄로 제한 (과도한 출력 방지)
- **민감 정보**: SSH 키 경로는 명령 내에서만 사용, 출력에 노출 금지. Secrets Manager 값은 절대 읽지 않고 메타데이터만 확인
- **Lambda 안전**: GET만 사용 (POST/PUT으로 부작용 방지)
- **DynamoDB 안전**: describe-table로 메타데이터만 확인. 데이터는 절대 읽지 않음
- **Shared infra 위임**: RPC/Faucet/블록체인 노드 문제는 nasun-devnet의 `/health-check` 스킬 실행 안내
- **AWS CLI**: `--profile nasun-prod` 사용 (프로덕션 계정 466841130170). dev 계정은 점검 대상 아님
- **devnet 중복 방지**: fullnode RSS, indexer OOM, .chk 파일, DB size, cgroup, consensus 등은 devnet health-check가 담당. 여기서는 explorer-api PM2와 nginx만 점검

## Anti-patterns

| 금지 | 이유 | 대안 |
|------|------|------|
| 헬스체크 중 서비스 재시작 | Read-only 원칙 | 조치 명령어를 출력하고 사용자 승인 대기 |
| devnet 노드 심층 점검 중복 | devnet health-check가 이미 수행 | explorer-api PM2 + nginx만 확인 |
| node-3:3200 직접 curl | 방화벽 제한 | SSH 경유 localhost curl |
| Lambda에 POST/PUT 전송 | 부작용 가능 | GET만 사용 |
| SSH 키/시크릿 값 출력 | 보안 | 키 경로만 내부 사용, 출력하지 않음 |
| DynamoDB 데이터 읽기 | 불필요한 접근 | describe-table로 메타데이터만 확인 |
| `pm2 env` / `pm2 prettylist` / `printenv` 실행 | 앱 시크릿 노출 (DB 비밀번호, API 키, 개인키) | `pm2 jlist` + Python 파서로 status/restarts/memory만 추출 |
| CloudWatch Logs `events[].message` 조회 | 인증 함수 에러 로그에 OAuth 토큰, JWT, salt 포함 가능 | `--query 'length(events)'`로 count만 추출 |
| 백업 파일 내용 출력 | ZkLoginUsers 테이블 백업에 지갑 주소, salt 등 PII 포함 | 크기/레코드 수만 확인, 내용 출력 금지 |
| `rsync --delete` 무확인 실행 | 런타임 생성 파일(SQLite DB, 로그) 삭제 위험 | 사용자 승인 후 실행. 런타임 파일 존재 시 `--delete` 없이 먼저 시도 |
| 시간 예측 | CLAUDE.md 원칙 | 시간 예측하지 않음 |

## Pado 인프라 참조

| 항목 | Prod | Staging |
|------|------|---------|
| Frontend URL | pado.finance (CloudFront -> EC2 43.200.67.52) | staging.pado.finance (EC2 15.165.19.180 직접) |
| Static files | `/var/www/pado.finance/` | `/var/www/staging.pado.finance/` |
| Chat server (**공용**) | `/home/ec2-user/nasun-chat-server/` (PM2: nasun-chat-server, port **3101**) | `/home/ubuntu/nasun-chat-server/` (PM2: nasun-chat-server, port 3101) |
| Chat API | `https://nasun.io/chat/*` (pado frontend가 호출) | `https://staging.nasun.io/chat/*` |
| WebSocket | `wss://nasun.io/ws/chat` | `wss://staging.nasun.io/ws/chat` |
| TP/SL Keeper | port 4001 (`/api/tpsl/*`) | port 4001 (`/api/tpsl/*`) |
| nginx config (chat 라우팅) | `/etc/nginx/conf.d/nasun.conf` | `/etc/nginx/sites-enabled/staging.nasun.io` (또는 nasun 관련 conf) |
| **레거시 (정리 대상)** | `pado-chat-server` PM2, `/var/www/pado-chat-server/`, `pado.finance.conf`의 `location /chat/` / `location /ws` 블록 | 동일 |

## 확장성

추후 gensol/baram 런칭 시:
- 1단계에 해당 앱의 프론트엔드 URL 추가
- 2단계에 해당 EC2/PM2 프로세스 추가
- 6단계에 앱별 failure pattern 추가 (GenSol: G1-Gn, Baram: BR1-BRn)
  - Note: B prefix는 Backup Patterns (B1-B3)이 사용 중이므로 Baram은 BR prefix 사용
- Stage 구조 자체는 변경 불필요
