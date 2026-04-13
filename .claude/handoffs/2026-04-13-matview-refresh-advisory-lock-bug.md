# Handoff: Matview REFRESH advisory lock session mismatch 버그

**생성**: 2026-04-13 06:35 UTC (KST 15:35)
**브랜치**: main
**이전 핸드오프**: [2026-04-12 scanner stall + matview incident](2026-04-12-scanner-stall-and-matview-incident.md)

## 현재 상태 요약

오늘 두 가지 주요 작업을 진행했다: (1) **Staking-v2 배포 완료** (Backend + Frontend prod/staging, 내일 UTC 00:00 cutoff 자동 발효 예정), (2) **Scanner scanLoop / Matview REFRESH 블로킹 문제 조사**. Phase 1 코드 변경은 한 번 배포했다가 롤백했으며, 실제 원인은 `pointsDb` pool의 connection 분산으로 인한 **advisory lock session mismatch 버그**로 확정됐다. 오늘 `postgresql.conf` 튜닝(`max_connections 20→50`, `work_mem 256MB→32MB`)으로 connection 포화는 해소했으나, **REFRESH 성공 로그는 여전히 0건** — advisory lock이 pool 재사용 상황에서 제대로 release되지 않아 `refresh skipped (lock held)` 루프에 빠진다.

## 완료된 작업

### Staking-v2 (배포 완료)
- [x] `config/points.ts` — `STAKING_V2_CUTOFF_DATE='2026-04-14'`, `calcStakingTierPts()` tier (1~500:1pt, 501~5000:2pt, 5001+:3pt)
- [x] `scanner/daily-nft-check.ts` — `awardStakingDailyPoints()` v2 + multi-wallet aggregation (`Promise.allSettled`, `registeredWallets` 기반) + `daysAgo=0,1,2` lookback
- [x] `scanner/points-scanner.ts` — `registeredWallets`를 `runDailyNftChecks`에 전달
- [x] `routes/ecosystem.ts` — 3개 staking 집계 쿼리 (today/weekly/allTime), 공식 `(baseScore + stakingScore) × multiplier + bonus + ref × 0.5`
- [x] `services/ecosystemScoreApi.ts` — `stakingScore?: number` 타입 추가
- [x] `ProfileHeroCard.tsx` — 공식 렌더링 분리 표기 (`staking > 0`일 때만 괄호)
- [x] Commit `2baae348 feat(explorer-api,nasun-website): reflect NSN staking in ecosystem points (tier-based)` pushed to main
- [x] Backend rsync + pm2 restart on node-3 (54.180.61.196)
- [x] Frontend staging 배포 (15.165.19.180)
- [x] Frontend prod 배포 (43.200.67.52)
- [x] Backend smoke test: `daily/weekly/allTime.stakingScore: 0` 필드 확인 (cutoff 전)

### Memory 저장
- [x] `feedback_points_monotonic_increase.md` — 단조 증가 불변식
- [x] `feedback_daily_missions_immediate_reflection.md` — 즉시 반영 원칙
- [x] MEMORY.md 인덱스 업데이트

### Scanner/Matview 조사
- [x] Phase 1 안 (fire-and-forget REFRESH, MIN_INTERVAL 3min, SET LOCAL 120s, Promise.all caches) 코드 구현 + 배포
- [x] 10분 관찰 후 "REFRESH 성공 0건 + lag 악화" 판정하여 **롤백** (`git restore` + rsync + pm2 restart)
- [x] 로깅만 추가한 버전 재배포 (동작 변경 0) → 동일 증상 반복 확인 → Phase 1이 원인 아님 확정
- [x] Postgres 진단: `max_connections=20` 포화, Swap 2.8GB 사용, `/etc/postgresql/16/main/conf.d/nasun-tuning.conf`가 실제 override 파일임을 발견
- [x] `nasun-tuning.conf` 백업(`nasun-tuning.conf.bak.20260413-062550`) + `max_connections=50`, `work_mem=32MB`로 수정 + `sudo systemctl restart postgresql` (실제 다운타임 6.5초)
- [x] Snapshot cron reliability 실측 (`ecosystem_score_snapshots`): 04-01 ~ 04-12 연속 12일 생성, 누락 0, 중복 0. 04-11만 row 수 적음(15k vs 44k~).

