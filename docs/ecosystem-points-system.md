# Nasun Ecosystem Points System Technical Specification

**상태**: 운영 중 (Production, V3 단일 경로, post-2026-05-04 안정화)
**최근 업데이트**: 2026-05-12 (RPC 503 mitigation: fullnode-restart cron 시각 분산 + daily-nft-check RPC_CONCURRENCY 50→20 + rpc.ts 중앙집중 retry+backoff. 5/8 staking-daily 14k 미적립 사고 클래스를 구조적으로 차단)
**핵심 경로**:
- Backend API: `apps/network-explorer/api-server/src/routes/ecosystem.ts`
- Multiplier Config: `apps/network-explorer/api-server/src/config/ecosystem.ts`
- Points Config: `apps/network-explorer/api-server/src/config/points.ts` (단일 source of truth: `BASE_POINTS`, `DEFAULT_MISSION_IDS`)
- Scanners:
  - `scanner/points-scanner.ts` (60초 이벤트 폴링 + 일 1회 snapshot/reconcile 트리거)
  - `scanner/daily-snapshot.ts` (일일 점수 확정, V3 단일 경로 + matview-vs-filteredBaseMap 가드)
  - `scanner/rpc-reconcile.ts` (RPC 야간 정합성 + mission-aware snapshot 보정)
  - `scanner/health-update.ts` (NFT health 일일 갱신)
  - `scanner/daily-nft-check.ts` (스테이킹 V2 + Genesis passive)
  - `scanner/wallet-transfer-scanner.ts`, `chat-scanner.ts`, `faucet-scanner.ts`
- Frontend Hook: `apps/nasun-website/frontend/src/hooks/useDailyMissions.ts`

