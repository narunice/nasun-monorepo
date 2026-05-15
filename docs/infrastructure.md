# Infrastructure Reference

## Nasun Indexer Infrastructure (공유 인프라)

Nasun Devnet의 블록체인 데이터를 PostgreSQL에 인덱싱하는 공유 인프라입니다.
Explorer, Pado, Baram 등 모든 Nasun 프로젝트에서 활용 가능합니다.

### 아키텍처 (2026-02-21 3-Node 마이그레이션 완료)

```
nasun-node-1 (3.38.127.23)       nasun-node-2 (3.38.76.85)
┌───────────────────────┐        ┌───────────────────────┐
│ Validator #1           │        │ Validator #2           │
│ Faucet (:5003)         │        │ zkLogin Prover         │
│ Nginx                  │        │                        │
└───────────────────────┘        └───────────────────────┘

nasun-node-3 (54.180.61.196)
┌──────────────────────────────┐
│ Fullnode (RPC :9000)          │
│   └─ DB: /home/ubuntu/        │
│      full_node_db/ (214GB)   │
│ sui-indexer (systemd)         │
│   └─ data-ingestion-path     │
│   └─> PostgreSQL 16 (:5432)  │
│ explorer-api (:3200/PM2)     │
│ Nginx (rpc.devnet.nasun.io)  │
└──────────────────────────────┘
     ↑
Production EC2 (43.200.67.52)
  nginx: explorer.nasun.io/api/v1/* → node-3:3200
```

**SSH**: `ubuntu@<IP>` + `/home/naru/.ssh/.awskey/nasun-devnet-key.pem` (모든 노드 공통)

> **Fullnode DB 주의**: `/home/ubuntu/full_node_db/` (214GB)는 node-3 Fullnode의 **유일한 원본 DB**입니다.
> `fullnode.yaml`의 `db-path`가 이 경로를 직접 참조합니다. 백업 없음. 절대 삭제 금지.
> 디렉토리 자체의 mtime은 Feb 21로 보이지만, RocksDB 내부 파일은 실시간 갱신 중입니다.

### 구성 요소

| 구성 요소 | 위치 | 설명 |
|-----------|------|------|
| **Fullnode** | EC2 node-3 (systemd) | Sui Fullnode, RPC + data-ingestion 체크포인트 생성 |
| **sui-indexer** | EC2 node-3 (systemd) | Rust 바이너리, local data-ingestion-path 기반 인덱싱 |
| **PostgreSQL 16** | EC2 node-3 | DB: `sui_indexer`, User: `sui_indexer` |
| **Explorer API** | EC2 node-3 (PM2, port 3200) | Hono REST API, 인덱싱 데이터 + RPC 실시간 조회 |
| **Nginx proxy** | Production EC2 | `/api/v1/*` → node-3:3200 리버스 프록시 |

### API 엔드포인트 (explorer.nasun.io/api/v1/)

| 엔드포인트 | 설명 | 캐시 TTL |
|-----------|------|---------|
| `GET /health` | DB 연결 + 체크포인트 상태 | 없음 |
| `GET /stats/top-accounts?limit=50` | 잔액 상위 주소 (하이브리드: DB 주소발견 + RPC 실시간 잔액) | 60초 |
| `GET /stats/tokens` | 토큰별 홀더 수 + 유통량 | 5분 |
| `GET /stats/daily-transactions?range=7d` | 일별 TX 수 | 5분 |
| `GET /stats/daily-gas?range=7d` | 일별 가스 비용 + 평균 가스/TX | 5분 |
| `GET /stats/active-addresses?range=7d` | 일별 활성 주소 수 | 5분 |
| `GET /stats/network-summary` | 총 TX/주소/패키지/이벤트 수 | 30초 |

### 코드 위치

- **API 서버**: `apps/network-explorer/api-server/` (Hono + postgres.js)
- **RPC 헬퍼**: `apps/network-explorer/api-server/src/rpc.ts` (공유 JSON-RPC 클라이언트 + 주소 발견)
- **프론트엔드 클라이언트**: `apps/network-explorer/src/lib/explorer-api.ts`

