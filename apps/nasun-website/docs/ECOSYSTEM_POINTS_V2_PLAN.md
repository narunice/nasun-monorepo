# Ecosystem Points V2 - 고도화 계획

## 비전

Ecosystem Points를 나선 생태계의 **유일한 통합 포인트 시스템**으로 확립한다.

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
| Battalion | 5x/개 (잠정, 복수 보유 가능, 비례 누적) |

- 보유 NFT 중 **최고 등급 배율**을 기준으로, Battalion은 개수 비례 누적
- 예: Alliance + Genesis + Battalion 3개 = 2x(Genesis) + 15x(Battalion 3개) = 17x
- 최대 배율 캡: 20x (현행 유지)

### Pado 리더보드 포인트 풀

기존 Pado 리더보드의 `points` 모드를 그대로 활용 (거래량 + PnL + 다양성 종합 점수).
별도 축 분리나 수익률 리더보드 신규 개발 불필요.

| 풀 | 기간 | 기준 | 규모 |
|----|------|------|------|
| Pado 주간 | 7일 | Pado leaderboard points | 50,000 pts |
| Pado 월간 | 30일 | Pado leaderboard points | 100,000 pts |

**분배 방식: 6-티어 구조**

| 티어 | 순위 | 인원 | 풀 비중 | 인당 (50K 풀) | 인당 (100K 풀) |
|------|------|------|---------|--------------|---------------|
| S | 1위 | 1 | 5% | 2,500 | 5,000 |
| A | 2-5위 | 4 | 10% | 1,250 | 2,500 |
| B | 6-20위 | 15 | 15% | 500 | 1,000 |
| C | 21-100위 | 80 | 25% | 156 | 312 |
| D | 101-500위 | 400 | 30% | 37 | 75 |
| E | 501-1000위 | 500 | 15% | 15 | 30 |

### Games USDC -> Points 환산

**규칙**: 1 USDC = 1 Bonus Point, **개인당 주간 캡 600 pts**

- 전 게임 통일 (즉석복권, 넘버매치, 주간 로또)
- 주간 로또 잭팟(수만 NUSDC 가능)도 600pt 캡 적용
- 600pt = 약 2주치 적극 그라인딩에 해당. "기분 좋지만 뒤집지는 못하는" 수준
- 즉석복권(최대 200)/넘버매치(최대 18)는 소액이라 캡에 거의 안 걸림
- 환산 비율 차등 관리 불필요, 규칙 단순

### 스테이킹 Anti-Farming 설계

**위협**: 10개 지갑 x 100 NSN/일(faucet) = 1000 NSN을 모아 스테이킹 파밍

**방어 3단계**:

1. **NFT Gate (기존)**: NFT 없으면 multiplier=0 -> 스테이킹 points도 0. 1차 방벽.
2. **Identity 레벨 합산 (기존)**: 모든 지갑의 스테이킹을 identity 단위로 합산. 지갑 분산 무의미.
3. **로그 스케일링 (신규)**: 스테이킹 점수에 로그 함수 적용, 대량 스테이킹의 한계수익 체감.

**스테이킹 일일 점수 공식**:
```
staking_daily = floor(log2(total_staked_NASUN / BASE_UNIT))
```

| 스테이킹 양 | BASE_UNIT=100 기준 | 비고 |
|------------|-------------------|------|
| 100 NASUN | log2(1) = 0점 | 최소 단위 미만, 무시 |
| 200 NASUN | log2(2) = 1점 | 기본 참여 |
| 1,000 NASUN | log2(10) = 3점 | 적극 참여 |
| 10,000 NASUN | log2(100) = 6점 | 큰 스테이커 |
| 100,000 NASUN | log2(1000) = 9점 | 고래도 크게 유리하지 않음 |

- BASE_UNIT은 env 설정 (초기 100 NASUN)
- multiplier 적용됨 (base_score에 포함되므로)
- 7일 이상 유지된 스테이크만 인정 (신규 스테이크는 7일 후부터 점수 부여)

