# Pado Score Leaderboard - Technical Reference

**상태**: 운영 중 (Production)
**최근 업데이트**:
- **2026-05-14**: prediction market PnL을 Score 리더보드 `totalScore`와 PnL 리더보드(`/api/pado/leaderboard/pnl`) 양쪽에 합산. 신규 `prediction_markets` 테이블 + `MarketResolved`/`MarketCancelled` 폴러, `trade_fills.is_yes` 컬럼, `trader_points_weekly` 4개 prediction 컬럼 도입. `computePredictionPnl(startMs, endMs, ...)` 헬퍼가 Score(주간)와 PnL(4 period) 양쪽에서 재사용. Score UI는 기존 Volume/Trades 컬럼만 노출 (prediction 기여는 totalScore에 흡수, 시각 분해는 PnL 리더보드에서 확인). v1에서 prediction loss penalty는 미적용.
- **2026-04-27**: W17 첫 정산 완료; 보상 테이블 top 2000 확장; wash-trading 필터 명시; 정산 자격에서 소셜 계정 요건 폐지; 주간 리셋 경계 00:10 UTC → 00:00 UTC 변경; settle-pado cron 자동화 월요일 00:15 UTC; PnL 크로스-풀 decimal 버그 수정(풀별 독립 계산); DAILY_TRADE_CAP=24 SQL per-day 방식 도입; PER_TRADE 4→2; PER_600_PNL 100→25; PER_10PCT_RETURN 100→200
**관련 문서**: [ecosystem-points-system.md](ecosystem-points-system.md)

---

## 1. 시스템 목적

Pado Score Leaderboard는 매주 **Pado 거래 활동**(스팟 DEX + 예측시장)을 기반으로 순위를 산정하고, 주간 종료 후 생태계 포인트(Ecosystem Points)로 환산 지급하는 경쟁 리더보드입니다.

> **Prediction market 통합 (2026-05)**: Pado 예측시장의 `prediction_market::OrderFilled` 이벤트는 동일한 `trade_fills` 테이블에 적재됩니다 (`pool_id` prefix `prediction:${market_id}`로 식별). 거래 활동성 지표(`tradeCount` / `volumeUsd` / `unique_pools`)는 자동 합산되어 Score 공식의 `tradePoints` / `volumePoints` / `diversityPoints`에 그대로 반영.
>
> **Spot PnL 격리**: spot `aggregateTraderPnlRaw`는 `pool_id NOT LIKE 'prediction:%'`로 prediction을 명시 격리. shares 단위가 spot의 base token decimals 모델과 호환되지 않고(prediction `fill_shares`는 raw NUSDC 스케일이라 1 share = 1e-6 NUSDC, spot base token과 결합 불가), binary outcome이라 mark-to-market 의미가 모호하기 때문.
>
> **Prediction PnL (2026-05-14)**: `computePredictionPnl(startMs, endMs, excluded, washPairs)`이 별도 계산. 인덱서가 `MarketResolved` / `MarketCancelled` 이벤트를 `prediction_markets` 테이블에 인덱싱하고, 윈도우 내 resolved된 시장에 대해 per-user per-market position을 정산(maker_is_bid 부호 규칙 + winning side payout = `net_shares` raw NUSDC). 사용 위치:
>
> - **Score 리더보드 (`runWeeklyScoreAggregation`)**: 해당 주 resolved 시장 PnL을 spot과 동일 가중치(`PER_600_PNL=25`, `PER_10PCT_RETURN=200`)로 `totalScore`에 합산. UI는 별도 컬럼 없이 `totalScore` 단일 표현(Score 컬럼 + 정산 audit).
> - **PnL 리더보드 (`runPnlAggregation`)**: 4개 period(`24h`/`7d`/`30d`/`all`) 각각의 윈도우 내 resolved 시장 PnL을 spot PnL과 합산하여 단일 PnL/PnL% 컬럼에 표시. cost basis는 각 leg `pnl / (pct/100)` 역산 후 분모 결합으로 percent 재계산.
> - **알트타임 `trader_points`** (Score `scope=alltime`): spot-only PnL 유지 (`cachedPnlByAddress`가 spot 결과만 cache). 누적 포인트 시멘틱 보존.
>
> v1에서 prediction loss penalty는 적용하지 않음 (binary outcome -100% 빈발로 tier 최상단 페널티가 분포 왜곡). perp/lending 도입 시에도 별도 venue ledger 권장.