### 운영 참고

- **Start checkpoint**: `start-indexer.sh` wrapper script가 DB에서 `MAX(sequence_number)+1`을 동적으로 조회하여 설정. DB 비어있으면 oldest `.chk` 파일 번호 사용. 수동 업데이트 불필요.
- **Validator OOM 보호**: Validator `oom_score_adj=-500`, Indexer `OOMScoreAdjust=500`
- **Security Group**: Port 3200은 Production EC2 IP (43.200.67.52/32)에만 개방
- **PM2 .env**: `DATABASE_URL`, `SUI_RPC_URL`, `GENESIS_ADDRESSES` 포함. `set -a && source .env && set +a` 후 PM2 시작
- **GENESIS_ADDRESSES 환경변수**: faucet/admin 주소를 콤마 구분으로 지정. RPC 주소 발견에 사용 (해당 주소의 트랜잭션에서 수신자 추출)
- **Explorer API .env 위치**: `~/explorer-api/.env` (node-3)

### 인덱서 data-ingestion 구조 및 장애 복구

인덱서는 **local file 기반** (`--data-ingestion-path`)으로 동작:
1. Fullnode가 체크포인트 `.chk` 파일을 `data-ingestion-dir`에 생성
2. 인덱서가 파일을 읽고 PostgreSQL에 인덱싱
3. 인덱서가 처리 완료된 파일을 GC (삭제) — `gc_checkpoint_files: true`

**GC gap 자동 복구 (2026-02-22 적용)**:
- `start-indexer.sh` wrapper script가 systemd 재시작 시 DB에서 resume point 자동 계산
- 인덱서 자체 GC만 동작 (cron 삭제됨). 미처리 파일이 삭제되는 일 없음
- systemd `StartLimitBurst=5` + `RestartSec=30`으로 무한 restart 방지

**DB 리셋이 필요한 경우** (Devnet 리셋 등):
```bash
# 1. 인덱서 중지
sudo systemctl stop sui-indexer

# 2. DB 리셋 (활성 연결 종료 필요)
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sui_indexer';"
sudo -u postgres psql -c "DROP DATABASE sui_indexer;"
sudo -u postgres psql -c "CREATE DATABASE sui_indexer OWNER sui_indexer;"

# 3. 인덱서 재시작 (start-indexer.sh가 oldest .chk 파일에서 자동 시작)
sudo systemctl start sui-indexer
```

**주의**: DB 리셋 후에는 과거 주소 데이터가 유실됨. `GENESIS_ADDRESSES` 기반 RPC 주소 발견으로 보완.

### Devnet 리셋 시 체크리스트

1. 인덱서 중지: `sudo systemctl stop sui-indexer`
2. DB 리셋: `DROP/CREATE DATABASE sui_indexer`
3. 인덱서 재시작: `sudo systemctl start sui-indexer` (`start-indexer.sh`가 자동으로 oldest .chk에서 시작)
4. `packages/devnet-config/devnet-ids.json`의 coin type 주소 업데이트
5. `stats.ts`의 `KNOWN_COIN_TYPES` 동기화 (devnet-ids.json 기준)
6. `GENESIS_ADDRESSES` 환경변수 업데이트 (새 faucet 주소)
7. `nasun_points`: 자동 처리됨 (scanner가 chain hash 변경 감지 후 TRUNCATE + 리셋)

---

## On-Chain Activity Points (nasun_points DB)

node-3에서 별도 PostgreSQL DB로 운영되는 온체인 활동 포인트 시스템입니다.
`sui_indexer` DB와 독립적이며, 데브넷 리셋 시 scanner가 자동으로 데이터를 초기화합니다.

### 구성

| 항목 | 값 |
|------|-----|
| DB 이름 | `nasun_points` |
| DB 유저 | `postgres` (node-3 로컬) |
| 테이블 | `activity_points`, `processing_state` |
| 스키마 | `apps/network-explorer/api-server/src/db/points-schema.sql` |
| Scanner | explorer-api 프로세스 내 setInterval (1시간 간격) |
| PM2 모드 | fork (cluster 아님) |