## 미완료 작업

### 🔴 Critical: Matview REFRESH advisory lock 버그 (다음 세션 최우선)
- [ ] `maybeRefreshMatview()`에서 advisory lock / REFRESH / unlock이 **같은 connection에 pin**되도록 수정
  - 권장 패턴: `pointsDb.reserve()` 사용하여 single connection으로 lock → REFRESH → unlock 수행
  - 또는 advisory lock 제거 (단일 PM2 fork 환경이므로 `lastMatviewRefresh` 시간 가드로 충분)
- [ ] 수정 후 `refreshed in Xms` 로그가 정상 출력되는지 확인
- [ ] Matview staleness 해소 확인

### 🟡 Staking-v2 cutoff 후속
- [ ] 2026-04-14 UTC 00:00 (KST 09:00) cutoff 발효 후 검증
  - `SELECT base_points, COUNT(*) FROM activity_points WHERE category='staking-daily' AND NOT flagged AND tx_timestamp >= '2026-04-14' GROUP BY 1;` → tier 1/2/3 분포
  - 단조 증가 샘플링 (배포 전후 여러 사용자 `allTime.ecosystemScore` 비교)
  - UI 공식 `(base + staking) × mult + bonus` 렌더링 확인
- [ ] 공지: tier 표, 등록된 모든 지갑 합산, 24h epoch 지연 가능성

### 🟢 Scope B / 후속 (우선순위 낮음)
- [ ] Category bar에 "Staking" 세그먼트 추가
- [ ] `scanTodayWalletTransfers` multi-wallet 전환
- [ ] activity_points retention / 파티셔닝 (14.5M rows / 9.2 GB)
- [ ] `snapshot_change_log` 테이블 `sui_indexer` role 권한 부여 (`permission denied` 로그 발생 중)
- [ ] `pg_stat_statements` 확장 활성화 (슬로우 쿼리 가시성)

## 중요 컨텍스트

### 결정사항

1. **Staking-v2는 "분리 표기" 방식 채택** (base에 흡수 아님): 공식이 `(base + staking) × mult + bonus` 로, 사용자가 UI에서 staking의 독립적 기여를 인지 가능.
2. **Multi-wallet staking 집계**: `awardStakingDailyPoints` 내부에서 `registeredWallets` Map을 역인덱싱하여 identity당 모든 Sui 지갑의 active stake 합산. `identityToWallet` Map 구조는 건드리지 않음 (다른 consumer 영향 0).
3. **Phase 1 코드 변경은 rollback**. 근본 원인은 postgres 튜닝(connection 포화) + advisory lock session mismatch. Phase 1 설계 자체가 부적절한 건 아니었으나, 근본 원인을 짚지 못한 상태에서 여러 변수를 동시에 바꿔 진단 방해.
4. **Postgres 설정 변경**: `nasun-tuning.conf`에서 `max_connections 20→50`, `work_mem 256MB→32MB` 적용됨. 효과 확인: scanner lag 2:46→0:18 완전 회복, API 응답 10~40ms 일관.

### 주의사항 (다음 세션 진입 전 반드시 확인)

- **advisory lock 제거 vs. reserve 패턴**: 현재 `ecosystem-cache.ts:199-234`의 `maybeRefreshMatview()`는 pool에서 **다른 connection으로** 3개 쿼리 실행:
  1. `SELECT pg_try_advisory_lock(8675309)` — 임의 connection C1
  2. `REFRESH MATERIALIZED VIEW CONCURRENTLY ...` — 다른 connection C2
  3. `SELECT pg_advisory_unlock(8675309)` — 또 다른 connection C3
  Session-level lock은 acquire한 session에서만 release 가능하므로 C1의 lock이 leak. 다음 시도에서 `pg_try_advisory_lock` 실패 → "refresh skipped (lock held)" 루프.