### Early Bird 소급 보너스

**공식**: `early_bird_points = (active_days x 10) + min(tx_count, 500)`

- `active_days`: activity_points에서 distinct(date(tx_timestamp)) 수
- `tx_count`: 총 activity_points 레코드 수 (500 cap, 스팸 방지)
- **Multiplier 미적용** (bonus_points로 직접 지급)
- 산정 기준일: Ecosystem Points V2 정식 출시일

| 사용자 유형 | 활동 일수 | TX 수 | Early Bird Points |
|------------|----------|-------|-------------------|
| 캐주얼 | 10일 | 30 | 130 |
| 활성 사용자 | 30일 | 200 | 500 |
| 파워 유저 | 60일 | 500+ | 1,100 |

일관성의 가치를 인정하되(active_days x10으로 가중), 단순 트랜잭션 스팸은 500 cap으로 방지.

---

## Phase 1: 기반 통합 (Core Unification)

### 1-1. 단일 점수 체계 확립

**현황**: activity_points(final_points)와 ecosystem_score가 공존
**목표**: Ecosystem Points가 유일한 점수. activity_points는 내부 이벤트 로그로만 존재

**작업**:
- 프론트엔드 PointsCard 제거/숨김
- `/points/leaderboard` API는 내부용으로 전환
- 모든 사용자 대면 점수를 Ecosystem Points로 통일

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/PointsCard.tsx`
- `nasun-website/frontend/src/pages/MyAccountPage.tsx`
- `nasun-website/frontend/src/pages/dev/DevMyAccountPage.tsx`

### 1-2. Multiplier 재설계

**작업**:
- `calculateMultiplier()` 로직 변경:
  - Alliance: base 1x
  - Genesis: base 2x
  - Battalion: 5x/개 (누적)
  - 복합 보유: max(Alliance 1x, Genesis 2x) + Battalion(5x * 개수), cap 20x
- Per-Transaction Multiplier (GENESIS_PASS_MULTIPLIER=2.0)는 레거시. V2에서 무관.

**수정 파일**:
- `api-server/src/config/ecosystem.ts` - MULTIPLIER_CONFIG, calculateMultiplier()

### 1-3. Multiplier 단일 계산 경로

**작업**:
- ProfileHeroCard의 `realtimeMultiplier` 제거
- 활성화 캐시 갱신 주기 3시간 -> 5분
- (선택) Ecosystem Lambda에서 activate/deactivate 시 Explorer API cache invalidation webhook

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx`
- `api-server/src/scanner/ecosystem-cache.ts`

### 1-4. 활동 감지 단일 경로

**원칙**: Scanner가 유일한 점수 산출 경로. 프론트엔드는 체크마크 UI 용도로만 RPC 사용.

**작업**:
- ProfileHeroCard의 `realtimeBaseScore` 및 `Math.max` 보정 로직 제거
- `useDailyMissions` 훅은 유지 (체크리스트 UI 전용)
- Score API 폴링 주기 5분 -> 1분
- wallet-transfer 감지를 Scanner에 추가

**수정 파일**:
- `nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx`
- `nasun-website/frontend/src/hooks/useEcosystemScore.ts`
- `api-server/src/scanner/points-scanner.ts`

---

## Phase 2: Base Score 고도화

### 2-1. 스테이킹 일일 점수

**작업**:
- 매일 1회 `suix_getStakes(ownerAddress)` 호출 (모든 등록 지갑)
- Identity 레벨로 합산
- `floor(log2(total / BASE_UNIT))` 공식 적용
- 7일 이상 유지 스테이크만 인정
- activity_points에 `staking-daily` 카테고리로 INSERT

**새 파일**: `api-server/src/scanner/daily-staking.ts`
**수정 파일**:
- `api-server/src/scanner/points-scanner.ts`
- `api-server/src/config/points.ts`

---

## Phase 3: Bonus Points 시스템

### 3-1. Bonus Points 인프라