### API 엔드포인트 (explorer.nasun.io/api/v1/points/)

| 엔드포인트 | 설명 | 캐시 TTL |
|-----------|------|---------|
| `GET /leaderboard?limit=50&offset=0` | identity 기준 포인트 순위 | 5분 |
| `GET /user/:walletAddress` | 지갑별 포인트 + 카테고리 분해 | 5분 |
| `GET /health` | Scanner 상태 (last_tx_sequence, wallet cache 등) | 없음 |

### 사용자 포인트 직접 조회 (admin)

`activity_points` 테이블은 **node-3 (54.180.61.196)의 `nasun_points` PostgreSQL DB**에 있음.
explorer-api node_modules에 pg 패키지 없음 - `sudo -u postgres psql`로 직접 조회.

```bash
# identityId로 all-time 포인트 합산
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
  "sudo -u postgres psql -d nasun_points -c \"
    SELECT SUM(final_points) as total, COUNT(*) as records
    FROM activity_points
    WHERE identity_id = '<identityId>' AND NOT flagged;
  \""

# 카테고리별 분해
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
  "sudo -u postgres psql -d nasun_points -c \"
    SELECT category, SUM(final_points) as pts, COUNT(*) as cnt
    FROM activity_points
    WHERE identity_id = '<identityId>' AND NOT flagged
    GROUP BY category ORDER BY pts DESC;
  \""
```

> identityId는 DynamoDB `UserProfiles` 테이블의 PK. walletAddress로 먼저 identityId를 찾으려면:
> `aws dynamodb scan --table-name UserProfiles --filter-expression "walletAddress = :w" ...`

### 환경변수 (node-3 ~/explorer-api/.env)

| 변수 | 설명 |
|------|------|
| `POINTS_DATABASE_URL` | `postgres://postgres@localhost:5432/nasun_points` |
| `WALLET_MAPPINGS_URL` | nasun-website admin API 내부 엔드포인트 URL |
| `WALLET_MAPPINGS_API_KEY` | 내부 API 인증 키 |

### 백업

```bash
# 일일 백업 (cron, 03:00 KST)
pg_dump -U postgres nasun_points | gzip > /backup/nasun_points-$(date +\%Y\%m\%d).sql.gz

# 복원
gunzip -c /backup/nasun_points-YYYYMMDD.sql.gz | psql -U postgres nasun_points
```

### 데브넷 리셋 시

Scanner가 chain genesis hash 변경을 자동 감지하여 `activity_points` TRUNCATE + `processing_state` 리셋을 수행합니다. 수동 작업 불필요.

---

## EC2 서버 접속

### Production EC2 (nasun-prod-web, 43.200.67.52)

- **AWS 계정**: nasun-prod (466841130170)
- **인스턴스 ID**: i-01b39553e9ef34b04
- **AMI**: Amazon Linux 2023 → 사용자명: `ec2-user`
- **AZ**: ap-northeast-2a

**SSH 접속 (로컬 키 사용)**:
```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52
```
> `~/.ssh/.awskey/nasun-prod-key` (ED25519, 2026-02-26 등록)

**SSH 접속 (EC2 Instance Connect — 키 없을 때 fallback)**:
```bash
# 1회용 임시 키 생성 (60초 유효)
ssh-keygen -t rsa -b 2048 -f /tmp/ec2_temp_key -N ''
aws ec2-instance-connect send-ssh-public-key \
  --profile nasun-prod \
  --instance-id i-01b39553e9ef34b04 \
  --availability-zone ap-northeast-2a \
  --instance-os-user ec2-user \
  --ssh-public-key file:///tmp/ec2_temp_key.pub \
  --region ap-northeast-2
ssh -i /tmp/ec2_temp_key ec2-user@43.200.67.52
```

### Staging EC2 (15.165.19.180)

- **AWS 계정**: default (135808943968)
- **SSH**: `ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180`

### nasun-website 프론트엔드 배포

