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

---

## 배포 방식

| 앱               | 배포 방식    | 트리거    | 대상 URL                         |
| ---------------- | ------------ | --------- | -------------------------------- |
| baram            | EC2 스크립트 | 수동 실행 | https://baram.nasun.io           |
| network-explorer | EC2 스크립트 | 수동 실행 | https://explorer.nasun.io/devnet |
| explorer-api     | EC2 + PM2    | 수동 rsync | https://explorer.nasun.io/api/v1 (node-3) |
| nasun-website    | EC2 스크립트 | 수동 실행 | https://nasun.io                 |
| gensol-website   | EC2 스크립트 | 수동 실행 | https://gensol.nasun.io          |
| pado             | EC2 스크립트 | 수동 실행 | https://pado.finance             |
| pado LP Bot      | EC2 + PM2    | 수동 실행 | staging/prod EC2 인스턴스        |

---

## 개발 환경 팁 (CLI)

- **터미널 페이징 비활성화**: AWS CLI와 Git의 페이저를 비활성화하여 `(END)` 상태 방지.
  - AWS CLI: `aws configure set cli_pager ""`
  - Git: `git config core.pager "cat"`
- **포트 충돌**: OAuth 2.0 인증(`setup-oauth2-auto.ts`) 시 5174 포트가 필요하므로, `nasun-website` 개발 서버를 일시 정지해야 할 수 있습니다.
