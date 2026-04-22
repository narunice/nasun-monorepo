# Handoff: Explorer API Stability - Postgres 연결 + Ecosystem Points 안정화

**생성**: 2026-04-22 (세션 종료)
**브랜치**: main
**이전 핸드오프**: [2026-04-13-matview-refresh-advisory-lock-bug.md](2026-04-13-matview-refresh-advisory-lock-bug.md)

## 현재 상태 요약

`https://nasun.io/uju?tab=dashboard`에서 ecosystem score API 502 오류 발생 원인을 진단하고 수정했다. PM2 `explorer-api` 프로세스가 93회 크래시한 원인은 postgres.js의 `CONNECTION_ENDED` 오류가 `process.exit(1)` 핸들러를 트리거한 것. 이 세션에서 총 8개 파일에 걸쳐 안정성 수정을 완료하고 node-3에 배포했다. 6개 수정은 커밋됨(`cdf1397c`), 3개는 아직 미커밋 상태.

## 완료된 작업

- [x] 502 오류 근본 원인 진단 (PM2 크래시 → CONNECTION_ENDED → process.exit(1))
- [x] `index.ts`: TRANSIENT_PG_CODES 필터 추가 (transient PG 코드는 exit 안 함)
- [x] `db.ts`: idle_timeout 60→30, max_lifetime 1800 추가
- [x] `points-scanner.ts`: scheduleNext() try/finally, setInterval async try/catch
- [x] `ecosystem-cache.ts`: syncTimestamps 1h TTL lazy purge, refreshInFlight finally 순서 수정
- [x] `cache.ts`: inflight.delete() .finally() 단일 경로로 통합
- [x] `daily-snapshot.ts`: 5개 batch 쿼리를 Promise.all → Promise.allSettled (커밋됨)
- [x] `daily-snapshot.ts`: 부분 완료 후 재실행 시 영구 스킵되는 조기 반환 제거 (미커밋)
- [x] `rpc-reconcile.ts`: 하드코딩된 REFERRAL_SF=0.5 → REFERRAL_ECOSYSTEM_SCALING_FACTOR import (미커밋)
- [x] `rpc-reconcile.ts`: N+1 INSERT → 단일 bulk unnest INSERT (미커밋)
- [x] `daily-nft-check.ts`: RPC_CONCURRENCY 200→50 (thundering herd 방지) (미커밋)
- [x] `daily-nft-check.ts`: staking_emission_state 15k+ 개별 UPSERT → 단일 bulk unnest UPSERT (미커밋)
- [x] `daily-nft-check.ts`: alliance penalty 개별 INSERT 루프 → batch INSERT (미커밋)
- [x] node-3 배포 완료 (PM2 restart count 96, status online)
- [x] 전체 코드 리뷰 수행

## 미완료 작업

- [ ] **MEDIUM: `daily-snapshot.ts` step 7 N+1 배치화** - 50k 사용자 개별 CTE INSERT 루프. 각 행의 prevBaseStr/prevBonusStr/prevRefStr 등 per-row prev 값을 배열로 SQL에 전달하는 방식으로 배치화 가능. 복잡도 있어 별도 세션 필요.
- [ ] **LOW: `rpc-reconcile.ts` snapshot correction의 all_time_* 미갱신** - reconcile로 base_score 올라가도 `all_time_base`, `all_time_score` 등 cumulative 컬럼은 갱신 안 됨. 당일 delta는 맞고, cumulative만 낮게 유지됨.
- [ ] **미커밋 파일 3개 커밋** - `daily-snapshot.ts`, `rpc-reconcile.ts`, `daily-nft-check.ts`

## 중요 컨텍스트

- **배포 서버**: node-3 (54.180.61.196, ubuntu), SSH 키: `~/.ssh/.awskey/nasun-devnet-key.pem`
- **PM2 프로세스**: `explorer-api` (ID 5), 포트 3200
- **배포 경로**: `rsync ... /dist/ ubuntu@54.180.61.196:/home/ubuntu/explorer-api/dist/`
- **빌드**: `cd apps/network-explorer/api-server && pnpm build` (tsc)
- **502 원인**: `9e6ad214` 커밋(2026-04-17)이 unhandledRejection에 process.exit(1) 추가, postgres.js 재연결 과정의 정상적인 CONNECTION_ENDED 에러가 fatal로 처리됨
- **Points 단조증가 불변식**: all_time_score는 절대 감소 불가. snapshot correction 시에도 `WHERE s.base_score < ns.new_base` 조건으로 업사이드만 반영
- **daily-snapshot.ts N+1 상세**: step 7의 각 INSERT는 `WITH cum AS (SELECT prevBaseStr + baseScore*multiplier AS atb, ...)` 형식의 CTE로 SQL numeric 정밀도 유지. 배치화 시 이 prev* 값들을 unnest 배열로 함께 전달해야 함

## 최근 변경 파일

커밋된 파일 (`cdf1397c`):
- `apps/network-explorer/api-server/src/index.ts`
- `apps/network-explorer/api-server/src/db.ts`
- `apps/network-explorer/api-server/src/scanner/points-scanner.ts`
- `apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts`
- `apps/network-explorer/api-server/src/cache.ts`
- `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts` (Promise.allSettled 부분)

미커밋 변경:
- `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts` (조기 반환 제거)
- `apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts` (SF 교체 + bulk INSERT)
- `apps/network-explorer/api-server/src/scanner/daily-nft-check.ts` (동시성 감소 + 배치 UPSERT)

## 즉시 다음 단계

1. 미커밋 파일 3개 커밋: `fix(network-explorer): batch db writes and fix referral sf config`
2. (선택) `daily-snapshot.ts` step 7 N+1 배치화: prevBaseStr, prevBonusStr, prevGovStr, prevRefStr, prevStakingStr 를 배열로 수집 후 unnest()로 단일 INSERT 구성
3. (선택) `rpc-reconcile.ts` snapshot correction에 all_time_* 컬럼 갱신 추가