프론트엔드는 CDK와 무관하게 로컬 빌드 → rsync 방식으로 배포합니다.

```bash
# Dev 빌드 → Staging (staging.nasun.io)
pnpm --filter @nasun/nasun-website exec -- vite build --mode development
rsync -avz --delete \
  -e "ssh -i ~/.ssh/.awskey/naru_seoul.pem" \
  apps/nasun-website/frontend/dist/ \
  ubuntu@15.165.19.180:/var/www/staging.nasun.io/

# Prod 빌드 → Production (nasun.io)
pnpm --filter @nasun/nasun-website exec -- vite build
rsync -avz --delete \
  -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" \
  apps/nasun-website/frontend/dist/ \
  ec2-user@43.200.67.52:/var/www/nasun/dist/
```

---

## CloudFront CDN (nasun.io)

nasun.io는 CloudFront를 통해 글로벌 CDN으로 서빙됩니다.

| 항목 | 값 |
|------|-----|
| Distribution ID | `E362CCGDH7WA7C` |
| Domain | `d1b7p63gzchrkh.cloudfront.net` |
| Origin | `ec2-43-200-67-52.ap-northeast-2.compute.amazonaws.com` (HTTP, port 80) |
| ACM Certificate | `arn:aws:acm:us-east-1:466841130170:certificate/ad93e5d8-9fee-4696-bcf6-423c93610552` |
| Origin 인증 | Custom header `X-CloudFront-Secret` (nginx에서 검증) |
| WAF WebACL | `nasun-cloudfront-waf` (us-east-1) |

### Cache behaviors (Path → origin)

CloudFront도 WAF와 마찬가지로 **CDK가 아닌 AWS CLI로 수동 관리**됩니다. precedence는 위에서 아래 순서.

| PathPattern | Target origin | Methods | 용도 |
|-------------|---------------|---------|------|
| `/api/nasun-ai/*` | `nasun-ec2-origin` | All (incl. POST/OPTIONS) | Nasun AI canonical alias (S5+, chat-server `/api/nasun-ai/*` 라우트) |
| `/api/baram/*` | `nasun-ec2-origin` | All | Legacy alias (chat-server에서 dual-mount, 향후 deprecate 예정) |
| `/ws/chat*` | `nasun-ec2-origin` | All | nasun-chat-server WebSocket |
| `/chat/*` | `nasun-ec2-origin` | All | chat-server REST API (leaderboard/feed) |
| `/locales/*` | `nasun-ec2-origin` | GET/HEAD | i18n static |
| `/assets/*` | `nasun-ec2-origin` | GET/HEAD | Vite build artifacts |
| `/videos/*`, `/images/*` | `nasun-ec2-origin` | GET/HEAD | static media |
| Default | `nasun-ec2-origin` | All | SPA fallback (`index.html`) |

**새 백엔드 path 추가 시 체크리스트**:
1. chat-server 코드에 라우트 등록 (`apps/nasun-website/chat-server/src/server.ts`)
2. nginx `location` 블록 추가 ([infra/nginx/snapshots/conf.d/nasun.conf](../infra/nginx/snapshots/conf.d/nasun.conf))
3. CloudFront cache behavior 추가 (AWS CLI: `update-distribution` + `/api/<path>/*` invalidation)
4. chat-server `ALLOWED_ORIGINS` ([apps/nasun-website/chat-server/ecosystem.config.cjs](../apps/nasun-website/chat-server/ecosystem.config.cjs))에 cross-origin 호출자 추가

위 4개를 일관되게 적용하지 않으면 staging origin이 SPA fallback에 빠지거나 CORS preflight가 실패합니다 (2026-05-14 staging.nasun.io → `/api/nasun-ai/*` 사고).

### AWS WAF (DDoS Protection)

nasun.io와 explorer.nasun.io 모두 동일한 WAF WebACL로 보호됩니다.

