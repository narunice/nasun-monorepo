# Pado Score Leaderboard - Technical Reference

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-04-27 (W17 첫 정산 완료; 보상 테이블 top 2000 확장; wash-trading 필터 명시; 정산 자격에서 소셜 계정 요건 폐지; 주간 리셋 경계 00:10 UTC → 00:00 UTC 변경; settle-pado cron 자동화 월요일 00:15 UTC; PnL 크로스-풀 decimal 버그 수정(풀별 독립 계산); DAILY_TRADE_CAP=24 SQL per-day 방식 도입; PER_TRADE 4→2; PER_600_PNL 100→25; PER_10PCT_RETURN 100→200)
**관련 문서**: [ecosystem-points-system.md](ecosystem-points-system.md)

---

## 1. 시스템 목적

Pado Score Leaderboard는 매주 DEX 트레이딩 활동을 기반으로 순위를 산정하고, 주간 종료 후 생태계 포인트(Ecosystem Points)로 환산 지급하는 경쟁 리더보드입니다.

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
totalScore = tradePoints + volumePoints + diversityPoints + pnlScore

tradePoints     = 50 (첫 거래 보너스, 1건 이상일 때)
                + capped_trade_count * 2
                  (capped_trade_count: SQL ROW_NUMBER() OVER (PARTITION BY address, 날짜(UTC))
                   하루에 최초 24건만 인정. 몰아치기 불가 - 초과분은 다음날로 이월 불가)

volumePoints    = floor(volume_raw / 1,000,000,000) * 5
                  (NUSDC 6 decimals 기준, $1K = 1e9 raw)

diversityPoints = unique_pools * 25

pnlScore        = floor(realizedPnl / 6e8) * 25    (실현 수익 > 0, $600당 25pt)
                + floor(pnlPercent / 10) * 200      (수익률 > 0, 10%당 200pt)
                - lossPenalty                        (floor 0)

lossPenalty:
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
DeepBook V3에서 인덱싱된 모든 거래 원장.

| 컬럼 | 설명 |
|------|------|
| maker_address | 메이커 지갑 주소 |
| taker_address | 테이커 지갑 주소 |
| pool_id | 거래 풀 ID (다양성 점수 계산 기준) |
| quote_quantity | 거래량 (NUSDC raw) |
| timestamp | 거래 타임스탬프 |

#### `trader_points_weekly`
주간 점수 집계 결과. 매 집계 주기마다 `replaceWeeklyTraderScores()`로 덮어씁니다.

```sql
CREATE TABLE trader_points_weekly (
  week_id              TEXT NOT NULL,
  address              TEXT NOT NULL,
  total_score          INTEGER NOT NULL DEFAULT 0,
  score_from_trades    INTEGER NOT NULL DEFAULT 0,
  score_from_volume    INTEGER NOT NULL DEFAULT 0,
  score_from_diversity INTEGER NOT NULL DEFAULT 0,
  score_from_pnl       INTEGER NOT NULL DEFAULT 0,
  trade_count          INTEGER NOT NULL DEFAULT 0,
  volume_quote         TEXT NOT NULL DEFAULT '0',
  rank                 INTEGER NOT NULL DEFAULT 0,
  prev_rank            INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL,
  PRIMARY KEY (week_id, address)
);

CREATE INDEX idx_weekly_rank ON trader_points_weekly(week_id, rank ASC);
```

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
1. `trade_fills`에서 `timestamp >= weekStart` 필터링
2. `aggregateWeeklyTraderVolume(weekStart, DAILY_TRADE_CAP)` - 거래량/풀 다양성 집계 + SQL ROW_NUMBER per-day cap 적용
3. `resolveIdentityIds()` - 미등록 지갑 필터링
4. `computeTraderPnl(weekStart)` - 풀별 독립 PnL 계산 후 합산 (cross-pool decimal 오염 방지)
5. 점수 공식 적용 → `total_score` 산출
6. `total_score DESC` 정렬 → `rank` 할당
7. 이전 주(`prev_rank`) 비교 → `rankChange` 계산
8. `replaceWeeklyTraderScores(weekId, rankedTraders)` - 덮어쓰기

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
DEEPBOOK_PACKAGE=0x<sui-package>    # 인덱싱 대상 패키지
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
