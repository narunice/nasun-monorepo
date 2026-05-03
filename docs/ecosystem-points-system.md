# Nasun Ecosystem Points System Technical Specification

**상태**: 운영 중 (Production, V3 단일 경로)
**최근 업데이트**: 2026-05-03 (V1 multiplier 경로 제거, mission-aware reconcile + 누적 컬럼 forward-propagation 도입, snapshot 스키마 V2 단일 write)
**핵심 경로**:
- Backend API: `apps/network-explorer/api-server/src/routes/ecosystem.ts`
- Multiplier Config: `apps/network-explorer/api-server/src/config/ecosystem.ts`
- Points Config: `apps/network-explorer/api-server/src/config/points.ts`
- Scanners:
  - `scanner/points-scanner.ts` (60초 이벤트 폴링 + 일 1회 snapshot/reconcile 트리거)
  - `scanner/daily-snapshot.ts` (일일 점수 확정, V3 단일 경로)
  - `scanner/rpc-reconcile.ts` (RPC 야간 정합성 + mission-aware snapshot 보정)
  - `scanner/health-update.ts` (NFT health 일일 갱신)
  - `scanner/daily-nft-check.ts` (스테이킹 V2 + Genesis passive)
  - `scanner/wallet-transfer-scanner.ts`, `chat-scanner.ts`, `faucet-scanner.ts`
- Frontend Hook: `apps/nasun-website/frontend/src/hooks/useDailyMissions.ts`

**관련 시스템**:
- 주간 Pado DEX 트레이딩 리더보드 → 정산 시 본 시스템의 `activity_points`에 `ecosystem-bonus-pado` 카테고리로 적립 ([pado-score-leaderboard.md](pado-score-leaderboard.md))
- 주간 Nasun Ecosystem Leaderboard → 본 시스템의 `activity_points`를 직접 조회

---

## 1. 시스템 목적

나선(Nasun) 에코시스템 활동을 정량화하여 보상하는 시스템. 사용자 충성도를 측정하고, NFT 보유자(Alliance / Genesis Pass)에게 multiplier 혜택을 제공.

V3에서 변경된 핵심 원칙:

- **사용자 주도 미션 구성**: 사용자가 자신이 추구할 데일리 미션을 직접 선택. 같은 행동을 해도 사용자마다 base_score 구성이 다름.
- **단일 경로(single path)**: V3 health-based multiplier만 사용. V1 additive battalion-stack 공식은 코드에서 제거됨 (cutover 2026-05-02).
- **Mission-aware 보정**: 모든 base_score 계산은 `user_active_missions` 필터를 거침. snapshot, /score 라이브, RPC 야간 reconcile이 모두 같은 필터 로직을 공유.

---

## 2. 아키텍처 개요

```
온체인 활동
    ├─ event-based scanner (points-scanner.ts) ─┐
    └─ indexer SQL scanner (wallet-transfer)    │
                                                 ▼
                                        activity_points
                                          (개별 활동 원장)
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
              ecosystem_daily_scores       /score 라이브        daily-snapshot
                  (matview, 미션 비필터)   (mission-aware)      (00:05 UTC)
                                                 │                  │
                                                 │                  ▼
                                                 │       ecosystem_score_snapshots
                                                 │            (불변 일일 원장)
                                                 │                  │
                                                 ▼                  ▼
                                          rpc-reconcile      Leaderboard / 누적 표시
                                          (mission-aware
                                           snapshot 보정)
```

### 2.1 Backend (포인트 엔진)

- **하이브리드 스캐닝**:
  - Event-based: `points-scanner.ts`가 60초 간격으로 Sui 이벤트 구독.
  - Indexer-SQL: `wallet-transfer` 등 대용량 카테고리는 인덱서의 `tx_affected_addresses` 직접 조회.
- **포인트 카테고리 두 종류**:
  - **Base categories**: 카테고리당 하루 최대 1회 인정 (DEX 거래, 게임 참여, 지갑 전송, faucet 등). `final_points`는 항상 1, 점수 계산은 COUNT(DISTINCT category)/day.
  - **Score categories**: `final_points`가 그대로 점수에 가산 (governance, referral-bonus, daily-mission, staking, ecosystem-bonus-*).
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