**관련 시스템**:
- 주간 Pado DEX 트레이딩 리더보드 → 정산 시 본 시스템의 `activity_points`에 `ecosystem-bonus-pado` 카테고리로 적립 ([pado-score-leaderboard.md](pado-score-leaderboard.md))
- 주간 Nasun Ecosystem Leaderboard → 본 시스템의 `activity_points`를 직접 조회. 추천인 보너스(`activity_type='l1-bonus'`)는 `× 2/3`로 weekly_score에 반영 ([ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md](../apps/nasun-website/doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md#referrer-bonus-score))
- Daily referral bonus (2026-05-11~): UTC 자정 직후 `runDailyReferralBonus()`가 어제 referee의 모든 final_points × 10% (per-referee MIN(50pt))을 `referral-bonus` 카테고리로 batch insert. 활성화(`tx_timestamp >= activatedAt`) 이후 활동만 포함

---

## 1. 시스템 목적

나선(Nasun) 에코시스템 활동을 정량화하여 보상하는 시스템. 사용자 충성도를 측정하고, NFT 보유자(Alliance / Genesis Pass)에게 multiplier 혜택을 제공.

V3에서 변경된 핵심 원칙:

- **사용자 주도 미션 구성**: 사용자가 자신이 추구할 데일리 미션을 직접 선택. 같은 행동을 해도 사용자마다 base_score 구성이 다름.
- **단일 경로(single path)**: V3 health-based multiplier만 사용. V1 additive battalion-stack 공식은 코드에서 제거됨 (cutover 2026-05-02).
- **Mission-aware 보정**: 모든 base_score 계산은 `user_active_missions` 필터를 거침. snapshot, /score 라이브, RPC 야간 reconcile이 모두 같은 필터 로직을 공유.
- **Live ↔ Snapshot 일관성** (2026-05-04 추가): 라이브 `/score` 엔드포인트의 allTime 계산이 자정에 lock-in될 값과 정확히 같은 mission filter를 사용. 자정 transition에서 allTime이 감소하는 일 없음.

---

## 2. 아키텍처 개요

```
온체인 활동
    ├─ event-based scanner (points-scanner.ts) ─┐
    └─ indexer SQL scanner (wallet-transfer)    │
                                                 ▼
                                        activity_points
                                          (개별 활동 원장, INSERT-only,
                                           integrity-guard 보호)
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
              ecosystem_daily_scores       /score 라이브        daily-snapshot
                  (matview, 미션 비필터)   (mission-aware,      (00:05 UTC,
                  raw 활동량 표시용)        라이브 + 단조증가)    mission-aware,
                                                 │             matview sanity gate)
                                                 │                  │
                                                 │                  ▼
                                                 │       ecosystem_score_snapshots
                                                 │            (불변 일일 원장,
                                                 │             V3 단일 경로)
                                                 │                  │
                                                 ▼                  ▼
                                          rpc-reconcile      Leaderboard / 차트
                                          (mission-aware
                                           snapshot 보정)
```

### 2.1 Backend (포인트 엔진)

- **하이브리드 스캐닝**:
  - Event-based: `points-scanner.ts`가 60초 간격으로 Sui 이벤트 구독.
  - Indexer-SQL: `wallet-transfer` 등 대용량 카테고리는 인덱서의 `tx_affected_addresses` 직접 조회.
- **포인트 카테고리 두 종류**:
  - **Base categories**: 카테고리당 하루 최대 1회 인정 (DEX 거래, 게임 참여, 지갑 전송, faucet 등). `final_points`는 항상 1, 점수 계산은 distinct 카테고리 가중합 (heavy categories `pado-dex`, `pado-prediction` = weight 2; 그 외 = 1). 가중치 단일 source는 `config/points.ts:HEAVY_BASE_CATEGORIES` + `baseWeightFor()` 헬퍼이며 SQL 측은 `category IN ('pado-dex','pado-prediction')` 패턴으로 lockstep.
  - **Score categories**: `final_points`가 그대로 점수에 가산 (governance, referral-bonus, staking, ecosystem-bonus-*, staking-reward). `daily-mission`도 historical SCORE_CATEGORIES 멤버지만 live writer는 없음 (아래 4절 참조).
- **야간 정합성 검사 (Nightly Reconciliation)**: `rpc-reconcile.ts`가 매일 자정(UTC) 이후 RPC 직접 조회로 누락된 이벤트 복구. 신규 갭이 발견되면 **사용자별 미션 선택을 적용한** base_score를 다시 계산하여 snapshot 보정 + 누적 컬럼 forward-propagation.

### 2.2 Frontend (실시간 미션 체크)

- **Direct RPC Query**: 백엔드 인덱싱 지연을 우회하기 위해 브라우저에서 직접 `queryEvents` / `queryTransactionBlocks` 호출.
- **Multi-wallet Tracking**: `useDailyMissions.ts`가 사용자 모든 연결 지갑을 동시에 검사. 어느 지갑에서든 미션 달성 시 UI 즉시 반영.

---

## 3. 점수 공식

### 3.1 일일 점수 (Daily Score)

```
daily_ecosystem_score
  = base_score * multiplier
  + bonus_total
  + governance_bonus
  + referral_bonus * REFERRAL_SCALING_FACTOR
  + staking_delta * multiplier
```

- `base_score`: 사용자가 활성화한 미션 중 오늘 수행한 distinct 카테고리 수의 가중합 (heavy categories `pado-dex`/`pado-prediction` weight=2, 그 외 weight=1; `HEAVY_BASE_CATEGORIES` 단일 상수).
- `multiplier`: V3 health-based multiplier (3.3 참조). NFT 미보유 또는 Alliance 미보유 시 0.
- `bonus_total`: 오늘 적립된 `ecosystem-bonus-*` 카테고리 합 (synthetic 제외).
- `governance_bonus`: 오늘 governance 카테고리 합.
- `referral_bonus`: 오늘 referral-bonus 카테고리 합 (스케일링 전 raw).
- `REFERRAL_SCALING_FACTOR`: 0.5 (env: `REFERRAL_ECOSYSTEM_SCALING`).
- `staking_delta`: 오늘 staking-daily 티어 점수 (post-cutoff 2026-04-14만 누적).

### 3.2 누적 점수 (All-time)

snapshot 행에 다음 컬럼이 누적됨 (numeric arithmetic, JS float drift 회피):

```
all_time_base            = prev.all_time_base   + base_score * multiplier
all_time_bonus           = prev.all_time_bonus  + bonus_total
all_time_gov             = prev.all_time_gov    + governance_bonus
all_time_referral_scaled = prev.all_time_ref    + referral_bonus * sf
all_time_staking_scaled  = prev.all_time_stak   + staking_delta * multiplier
all_time_score           = SUM(위 5개)
```

라이브 `/score` 엔드포인트의 "All Time" 표시는 다음 공식을 매번 재계산한다 (anchor에 의존하지 않음):

```
allTime_live
  = SUM(base_score * COALESCE(multiplier_v2, multiplier))    (모든 snapshot 행)
  + (todayFilteredBase + unsnapshottedFilteredBase) * mult_today
  + stakingAllTime * mult_today
  + bonusTotal_alltime  (activity_points SUM, synthetic 포함)
  + govTotal_alltime
  + refTotal_alltime * sf
```

이 공식의 모든 컴포넌트는 `activity_points` 또는 `ecosystem_score_snapshots`의 base_score/multiplier 컬럼에서 직접 SUM된다. `all_time_*` 컬럼은 anchor chain 표시(차트)와 다음 날 snapshot의 prev anchor 용도로만 사용된다.

> **Anchor 전파 일관성 (중요)**: reconcile이 이전 날짜의 `base_score`를 갱신하면 `rpc-reconcile.ts`의 `correctSnapshotForReconciledDate()`가 자동으로 같은 `(new_base - old_base) * multiplier` 델타를 해당 날짜와 그 이후 모든 snapshot 행의 `all_time_base` / `all_time_score`에 더한다. 이 forward-propagation이 빠지면 다음 날 snapshot이 stale anchor를 상속받아 영구적인 누적 오차가 발생한다.

> **Live↔Snapshot mission filter 일관성 (2026-05-04 fix)**: 라이브 `allTime` 계산은 반드시 `todayFilteredBase`와 `unsnapshottedFilteredBase` (= 사용자 active mission으로 필터링된 base)를 사용해야 한다. matview의 raw `base_score`(미션 비필터)를 쓰면 자정 lock-in에서 base가 mission-filtered 값으로 바뀌면서 allTime이 감소한다 (never-decrease invariant 위반).

### 3.3 V3 Health-Based Multiplier

`config/ecosystem.ts`의 `calculateMultiplier()`:

| NFT 상태 | Multiplier |
|---|---|
| Alliance 없음 | 0 (포인트 적립 비활성) |
| Alliance만 보유 | `alliance_health / 100` (0.0 ~ 1.0) |
| Alliance + Genesis Pass | `1.0 + gp_bonus / 100` (1.0 ~ 1.8) |

- `alliance_health`는 5단계 (0/25/50/75/100)
- `gp_bonus`는 6단계 (0/20/40/60/80/100)
- GP 보유자는 alliance가 100%로 강제 잠김 (V3 사양). Live 응답에서 cache lag을 보정해서 일관성 유지.
- Battalion NFT는 V3에서 multiplier에 영향 없음 (display badge용으로만 보존: `getActivationBonus`).

`scanner/health-update.ts`가 매일 1회 모든 NFT 보유자의 health를 갱신. `nft_health_state` 테이블에 `(identity_id, nft_type, health_pct, last_evaluated_day, consecutive_rest_days)` 저장.

### 3.4 Mission Selection (사용자별 base 구성)

`user_active_missions` 테이블:

| identity_id | missions (jsonb array) | updated_at |
|---|---|---|
| `ap-northeast-2:...` | `["pado-dex","wallet-transfer","gostop-crash"]` | timestamp |

- **인코딩**: `missions`는 jsonb 컬럼이고 **반드시 native jsonb array**로 저장된다. 과거 PUT handler가 `JSON.stringify(missions)`를 쓰는 이중 인코딩 버그가 있었다 (jsonb-string of array). 2026-05-04 fix로 `pointsDb.json(missions)`을 사용하도록 수정 + 기존 13,627 entries normalize 완료. reader 측은 `jsonb_typeof(missions) = 'array'`를 가정하되, defensive하게 `'string'` 케이스도 fallback 처리한다.
- **Fallback**: 행이 없거나 jsonb 배열이 비어있으면 `DEFAULT_MISSION_IDS` 사용.
- **Single source of truth**: `apps/network-explorer/api-server/src/config/points.ts`의 `DEFAULT_MISSION_IDS` 상수 (`faucet`, `wallet-transfer`, `pado-dex`, `gostop-lottery`, `gostop-scratchcard`, `gostop-numbermatch`). 모든 base_score 계산 지점이 이 상수를 import하여 사용:
  - `daily-snapshot.ts` 일일 INSERT
  - `routes/ecosystem.ts /score` 라이브 응답
  - `rpc-reconcile.ts correctSnapshotForReconciledDate` 야간 보정
- **Mission cap**: PUT API는 1~10개 mission ID를 허용 (validation). 프론트엔드 UI는 7개 cap 권장.

**미션 추가/제거 시 안전성**: 새 미션 카테고리를 추가하거나 기존을 제거해도 다음 조건만 지키면 시스템이 깨지지 않는다:
1. 새 카테고리는 `BASE_POINTS` (`config/points.ts`)에 등록한다 (스캐너가 활동을 기록하도록).
2. 카테고리가 `staking-daily`/`referral-bonus`/`daily-mission`/`ecosystem-passive`/`staking`/`staking-reward` 또는 `ecosystem-bonus-%`에 해당하지 않는 일반 base 카테고리라면, snapshot/reconcile/score 모두가 자동으로 `user_active_missions`로 필터링한다.
3. 프론트엔드 미션 레지스트리(`apps/nasun-website/frontend/src/sections/uju/missions/missionRegistry.ts`)에 추가하면 사용자가 선택할 수 있게 된다.

기본 미션 목록 변경 시 `config/points.ts:DEFAULT_MISSION_IDS` 한 곳만 수정.

---

## 4. 미션 카테고리 (현재 운영 중)

| 카테고리 | 활동 | 종류 |
|---|---|---|
| `pado-dex` | DEX 주문 / 시장가 / 취소 | Base (weight 2) |
| `pado-prediction` | Pado 예측시장 주문/체결/민트/취소/배당 | Base (weight 2) |
| `wallet-transfer` | 다른 지갑으로 자산 전송 (linked wallet 자동 제외) | Base (1) |
| `faucet` | Faucet 토큰 청구 | Base (1) |
| `pado-perp`, `pado-lending` | Pado 파생/대출 | Base (1) |
| `gostop-lottery`, `gostop-scratchcard`, `gostop-numbermatch`, `gostop-mines`, `gostop-crash`, `gostop-wheel` | GoStop 게임 | Base (1) — 게임당 독립 카운트 |
| `chat` | 채팅 참여 | Base (1) |
| `baram-ai`, `baram-executor` | Baram AI 정산 | Base (1) |
| `staking` | 첫 위임 | Base (1) |
| `staking-daily` | 액티브 스테이크 일일 티어 | Score (티어제, 4.1) |
| `staking-reward` | 일일 emission delta (LOG2 사전 적용) | Score → **Leaderboard score 전용**, ecosystem points에 직접 반영 X. 주간 leaderboard 정산 시 `ecosystem-bonus-leaderboard`로 환원. |
| `governance` | 제안서 vote/delegate | Score (10/5) |
| `daily-mission` | (Deprecated, 2026-05-11) Live writer 없음. 과거 일회성 보상 스크립트가 INSERT한 historical row만 존재. SCORE_CATEGORIES에는 유지되어 누적 점수에 계속 가산됨 (단조 증가 불변식 보호) | Score (historical) |
| `referral-bonus` | 추천인 보너스 | Score (변동, sf=0.5 적용) |
| `ecosystem-bonus-creator-posts` | X 게시물 큐레이션 | Score (1–30) |
| `ecosystem-bonus-bugreport` / `-feedback` | 버그/피드백 보너스 | Score (1–5) |
| `ecosystem-bonus-game` | 게임 이벤트 보너스 | Score |
| `ecosystem-bonus-pado` | 주간 Pado 트레이딩 정산 | Score |
| `ecosystem-bonus-leaderboard` | 주간 ecosystem 리더보드 정산 (staking-reward 환원 포함) | Score |

> 권위적 정의는 `apps/network-explorer/api-server/src/config/points.ts`의 `BASE_POINTS`. 변경 시 위 표도 함께 갱신.

### 4.1 스테이킹 점수 이원화 (Dual Staking)

| 카테고리 | 산정 방식 | 적용 | 비고 |
|---|---|---|---|
| `staking-daily` | 원금(NSN) 기준 일일 티어 점수 | 개인 ecosystem points 누적 | Ecosystem Leaderboard에서는 제외 |
| `staking-reward` | `STAKING_EMISSION_COEFF * LOG2(daily_emission_delta_mist + 1)` | Leaderboard score 전용 (ecosystem points 직접 반영 X) | LOG2 사전 적용. 주간 정산으로 leaderboard 보너스 환원 |

**Staking V2 티어** (`STAKING_V2_TIERS`, cutoff 2026-04-14):

| 원금 (NSN) | 일일 점수 |
|---|---|
| 1 ~ 500 | 1pt |
| 501 ~ 5,000 | 2pt |
| 5,001 이상 | 3pt |

`daily-nft-check.ts`가 매일 1회 액티브 스테이크 원금을 계산하여 가장 높은 단일 티어를 부여 (스택 불가).

---

## 5. 데이터 파이프라인

### 5.1 원장 기록

1. 사용자가 온체인 트랜잭션 수행.
2. 스캐너가 이벤트 또는 SQL 인덱스를 통해 활동 포착.
3. **Identity Attribution**: 트랜잭션 Sender가 등록된 지갑 목록 중 하나면 해당 identity_id로 귀속.
4. `activity_points` 행 INSERT: `(identity_id, category, activity_type, final_points, tx_digest, tx_timestamp, ...)`.
5. ON CONFLICT (`tx_digest`, `activity_type`, `event_seq`) DO NOTHING으로 멱등성 보장.
6. **Integrity guard**: `activity_points`에는 trigger 기반 가드가 설치되어 있어 UPDATE/DELETE/TRUNCATE는 명시적 `app.allow_points_mutation = 'on'` 세션 변수 없이는 차단된다 (`scripts/points-integrity-guard.sql`).

### 5.2 집계 + 스냅샷

1. **Materialized view** `ecosystem_daily_scores`: `activity_points`를 (identity_id, day, category) 단위로 집계. 5분 간격으로 refresh, scanner가 활동을 발견하면 force-refresh도 트리거. **Mission filter는 적용 안 됨** (raw 활동량 view).
2. **Daily Snapshot** `daily-snapshot.ts`: 매일 00:05 UTC에 어제 날짜에 대해 실행.
   - 사용자별 활성 미션 로드 (jsonb-tolerant decode) → 카테고리 필터링 → `base_score` 계산.
   - **Sanity gate (2026-05-04 추가)**: `filteredBaseMap` 크기가 `ecosystem_daily_scores` matview의 active user count의 절반 미만이면 (matview ≥100명 기준) 스냅샷 abort + 다음 scanLoop에서 재시도. raw `activity_points` 쿼리가 빈 결과를 반환할 때 base=0 lock-in을 막는 가드.
   - NFT health 로드 → V3 multiplier 계산 (NFT 보유자 health 누락 시 전체 abort).
   - bonus / referral / governance / staking-daily 합산.
   - cumulative anchor (`prevMap`) 로드 → SQL에서 numeric 정확도로 누적.
   - 단일 INSERT 블록 (V3 단일 경로). `multiplier_v2` / `ecosystem_score_v2` / `alliance_health` / `gp_health` 채움. legacy `multiplier` / `ecosystem_score` 컬럼은 NULL.
   - ON CONFLICT (`identity_id`, `snapshot_date`) DO NOTHING.
3. **RPC Reconcile** `rpc-reconcile.ts`: snapshot 직후 `reconcileFromRpc(yesterdayStr, ...)` fire-and-forget.
   - RPC 직접 조회로 누락 이벤트 발견 → `activity_points` bulk INSERT.
   - 갭이 채워지면 `correctSnapshotForReconciledDate(yesterdayStr)` 호출:
     - **Mission-aware**: `user_active_missions` 필터를 적용해서 새 base_score 계산 (matview 의존 제거). jsonb-array와 jsonb-string 두 포맷 모두 디코드 (defensive).
     - 변경된 사용자 행에 대해 `base_score` UPDATE + `ecosystem_score(_v2)` 재계산 (`base * mult + bonuses + ref*sf + day_staking_scaled`).
     - 같은 사용자의 해당 날짜 + 그 이후 모든 snapshot 행에 누적 델타 forward-propagation.
     - 마지막에 해당 날짜 전체 re-rank.

### 5.3 라이브 `/score` 엔드포인트

`routes/ecosystem.ts /score/:identityId`:

1. 30초 캐시된 cumulative + today/unsnapshotted **카테고리 리스트** + bonus/staking/gov/ref 데이터 한 번에 조회 (allTimeCumulative는 캐시 안 함).
2. NFT activations cache + `nft_health_state`에서 V3 multiplier 계산.
3. 캐시 외부에서 별도 쿼리로 `user_active_missions` 로드 (jsonb-tolerant decode, 항상 최신).
4. `todayCategories` × `activeMissions` 필터링 → `todayFilteredBase` 계산.
5. `unsnapshottedCategories` × `activeMissions` 필터링 → `unsnapshottedFilteredBase` (00:00~00:05 UTC 5분 갭 처리).
6. `allTimeCumulative` = `baseCumulative` + `(todayFilteredBase + unsnapshottedFilteredBase) * mult` + staking + bonus + gov + ref*sf — **mission-filtered base 사용으로 자정 lock-in과 정확히 일치**.
7. daily / weekly / allTime 점수 컴포지션 응답.

---

## 6. 보안 및 무결성

- **중복 방지**: `(tx_digest, activity_type, event_seq)` UNIQUE로 동일 이벤트 중복 차단. base 카테고리는 (identity_id, category) 일일 1회 캡 (스캐너 측 enforcement).
- **자가 전송 제외**: 동일 identity에 연결된 지갑 간 전송은 점수 적립 대상에서 자동 제외.
- **Integrity guard**: `activity_points`에 BEFORE UPDATE/DELETE/TRUNCATE trigger. 실수로 인한 데이터 손실 방지. 명시적 admin 작업은 transaction에서 `SET LOCAL app.allow_points_mutation = 'on'` 후 수행.
- **Mission-filter 일관성**: snapshot, /score (allTime 포함), rpc-reconcile이 모두 같은 `DEFAULT_MISSION_IDS` 상수와 `user_active_missions` 처리 패턴 사용. 어느 한 곳에서 빠뜨리면 base_score가 어긋난다 — 새 reader 추가 시 반드시 `config/points.ts:DEFAULT_MISSION_IDS` import + jsonb-tolerant decode 적용.
- **Live↔Snapshot 일치**: 라이브 allTime 공식이 자정에 lock-in될 값과 동일한 mission-filtered base를 사용. 자정 transition에서 사용자가 보는 allTime이 감소하지 않도록 보장.
- **Snapshot sanity gate**: 매일 00:05 UTC 스냅샷 INSERT 직전, matview 활성 사용자 수와 filteredBaseMap 크기를 비교. 과도한 차이가 있으면 abort + 다음 scanLoop에서 재시도. raw query 일시적 실패로 인한 base=0 lock-in 방지.
- **Never-decrease (단조 증가)**: 누적 원장 모델은 forward-only. 과거 데이터 임의 삭감 금지. 공식 변경 시에도 기존 행은 그대로 두고 다음 날부터 적용.
- **V2 health fail-safe**: NFT 보유자에 대해 `nft_health_state`에 행이 하나라도 없으면 snapshot 전체 skip. 다음 사이클에서 health-update 정상 동작 후 재시도.
- **Anti-stale-anchor**: reconcile이 base_score를 변경하면 동일 사용자의 미래 snapshot 행 누적 컬럼도 함께 갱신.

---

## 7. DB 스키마

### 7.1 핵심 테이블

| 테이블 | 용도 |
|---|---|
| `activity_points` | 개별 활동 원장 (immutable + ON CONFLICT 멱등 + integrity guard) |
| `ecosystem_daily_scores` (matview) | 일 단위 집계, **미션 비필터**, raw 활동량 view |
| `ecosystem_score_snapshots` | 일일 확정 점수 + 누적. Leaderboard / 차트 source of truth |
| `nft_health_state` | V3 health 추적 (identity, nft_type, health_pct, consecutive_rest_days, last_evaluated_day) |
| `user_active_missions` | 사용자별 활성 미션 셀렉션 (jsonb array, post-2026-05-04 normalize 완료) |
| `identity_to_wallet_map` | Cognito identity ↔ 지갑 주소 매핑 |
| `tx_affected_addresses` | SQL 스캐너가 참조하는 인덱서 데이터 |
| `alliance_penalties`, `alliance_first_seen` | (deprecated, V1 시대 — 운영 코드에서 더 이상 read하지 않음. 과거 인시던트 자료로 보존) |

### 7.2 `ecosystem_score_snapshots` 컬럼

| 컬럼 | 용도 | 현재 write |
|---|---|---|
| `base_score` | 미션 필터 적용된 distinct 카테고리 가중합 | ✓ |
| `multiplier` (V1) | legacy battalion-stack multiplier | ✗ (cutover 이전 역사적 값만 보존) |
| `ecosystem_score` (V1) | legacy daily 점수 | ✗ (legacy) |
| `multiplier_v2` (V3) | health-based multiplier | ✓ |
| `ecosystem_score_v2` (V3) | V3 daily 점수 | ✓ |
| `alliance_health`, `gp_health` | 스냅샷 시점의 NFT health % | ✓ |
| `bonus_total`, `referral_bonus`, `governance_bonus` | 일일 component (synthetic 제외) | ✓ |
| `is_penalized` | (deprecated, 항상 false) | ✓ (false 고정) |
| `rank` | 일일 ranking | ✓ |
| `all_time_*` | 누적 anchor (numeric arithmetic). chart/prev-anchor 전용. live는 직접 SUM 사용 | ✓ |
| `is_backfilled` | reconcile에 의해 보정된 행 표시 | ✓ |

**Reader 컨벤션**: snapshot 점수/multiplier를 읽는 모든 SQL은 반드시 `COALESCE(multiplier_v2, multiplier)` / `COALESCE(ecosystem_score_v2, ecosystem_score)`로 cross-era 호환을 유지한다. V1 컬럼은 cutover(2026-05-02) 이전 행에만 값이 있고, V3 행은 NULL이다.

---

## 8. 코드 surface map

| 책임 | 파일 |
|---|---|
| V3 multiplier 공식 | `config/ecosystem.ts calculateMultiplier()` |
| 미션 가중치 / 카테고리 등록 / `DEFAULT_MISSION_IDS` | `config/points.ts` |
| 일일 snapshot | `scanner/daily-snapshot.ts takeDailySnapshot()` |
| RPC 정합성 + snapshot 보정 | `scanner/rpc-reconcile.ts reconcileFromRpc() / correctSnapshotForReconciledDate()` |
| Health 상태 머신 | `scanner/health-update.ts updateHealthForAllNftHolders()` |
| Live `/score` (mission-filtered allTime) | `routes/ecosystem.ts:/score/:identityId` |
| Active mission upsert (jsonb-array enforced) | `routes/ecosystem.ts:PUT /active-missions/:identityId` |
| Snapshot history (차트) | `routes/ecosystem.ts:/snapshot/history/:identityId` |
| NFT activations cache | `scanner/ecosystem-cache.ts` |
| Integrity guard install | `scripts/points-integrity-guard.sql` |
| Pado weekly 정산 | `scripts/settle-pado.ts` |
| Ecosystem weekly 정산 | `scripts/settle-ecosystem.ts` |

### 일회성 backfill / repair 스크립트 (필요 시 prod에서 실행)

| 스크립트 | 용도 |
|---|---|
| `scripts/repair-v2-ecosystem-score.ts` | reconcile이 V1 컬럼만 갱신했던 시기에 stale된 `ecosystem_score_v2` 재계산 (idempotent) |
| `scripts/repair-v2-cumulative.ts` | 같은 시기에 stale된 `all_time_*` 누적 컬럼 재계산 (idempotent, 부분적) |
| `repair_cumulative_anchors.sql` (2026-05-04 ad-hoc) | `all_time_*` 전체 ledger를 running SUM으로 재구축. 615,737 rows fix. |
| `scripts/backfill-referral-bonus-day.ts` (2026-05-18 신규) | snapshot은 정상이나 daily-referral-bonus 누락된 날짜를 독립적으로 재실행. `--date YYYY-MM-DD`. fetchWithOffload로 wallet-mappings 조회. |
| `scripts/repair-referral-aggregate-bug.ts` (2026-05-18 신규) | 5/11~17 referral aggregate ON CONFLICT silent dedup으로 부분 적립된 referrer-day pair를 `ref-daily-l1-catchup:{referrerId}:{date}` suffix row로 복구. `--date --dry-run` 옵션. |
| `scripts/repair-snapshots.ts` | (legacy V1) 2026-04-01 ~ 04-05 활성화 캐시 outage 시기 V1 multiplier=0 복구 |
| `scripts/restore-alliance-penalty*.sql` | (legacy V1) 알리언스 penalty 시대 인시던트 복구 |

신규 backfill 작성 시 같은 패턴 (`--dry-run` 옵션 + 차이가 있는 행만 UPDATE + 진행률 출력)을 따른다.

---

## 9. 변경 이력 / 마이그레이션 노트

### V1 → V3 cutover (2026-05-02)

- 이전: `calculateMultiplier(activations)` — alliance 1.0x, GP 2.0x, battalion +5/unit, max 20.0
- 이후: `calculateMultiplier(health, hasAlliance, hasGp)` — health % 기반, [0, 2.0]
- DB: `multiplier`, `ecosystem_score` 컬럼은 cutover 이전 행에만 값. cutover 이후 행은 `multiplier_v2`, `ecosystem_score_v2`만 채움.
- 코드: `calculateMultiplierV2`는 backward-compat alias로 유지 (= `calculateMultiplier`).

### 2026-05-03 안정화 작업

- **버그**: `routes/ecosystem.ts /snapshot/history`가 V2 컬럼을 COALESCE 안 함 → 차트에서 5/2 점수 0으로 표시
- **버그**: `rpc-reconcile.ts`가 `ecosystem_daily_scores` matview(미션 비필터)를 읽어서 V1 컬럼만 update → 사용자별 미션 선택 무시 + V2 점수 stale + 누적 컬럼 stale
- **수정**:
  1. `/snapshot/history`에 COALESCE 적용
  2. reconcile을 mission-aware로 재작성 (matview 의존 제거)
  3. reconcile이 base 변경 시 같은 날짜 + 미래 모든 snapshot의 누적 컬럼 forward-propagate
  4. V1 path 코드 제거 (`calculateMultiplier` V1 함수, `MULTIPLIER_CONFIG`, `isV2CutoverActive` 분기, V1 INSERT 블록)
  5. 6,675개 5/2자 V2 row backfill (`ecosystem_score_v2` + `all_time_*`)

### 2026-05-04 신뢰성 인시던트 + 안정화

**증상**: 사용자 @Skymoon201095이 1,328 + 130 ≠ 1,442 불일치 보고. 조사 결과 05-03 snapshot 전체에서 7,255개 active user 행이 `base_score=0`으로 잘못 lock-in됨.

**Root cause (이중 결함)**:

1. **PUT /active-missions의 이중 인코딩 버그**: `JSON.stringify(missions)` 호출이 array를 JSON 문자열로 만들어 jsonb 컬럼에 jsonb-string-of-array로 저장됨. 13,627 entries 모두 영향.
2. **daily-snapshot.ts read 측에서 jsonb-string 미처리**: `new Set(row.missions as string[])`는 postgres.js가 반환한 JS string에 대해 character-set을 만든다. `'faucet'` 같은 카테고리는 단일 character가 아니므로 `activeMissions.has(category)` 항상 false → base 활동 모두 SKIP → snapshot에 base=0 기록.
3. **`points-scanner.ts`의 daily category cap이 날짜를 키에 포함하지 않는 잠재 버그**: `TRUNCATE` 후 재스캔 시 첫 발생 일자만 보존되는 위험. 현실에선 `points-integrity-guard.sql`이 TRUNCATE를 차단해서 발현되지 않음 (방어 다층화 검증).

**부수 발견 (V2 cutover 잔재)**:

- 9,281명 사용자에 대해 20,917 snapshot 행이 stale `all_time_base`. 04-29 ~ 05-01 transition 기간에 forward-propagation이 누락됨.
- 10,441 행 `all_time_bonus` chain mismatch.
- 8,229 행 `all_time_score` sum-invariant 위반.
- 라이브 `/score`는 SUM 직접 계산이라 영향 없음. 그러나 차트와 prev-anchor 전파 측면에서 chain 깨짐.

**또 한 가지 구조적 결함 (Live↔Snapshot mission filter 불일치)**:

라이브 allTime 공식이 matview의 raw `base_score` (미션 비필터)를 사용. snapshot은 mission-filtered. 사용자가 자기 미션 외 카테고리(예: gostop-crash)를 플레이하면, 라이브에서는 잠깐 그 만큼 부풀어 보였다가 자정에 lock-in되며 사라짐 → never-decrease invariant 위반.

**수정 (2026-05-04)**:

1. `JSON.stringify` → `pointsDb.json()`으로 PUT handler fix.
2. `daily-snapshot.ts` / `routes/ecosystem.ts` / `rpc-reconcile.ts` 모두 jsonb-string과 jsonb-array 양쪽 포맷 디코드 가능하도록 defensive read.
3. DB migration: 13,627 jsonb-string entries → native jsonb arrays 정상화.
4. `daily-snapshot.ts`에 matview vs filteredBaseMap sanity gate 추가 (활성 사용자 100+ 기준 50% 미만이면 abort + 재시도).
5. `routes/ecosystem.ts` 라이브 allTime이 mission-filtered base 사용하도록 refactor + unsnapshotted yesterday도 mission-filtered.
6. `DEFAULT_MISSION_IDS` 단일 상수 (`config/points.ts`)로 통합. 3곳 중복 제거.
7. **즉시 복구**: 7,255 affected 사용자의 05-03 snapshot `base_score`/`ecosystem_score_v2`/`all_time_*` 보정 (38,172pt 복원).
8. **누적 ledger 일괄 재구축**: `repair_cumulative_anchors.sql`로 615,737 행 running SUM rebuild. 모든 chain invariant 위반 0으로 정상화.

**배운 점 (Lessons)**:

- **다층 방어 작동 확인**: integrity guard가 TRUNCATE를 차단했기 때문에 `detectChainReset()` 코드의 가설적 daily-cap 버그가 실재화되지 않음. 가드는 invariant 강제만이 아니라 잠재 버그를 무력화하는 안전망.
- **Live와 Lock-in의 공식이 같아야 함**: 어느 한 쪽이라도 다른 데이터 소스(matview vs activity_points) 또는 다른 필터(unfiltered vs mission-filtered)를 사용하면 자정 transition에서 차이가 노출됨. 단일 필터 함수와 단일 mission constant로 강제.
- **postgres.js + jsonb의 함정**: jsonb 컬럼에 string을 INSERT하면 jsonb-string으로 저장됨. JS array를 jsonb array로 보내려면 `.json()` helper 또는 native `${array}` placeholder 사용 필요. 이중 인코딩은 reader 측에서 character-iteration 같은 미묘한 silent failure를 만든다.
- **사용자 보고가 last-line monitoring**: 자동 sanity check가 없는 한, 사용자가 직접 누적 변화를 추적해서 이상을 발견하기 전까지 silent fail이 가능. snapshot sanity gate를 추가했지만, 정기 invariant audit (예: 매일 anchor chain 검증) 도입을 follow-up으로 권장.

### 2026-05-04 안정화 (Sprint 후속)

상기 인시던트 수정 직후 다음 3개 항목을 추가 배포 (silent-failure 가능성 제거):

1. **일일 invariant audit (`scanner/invariant-audit.ts`)**
   - 매 scanLoop 종료 시 `runInvariantAuditDaily()` fire-and-forget 호출.
   - 함수 내부에서 `lastAuditDate === today` 게이트로 1일 1회만 실제 실행.
   - 검사 항목:
     - `anchor_chain_consistency`: `all_time_base[N] = all_time_base[prev] + base_score[N] * mult[N]`
     - `sum_invariant`: `all_time_score = SUM(5 components)`
     - `monotonic_all_time_score`: 같은 사용자의 all_time_score는 단조 증가
   - 위반 카운트가 임계(WARN_THRESHOLD=5) 초과 시 ALERT 로그.
   - **snapshot/reconcile 상태와 독립적**으로 실행 — snapshot이 health 미수신 등으로 abort되더라도 audit은 계속 동작.

2. **`points-scanner.ts` daily cap 키에 tx 날짜 포함**
   - 이전: `${identityId}::${category}` → 동일 (id, category)는 process-day 동안 한 번만 인정.
   - 이후: `${identityId}::${category}::${txDate}` → tx의 UTC 일자별로 캡 적용.
   - `warmUpDailyCategoryCap()` 도 같은 키 포맷 사용.
   - integrity guard가 TRUNCATE를 차단하고 있지만 다층 방어. 만약 가드가 우회되거나 backfill 시나리오에서 historical 이벤트를 재처리할 때, 첫 발생 일자만 보존되는 잠재 버그 차단.

3. **`reconcileFromRpc`가 갭 유무와 관계없이 `correctSnapshotForReconciledDate` 호출**
   - 이전: `if (totalFilled > 0)` 게이트로 갭이 있을 때만 보정.
   - 이후: 매번 보정 함수 실행 (matview refresh는 totalFilled > 0일 때만).
   - 사유: 2026-05-03 사고처럼 activity_points는 정상이지만 reader-side mission-decode 버그로 snapshot에 잘못된 base가 lock-in된 경우, 갭이 0이어서 보정이 트리거되지 않았음. 이제 reconcile이 매일 마지막 audit 단계를 겸함.
   - `correctSnapshotForReconciledDate`는 `fb.new_base > s.base_score` 조건으로 단조 증가 방향만 수정 (idempotent).
   - postgres.js 파라미터화 함정 (jsonb vs text[] COALESCE 충돌) 회피를 위해 default missions를 SQL fragment로 inline.

### 2026-05-11 daily-mission scanner 제거

**상황**: `scanner/daily-mission.ts`의 `calculateDailyMissions()`가 export만 되고 어디서도 import되지 않은 dead code였음. 첫 행동 보너스(5pt/category)와 tier bonus(+3/+5/+10pt)는 설계만 존재하고 실제로는 한 번도 운영 적립된 적이 없음. UI(`DailyMissionsCard`, `useDailyMissions`)도 tier 보너스를 표시하지 않음.

**제거 범위**:
1. `apps/network-explorer/api-server/src/scanner/daily-mission.ts` 파일 삭제.
2. `apps/network-explorer/api-server/src/config/points.ts`의 `BASE_POINTS['daily-mission']` 항목 제거 (dex-first/tier-3/all-clear 등). 어떤 reader도 이 entry를 참조하지 않음.
3. `SCORE_CATEGORIES`의 `'daily-mission'`은 **유지**. 과거 `grant-may4-outage-comp.ts` 등 일회성 보상 스크립트가 INSERT한 historical row가 SUM에 계속 포함되어 사용자별 all-time pts가 감소하지 않도록 보호.
4. 다른 exclusion 리스트(`excluded-categories.ts`, `settle-ecosystem.ts`, `daily-snapshot.ts`, `rpc-reconcile.ts`, `nasun-metrics.ts`, `ecosystem-matview-migration.ts` 등)의 `'daily-mission'` 문자열도 그대로 유지.

**불변식 보호**:
- All-time ecosystem pts 단조 증가: historical `daily-mission` row가 그대로 합산되어 변동 없음.
- UI today pts: live `/score`는 이미 `activity_points` 실시간 SUM (5.3절 참조). today categories 쿼리는 line 566에서 `daily-mission`을 이미 제외하고 있어 영향 없음.
- 체크리스트 ✓: UI는 `useDailyMissions`가 직접 RPC로 검사하므로 backend scanner와 무관.

**검증**: `pnpm tsc --noEmit`으로 api-server 타입 체크 통과. 다른 import 끊김 없음.

### 2026-05-12 RPC 503 mitigation (staking-daily 적립 신뢰성)

**배경**: 자정 day-rollover 시점에 explorer-api `scanLoop`이 `runDailyNftChecks` 진입(utcMinutes gate 없음, [points-scanner.ts:331](../apps/network-explorer/api-server/src/scanner/points-scanner.ts#L331)) → `fetchIdentityStakeData`가 14k staking 식별자에 대해 `suix_getStakes`를 **`RPC_CONCURRENCY=50`** 동시 호출 → fullnode 메모리 폭증 → `check-fullnode-memory.sh` (`*/5`, 16GB threshold)가 즉시 restart 트리거 → ~60-90초 RPC downtime 동안 explorer-api의 모든 RPC caller가 503 폭격 → `hasPartialFailure=true`로 `staking-daily`/`staking-reward` 적립 skip. 2026-05-08 14k staker가 하루 1pt를 잃은 사고의 직접 원인 클래스.

**3-fix coordinated**:

1. **Cron 시각 분산** (dev EC2 crontab): `fullnode-restart.sh` 의도적 restart를 `0 */6` → `30 */6` UTC. critical Monday window(00:00 leaderboard reset / 00:05 snapshot / 00:15 settle-pado / 00:20 settle-ecosystem)가 모두 종료된 후 restart fire하도록 격리. settle-pado/settle-ecosystem/daily-snapshot/daily-referral-bonus 모두 fullnode RPC 의존이 0임을 grep으로 검증 → restart 시각 이동이 정산 파이프라인과 모순되지 않음 확인.

2. **`RPC_CONCURRENCY` 50 → 20** ([daily-nft-check.ts:215](../apps/network-explorer/api-server/src/scanner/daily-nft-check.ts#L215)): 14k× `suix_getStakes` 동시 호출량을 60% 감소 → fullnode 메모리 burst 약화 → 16GB watchdog threshold 도달 가능성 감소. 처리 시간 ~6분 → ~15분으로 증가하나 scanLoop 외부 호출이라 timeout 무관. partial-failure 시 `stakingRetryNeeded`로 daily-gate 유지 + 다음 scanLoop(~60s) ON CONFLICT DO NOTHING 재시도가 멱등 보장.

3. **`rpc.ts` 중앙집중 retry+backoff** ([rpc.ts:17-110](../apps/network-explorer/api-server/src/rpc.ts#L17-L110)): 모든 `rpcCall<T>(method, params)` caller가 자동으로 흡수.
   - 502/503/504 + AbortError(timeout) + TypeError(fetch network failure) → 최대 3회 시도
   - backoff: 500ms → 1500ms → 4500ms × ±20% jitter
   - nginx `Retry-After` 헤더 존재 시 우선(max 5s cap) — 실제 504 응답이 `Retry-After: 5`를 보내므로 5초 cap에 자주 도달
   - JSON-RPC application error (`json.error.code`) 및 retryable 외 4xx → 즉시 throw (non-idempotent)
   - retry 시도/실패를 `console.warn`으로 로깅 (silent failure 방지)
   - `daily-nft-check.ts`의 per-wallet ad-hoc retry는 제거. 중복 회피 + 모든 RPC caller(rpc-reconcile, rpc-reconcile-identity, detectChainReset 등)가 동일하게 보호받음

**관측 (배포 직후 12:30 UTC cron fire)**:
- cron이 정확히 `:30`으로 이동: `[2026-05-12 12:30:01 UTC] Restarting fullnode...`
- nginx 503 burst: 5/12 06:00 (변경 전) 35,232건/3min → 5/12 12:30 (변경 후) ~1,727건/3min. **약 95% 감소**
- explorer-api `RPC suix_queryEvents 503, retry 1/2 in 5000ms` retry warn 로그 첫 등장 확인. retry 1/2 → 2/2 단계적 시도 정상 작동
- retry 실패 잔재(1,725건/min)는 `fullnode-restart.sh` 주석의 "RPC downtime ~60-90s"와 일치. Fix 3 retry 윈도우(5s×3 = ~15s)로는 단일 restart를 fully cover 못 함 → daily-nft-check의 partial-failure → 다음 scanLoop 재시도 layer가 최종 적립 보장

**불변식 영향 (검토 완료, [pado-score-leaderboard.md] + [ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md] 교차 검증)**:
- Points 단조 증가: cron/concurrency/retry는 공식 미터치, INSERT-only ledger 보존
- Live ↔ snapshot lock-in 일치: snapshot/`/score` 모두 PG-only, fullnode RPC 무관
- Pado Score Leaderboard: prod EC2 chat-server 운영 + SQLite + DeepBook. devnet fullnode RPC 무관, 영향 0
- settle-pado(Mon 00:15) / settle-ecosystem(Mon 00:20): S3/HTTP/PG 의존만, fullnode RPC 0. 신 cron(:30)과 충돌 없음
- 매시 :30 cron(`indexer-db-reinit`, `backfill-snapshot-day`)이 fullnode-restart와 같은 분에 발화하지만 Fix 3 retry로 transparent 흡수

**미해결 anomaly (별도 추적)**:
- 정각(:00) 503 burst의 진짜 트리거는 `check-fullnode-memory.sh` watchdog일 가능성. Fix 2로 14k getStakes 메모리 burst가 약해지면 자정 burst도 사라질 것. 다음 자정(00:00 UTC = KST 09:00) 측정이 결정적

### 2026-05-17 DDB ↔ PostgreSQL ban 비동기화 재발

**증상**: 사용자가 alliance health 0% / mission 입력 안 됨을 보고. UserProfiles(DynamoDB)에는 `banned=false`이지만 PostgreSQL `activity_points.flagged=true` + `banned_users` row 존재. health-update가 flagged row를 제외해 health 가 점진적 decay.

**Root cause**: 2026-05-07 false-positive PG-only ban (UserProfiles 동기 없이 `ban-users.ts`가 PG 측에만 row 작성)이 누적되어 silent degrade. ban 진단 시 항상 양쪽을 봐야 했으나 운영 매뉴얼은 DDB만 강조.

**복구**: 229 rows unflag + banned_users 해제. 향후 ban 진단 체크리스트에 `SELECT * FROM banned_users WHERE identity_id=...` 강제 (project_2026_05_17_ddb_pg_ban_async_recurrence.md).

> **Why this keeps coming back**: ban 작업이 2개 storage layer(DDB UserProfiles + PG banned_users + PG activity_points.flagged)에 걸쳐있고, 어느 쪽 한 곳만 갱신하면 silent inconsistency가 health/leaderboard로 새어나옴. 단일 트랜잭션 보장이 불가능한 cross-store 구조에서 매뉴얼 체크리스트로 보완하는 것이 현재 차선.

### 2026-05-18 Referral / Snapshot lockout (P0)

**증상**: 사용자 sunominq가 referee 활성화 후 referrer bonus 0건 보고. 조사 결과 system-wide referral-bonus가 며칠간 0건이었음.

**Root cause (이중 결함)**:
1. **5/17 snapshot fail-safe lockout**: 10명의 신규 NFT holder가 mid-day에 activate되어 health-update가 그날 unlock 상태였음에도 takeDailySnapshot이 fail-safe로 abort 후 `lastSnapshotDate`를 영구 set. daily-referral-bonus가 snapshot dependency로 인해 영구 block.
2. **`REFERRAL_REWARD_ENABLED=false`** 환경변수가 따로 발견됨. true로 토글 안 됨.

**복구**:
- daily-snapshot에 self-heal 로직 추가 (mid-day activation으로 holder count가 증가하면 다음 cycle에서 회복 시도)
- 환경 flag flip
- 5/16, 5/17 backfill을 신규 `backfill-referral-bonus-day.ts` 스크립트로 idempotent 재실행

> **Why a brand new "backfill-referral-bonus-day" script**: 기존 backfill 스크립트들은 snapshot 자체를 재계산하는데, 이번 케이스는 snapshot은 정상이나 referral batch만 누락이었음. snapshot을 건드리면 단조 증가 invariant 위반 위험. snapshot-readonly + referral-write-only 분리가 더 안전 (project_2026_05_18_referral_snapshot_lockout.md, feedback_no_speculation_drift.md).

> **Why a "repair-referral-aggregate-bug.ts"**: 5/11 daily-referral-bonus 도입 시 `tx_digest = ref-daily-l1:{referrerId}:{date}` 형식이었는데 referee가 여러 명일 때 같은 unique-key tuple로 INSERT가 들어가 ON CONFLICT DO NOTHING이 silent dedup. 첫 referee만 살고 나머지 무시. `ref-daily-l1-catchup:{referrerId}:{date}` suffix로 catchup row를 분리 작성하는 repair 스크립트 추가 (feedback_unique_conflict_silent_dedup.md).

---

- **Monotonic-increase watermark**: 사용자별 historical max allTime을 별도 테이블에 유지하고 라이브 응답이 그보다 작아지지 않도록 floor 적용 (deploy 시 단발성 정상화 충격 흡수용).
- **snapshot 컬럼 명 통일**: V1 컬럼이 archival-only가 된 만큼, 새 컬럼명(`multiplier`, `ecosystem_score`)으로 V3 데이터를 재정의하는 마이그레이션을 검토. 단, 라이브 데이터 마이그레이션이라 별도 sprint 필요.
- **`alliance_penalties` / `alliance_first_seen` 테이블**: 더 이상 write/read 없음. archival 보존 중. 일정 기간 후 DROP 검토.
- **DB 레벨 invariant trigger**: `ecosystem_score_snapshots`의 `all_time_score` 컬럼에 BEFORE INSERT trigger를 추가해서 row 단위로 `all_time_score = sum(components)` 강제.
- **PUT /active-missions cap 일치**: 백엔드 validation 10 → UI cap 7과 동일하게 정렬.
- **frontend missionRegistry와 backend BASE_POINTS 통합**: shared package 또는 backend → frontend codegen.
- **alert 채널 통합**: 현재 invariant audit ALERT는 stderr 로그. PagerDuty/Slack 같은 능동 알림 채널 연결.
