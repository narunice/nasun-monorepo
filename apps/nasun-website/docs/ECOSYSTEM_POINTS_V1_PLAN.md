# Ecosystem Points V1 - 구현 계획

## 비전

Ecosystem Points를 나선 생태계의 **유일한 통합 포인트 시스템**으로 정식 런칭한다.
기존 activity points는 실험적 단계였으며, 이번이 첫 정식 출시이다.

```
Ecosystem Points = (Base Score x Multiplier) + Bonus Points
```

---

## 확정 사항

### Multiplier

| NFT | 배율 |
|-----|------|
| 없음 | 0x (disabled) |
| Alliance만 | 1x |
| Genesis Pass | 2x |
| Battalion | 5x/개 (잠정, 복수 보유 시 누적) |

- 공식: `max(Alliance 1x, Genesis 2x) + Battalion(5x * 개수)`, cap 20x
- 예: Genesis + Battalion 3개 = 2 + 15 = 17x

### NFT 활성화 캐시 전략

전체 캐시는 12시간 간격으로 갱신 (비용 최소화). 즉시성은 개별 sync로 보장.

| 방식 | 트리거 | 범위 |
|------|--------|------|
| 정기 갱신 | 12시간 간격 | 전체 사용자 |
| 자동 sync | Lambda activate/deactivate 완료 시 | 해당 사용자 1명 |
| 수동 sync | 프론트엔드 "Refresh" 버튼 | 해당 사용자 1명 |

- 스냅샷은 하루 1회이므로 캐시 지연으로 점수 손실 없음
- 프론트엔드 표시만 일시적 지연 가능, sync로 즉시 해소

### Pado 리더보드 포인트 풀

기존 Pado 리더보드 `points` 모드(거래량+PnL+다양성 종합) 그대로 활용.

| 풀 | 기간 | 규모 |
|----|------|------|
| Pado 주간 | 7일 | 50,000 pts |
| Pado 월간 | 30일 | 100,000 pts |

**분배: Top N + 나머지 2단계** (141명 규모에 적합)

| 구간 | 대상 | 인당 (50K 풀) | 인당 (100K 풀) |
|------|------|--------------|---------------|
| Top 15 | 1-15위 | 2,000 | 4,000 |
| 나머지 | 16위~ | 균등 분배 | 균등 분배 |

- Top 15 합계: 30,000 (60%). 나머지 20,000 (40%) 균등.
- 141명 기준: 16-141위 = 126명, 인당 약 159 (50K 풀)
- 사용자 1000명 초과 시 6-티어 구조로 확장

### Games USDC -> Points 환산

**규칙**: 1 USDC = 1 Bonus Point, **개인당 주간 캡 600 pts**

- 전 게임 통일 (즉석복권, 넘버매치, 주간 로또)
- 주간 로또 잭팟도 600pt 캡 적용
- USDC 금액은 이벤트 parsed_json에서 파싱 (6 decimal, /1,000,000)

### 스테이킹 일일 점수

**데브넷 단계: 단순 flat bonus로 시작**

- 스테이킹 활성 상태이면 일 1pt (base_score에 포함, multiplier 적용됨)
- Identity 레벨 합산 (다중 지갑의 스테이킹 합산 후 "스테이킹 여부"만 판단)
- daily-nft-check.ts에 함수 추가 (별도 모듈 불필요)
- 메인넷에서 토큰에 실제 가치가 생기면 log2 anti-farming 공식으로 전환

### Early Bird 소급 보너스

**공식**: `(active_days x 10) + min(tx_count, 500)`
- Multiplier 미적용 (bonus로 직접 지급)
- 1회성 스크립트 (기존 `backfill-points.ts` 패턴)
- SSH 접속하여 node-3에서 직접 실행

---

## Phase 1: 기반 통합

### 1-1. 단일 점수 체계