| 항목 | 값 |
|------|-----|
| WebACL Name | `nasun-cloudfront-waf` |
| WebACL ID | `20dcb78e-2920-48c4-beb8-2cbf0d3d36e5` |
| WebACL ARN | `arn:aws:wafv2:us-east-1:466841130170:global/webacl/nasun-cloudfront-waf/20dcb78e-2920-48c4-beb8-2cbf0d3d36e5` |
| Scope | CLOUDFRONT (us-east-1) |
| Rules | RateLimit2000Per5Min (IP당 2000 req/5min, Block) |
| Logging | S3: `aws-waf-logs-nasun-prod` (Block만 로깅, 30일 보관) |
| Monitoring | CloudWatch Alarms: `nasun-waf-blocked-requests-high`, `nasun-waf-allowed-requests-low` |
| SNS Topic | `arn:aws:sns:us-east-1:466841130170:nasun-waf-alerts` (admin@nasun.io) |
| 연결 분포 | `E362CCGDH7WA7C` (nasun.io), `E31QOCW4WNY9FL` (explorer.nasun.io) |
| 월 비용 | ~$6 (WebACL $5 + Rule $1 + 요청 $0.60/M) |

**관리**: WAF는 CDK가 아닌 AWS CLI로 수동 관리 (CloudFront와 동일).

**긴급 대응 (정상 트래픽 차단 시)**:
```bash
# Option 1: Rate limit을 Count 모드로 전환 (로깅만, 차단 안 함)
aws wafv2 get-web-acl --name nasun-cloudfront-waf --scope CLOUDFRONT \
  --id 20dcb78e-2920-48c4-beb8-2cbf0d3d36e5 --region us-east-1 --profile nasun-prod
# 출력의 LockToken을 사용하여 Rule의 Action을 {"Count":{}}로 변경 후 update-web-acl

# Option 2: CloudFront에서 WAF 분리 (Console)
# CloudFront > Distribution > General > Edit > Web ACL을 None으로 변경
```

**로그 확인**:
```bash
# 최근 차단된 요청 확인
aws s3 ls s3://aws-waf-logs-nasun-prod/ --profile nasun-prod --region us-east-1
# 파일 다운로드 후 JSON 분석
```

### Nginx Rate Limiting (Origin 보호)

EC2 nginx에 CloudFront 우회 공격 대비 rate limiting이 적용되어 있습니다.

| 항목 | 값 |
|------|-----|
| 요청 제한 | IP당 30 req/s, burst 50 (429 반환) |
| 연결 제한 | IP당 동시 20개 |
| Real IP 추출 | CloudFront IP ranges + X-Forwarded-For |
| IP 범위 위치 | `/etc/nginx/snippets/cloudfront-realip.conf` |
| 자동 갱신 | systemd timer (매주 일요일 18:00 UTC) |

### EC2 Security Group (nasun-prod-web-sg)

| Port | Source | 용도 |
|------|--------|------|
| 80 | CloudFront managed prefix list (`pl-22a6434b`) | CloudFront origin |
| 443 | 0.0.0.0/0 | Direct HTTPS (긴급 접속용) |
| 22 | 특정 IP만 | SSH |

### 캐시 정책

| 경로 | TTL | 설명 |
|------|-----|------|
| `/assets/*` | 10년 (immutable) | 해시 파일명, 장기 캐시 |
| `/videos/*` | 30일 (immutable) | 비디오 파일 |
| `/images/*` | 30일 (immutable) | 포스터 이미지 |
| `index.html` (default) | 1시간 | SPA 엔트리, 배포 시 갱신 필요 |
| `/locales/*` | no-cache | 다국어 JSON, 항상 origin 히트 |

### 배포 후 캐시 무효화

```bash
# 긴급 배포 후 index.html 캐시 즉시 갱신
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C \
  --paths "/index.html" "/"

# 전체 캐시 무효화 (비용: 1,000건까지 무료/월)
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E362CCGDH7WA7C \
  --paths "/*"
```

### DNS 전환 (런칭 시)

Porkbun에서 nasun.io DNS 레코드를 변경:

```
# 변경 전 (현재)
nasun.io    A    43.200.67.52

# 변경 후 (CloudFront)
nasun.io    CNAME    d1b7p63gzchrkh.cloudfront.net
www.nasun.io    CNAME    d1b7p63gzchrkh.cloudfront.net
```