- 주 단위 리셋으로 신규 참여자에게 지속적 기회를 부여
- 상위 2000위까지 Ecosystem Points 지급 (Genesis Pass 보유자 2x). 자격: 등록된 identityId + Alliance NFT 활성화. (소셜 계정 요건은 2026-04-27 정책 업데이트로 폐지)
- 리더보드는 실시간(~60초)으로 갱신

---

## 2. 아키텍처 개요

```
DeepBook Events
    ↓ (실시간 인덱싱)
SQLite: trade_fills
    ↓ (60초마다 집계)
SQLite: trader_points_weekly
    ↓ (API 요청 시)
REST API: /api/pado/leaderboard/score/weekly/:weekId
    ↓ (15s stale, 30s refetch)
React: useScoreLeaderboard hook
    ↓
UI: ScoreLeaderboardTable.tsx (Pado App)
    ↓ (주간 종료 후 자동 실행, 월요일 00:15 UTC cron)
Settlement: settle-pado.ts
    ↓
PostgreSQL: activity_points (Ecosystem Points 지급)
```

---

## 3. 점수 계산 공식

집계 주기마다 `apps/nasun-website/chat-server/src/aggregator.ts`의 `runWeeklyScoreAggregation()`이 실행되며 다음 공식으로 점수를 계산합니다.

```
totalScore = tradePoints + volumePoints + diversityPoints + pnlScore + predictionPnlScore

tradePoints     = 50 (첫 거래 보너스, 1건 이상일 때)
                + capped_trade_count * 2
                  (capped_trade_count: SQL ROW_NUMBER() OVER (PARTITION BY address, 날짜(UTC))
                   하루에 최초 24건만 인정. 몰아치기 불가 - 초과분은 다음날로 이월 불가)

volumePoints    = floor(volume_raw / 1,000,000,000) * 5
                  (NUSDC 6 decimals 기준, $1K = 1e9 raw)
                  (spot + prediction `cost` 자동 합산)

diversityPoints = unique_pools * 25
                  (spot 풀 + `prediction:${market_id}` 풀 합산)

pnlScore        = floor(realizedPnl / 6e8) * 25    (spot 실현 수익 > 0, $600당 25pt)
                + floor(pnlPercent / 10) * 200      (spot 수익률 > 0, 10%당 200pt)
                - lossPenalty                        (floor 0; spot only)

predictionPnlScore = floor(predictionRealizedPnl / 6e8) * 25
                   + floor(predictionPnlPercent / 10) * 200
                   (v1: loss penalty 미적용. binary outcome -100% 빈발 → tier 최상단 페널티가 분포 왜곡)
                   (시장이 해소된 주에 한해 합산; MarketCancelled 시장은 제외)

lossPenalty (spot only):
  pnlPercent <= -5%  →  5pt
  pnlPercent <= -10% → 10pt
  pnlPercent <= -15% → 15pt
  pnlPercent <= -20% → 20pt
```

**PnL 풀별 독립 계산**: PnL은 NBTC/NETH/NSOL/NASUN 각 풀에서 독립적으로 계산한 뒤 합산합니다. 풀 간 base token decimal이 다르므로(NSOL raw 단위 vs NBTC raw 단위), 풀을 섞어 집계하면 phantom profit이 발생합니다. `aggregateTraderPnlRaw()`가 `GROUP BY address, pool_id`로 풀별 집계 후 `computeTraderPnl()`에서 합산합니다.

**Loss Penalty**는 주간 점수 계산에만 적용되며, 정산(Ecosystem Points) 단계로 전파되지 않습니다.

**Wash-trading 필터 (Self-trade Exclusion)**: 동일한 `identityId`에 연결된 지갑 간의 maker/taker 거래는 거래량/거래수 집계와 PnL 계산에서 모두 제외됩니다. `chat-server/identity-resolver.ts`의 `buildSameIdentityPairs()`가 identity 캐시 갱신 시 양방향 페어 set을 구축하여 `aggregateWeeklyTraderVolume`, `computeTraderPnl` 양쪽에 전달합니다.

POINTS 상수 정의 위치: `apps/nasun-website/chat-server/src/leaderboard-types.ts` (`POINTS` 객체).