- `base_score`: 사용자가 활성화한 미션 중 오늘 수행한 distinct 카테고리 수의 가중합 (`pado-dex` weight=2, 그 외 weight=1).
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
all_time_bonus           = prev.all_time_bonus  + bonus_total_incl_synthetic
all_time_gov             = prev.all_time_gov    + governance_bonus
all_time_referral_scaled = prev.all_time_ref    + referral_bonus * sf
all_time_staking_scaled  = prev.all_time_stak   + staking_delta * multiplier
all_time_score           = SUM(위 5개)
```

라이브 `/score` 엔드포인트의 "All Time" 표시는 `SUM(base_score * COALESCE(multiplier_v2, multiplier))` 등으로 매번 계산해서 정확하지만, 일일 snapshot 행의 `all_time_*`도 `daily-snapshot.ts`의 prev anchor 전파를 위해 항상 일관되게 유지되어야 한다.

> **Anchor 전파 일관성 (중요)**: reconcile이 이전 날짜의 `base_score`를 갱신하면 `rpc-reconcile.ts`의 `correctSnapshotForReconciledDate()`가 자동으로 같은 `(new_base - old_base) * multiplier` 델타를 해당 날짜와 그 이후 모든 snapshot 행의 `all_time_base` / `all_time_score`에 더한다. 이 forward-propagation이 빠지면 다음 날 snapshot이 stale anchor를 상속받아 영구적인 누적 오차가 발생한다.

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

| identity_id | missions (text[]) |
|---|---|
| `ap-northeast-2:...` | `['pado-dex','wallet-transfer','gostop-crash','gostop-mines']` |

- 행이 없거나 빈 배열이면 `DEFAULT_MISSION_IDS` 사용 (`faucet`, `wallet-transfer`, `pado-dex`, `gostop-lottery`, `gostop-scratchcard`, `gostop-numbermatch`).
- 모든 base_score 계산 지점이 같은 fallback을 적용:
  - `routes/ecosystem.ts /score` 라이브 응답
  - `daily-snapshot.ts` 일일 INSERT
  - `rpc-reconcile.ts correctSnapshotForReconciledDate` 야간 보정

**미션 추가/제거 시 안전성**: 새 미션 카테고리를 추가하거나 기존을 제거해도 다음 조건만 지키면 시스템이 깨지지 않는다:
1. 새 카테고리는 `BASE_POINTS` (`config/points.ts`)에 등록한다 (스캐너가 활동을 기록하도록).
2. 카테고리가 `staking-daily`/`referral-bonus`/`daily-mission`/`ecosystem-passive` 또는 `ecosystem-bonus-%`에 해당하지 않는 일반 base 카테고리라면, snapshot/reconcile/score 모두가 자동으로 `user_active_missions`로 필터링한다.
3. 프론트엔드 미션 레지스트리(`apps/nasun-website/frontend/src/sections/uju/missions/missionRegistry.ts`)에 추가하면 사용자가 선택할 수 있게 된다.

기본 미션 목록을 변경하려면 다음 두 곳을 함께 수정:
- `daily-snapshot.ts` `DEFAULT_MISSION_IDS`
- `rpc-reconcile.ts correctSnapshotForReconciledDate` `defaultMissions`
- `routes/ecosystem.ts` `DEFAULT_MISSION_IDS` (라이브 응답)
- (앞으로 단일 상수로 모으기 권장)

---

## 4. 미션 카테고리 (현재 운영 중)

| 카테고리 | 활동 | 종류 |
|---|---|---|
| `pado-dex` | DEX 주문 / 시장가 / 취소 | Base (weight 2) |
| `wallet-transfer` | 다른 지갑으로 자산 전송 (linked wallet 자동 제외) | Base (1) |
| `faucet` | Faucet 토큰 청구 | Base (1) |
| `pado-prediction`, `pado-perp`, `pado-lending` | Pado 파생/예측/대출 | Base (1) |
| `gostop-lottery`, `gostop-scratchcard`, `gostop-numbermatch`, `gostop-mines`, `gostop-crash` | GoStop 게임 | Base (1) — 게임당 독립 카운트 |
| `chat` | 채팅 참여 | Base (1) |
| `baram-ai`, `baram-executor` | Baram AI 정산 | Base (1) |
| `staking` | 첫 위임 | Base (1) |
| `staking-daily` | 액티브 스테이크 일일 티어 | Score (티어제, 4.1) |
| `staking-reward` | 일일 emission delta (LOG2 사전 적용) | Score (`STAKING_EMISSION_COEFF=0.07`, cutoff 2026-04-21) |
| `governance` | 제안서 vote/delegate | Score (10/5) |
| `daily-mission` | 첫 행동 보너스 + 티어 보너스 | Score (변동) |
| `referral-bonus` | 추천인 보너스 | Score (변동, sf=0.5 적용) |
| `ecosystem-bonus-creator-posts` | X 게시물 큐레이션 | Score (1–30) |
| `ecosystem-bonus-bugreport` / `-feedback` | 버그/피드백 보너스 | Score (1–5) |
| `ecosystem-bonus-game` | 게임 이벤트 보너스 | Score |
| `ecosystem-bonus-pado` | 주간 Pado 트레이딩 정산 | Score |
| `ecosystem-bonus-leaderboard` | 주간 ecosystem 리더보드 정산 | Score |

> 권위적 정의는 `apps/network-explorer/api-server/src/config/points.ts`의 `BASE_POINTS`. 변경 시 위 표도 함께 갱신.

### 4.1 스테이킹 점수 이원화 (Dual Staking)

| 카테고리 | 산정 방식 | 적용 | 비고 |
|---|---|---|---|
| `staking-daily` | 원금(NSN) 기준 일일 티어 점수 | 개인 누적 | Ecosystem Leaderboard에서 제외 |
| `staking-reward` | `STAKING_EMISSION_COEFF * LOG2(daily_emission_delta_mist + 1)` | 개인 + 리더보드 | LOG2 사전 적용 |

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

### 5.2 집계 + 스냅샷

1. **Materialized view** `ecosystem_daily_scores`: `activity_points`를 (identity_id, day, category) 단위로 집계. 5분 간격으로 refresh, scanner가 활동을 발견하면 force-refresh도 트리거.
2. **Daily Snapshot** `daily-snapshot.ts`: 매일 00:05 UTC에 어제 날짜에 대해 실행.
   - 사용자별 활성 미션 로드 → 카테고리 필터링 → `base_score` 계산.
   - NFT health 로드 → V3 multiplier 계산.
   - bonus / referral / governance / staking-daily 합산.
   - cumulative anchor (`prevMap`) 로드 → SQL에서 numeric 정확도로 누적.
   - 단일 INSERT 블록 (V3 단일 경로). `multiplier_v2` / `ecosystem_score_v2` / `alliance_health` / `gp_health` 채움. legacy `multiplier` / `ecosystem_score` 컬럼은 NULL.
   - ON CONFLICT (`identity_id`, `snapshot_date`) DO NOTHING.
3. **RPC Reconcile** `rpc-reconcile.ts`: snapshot 직후 `reconcileFromRpc(yesterdayStr, ...)` fire-and-forget.
   - RPC 직접 조회로 누락 이벤트 발견 → `activity_points` bulk INSERT.
   - 갭이 채워지면 `correctSnapshotForReconciledDate(yesterdayStr)` 호출:
     - **Mission-aware**: `user_active_missions` 필터를 적용해서 새 base_score 계산 (matview 의존 제거).
     - 변경된 사용자 행에 대해 `base_score` UPDATE + `ecosystem_score(_v2)` 재계산 (`base * mult + bonuses + ref*sf + day_staking_scaled`).
     - 같은 사용자의 해당 날짜 + 그 이후 모든 snapshot 행에 누적 델타 forward-propagation.
     - 마지막에 해당 날짜 전체 re-rank.

### 5.3 라이브 `/score` 엔드포인트

`routes/ecosystem.ts /score/:identityId`:

1. 30초 캐시된 cumulative + today 데이터 한 번에 조회.
2. NFT activations cache + `nft_health_state`에서 V3 multiplier 계산.
3. 별도 쿼리로 `user_active_missions` 로드 (캐시 외부, 항상 최신).
4. `todayCategories` × `activeMissions` 필터링 → `todayFilteredBase` 계산.
5. daily / weekly / allTime 점수 컴포지션 응답.

---

## 6. 보안 및 무결성

- **중복 방지**: `(tx_digest, activity_type, event_seq)` UNIQUE로 동일 이벤트 중복 차단. base 카테고리는 (identity_id, category) 일일 1회 캡 (스캐너 측 enforcement).
- **자가 전송 제외**: 동일 identity에 연결된 지갑 간 전송은 점수 적립 대상에서 자동 제외.
- **Mission-filter 일관성**: snapshot, /score, rpc-reconcile이 모두 같은 mission filter + 같은 default fallback 사용. 어느 한 곳에서 빠뜨리면 base_score가 어긋난다 — 새 reader 추가 시 반드시 같은 패턴 적용.
- **Never-decrease (단조 증가)**: 누적 원장 모델은 forward-only. 과거 데이터 임의 삭감 금지. 공식 변경 시에도 기존 행은 그대로 두고 다음 날부터 적용.
- **V2 health fail-safe**: NFT 보유자에 대해 `nft_health_state`에 행이 하나라도 없으면 snapshot 전체 skip. 다음 사이클에서 health-update 정상 동작 후 재시도.
- **Anti-stale-anchor**: reconcile이 base_score를 변경하면 동일 사용자의 미래 snapshot 행 누적 컬럼도 함께 갱신.

---

## 7. DB 스키마

### 7.1 핵심 테이블

| 테이블 | 용도 |
|---|---|
| `activity_points` | 개별 활동 원장 (immutable + ON CONFLICT 멱등) |
| `ecosystem_daily_scores` (matview) | 일 단위 집계, **미션 비필터** — 라이브 reader는 이 값을 mission filter와 함께 사용 |
| `ecosystem_score_snapshots` | 일일 확정 점수 + 누적. Leaderboard / 차트 source of truth |
| `nft_health_state` | V3 health 추적 (identity, nft_type, health_pct, consecutive_rest_days, last_evaluated_day) |
| `user_active_missions` | 사용자별 활성 미션 셀렉션 (text[]) |
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
| `bonus_total`, `referral_bonus`, `governance_bonus` | 일일 component | ✓ |
| `is_penalized` | (deprecated, 항상 false) | ✓ (false 고정) |
| `rank` | 일일 ranking | ✓ |
| `all_time_*` | 누적 anchor (numeric arithmetic) | ✓ |
| `is_backfilled` | reconcile에 의해 보정된 행 표시 | ✓ |

**Reader 컨벤션**: snapshot 점수/multiplier를 읽는 모든 SQL은 반드시 `COALESCE(multiplier_v2, multiplier)` / `COALESCE(ecosystem_score_v2, ecosystem_score)`로 cross-era 호환을 유지한다. V1 컬럼은 cutover(2026-05-02) 이전 행에만 값이 있고, V3 행은 NULL이다.

---

## 8. 코드 surface map

| 책임 | 파일 |
|---|---|
| V3 multiplier 공식 | `config/ecosystem.ts calculateMultiplier()` |
| 미션 가중치 / 카테고리 등록 | `config/points.ts BASE_POINTS` |
| 일일 snapshot | `scanner/daily-snapshot.ts takeDailySnapshot()` |
| RPC 정합성 + snapshot 보정 | `scanner/rpc-reconcile.ts reconcileFromRpc() / correctSnapshotForReconciledDate()` |
| Health 상태 머신 | `scanner/health-update.ts updateHealthForAllNftHolders()` |
| Live `/score` | `routes/ecosystem.ts:/score/:identityId` |
| Snapshot history (차트) | `routes/ecosystem.ts:/snapshot/history/:identityId` |
| NFT activations cache | `scanner/ecosystem-cache.ts` |
| Pado weekly 정산 | `scripts/settle-pado.ts` |
| Ecosystem weekly 정산 | `scripts/settle-ecosystem.ts` |

### 일회성 backfill / repair 스크립트 (필요 시 prod에서 실행)

| 스크립트 | 용도 |
|---|---|
| `scripts/repair-v2-ecosystem-score.ts` | reconcile이 V1 컬럼만 갱신했던 시기에 stale된 `ecosystem_score_v2` 재계산 (idempotent) |
| `scripts/repair-v2-cumulative.ts` | 같은 시기에 stale된 `all_time_*` 누적 컬럼 재계산 (idempotent) |
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

### 향후 개선 후보

- `DEFAULT_MISSION_IDS`를 단일 상수로 통합 (현재 daily-snapshot, rpc-reconcile, routes/ecosystem 3곳에 중복).
- snapshot 컬럼 명 통일: V1 컬럼이 archival-only가 된 만큼, 새 컬럼명(`multiplier`, `ecosystem_score`)으로 V3 데이터를 재정의하는 마이그레이션을 검토. 단, 라이브 데이터 마이그레이션이라 별도 sprint 필요.
- `alliance_penalties` / `alliance_first_seen` 테이블: 더 이상 write/read 없음. archival 보존 중. 일정 기간 후 DROP 검토.