- **단일 PM2 fork 환경**: `ecosystem.config.cjs`의 `exec_mode: 'fork', instances: 1`. 따라서 **crosswork concurrent REFRESH 방어는 불필요**. Advisory lock은 오히려 dead code이자 **버그 원인**. 제거해도 동작 이상 없음 (`lastMatviewRefresh` 시간 가드만 유지).

- **Postgres restart 후 Swap은 그대로**: 3.1GB (restart 전 2.8GB에서 오히려 일시 증가 후 소폭 감소). 장기 모니터링 필요.

- **`ecosystem-matview-migration.ts`에 pre-existing typecheck 에러 3건** (TS2349 "expression is not callable", TS2578 "Unused @ts-expect-error"). 내 코드와 무관, 기존 것.

- **배포 후 24시간 관찰 실측 누적**:
  - `scanLoop exceeded 180000ms`: 05:00 기준 7 → 06:35 기준 **20** (+13건). 대부분 postgres restart 순간의 ECONNREFUSED 때문이지만 REFRESH 문제와 부분 상관.
  - `Matview refresh error: canceling statement due to statement timeout`: 지속 발생.
  - `Matview refresh skipped (lock held)`: **Postgres 튜닝 직후부터 처음 출현** — 내가 추가한 로깅 라인이 정상 작동. 이 로그가 바로 "advisory lock leak 증거".

### 파일 위치

