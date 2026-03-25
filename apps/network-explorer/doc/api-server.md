# Explorer API Server (인덱서 기반)

Explorer API는 sui-indexer가 인덱싱한 PostgreSQL 데이터를 REST API로 제공합니다.
이 인프라는 Explorer 전용이 아닌 **Nasun 프로젝트 공유 인프라**입니다 (상세: 루트 CLAUDE.md 참조).

## API 서버 구조

```
api-server/
├── src/
│   ├── index.ts       # Hono app + CORS + graceful shutdown
│   ├── db.ts          # postgres.js 커넥션 (DATABASE_URL 환경변수)
│   ├── cache.ts       # In-memory TTL 캐시 (thundering herd 방지)
│   └── routes/
│       ├── health.ts  # GET /api/v1/health
│       └── stats.ts   # GET /api/v1/stats/* (top-accounts, daily-transactions, etc.)
├── package.json       # @nasun/explorer-api
└── ecosystem.config.cjs  # PM2 config (PORT=3200)
```

## 엔드포인트

| 메서드 | 경로 | 설명 | 캐시 TTL |
|--------|------|------|---------|
| GET | `/api/v1/health` | DB + 체크포인트 상태 | 없음 |
| GET | `/api/v1/stats/top-accounts?limit=50` | 잔액 상위 주소 | 5분 |
| GET | `/api/v1/stats/daily-transactions?range=7d` | 일별 TX 수 | 5분 |
| GET | `/api/v1/stats/active-addresses?range=7d` | 일별 활성 주소 수 | 15분 |
| GET | `/api/v1/stats/network-summary` | 총 TX/주소/패키지/이벤트 | 5분 (fast) / 30분 (addresses) |

- `limit` 파라미터: whitelist `[25, 50, 100, 200]`으로 캐시 키 정규화
- `range` 파라미터: `7d`, `14d`, `30d` 지원

## 배포 (EC2 node-3)

```bash
# 1. API 서버 코드 rsync (node_modules, .env 제외)
rsync -avz --exclude node_modules --exclude .env \
  apps/network-explorer/api-server/ \
  -e "ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem" \
  ubuntu@54.180.61.196:~/explorer-api/

# 2. SSH 접속 후 의존성 설치 + PM2 재시작
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
cd ~/explorer-api && npm install
set -a && source .env && set +a
pm2 restart explorer-api --update-env

# 3. 헬스체크 확인
curl http://localhost:3200/api/v1/health
```

## 환경 변수 (node-3 .env)

```env
DATABASE_URL=postgresql://sui_indexer:<password>@localhost:5432/sui_indexer
```

> **보안**: `.env` 파일은 `chmod 600`, `ecosystem.config.cjs`에는 DB 자격 증명 미포함

## 프론트엔드 클라이언트

`src/lib/explorer-api.ts`에서 API 호출. base URL은 `VITE_EXPLORER_API_URL` 또는 기본값 `/api/v1`.
Production에서는 nginx가 `/api/v1/*`을 node-3:3200으로 프록시하므로 CORS 없음.