**새 테이블**:
```sql
CREATE TABLE bonus_points (
  id BIGSERIAL PRIMARY KEY,
  identity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  points NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identity_id, source, source_ref)
);
```

- `ecosystem_score = (base_score x multiplier) + SUM(bonus_points)`
- Score API에 bonus 합산 반영

**새 파일**: `api-server/src/db/bonus-schema.sql`
**수정 파일**: `api-server/src/routes/ecosystem.ts`

### 3-2. Pado 리더보드 -> Bonus Points

기존 Pado 리더보드 `points` 모드를 그대로 사용. 선행 작업 없음.

**정산 로직**:
- 주간: 매주 UTC 월요일 00:05에 정산
- 월간: 매월 1일 00:05에 정산
- Pado chat-server API (`GET /api/leaderboard/points?limit=1000`)에서 결과 fetch
- wallet -> identity 매핑 (registeredWallets 캐시 활용)
- 6-티어 분배 적용 후 bonus_points INSERT

**새 파일**: `api-server/src/scanner/leaderboard-settlement.ts`
(Pado chat-server 수정 불필요)

### 3-3. Pado Games USDC -> Points

- claim-prize 이벤트에서 당첨 금액 파싱 (즉석복권, 넘버매치, 주간 로또)
- `1 USDC = 1 Bonus Point`, 개인당 주간 캡 600 pts
- bonus_points INSERT (source: `games-usdc`)
- 주간 캡 체크: `SELECT SUM(points) FROM bonus_points WHERE identity_id=$1 AND source='games-usdc' AND created_at >= (이번주 월요일 UTC)`

**수정 파일**: `api-server/src/scanner/points-scanner.ts`

### 3-4. 포인트 에어드롭

- Admin API: `POST /admin/airdrop-points`
- bonus_points INSERT (source: `airdrop`)

**새 파일**: 기존 admin API에 엔드포인트 추가

### 3-5. Early Bird 소급 보너스

- 1회성 스크립트
- `(active_days x 10) + min(tx_count, 500)`
- bonus_points INSERT (source: `early-bird`)

**새 파일**: `api-server/src/scripts/early-bird-bonus.ts`

---

## Phase 4: Daily Snapshot (V2 공식)

기존 ECOSYSTEM_DAILY_SNAPSHOT_PLAN.md 기반, V2 공식 반영:
- `ecosystem_score = (base_score x multiplier) + bonus_total`
- 스키마에 `bonus_total NUMERIC(10,2)` 추가

---

## Phase 5: Pado 프론트엔드 연동

- Pado Header에 Ecosystem Points 위젯
- 거래 완료 시 "Earned X points" 토스트
- Pado 리더보드 페이지에 "이 순위에 따라 Bonus Points를 받습니다" 안내

---

## Phase 6: Ecosystem 리더보드 재구성

| 기간 | 설명 |
|------|------|
| All-time | 전체 누적 ecosystem_score |
| Weekly | 최근 7일 |
| Monthly (신규) | 최근 30일 |

기존 daily 리더보드 -> weekly/monthly로 대체.

---

## 구현 우선순위

| 순서 | 작업 | 의존성 |
|------|------|--------|
| 1 | 1-1. 단일 점수 체계 | 없음 |
| 2 | 1-2. Multiplier 재설계 | 없음 |
| 3 | 1-3. Multiplier 단일 경로 | 1-2 |
| 4 | 1-4. 활동 감지 단일 경로 | 없음 |
| 5 | 3-1. Bonus Points 인프라 | 없음 |
| 6 | 4. Daily Snapshot V2 | 3-1 |
| 7 | 2-1. 스테이킹 일일 점수 | 없음 |
| 8 | 3-5. Early Bird 소급 | 3-1 |
| 9 | 6. 리더보드 재구성 | 3-1 |
| 10 | 3-2. Pado 리더보드 연동 | 3-1 |
| 11 | 3-3. Games USDC 환산 | 3-1 |
| 12 | 3-4. 에어드롭 | 3-1 |
| 13 | 5. Pado 프론트엔드 | 1-1 |
