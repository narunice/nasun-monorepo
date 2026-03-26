# Handoff: On-Chain Activity Points System

**생성**: 2026-03-25 15:15
**브랜치**: `feat/onchain-activity-points-impl`
**이전 핸드오프**: `.claude/handoffs/2026-03-25-onchain-activity-points.md` (설계 단계)
**플랜 파일**: `/home/naru/.claude/plans/soft-wandering-fox.md` (v3 Final)

## 현재 상태 요약

(A) Core + (B) Integration 구현 완료. node-3에 배포되어 라이브 운영 중. 소급 스캔 완료 (154건 기록, 141명 사용자). 7개 E2E 테스트 전체 PASS. (C) Ops (백업 cron, 인프라 문서, 지갑 한도)는 미완료.

## 완료된 작업

- [x] DB 스키마 설계 + node-3에 `nasun_points` DB 생성
- [x] Points config (BASE_POINTS, event-to-activity 매핑, scoring 함수)
- [x] Points scanner (chain reset 감지, batch 처리, wallet cache, setInterval)
- [x] Points API routes (leaderboard, user, health) + rate limiting
- [x] explorer-api index.ts 통합 (routes, scanner, shutdown handler)
- [x] pointsDb 커넥션 풀 (db.ts)
- [x] PM2 fork mode 전환 + ecosystem.config.cjs 업데이트
- [x] nasun-website Lambda `/internal/wallet-mappings` 엔드포인트 (API key 인증)
- [x] CDK AdminStack 배포 (dev + prod) - UserWallets 읽기 권한, INTERNAL_API_KEY
- [x] node-3 환경변수 설정 (WALLET_MAPPINGS_URL, WALLET_MAPPINGS_API_KEY)
- [x] 전체 소급 스캔 (genesis부터 현재까지)
- [x] E2E 테스트 7/7 PASS

## 미완료 작업

- [ ] **(C-1)** pg_dump 백업 cron (일 1회, 03:00 KST)
- [ ] **(C-2)** `docs/infrastructure.md` 업데이트 (nasun_points DB, 백업, 엔드포인트 문서)
- [ ] **(C-3)** 지갑 등록 한도 (계정당 max 10) - nasun-website wallet-api Lambda에 검증 추가
- [ ] **(C-4)** tx_count 정확도 개선 - 현재 insert 시도 수를 세지만 실제 삽입 수와 차이 있음 (ON CONFLICT 시)
- [ ] Git 커밋 + 코드 리뷰 + push

## 중요 컨텍스트

### 구현 중 발견/수정한 버그 (총 5건)

| # | 문제 | 수정 |
|---|------|------|
| 1 | `checkpoints.digest` 컬럼 미존재 | `checkpoint_digest`로 수정 |
| 2 | Genesis checkpoint(seq=0) 인덱서에 없음 | 가장 오래된 checkpoint 사용 |
| 3 | Leaderboard TEXT 정렬 (5 > 21 사전순) | `ORDER BY SUM(final_points) DESC` |
| 4 | User 엔드포인트 GROUP BY wallet+identity 불일치 | wallet만으로 GROUP BY 통일 |
| 5 | Connection pool 합산(85) > max_connections(20) | 풀 크기 10+5=15로 축소 |

### 이벤트 매핑 현황

실제 인덱서 데이터 검증 결과, 현재 존재하는 이벤트:
- DeepBook: `order::OrderCanceled`, `order_info::OrderPlaced`, `order_info::OrderInfo`(skip)
- System: `validator::StakingRequestEvent`, `validator::UnstakingRequestEvent`
- 기타 모듈(prediction, lottery, governance, baram, lending, perp): 아직 온체인 활동 없음. 매핑은 설정 완료, 활동 발생 시 자동 적용됨.

### 소급 스캔 결과

- 총 154건, 141명 고유 사용자, 1,555 pts
- 카테고리: staking::delegate only (DEX 이벤트는 봇 주소가 대부분)
- Genesis Pass 배수 적용: 3건 (2명, x1.5 = 15pts)

### 주의사항