**다음 세션에서 수정해야 할 파일**:
- [apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts:199-234](../../apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts#L199-L234) — `maybeRefreshMatview()` 본체, advisory lock 수정 대상
- [apps/network-explorer/api-server/src/db.ts:13-28](../../apps/network-explorer/api-server/src/db.ts#L13-L28) — `pointsDb` pool 설정 (max=5, statement_timeout=30000). 필요 시 pool size 조정

**참조 (수정 금지)**:
- [apps/network-explorer/api-server/src/scanner/points-scanner.ts:305-335](../../apps/network-explorer/api-server/src/scanner/points-scanner.ts#L305-L335) — scanLoop 3개 REFRESH 호출 지점 (L312/L319/L330)
- [apps/network-explorer/api-server/src/scanner/daily-snapshot.ts:33-37](../../apps/network-explorer/api-server/src/scanner/daily-snapshot.ts#L33-L37) — snapshot이 matview를 읽는 쿼리 (L330 pre-snapshot refresh가 왜 await 유지인지 설명)
- [apps/network-explorer/api-server/src/config/ecosystem.ts:40-41](../../apps/network-explorer/api-server/src/config/ecosystem.ts#L40-L41) — `MATVIEW_REFRESH_MIN_INTERVAL_MS` (Phase 1에서 3min 제안했으나 rollback, 현재 **5min 원복 상태**)

**Plan 파일** (Phase 1 실패 분석 + Phase 2 설계 포함):
- [/home/naru/.claude/plans/linear-skipping-harp.md](/home/naru/.claude/plans/linear-skipping-harp.md)

**운영 정보**:
- Node-3 host: `54.180.61.196`, ssh key `~/.ssh/.awskey/nasun-devnet-key.pem`
- PM2 process: `explorer-api` (id 4, fork mode, 1 instance), port 3200
- Postgres: 16.13, `/etc/postgresql/16/main/postgresql.conf` + `conf.d/nasun-tuning.conf`
- Config backup: `/etc/postgresql/16/main/conf.d/nasun-tuning.conf.bak.20260413-062550`
- Database: `nasun_points`, role `sui_indexer`
- Pool: `pointsDb max=5`, `sql max=10` (db.ts)

## 최근 변경 파일 (현재 working tree)

현재 변경 상태 — 내가 작업한 건 이미 모두 commit(`2baae348`)되어 push됨. 아래는 **다른 세션의 변경**이거나 **pre-existing**:

```
M .claude/handoffs/2026-04-12-points-audit-followup.md
M apps/nasun-website/cdk/lambda-src/bug-report/src/... (여러 파일)
M apps/nasun-website/cdk/lib/common-stack.ts
M apps/nasun-website/chat-server/README.md
M apps/nasun-website/chat-server/ecosystem.config.cjs
M apps/nasun-website/frontend/src/sections/myAccount/CreatorPostsCard.tsx
M apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts    ← 로깅 추가 (미커밋)
M apps/network-explorer/api-server/src/scripts/grant-retroactive-bugreport-bonus.ts
M apps/network-explorer/api-server/src/scripts/settle-pado.ts
M apps/pado/CLAUDE.md, apps/pado/docs/chat-server.md
?? apps/nasun-website/chat-server/doc/
```

**주의**: `ecosystem-cache.ts`의 로깅 추가분은 prod에 배포됐으나 커밋 안 된 상태. 다음 세션에서 advisory lock 수정할 때 함께 커밋.

## 즉시 다음 단계 (next session)

1. **`ecosystem-cache.ts`의 `maybeRefreshMatview()` 수정**:
   ```typescript
   export async function maybeRefreshMatview(force = false): Promise<void> {
     if (!pointsDb) return;
     const now = Date.now();
     if (!force && now - lastMatviewRefresh < MATVIEW_REFRESH_MIN_INTERVAL_MS) return;

     // 단일 PM2 fork 환경 — cross-worker concurrent refresh 방어 불필요.
     // 시간 가드만으로 충분. Advisory lock 제거로 session-mismatch 버그 해소.
     let started = 0;
     try {
       started = Date.now();
       lastMatviewRefresh = started; // throttle-first: 실패해도 MIN_INTERVAL 존중
       await pointsDb`REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`;
       const ms = Date.now() - started;
       console.log(`[Ecosystem] Materialized view refreshed in ${ms}ms`);
     } catch (err) {
       const ms = started > 0 ? Date.now() - started : 0;
       console.error(`[Ecosystem] Matview refresh error after ${ms}ms:`, err);
     }
   }
   ```
   **대안 (advisory lock 유지, reserve 패턴)**:
   ```typescript
   await pointsDb.reserve().then(async (conn) => {
     try {
       const [lock] = await conn`SELECT pg_try_advisory_lock(${MATVIEW_ADVISORY_LOCK_ID}) as acquired`;
       if (!lock?.acquired) { console.log('[Ecosystem] refresh skipped (lock held)'); return; }
       try {
         // REFRESH 실행
       } finally {
         await conn`SELECT pg_advisory_unlock(${MATVIEW_ADVISORY_LOCK_ID})`;
       }
     } finally {
       conn.release();
     }
   });
   ```
   권장: **advisory lock 제거안** (더 단순, 단일 fork 전제 명시적).

2. **Typecheck + `/code-review` 실행** 후 rsync + pm2 restart.

3. **3~5분 관찰**: `pm2 logs explorer-api | grep "refreshed in"` 성공 로그 확인. MIN_INTERVAL은 현재 5분이므로 첫 refresh까지 대기.

4. **Staking-v2 cutoff 검증** (2026-04-14 UTC 00:00 이후):
   - tier 분포 SQL 조회
   - 사용자 로그인 후 my-account 페이지에서 `(base + staking) × mult + bonus` 렌더링 확인
   - `allTime.ecosystemScore` 단조 증가 확인

5. **공지**: staking-v2 활성화, tier 표, 모든 지갑 합산, 24h epoch 지연.

## 후속 교훈 (이번 세션에서)

- **진단 전 변경 금지**: Phase 1 배포 10분 후 "REFRESH 성공 로그 0건"을 보고 롤백했지만, 롤백 후에도 같은 증상 지속 → Phase 1은 원인이 아니었음. 교훈: 여러 변수(SET LOCAL, fire-and-forget, MIN_INTERVAL, Promise.all)를 한 번에 바꾸면 진단이 어렵다. **로깅만 먼저 배포하는 것이 정석**이었다.
- **postgres-level 문제를 app-level 최적화로 풀려 했음**: 실제 원인은 `max_connections=20` 포화였는데 app 재구조화 먼저 시도. 인프라 현황 진단을 먼저 해야 함.
- **`m6i.xlarge (16GB RAM) tuning` 주석이 현실과 불일치**: 실제 호스트는 30GB RAM. 설정 파일 주석이 오래되어 misleading. 튜닝 파일 주석에 "Adjusted YYYY-MM-DD" 라인 남기면 이후 세션 디버깅 수월.