| 상수 | 값 | 설명 |
|------|----|------|
| `FIRST_TRADE_BONUS` | 50 | 첫 거래 1회 보너스 |
| `DAILY_TRADE_CAP` | 24 | 하루 인정 거래수 상한 |
| `PER_TRADE` | 2 | 거래 1건당 pt |
| `PER_1K_VOLUME` | 5 | $1,000 거래량당 pt |
| `PER_UNIQUE_POOL` | 25 | 고유 풀 1개당 pt |
| `PER_600_PNL` | 25 | $600 실현 수익당 pt |
| `PER_10PCT_RETURN` | 200 | 수익률 10%당 pt |

---

## 4. 주간 사이클 (Week Lifecycle)

- **주 시작**: 매주 월요일 00:00 UTC
- **주 ID 형식**: ISO 8601 (`YYYY-Www`, 예: `2026-W17`)
- **Grace Period**: 주 시작 후 12시간 (00:00 ~ 12:00 UTC)
  - 이 기간 동안 UI는 "Week just started" 메시지와 함께 전 주 최종 순위를 표시
  - 12시간 경과 후 현재 주 실시간 데이터로 전환

```
월요일 00:00 UTC  주 시작 + 집계 시작
       ↓
       (60초 간격 집계 지속)
       ↓
일요일 23:59 UTC  주 종료 (데이터 확정)
       ↓
다음 월요일 00:00 UTC  새 주 시작, 이전 주 frozen
       ↓ (자동 실행, 월요일 00:15 UTC cron)
settle-pado.ts --week auto  → Ecosystem Points 지급
```

---

## 5. 데이터베이스

### 5.1 SQLite (Chat Server - 실시간 운영)

**파일**: `apps/nasun-website/chat-server/` (런타임 로컬 DB)

#### `trade_fills`
DeepBook V3 + prediction market 모두에서 인덱싱된 거래 원장.

| 컬럼 | 설명 |
|------|------|
| maker_address | 메이커 지갑 주소 (prediction 인덱싱 시 lowercase 강제) |
| taker_address | 테이커 지갑 주소 (prediction 인덱싱 시 lowercase 강제) |
| pool_id | 거래 풀 ID (spot은 DeepBook pool ID, prediction은 `prediction:${market_id}`). 다양성 점수 계산 기준 |
| base_quantity | spot: 베이스 토큰 raw 수량 / prediction: `fill_shares` (raw NUSDC 스케일) |
| quote_quantity | NUSDC raw 6 decimals (spot=quote, prediction=`cost`) |
| taker_is_bid | spot: taker가 bid면 1 / **prediction: maker가 bid면 1** (컬럼명과 실제 의미 양면성 — `taker_is_bid` 부채 섹션 참조) |
| is_yes | spot: NULL / prediction: YES side면 1, NO면 0 |
| timestamp_ms | 거래 타임스탬프 |

#### `prediction_markets` (2026-05-14 신규)
인덱서의 `MarketResolved` / `MarketCancelled` 폴러가 채우는 시장 해소 원장. `computePredictionPnl`가 `trade_fills`와 JOIN하여 PnL 계산.

```sql
CREATE TABLE prediction_markets (
  market_id       TEXT PRIMARY KEY,
  status          TEXT NOT NULL,             -- 'resolved' | 'cancelled'
  outcome         INTEGER,                   -- 0=NO, 1=YES, NULL=cancelled
  resolved_at_ms  INTEGER NOT NULL,          -- event.timestampMs (trade_fills와 동일 시계)
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_pred_markets_resolved ON prediction_markets(resolved_at_ms DESC);
```

**불변성 보장**: `upsertPredictionMarket`은 `ON CONFLICT(market_id) DO NOTHING`. Move 컨트랙트가 `resolve_market`에서 `STATUS_OPEN` assertion으로 outcome 변경을 막지만, 인덱서 replay나 RPC 이상으로 같은 시장이 재emit될 때 outcome flip이 일어나면 과거 주의 PnL이 retroactive하게 바뀌어 단조 증가 불변식이 깨진다. 첫 write 우선 정책으로 차단.

#### `trader_points_weekly`
주간 점수 집계 결과. 매 집계 주기마다 `replaceWeeklyTraderScores()`로 덮어씁니다.