- PointsCard 제거/숨김, Ecosystem Points만 사용자에게 노출
- `/points/leaderboard` API는 내부용으로 전환

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/PointsCard.tsx` - 제거
- `nasun-website/frontend/src/pages/MyAccountPage.tsx` - 참조 제거
- `nasun-website/frontend/src/pages/dev/DevMyAccountPage.tsx` - 참조 제거

### 1-2. Multiplier 재설계

- `calculateMultiplier()` 변경: additive -> hybrid (max base + Battalion 누적)
- 환경변수: ECO_MULT_ALLIANCE=1, ECO_MULT_GENESIS=2, ECO_MULT_BATTALION=5
- 첫 런칭이므로 소급 적용 문제 없음 (기존 스냅샷 없음)

**수정 파일**:
- `api-server/src/config/ecosystem.ts` - MULTIPLIER_CONFIG, calculateMultiplier()

### 1-3. Multiplier 단일 계산 경로 + 개별 Sync

- ProfileHeroCard의 `realtimeMultiplier` useMemo 제거
- 활성화 캐시 12시간 간격 (ACTIVATIONS_CACHE_REFRESH_MS)
- **신규**: `POST /ecosystem/sync/:identityId` 엔드포인트
  - 해당 사용자 1명의 활성화 상태만 DynamoDB에서 즉시 조회
  - 메모리 캐시의 해당 사용자 항목만 갱신
  - Rate limit: 1분에 3회 (남용 방지)
- **프론트엔드에서 sync 호출**: activate/deactivate 성공 후 프론트엔드가 sync 엔드포인트 호출
  - Lambda -> Explorer-api 콜백 불필요 (Security Group 문제 회피, 아키텍처 단순화)
- 프론트엔드에 "Refresh" 버튼 추가 (수동 sync)
- sync 구현: admin-api Lambda에 단일 사용자 조회 엔드포인트 추가 (`GET /internal/ecosystem-activations/:identityId`)
  - Explorer-api가 이 엔드포인트를 HTTP로 호출하여 해당 사용자 캐시만 갱신

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` - realtimeMultiplier 제거, Refresh 버튼
- `nasun-website/frontend/src/hooks/useEcosystemStatus.ts` - activate 후 sync 호출
- `api-server/src/scanner/ecosystem-cache.ts` - 12h 캐시 + per-user sync 함수 (updateActivationsForUser)
- `api-server/src/routes/ecosystem.ts` - POST /ecosystem/sync/:identityId 엔드포인트
- `nasun-website/cdk/lambda-src/admin-api/` - 단일 사용자 활성화 조회 엔드포인트 추가

### 1-4. 활동 감지 단일 경로

- ProfileHeroCard의 `realtimeBaseScore`, `Math.max` 보정 로직 제거
- `useDailyMissions` 훅 유지 (체크리스트 UI 전용, 점수 계산에 사용 안 함)
- Score API 폴링 주기 5분 -> 1분
- **wallet-transfer Scanner 감지 추가**: `suix_queryTransactionBlocks({FromAddress})` RPC로 TransferObjects 감지
  - daily-nft-check.ts에 함수 추가 (별도 모듈 불필요)
  - 하루 1회, 등록 사용자당 1번 RPC 호출 (~141 calls/day)
  - Explorer가 트랜잭션 히스토리를 보여주는 것과 동일한 방식