- PM2는 **fork mode**로 실행해야 함 (cluster mode에서 tsx 로그 안 나옴)
- `max_connections=20`으로 pool 크기에 주의 (현재 10+5=15)
- 첫 소급 스캔은 안티봇 규칙 없이 실행됨 (Phase 1 의도된 설계)
- `tx_count`는 insert 시도 수이지 실제 성공 수가 아님

### 인증 / 시크릿

- `INTERNAL_API_KEY`: dev + prod `.env`/`.env.production`에 동일 키 설정됨
- node-3 `.env`에 `WALLET_MAPPINGS_URL` + `WALLET_MAPPINGS_API_KEY` 설정됨
- API key는 CDK Lambda 환경변수 `INTERNAL_API_KEY`로 전달

## 파일 위치

### 새로 생성한 파일

| 용도 | 경로 |
|------|------|
| DB 스키마 | `apps/network-explorer/api-server/src/db/points-schema.sql` |
| Points config | `apps/network-explorer/api-server/src/config/points.ts` |
| Scanner | `apps/network-explorer/api-server/src/scanner/points-scanner.ts` |
| API routes | `apps/network-explorer/api-server/src/routes/points.ts` |

### 수정한 파일

| 용도 | 경로 |
|------|------|
| DB 커넥션 | `apps/network-explorer/api-server/src/db.ts` |
| API 진입점 | `apps/network-explorer/api-server/src/index.ts` |
| PM2 설정 | `apps/network-explorer/api-server/ecosystem.config.cjs` |
| Wallet mappings handler | `apps/nasun-website/cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` |
| CDK AdminStack | `apps/nasun-website/cdk/lib/admin-stack.ts` |
| CDK .env (dev) | `apps/nasun-website/cdk/.env` |
| CDK .env (prod) | `apps/nasun-website/cdk/.env.production` |

### 라이브 엔드포인트

| 엔드포인트 | URL |
|-----------|-----|
| Leaderboard | `https://explorer.nasun.io/api/v1/points/leaderboard?limit=50&offset=0` |
| User | `https://explorer.nasun.io/api/v1/points/user/:walletAddress` |
| Health | `https://explorer.nasun.io/api/v1/points/health` |
| Wallet mappings (internal, prod) | `https://doetwxms5a.execute-api.ap-northeast-2.amazonaws.com/prod/internal/wallet-mappings` |
| Wallet mappings (internal, dev) | `https://x9rd39ej88.execute-api.ap-northeast-2.amazonaws.com/prod/internal/wallet-mappings` |

## 최근 변경 파일

```
modified:   apps/nasun-website/cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts
modified:   apps/nasun-website/cdk/lib/admin-stack.ts
modified:   apps/network-explorer/api-server/ecosystem.config.cjs
modified:   apps/network-explorer/api-server/src/db.ts
modified:   apps/network-explorer/api-server/src/index.ts
new:        apps/network-explorer/api-server/src/config/points.ts
new:        apps/network-explorer/api-server/src/db/points-schema.sql
new:        apps/network-explorer/api-server/src/routes/points.ts
new:        apps/network-explorer/api-server/src/scanner/points-scanner.ts
```

## E2E 테스트 결과

| # | 테스트 | 결과 |
|---|--------|------|
| 1 | 데이터 무결성 (10개 검사) | PASS (violations=0) |
| 2 | Genesis Pass 배수 (x1.5) | PASS (3건, 15.00pts each) |
| 3 | 멱등성 (재스캔) | PASS (154건 불변) |
| 4 | API 엔드포인트 (6개 시나리오) | PASS |
| 5 | 외부 접근 (explorer.nasun.io) | PASS + CORS |
| 6 | Wallet cache 일치 | PASS (2674 wallets, 31 genesis) |
| 7 | 에러 시나리오 (rate limit, invalid input, 기존 API) | PASS |

## 즉시 다음 단계

1. **Git 커밋**: 변경사항을 논리적 단위로 커밋 (`/ship` 사용)
2. **(C-1) 백업 cron**: node-3에 `pg_dump nasun_points` 일일 cron 추가
3. **(C-2) 인프라 문서**: `docs/infrastructure.md`에 points 시스템 섹션 추가
4. **(C-3) 지갑 한도**: wallet-api Lambda에 계정당 max 10 검증 추가