```sql
CREATE TABLE trader_points_weekly (
  week_id                    TEXT NOT NULL,
  address                    TEXT NOT NULL,
  total_score                INTEGER NOT NULL DEFAULT 0,
  score_from_trades          INTEGER NOT NULL DEFAULT 0,
  score_from_volume          INTEGER NOT NULL DEFAULT 0,
  score_from_diversity       INTEGER NOT NULL DEFAULT 0,
  score_from_pnl             INTEGER NOT NULL DEFAULT 0,     -- spot PnL 점수
  score_from_prediction_pnl  INTEGER NOT NULL DEFAULT 0,     -- prediction PnL 점수 (2026-05-14)
  trade_count                INTEGER NOT NULL DEFAULT 0,
  volume_quote               TEXT NOT NULL DEFAULT '0',      -- spot + prediction 합산 (UI "Volume")
  prediction_volume_quote    TEXT NOT NULL DEFAULT '0',      -- prediction-only volume (audit/breakdown, UI 미노출)
  prediction_unique_markets  INTEGER NOT NULL DEFAULT 0,     -- prediction-only market count (audit, UI 미노출)
  prediction_realized_pnl    TEXT NOT NULL DEFAULT '0',      -- prediction realized PnL raw (audit)
  rank                       INTEGER NOT NULL DEFAULT 0,
  prev_rank                  INTEGER NOT NULL DEFAULT 0,
  updated_at                 INTEGER NOT NULL,
  x_handle                   TEXT,
  has_google                 INTEGER NOT NULL DEFAULT 0,
  has_telegram               INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_id, address)
);

CREATE INDEX idx_weekly_rank ON trader_points_weekly(week_id, rank ASC);
```

`prediction_*` 컬럼은 weekly settlement audit + 차후 UI 재도입 시 재사용 목적으로 SQLite에 저장하되, 현재 API 응답과 UI 컬럼에는 노출하지 않음. `score_from_prediction_pnl`은 `totalScore`에 합산된 prediction 기여분을 추적하므로 settlement 검증에 필수.

#### `indexer_state`
| key | value |
|-----|-------|
| `pado_aggregator_last_run_ms` | 마지막 집계 타임스탬프 (신선도 판단용) |

### 5.2 PostgreSQL (Network Explorer - 정산 저장)

**연결**: `apps/network-explorer/api-server/.env`의 `POINTS_DATABASE_URL`

#### `weekly_score_snapshots`
주간 정산 완료 기록.

```sql
CREATE TABLE weekly_score_snapshots (
  week_id    TEXT NOT NULL,
  address    TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  rank       INTEGER NOT NULL,
  settled    INTEGER NOT NULL DEFAULT 0,  -- 0=미정산, 1=정산완료
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_id, address)
);
CREATE INDEX idx_wss_unsettled ON weekly_score_snapshots(week_id, settled);
```

#### `activity_points`
정산 완료된 Ecosystem Points 지급 기록. 기존 Ecosystem Points 시스템과 동일한 테이블.

| 컬럼 | 설명 |
|------|------|
| category | `'ecosystem-bonus-pado'` |
| activity_type | `'weekly-2026-W17'` (주 ID 포함) |
| base_points | 순위 기반 포인트 (아래 보상 테이블 참고) |
| genesis_multiplier | Genesis Pass 보유자: `2.0`, 미보유: `1.0` |
| final_points | `base_points * genesis_multiplier` |

---

## 6. API 엔드포인트

**서버**: `apps/nasun-website/chat-server/src/leaderboard-api.ts`

### 공개 API

| Method | Path | 설명 | 캐시 |
|--------|------|------|------|
| `GET` | `/api/pado/leaderboard/score/weekly` | 사용 가능한 주 목록 | 120s |
| `GET` | `/api/pado/leaderboard/score/weekly/:weekId` | 특정 주 순위 (상위 500) | 30s |
| `GET` | `/api/pado/leaderboard/score?scope=alltime` | 누적 전체 순위 (하위 호환) | - |
| `GET` | `/api/pado/leaderboard/trader/:address/score` | 개별 트레이더 점수 + 순위 | - |

**응답 예시** (`/weekly/:weekId`):
```json
{
  "scope": "weekly",
  "weekId": "2026-W17",
  "weekStart": 1713607800000,
  "traders": [
    {
      "rank": 1,
      "address": "0x...",
      "nickname": "trader_name",
      "hasGenesisPass": true,
      "totalScore": 850,
      "tradeCount": 42,
      "volumeUsd": "125000.50",
      "rankChange": 5,
      "followerCount": 123
    }
  ],
  "updatedAt": 1713900345123,
  "totalTraders": 287
}
```