- **daily-mission 보너스 적립 중단**: `calculateDailyMissions()` 호출 비활성화
  - 체크리스트 UI는 유지 (사용자 가이드 용도)
  - base_score가 이미 카테고리 다양성을 보상하므로 이중 보상 불필요
  - 기존 daily-mission 레코드는 activity_points에 보존 (삭제하지 않음)

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` - realtimeBaseScore 제거
- `nasun-website/frontend/src/hooks/useEcosystemScore.ts` - 폴링 1분
- `api-server/src/scanner/points-scanner.ts` - calculateDailyMissions() 호출 제거
- `api-server/src/scanner/daily-nft-check.ts` - wallet-transfer RPC 감지 함수 추가

---

## Phase 2: Base Score 고도화

### 2-1. 스테이킹 일일 점수

- daily-nft-check.ts에 `awardStakingDailyPoints()` 함수 추가
- `suix_getStakes(ownerAddress)` 호출하여 활성 스테이크 확인
- 스테이킹 있으면 1pt/일 (category: `staking-daily`)
- Identity 레벨 합산: 등록 지갑 중 하나라도 스테이킹 있으면 인정
- RPC 호출 최적화: 기존 StakingRequestEvent 기록이 있는 사용자만 대상 (전체 1400이 아닌 ~50-100 호출)
- activity_points에 synthetic INSERT: `tx_digest="stk:{identityId}:{date}"`

**수정 파일**:
- `api-server/src/scanner/daily-nft-check.ts` - awardStakingDailyPoints() 추가
- `api-server/src/config/points.ts` - staking-daily 카테고리 + BASE_POINTS

### 2-2. numbermatch 이벤트 매핑

- points.ts의 EVENT_MAP에 numbermatch 컨트랙트 이벤트 추가 (현재 TODO 주석)
- Games USDC 파싱(3-3) 전에 선행 필요

**수정 파일**:
- `api-server/src/config/points.ts` - EVENT_MAP_ENTRIES에 numbermatch 추가

---

## Phase 3: Bonus Points 시스템

### 3-1. Bonus Points 인프라

**기존 activity_points 테이블 재사용** (별도 테이블 불필요)

activity_points에 이미 synthetic 레코드 패턴이 존재:
- `dm:{wallet}:{date}:{type}` (daily-mission)
- `ref:{referrerId}:{digest}` (referral-bonus)
- `pp:{identityId}:{date}` (genesis passive)

Bonus도 동일 패턴으로 통합:
- `bonus-pado:{identityId}:{period}` (Pado 리더보드)
- `bonus-game:{identityId}:{tx_digest}` (Games USDC)
- `bonus-airdrop:{eventId}:{identityId}` (에어드롭)
- `bonus-earlybird:{identityId}` (Early Bird)

카테고리는 `ecosystem-bonus-pado`, `ecosystem-bonus-game`, `ecosystem-bonus-airdrop`, `ecosystem-bonus-earlybird`

**matview 재생성 필요**: 현재 matview는 명시적 NOT IN 리스트를 사용.
새 bonus 카테고리가 base_score에 이중 계산되는 것을 방지하기 위해 와일드카드 패턴으로 변경:
```sql
-- 기존: AND category NOT IN ('ecosystem-bonus-pnl', 'ecosystem-bonus-rank', ...)
-- 변경: AND category NOT LIKE 'ecosystem-bonus-%'
```
DROP + CREATE MATERIALIZED VIEW 필요 (ALTER 불가). 배포 시 brief downtime.

**Score API 변경**:
```sql
-- 기존: base_score만 조회
-- 변경: base_score + bonus 별도 조회
SELECT COALESCE(SUM(final_points), 0) as bonus_total
FROM activity_points
WHERE identity_id = $1
  AND category LIKE 'ecosystem-bonus-%'
  AND NOT flagged
```

**리더보드 변경**:
- 기존: base_score 상위 500명 fetch -> multiplier 적용 -> 재정렬
- 변경: base_score + bonus 합산 점수 기준으로 정렬
- 방법: CTE로 base_score와 bonus를 합산한 뒤 정렬
```sql
WITH scores AS (
  SELECT identity_id, COALESCE(SUM(base_score),0) as base
  FROM ecosystem_daily_scores WHERE day = CURRENT_DATE
  GROUP BY identity_id
), bonuses AS (
  SELECT identity_id, COALESCE(SUM(final_points),0) as bonus
  FROM activity_points
  WHERE category LIKE 'ecosystem-bonus-%' AND NOT flagged
  GROUP BY identity_id
)
SELECT ... ORDER BY (base * multiplier + bonus) DESC
```

**수정 파일**:
- `api-server/src/routes/ecosystem.ts` - score/leaderboard 쿼리 변경

### 3-2. Pado 리더보드 -> Bonus Points

**선행**: Pado chat-server points API limit 100 -> 1000 상향

**정산 로직**:
- 주간: UTC 월요일 00:05. 월간: 매월 1일 00:05.
- Explorer API가 `https://pado.finance/chat/api/leaderboard/points?limit=1000` fetch
- wallet -> identity 매핑 (registeredWallets 캐시)
- Top 15 + 나머지 2단계 분배
- activity_points INSERT (category: `ecosystem-bonus-pado`)
- 주간/월간 delta 계산을 위해 직전 스냅샷과 비교 필요
  - `pado_points_snapshots` 테이블 또는 bonus의 source_ref로 기간 인코딩