> **주의**: CNAME은 zone apex (nasun.io)에 설정 불가한 DNS 제공자가 있음.
> Porkbun은 ALIAS/CNAME flattening을 지원하므로 가능.
> 만약 안되면 A record로 CloudFront IP를 설정하되, IP가 변경될 수 있으므로 비추.

### 런칭 체크리스트

1. [ ] nasun.conf에서 Basic Auth 제거 (2줄 주석 처리)
2. [ ] `sudo nginx -t && sudo systemctl reload nginx`
3. [ ] Porkbun에서 nasun.io A record → CNAME `d1b7p63gzchrkh.cloudfront.net` 변경
4. [ ] Porkbun에서 www.nasun.io CNAME → `d1b7p63gzchrkh.cloudfront.net` 추가/변경
5. [ ] `curl -sI https://nasun.io` 로 `x-cache` 헤더 확인
6. [ ] 글로벌 테스트: https://www.webpagetest.org/ 에서 US/EU 지역 테스트

---

## CloudFront CDN (explorer.nasun.io)

network-explorer는 CloudFront를 통해 글로벌 CDN으로 서빙됩니다.

| 항목 | 값 |
|------|-----|
| Distribution ID | `E31QOCW4WNY9FL` |
| Domain | `d3950nhuogw1zy.cloudfront.net` |
| Origin | `ec2-43-200-67-52.ap-northeast-2.compute.amazonaws.com` (HTTP, port 80) |
| ACM Certificate | `arn:aws:acm:us-east-1:466841130170:certificate/885a2c6f-04b4-4469-8257-8f4bc9fa4bf9` (`*.nasun.io` 와일드카드) |

### 캐시 정책

| 경로 | 정책 | 설명 |
|------|------|------|
| `/devnet/assets/*` | CachingOptimized | 해시 파일명, 장기 캐시 |
| `/api/*` | CachingDisabled | API는 origin 직통 (캐시 없음) |
| 기본 (나머지) | CachingOptimized | index.html 등 정적 파일 |

### 배포 후 캐시 무효화

```bash
aws cloudfront create-invalidation --profile nasun-prod \
  --distribution-id E31QOCW4WNY9FL \
  --paths "/devnet/index.html" "/devnet/"
```

### DNS 설정

```
explorer.nasun.io    CNAME    d3950nhuogw1zy.cloudfront.net
```

---

## 배포 방식

| 앱               | 배포 방식    | 트리거    | 대상 URL                         |
| ---------------- | ------------ | --------- | -------------------------------- |
| baram            | EC2 스크립트 | 수동 실행 | https://baram.nasun.io           |
| network-explorer | 로컬 빌드 + rsync + CF invalidation | 수동 실행 | https://explorer.nasun.io/devnet (CloudFront CDN) |
| explorer-api     | EC2 + PM2    | `./scripts/deploy-explorer-api.sh` | https://explorer.nasun.io/api/v1 (node-3) |
| nasun-website    | 로컬 빌드 + rsync + CF invalidation | 수동 실행 | https://nasun.io (prod, CloudFront CDN), https://staging.nasun.io (dev) |
| gensol-website   | EC2 스크립트 | 수동 실행 | https://gensol.nasun.io          |
| pado             | EC2 스크립트 | 수동 실행 | https://pado.finance             |
| pado LP Bot      | EC2 + PM2    | 수동 실행 | staging/prod EC2 인스턴스        |

---

## 개발 환경 팁 (CLI)

- **터미널 페이징 비활성화**: AWS CLI와 Git의 페이저를 비활성화하여 `(END)` 상태 방지.
  - AWS CLI: `aws configure set cli_pager ""`
  - Git: `git config core.pager "cat"`
- **포트 충돌**: OAuth 2.0 인증(`setup-oauth2-auto.ts`) 시 5174 포트가 필요하므로, `nasun-website` 개발 서버를 일시 정지해야 할 수 있습니다.