### 내부 API (정산 서버 전용)

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| `GET` | `/api/pado/internal/weekly-scores/:weekId` | Bearer token | 상위 500명 + identityId + hasGenesisPass + hasSocialAccount |

진행 중인 주(current week) 요청은 403 `week_in_progress`로 거부. 완료된 주(past week)만 허용.

**내부 API 응답 필드**:
```typescript
{
  weekId: string;
  traders: Array<{
    rank: number;
    address: string;
    identityId: string | null;    // null = 미등록 지갑
    hasGenesisPass: boolean;
    hasSocialAccount: boolean;    // Twitter/Google/Telegram 중 하나 이상 연결
    totalScore: number;
  }>;
  totalTraders: number;
  generatedAt: number;            // ms timestamp
}
```

---

## 7. 집계 프로세스 (Aggregation)

**파일**: `apps/nasun-website/chat-server/src/aggregator.ts`

```typescript
// 60초(기본값) 간격 setInterval
setInterval(() => {
  runAggregation();  // runWeeklyScoreAggregation() 포함
}, AGGREGATION_INTERVAL_MS);
```

집계 단계:
1. `trade_fills`에서 `timestamp >= weekStart` 필터링 (spot + prediction:* 풀 합산)
2. `aggregateWeeklyTraderVolume(weekStart, DAILY_TRADE_CAP)` - 거래량/풀 다양성 집계 + SQL ROW_NUMBER per-day cap 적용
3. `resolveIdentityIds()` - 미등록 지갑 필터링
4. `computeTraderPnl(weekStart)` - **spot only** (SQL이 `pool_id NOT LIKE 'prediction:%'` 격리). 풀별 독립 PnL 계산 후 합산 (cross-pool decimal 오염 방지)
5. `computePredictionPnl(weekStart, weekStart + 7d)` - 해당 주 resolved 시장 PnL 계산. `prediction_markets JOIN trade_fills`로 per-user per-market position 정산, payout = winning shares (1 share = 1 raw NUSDC)
6. 점수 공식 적용 → `totalScore = ... + pnlScore + predictionPnlScore` 산출
7. `total_score DESC` 정렬 → `rank` 할당
8. 이전 주(`prev_rank`) 비교 → `rankChange` 계산
9. `replaceWeeklyTraderScores(weekId, rankedTraders)` - 덮어쓰기 (트랜잭션 + ON CONFLICT UPDATE)

### PnL 리더보드와의 관계

`runPnlAggregation` (별도 함수)이 동일한 `computePredictionPnl(cutoff, now, ...)`을 호출하여 4개 period(`24h`/`7d`/`30d`/`all`)의 spot PnL과 prediction PnL을 합산. 응답 `realizedPnl` / `pnlPercent`는 합산값. cost basis는 각 leg의 `pnl / (pct/100)` 역산 후 분모로 결합하여 percent 재계산 (작은 cost prediction win이 큰 cost spot trader 수익률을 왜곡하지 않게).

알트타임 `trader_points` (Score 리더보드의 alltime scope)는 spot-only PnL 유지 (`cachedPnlByAddress`가 spot 결과만 cache).

---

## 8. 주간 정산 (Settlement)

**스크립트**: `apps/network-explorer/api-server/src/scripts/settle-pado.ts`

**실행**: 매주 월요일 00:15 UTC에 node-3 crontab에서 자동 실행됩니다. 수동 실행이 필요한 경우:

```bash
# 특정 주 정산
npx tsx src/scripts/settle-pado.ts --week 2026-W17

# 자동 감지 (마지막 완료된 주)
npx tsx src/scripts/settle-pado.ts --week auto

# Dry-run (실제 DB 기록 없음)
npx tsx src/scripts/settle-pado.ts --week 2026-W17 --dry-run
```

**정산 프로세스**:
1. `ECOSYSTEM_ACTIVATIONS_URL`에서 Alliance NFT 활성화 목록 수신 (S3 gzip offload 지원)
2. 내부 API에서 상위 500명 데이터 수신 (`identityId`, `hasGenesisPass`, `hasSocialAccount` 포함)
3. `weekly_score_snapshots`에 스냅샷 upsert (ON CONFLICT DO NOTHING - 멱등)
4. 미정산(`settled = 0`) 트레이더만 처리
5. 트레이더별 자격 검사 (아래 조건 모두 충족해야 지급):
   - `identityId`가 null이 아님 (등록된 지갑)
   - Alliance NFT 활성화 상태 (`nftType === 'alliance'`)
   - 순위 2000위 이내 (보상 존재)
   - **(2026-04-27 폐지) ~~소셜 계정 연결~~** — `hasSocialAccount` 필터 제거됨