**Pado chat-server points API에 기간 필터가 없는 문제**:
- Explorer-api가 자체적으로 주간 스냅샷을 관리
- 매주 월요일: 현재 Pado points 스냅샷 저장 -> 전주 스냅샷과 delta 계산 -> delta 기준 정산
- 별도 테이블: `pado_points_snapshots (snapshot_date, wallet_address, total_points)`

**새 파일**: `api-server/src/scripts/settle-pado.ts` (SSH 스크립트, 수동 실행)
- 자동화 모듈 대신 수동 스크립트로 단순화 (141명 규모)
- 사용자 500명 초과 시 자동화(leaderboard-settlement.ts) 전환
- delta 계산을 위한 이전 스냅샷은 스크립트 내 로컬 JSON 파일로 관리
**수정 파일**: `pado/chat-server/src/server.ts` - limit 캡 100 -> 1000

### 3-3. Games USDC -> Bonus Points

- claim-prize 이벤트의 parsed_json에서 당첨 금액 파싱
- Scanner의 `fetchEventBatch()` 쿼리에 이벤트 데이터 포함하도록 확장
  - 또는 claim 이벤트 감지 시 `sui_getTransactionBlock(showEvents:true)` RPC 호출
- 1 USDC(= 1,000,000 micro-NUSDC) = 1 Bonus Point
- 주간 캡 600pt: rolling 7일 윈도우로 체크 (고정 주간 경계 대신, 게이밍 방지)
- atomic cap check: CTE로 현재 합산 + 신규 포인트를 원자적 INSERT
- activity_points INSERT (category: `ecosystem-bonus-game`)

**수정 파일**: `api-server/src/scanner/points-scanner.ts` - claim 이벤트 금액 파싱

### 3-4. 포인트 에어드롭

- SSH 스크립트로 node-3에서 직접 실행 (141명 규모, API 엔드포인트 불필요)
- 기존 `backfill-points.ts` 패턴
- activity_points INSERT (category: `ecosystem-bonus-airdrop`)

**새 파일**: `api-server/src/scripts/airdrop-bonus.ts`

### 3-5. Early Bird 소급 보너스

- 1회성 SSH 스크립트
- `(active_days x 10) + min(tx_count, 500)`, multiplier 미적용
- activity_points INSERT (category: `ecosystem-bonus-earlybird`)
- Idempotency: `tx_digest="bonus-earlybird:{identityId}"`, ON CONFLICT DO NOTHING

**새 파일**: `api-server/src/scripts/early-bird-bonus.ts`

---

## Phase 4: Daily Snapshot

기존 ECOSYSTEM_DAILY_SNAPSHOT_PLAN.md 기반:
- V1 공식 반영: `ecosystem_score = (base_score x multiplier) + bonus_total`
- bonus_total = `SUM(final_points) WHERE category LIKE 'ecosystem-bonus-%'`
- 스키마에 `bonus_total NUMERIC(10,2)` 컬럼 추가

---

## Phase 5: Pado 프론트엔드 연동

- Pado Header에 Ecosystem Points 위젯 (기존 Explorer API `/ecosystem/score` 호출)
- 거래 완료 시 "Activity detected" 토스트 (정확한 점수는 Scanner 반영 후)
- Pado 리더보드 페이지에 "상위 순위자는 Ecosystem Bonus Points를 받습니다" 안내

**수정 파일**:
- `pado/frontend/src/components/layout/Header.tsx` - 포인트 위젯
- `pado/frontend/src/features/trading/` - 거래 완료 알림

---

## Phase 6: Ecosystem 리더보드 재구성

| 기간 | 설명 |
|------|------|
| All-time | 전체 누적 ecosystem_score |
| Weekly | 최근 7일 |
| Monthly (신규) | 최근 30일 |

기존 daily -> weekly/monthly로 대체.

**수정 파일**:
- `api-server/src/routes/ecosystem.ts` - monthly 기간 추가
- `nasun-website/frontend/src/pages/ecosystem/EcosystemLeaderboardPage.tsx` - 탭 추가

---

## 핵심 수정 파일 종합

| 파일 | Phase | 작업 |
|------|-------|------|
| `api-server/src/config/ecosystem.ts` | 1-2 | Multiplier 재설계 |
| `api-server/src/scanner/ecosystem-cache.ts` | 1-3 | 12h 캐시 + per-user sync |
| `api-server/src/routes/ecosystem.ts` | 1-3, 3-1, 6 | sync 엔드포인트, bonus 합산, monthly |
| `api-server/src/scanner/points-scanner.ts` | 1-4, 3-3 | transfer 호출, claim 파싱 |
| `api-server/src/scanner/daily-nft-check.ts` | 2-1 | 스테이킹 일일 점수 |
| `api-server/src/config/points.ts` | 2-1, 2-2 | staking-daily, numbermatch |
| `pado/chat-server/src/server.ts` | 3-2 | limit 100->1000 |
| `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` | 1-3, 1-4 | realtime 제거, Refresh 버튼 |
| `nasun-website/frontend/src/hooks/useEcosystemStatus.ts` | 1-3 | activate 후 sync 호출 |
| `nasun-website/cdk/lambda-src/admin-api/` | 1-3 | 단일 사용자 활성화 조회 |

**새 파일**:
| 파일 | Phase | 역할 |
|------|-------|------|
| `api-server/src/scripts/settle-pado.ts` | 3-2 | Pado 리더보드 수동 정산 스크립트 |
| `api-server/src/scripts/airdrop-bonus.ts` | 3-4 | 에어드롭 스크립트 |
| `api-server/src/scripts/early-bird-bonus.ts` | 3-5 | Early Bird 스크립트 |

---

## 구현 우선순위

| 순서 | 작업 | 의존성 | 병렬 가능 |
|------|------|--------|----------|
| 1 | 1-1. 단일 점수 체계 | 없음 | A |
| 2 | 1-2. Multiplier 재설계 | 없음 | A |
| 3 | 1-3. Multiplier 단일 경로 + Sync | 1-2 | |
| 4 | 1-4. 활동 감지 단일 경로 | 없음 | A |
| 5 | 2-1. 스테이킹 일일 점수 | 없음 | B |
| 6 | 2-2. numbermatch 이벤트 매핑 | 없음 | B |
| 7 | 3-1. Bonus Points 인프라 (Score API) | 없음 | B |
| 8 | 3-5. Early Bird 소급 | 3-1 | |
| 9 | 4. Daily Snapshot | 3-1 | |
| 10 | 6. 리더보드 재구성 | 3-1 | |
| 11 | 3-2. Pado 리더보드 연동 | 3-1 | |
| 12 | 3-3. Games USDC 환산 | 3-1, 2-2 | |
| 13 | 3-4. 에어드롭 스크립트 | 3-1 | |
| 14 | 5. Pado 프론트엔드 | 1-1 | |

- A 그룹 (1,2,4)은 Phase 1 병렬 작업
- B 그룹 (5,6,7)은 Phase 2-3 초반 병렬 작업