6. Genesis Pass 보유자에게 2x 적용
7. PostgreSQL `activity_points`에 `ON CONFLICT DO NOTHING`으로 멱등 삽입 + `settled = 1` 업데이트 (단일 트랜잭션)

**스킵 카운터 (Summary 출력)**:
| 카운터 | 조건 |
|--------|------|
| `skippedUnregistered` | identityId 없음 |
| `skippedNoAlliance` | identityId 있으나 Alliance NFT 미보유 |
| `skippedNoReward` | 순위 2001위 이상 (또는 보상 테이블 외) |

> ~~`skippedNoSocial`~~ 카운터는 2026-04-27 정책 변경으로 제거됨.

**보상 테이블**:

| 순위 | 기본 포인트 | Genesis Pass (2x) |
|------|------------|-------------------|
| 1위 | 50 | 100 |
| 2위 | 45 | 90 |
| 3위 | 40 | 80 |
| 4-10위 | 35 | 70 |
| 11-20위 | 30 | 60 |
| 21-50위 | 25 | 50 |
| 51-100위 | 20 | 40 |
| 101-200위 | 15 | 30 |
| 201-300위 | 10 | 20 |
| 301-500위 | 8 | 16 |
| 501-1000위 | 6 | 12 |
| 1001-2000위 | 5 | 10 |

**Alliance NFT 데이터 수신 흐름**:
```
ECOSYSTEM_ACTIVATIONS_URL
    ↓
{ url: "https://s3.amazonaws.com/..." }  또는  { activations: {...} }
    ↓ (S3 presigned URL인 경우)
fetch → gunzip (node:zlib) → JSON.parse
    ↓
activations: Record<identityId, Array<{ nftType, nftCount }>>
    ↓
allianceSet = identityId where any nftType === 'alliance'
```

allianceSet이 빈 경우(API 이상) `process.exit(1)`로 즉시 중단합니다.

---

## 9. 프론트엔드 컴포넌트

### Pado App (주요 진입점)

| 파일 | 역할 |
|------|------|
| `apps/pado/frontend/src/pages/LeaderboardPage.tsx` | 리더보드 페이지 (탭: activity / volume / pnl / score) |
| `apps/pado/frontend/src/features/leaderboard/components/ScoreLeaderboardTable.tsx` | 점수 리더보드 테이블 |
| `apps/pado/frontend/src/features/leaderboard/components/ScoreTraderRow.tsx` | 트레이더 행 |
| `apps/pado/frontend/src/features/leaderboard/hooks/useLeaderboard.ts` | `useScoreLeaderboard` 포함 |
| `apps/pado/frontend/src/features/leaderboard/components/WeekPicker.tsx` | 과거 주차 선택 드롭다운 |
| `apps/pado/frontend/src/features/leaderboard/components/ModeSelector.tsx` | 탭 전환 UI |
| `apps/pado/frontend/src/features/leaderboard/components/ScopeSelector.tsx` | Current / Past 전환 |

**LeaderboardPage 상태 관리**:

```typescript
// 탭 전환은 URL ?tab= 으로 반영 (Umami analytics 페이지뷰 추적)
const [searchParams, setSearchParams] = useSearchParams();

const VALID_MODES: LeaderboardMode[] = ['activity', 'volume', 'pnl', 'score'];
const rawTab = searchParams.get('tab') as LeaderboardMode | null;
const mode: LeaderboardMode = rawTab && VALID_MODES.includes(rawTab) ? rawTab : 'volume';

// 탭 변경: 기존 쿼리파라미터를 유지하며 tab만 교체
const handleModeChange = useCallback((m: LeaderboardMode) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', m);
    return next;
  });
  setPage(1);
}, [setSearchParams]);
```

URL 예시: `/leaderboard?tab=score`, `/leaderboard?tab=pnl`

**Grace Period 로직**:
```typescript
const WEEK_GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;  // 12시간

const isGracePeriod = Date.now() - weekStart < WEEK_GRACE_PERIOD_MS;
// true이면 전 주 데이터 표시 + "Week just started" 메시지
```

---

## 10. 환경 변수

### Chat Server (`apps/nasun-website/chat-server/.env`)
```env
AGGREGATION_INTERVAL_MS=60000       # 집계 주기 (기본 60초)
DEEPBOOK_PACKAGE=0x<sui-package>    # spot DEX 인덱싱 대상 패키지
PREDICTION_PACKAGE=0x<sui-package>  # prediction market 인덱싱 (미설정 시 prediction 폴러 비활성)
USER_WALLETS_TABLE=UserWallets      # DynamoDB 테이블명 (기본값)
USER_PROFILES_TABLE=UserProfiles    # DynamoDB 테이블명 (기본값)
WALLET_MAPPINGS_URL=...             # 전체 지갑-identityId 맵 엔드포인트 (1시간 캐시)
WALLET_MAPPINGS_API_KEY=...         # 위 URL의 x-api-key (선택)
```

### 프론트엔드 (`apps/pado/frontend/.env`)
```env
VITE_NASUN_CHAT_HTTP_URL=https://nasun.io/chat  # prod
# staging: https://staging.nasun.io/chat
# dev:     http://localhost:3101
```

### Settlement Script (`apps/network-explorer/api-server/.env`)
```env
POINTS_DATABASE_URL=postgres://...              # PostgreSQL 연결 (nasun_points DB)
CHAT_SERVER_URL=http://43.200.67.52:3101        # Chat server 내부 주소
INTERNAL_API_KEY=...                             # Bearer token (내부 API 인증)
ECOSYSTEM_ACTIVATIONS_URL=...                    # Alliance NFT 활성화 API (필수)
ECOSYSTEM_ACTIVATIONS_API_KEY=...               # 위 URL의 x-api-key (선택)
```

---

## 11. 보안 및 무결성

- **멱등 정산**: `ON CONFLICT DO NOTHING`으로 중복 실행 안전
- **현재 주 거부**: 내부 API가 진행 중인 주 데이터 반환 차단 (확정성 보장)
- **identityId 없는 트레이더 제외**: 미등록 지갑은 Ecosystem Points 미지급
- **Alliance NFT 미보유 제외**: 활성화된 Alliance NFT가 없으면 지급 제외
- **allianceSet 비어있으면 중단**: API 이상 상황에서 전체 정산 차단 (silent skip 방지)
- **Loss Penalty 격리**: PnL 패널티는 순위 계산에만 반영, Ecosystem Points 산출 시 제외
- **Ecosystem Points 단조 증가**: `activity_points` 삽입만 허용, 삭제/수정 금지
- **소셜 배지 표시**: 리더보드 응답에는 닉네임, 프로필 이미지, X 핸들, Google/Telegram 연동 여부를 DynamoDB UserProfiles BatchGetItem으로 실시간 조회하여 표시용으로만 포함 (정산 자격 판단에는 사용 안 함). UnprocessedKeys 지수 백오프 재시도(최대 3회).
- **Prediction outcome 불변성**: `prediction_markets`는 `ON CONFLICT DO NOTHING`. Move 컨트랙트의 `STATUS_OPEN` 가드와 함께 이중 방어로 outcome retroactive 변경 차단.
- **Prediction 주소 정규화**: `pollPredictionOrderFilled`가 `json.maker`/`json.taker`를 `String(x).toLowerCase()`로 강제 변환 후 `trade_fills`에 저장. wash-pair canonical key (`min(a,b):max(a,b)`)와 banned-list (lowercase) 매칭 일관성 확보.
- **`taker_is_bid` 의미 양면성 (기술 부채)**: prediction `OrderFilled`의 `is_bid`는 maker 기준 (`prediction_market.move:202`). 인덱서가 그대로 `taker_is_bid` 컬럼에 저장하므로 prediction row의 해당 컬럼은 사실상 `maker_is_bid`. `computePredictionPnl`은 SQL alias (`taker_is_bid AS maker_is_bid`)로 의미 복원. **spot+prediction을 이 컬럼으로 join하면 사일런트 버그**. 컬럼명/뷰 정리는 별도 cleanup PR.
- **Prediction PnL Number 정밀도**: cost/shares 누적은 IEEE 754 안전 범위(2^53 ≈ $9B per single fill) 안에서 동작. 단일 사용자 주간 PnL이 `Number.MAX_SAFE_INTEGER`에 근접하면 aggregator가 warn 로그. 정상 사용자에서는 발생 불가.
