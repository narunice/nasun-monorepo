# Nasun Ecosystem Leaderboard 구현 상태

**작성일**: 2026-04-18
**참조 문서**: [ecosystem-points-system.md](ecosystem-points-system.md)

---

## 1. 시스템 구성 개요

Nasun Website의 리더보드는 **세 개의 독립 시스템**으로 구성됩니다.

| 시스템 | 위치 | 데이터 저장소 | 목적 |
|--------|------|-------------|------|
| **Leaderboard V3** | `/community/creators-leaderboard` | DynamoDB (AWS CDK) | 커뮤니티 참여도 (X Post 기반) |
| **Pado Score Leaderboard** | `/community/pado-score-leaderboard` | chat-server PostgreSQL | Pado 주간 트레이딩 점수 |
| **Ecosystem Points** | `/myAccount` 내 표시 | PostgreSQL (nasun_points) | 온체인 활동 포인트 |

---

## 2. Leaderboard V3 (커뮤니티 참여)

### 2.1 코드 위치

```
apps/nasun-website/
├── frontend/src/features/leaderboard-v3/
│   ├── types/index.ts                       # 타입 정의
│   ├── services/leaderboardV3Api.ts         # API 클라이언트
│   ├── hooks/
│   │   ├── useSeasonLeaderboard.ts          # 리더보드 조회 (React Query)
│   │   ├── useMyRank.ts                     # 내 랭크 조회
│   │   ├── useTopClimbersV3.ts              # Top Climbers
│   │   ├── useSeasons.ts                    # 시즌 목록
│   │   ├── useLeaderboardState.ts           # 페이지 상태 통합
│   │   └── useRankHistory.ts                # 랭크 변화 히스토리
│   └── components/
│       ├── LeaderboardV3.tsx                # 메인 페이지
│       ├── LeaderboardMainContent.tsx       # 테이블
│       ├── TopClimbersV3.tsx                # Top Climbers
│       └── MyRank/                          # 내 랭크 카드
└── cdk/
    ├── lambda-src/leaderboard-v3/
    │   ├── src/types/index.ts               # 공유 타입 + 상수
    │   ├── src/handlers/                    # Lambda 핸들러
    │   └── src/services/                    # DynamoDB 클라이언트, Score 계산
    └── lib/leaderboard-v3-stack.ts          # CDK 인프라 정의
```

### 2.2 DynamoDB 테이블

| 테이블 | PK | SK | 용도 |
|--------|----|----|------|
| `leaderboard-v3-posts` | postId | - | X 포스트 저장 |
| `leaderboard-v3-accounts` | accountId | - | 계정 정보 및 점수 |
| `leaderboard-v3-seasons` | seasonId | `METADATA` | 시즌 메타데이터 |
| `leaderboard-v3-snapshots` | `{seasonId}#{date}` | `RANK#{rank}` | 일일 랭크 스냅샷 |
| `leaderboard-v3-season-accounts` | `{seasonId}#{accountId}` | - | 시즌별 실시간 점수 |

**주요 GSI**:
- `posts`: `postUrl-index` (중복 방지), `createdAt-index`, `seasonId-createdAt-index`
- `accounts`: `platform-username-index` (소문자 핸들 검색)
- `snapshots`: `seasonId-rank-index`, `accountId-date-index`

### 2.3 점수 계산 상수

```typescript
// apps/nasun-website/cdk/lambda-src/leaderboard-v3/src/types/index.ts
BASE_SCORE = 1                      // 포스트당 기본 점수
ROLE_MULTIPLIER_MAX = 4.0           // 역할 배수 상한
ROLE_MULTIPLIER_BASE = 0.3
ROLE_MULTIPLIER_LOG_FACTOR = 0.74
RAW_SCORE_EXPONENT = 0.8            // 점수 압축 (고점 방지)
FRESHNESS_HALF_LIFE_DAYS = 7        // 최근 활동 가중치 반감기
FRESHNESS_GRACE_DAYS = 3
CONSISTENCY_BONUS_MULTIPLIER = 0.1  // 연속 활동 보너스 (상한 1.5)
POST_SCORE_MAX = 7.0                // 포스트 1개당 최대 점수
```

**Daily Base Score Tiers** (catch-up 메커니즘):
- Rank 1-50: 0.067점/일
- Rank 451+: 0.427점/일
- 절대 상한: 10.0점/일

### 2.4 API 엔드포인트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | `/v3/leaderboard?listSeasons=true` | 시즌 목록 | X |
| GET | `/v3/leaderboard?seasonId=X&limit=50&offset=0` | 리더보드 | X |
| GET | `/v3/leaderboard/my-rank?username=X&seasonId=Y` | 내 랭크 | X |
| GET | `/v3/leaderboard/rank-history?username=X&days=7` | 랭크 히스토리 | X |
| GET | `/v3/leaderboard/top-climbers?range=7d&limit=10` | Top Climbers | X |
| POST | `/v3/leaderboard/verify-telegram` | Telegram 연결 | JWT |
| GET | `/v3/leaderboard/telegram-status` | Telegram 상태 | JWT |
| POST | `/v3/leaderboard/disconnect-telegram` | Telegram 해제 | JWT |

### 2.5 주요 데이터 모델

```typescript
interface Season {
  seasonId: string;
  name: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;
  status: 'upcoming' | 'active' | 'paused' | 'ended' | 'archived';
  isDefault: boolean;
}

interface SeasonLeaderboardEntry {
  rank: number;
  username: string;
  platform: 'twitter' | 'discord' | 'farcaster';
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;
  rankChange?: { direction: 'up' | 'down' | 'same'; amount: number };
  breakdown?: ScoreBreakdown;
}
```

### 2.6 프론트엔드 상태 관리

`useLeaderboardState.ts` 통합 훅이 다음을 관리:
- seasons 목록, activeSeason
- 선택된 시즌 및 스냅샷 날짜 (과거 날짜 조회 지원)
- 페이지 번호 및 pagination
- 검색된 username 하이라이트

React Query 설정: `staleTime: 5분`, `placeholderData: keepPreviousData` (페이지 전환 시 깜빡임 방지)

---

## 3. Ecosystem Points (온체인 활동 포인트)

### 3.1 코드 위치

```
apps/nasun-website/frontend/src/
├── hooks/
│   ├── useEcosystemScore.ts             # 점수 조회 + 새로고침
│   ├── useSnapshotHistory.ts            # 히스토리 조회
│   └── useDailyMissions.ts              # 실시간 미션 완료 여부 (RPC 직접 호출)
├── services/
│   ├── ecosystemApi.ts                  # NFT 활성화 관리 (인증 필요)
│   └── ecosystemScoreApi.ts             # 점수 조회 (공개)
└── sections/myAccount/
    └── EcosystemStatusCard.tsx          # 점수 및 NFT 상태 UI

apps/network-explorer/api-server/src/
├── routes/ecosystem.ts                  # API 라우트
└── scanner/
    ├── points-scanner.ts                # 메인 스캔 루프 (60s)
    ├── ecosystem-cache.ts               # NFT 활성화 캐시 (5분)
    ├── daily-mission.ts                 # 미션 보너스 계산
    ├── referral-bonus.ts                # 추천인 보너스 배치
    ├── daily-snapshot.ts                # UTC 자정 스냅샷 생성
    ├── daily-nft-check.ts               # Alliance 페널티 체크
    ├── faucet-scanner.ts                # Faucet 클레임 추적
    └── chat-scanner.ts                  # 채팅 참여도 추적
```

### 3.2 Backend API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/ecosystem/score/:identityId` | 사용자 점수 (daily/weekly/all-time) |
| GET | `/api/v1/ecosystem/leaderboard?period=daily\|weekly\|all-time` | 포인트 리더보드 |
| POST | `/api/v1/ecosystem/sync/:identityId` | 캐시 동기화 |
| GET | `/api/v1/ecosystem/snapshot/history/:identityId` | 스냅샷 히스토리 |
| GET | `/api/v1/ecosystem/bonus-history/:identityId` | 보너스 히스토리 |
| GET | `/api/v1/ecosystem/health` | 시스템 상태 |

### 3.3 점수 응답 구조

```typescript
interface EcosystemScoreData {
  identityId: string;
  multiplier: number;         // NFT에 따라 1.0 ~ 4.0
  disabled?: boolean;         // NFT 미보유 시
  isPenalized?: boolean;      // Alliance 페널티 적용 중
  activations: Array<{
    nftType: 'alliance' | 'genesis-pass' | 'battalion';
    nftCount: number;
    bonus?: number;
  }>;
  daily: { baseScore; bonusTotal; referralBonus; ecosystemScore };
  weekly: { baseScore; bonusTotal; referralBonus; ecosystemScore; activeDays };
  allTime: { baseScore; bonusTotal; referralBonus; ecosystemScore; activeDays; scoreBreakdown };
}
```

### 3.4 Multiplier 계산

| NFT | 보너스 |
|-----|--------|
| Alliance | +0.5 |
| Genesis Pass | +1.1 |
| Battalion | +1.0 |
| 최종 배수 | `1 + sum(bonuses)`, 상한 4.0 |

Alliance 페널티: Genesis Pass 없이 7일 이상 활동 없으면 Alliance 보너스 제외

### 3.5 미션 카테고리 및 보너스

```typescript
// scanner/daily-mission.ts
const MISSION_MAP = {
  'pado-dex':        { points: 5 },
  'pado-prediction': { points: 5 },
  'pado-lottery':    { points: 5 },
  'governance':      { points: 10 },
  'pado-perp':       { points: 5 },
  'pado-scratchcard':{ points: 5 },
  'baram-ai':        { points: 5 },
  'faucet':          { points: 5 },
};

// 티어 보너스 (8개 중 N개 완료 시 추가 보너스)
// 4/8 -> +3, 5/8 -> +5, 6/8 -> +10
```

### 3.6 PostgreSQL DB 구조 (nasun_points)

**Materialized View**: `ecosystem_daily_scores`
- `pado-dex`는 가중치 2, 나머지 카테고리는 1
- 제외 카테고리: `referral-bonus`, `daily-mission`, `ecosystem-passive`, `staking*`, `ecosystem-bonus-*`
- REFRESH 목표: 60초 이내 (CONCURRENTLY 실행)

**주요 테이블**:

| 테이블 | 용도 |
|--------|------|
| `activity_points` | 모든 활동 개별 로그 |
| `ecosystem_daily_scores` | 일별 기본 점수 matview |
| `ecosystem_score_snapshots` | UTC 자정 스냅샷 (리더보드 source of truth) |
| `alliance_penalties` | 부정행위 페널티 기록 |
| `alliance_first_seen` | Alliance NFT 첫 활성화 날짜 |
| `identity_to_wallet_map` | Cognito ID - 지갑 주소 매핑 |

### 3.7 스캔 파이프라인

1. `points-scanner.ts`: 60초 간격으로 Sui RPC 이벤트 구독
2. `wallet-transfer` 카테고리: `tx_affected_addresses` 테이블 직접 SQL 쿼리 (RPC 부하 없음)
3. Identity Attribution: sender 주소가 등록된 지갑이면 해당 identity_id로 귀속
4. 중복 방지: `identityId::category` 기반 일일 고유 키
5. 자가 전송 제외: 동일 Identity 연결 지갑 간 전송 자동 제외
6. `daily-snapshot.ts`: UTC 자정 실행, idempotent (`ON CONFLICT` 처리)

### 3.8 Frontend 실시간 미션 체크

`useDailyMissions.ts`:
- 백엔드 인덱싱 지연을 우회하기 위해 브라우저에서 직접 Sui RPC 호출 (`queryEvents`, `queryTransactionBlocks`)
- 사용자의 모든 Linked Wallet을 동시 검사
- 어느 지갑에서든 미션 달성 시 UI 즉시 반영

---

## 4. Pado Score Leaderboard (주간 트레이딩 점수)

### 4.1 코드 위치

```
apps/nasun-website/frontend/src/
├── features/pado-score-leaderboard/
│   ├── usePadoScoreLeaderboard.ts       # 훅 + 타입 정의
│   └── PadoScoreLeaderboard.tsx         # 메인 컴포넌트
└── pages/dev/PadoScoreLeaderboardPage.tsx  # 페이지 래퍼
```

### 4.2 데이터 소스

chat-server (`VITE_NASUN_CHAT_HTTP_URL`)의 `/api/pado/` 전용 엔드포인트에서 조회.

| Endpoint | 설명 |
|----------|------|
| `GET /api/pado/leaderboard/score/weekly` | 사용 가능한 주차 목록 |
| `GET /api/pado/leaderboard/score/weekly/{weekId}?limit=&offset=` | 특정 주차 리더보드 |

### 4.3 데이터 모델

```typescript
interface ScoreLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass?: boolean;
  totalScore: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;       // 전주 대비 랭크 변화
}

interface ScoreLeaderboardResponse {
  scope: 'weekly' | 'alltime';
  weekId?: string;          // ISO 8601 주차 ID (예: "2026-W16")
  weekStart?: number;       // 해당 주 월요일 00:10 UTC (ms)
  traders: ScoreLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}
```

### 4.4 주차 ID 알고리즘

ISO 8601 Thursday-anchor 방식. 매주 월요일 00:10 UTC에 주간 리셋.

```typescript
// 현재 주차 ID 계산 (pado useLeaderboard.ts와 동일 알고리즘)
function getWeekId(weeksAgo = 0): string
// 예: "2026-W16"
```

### 4.5 UI 기능

- **Current Week / Past Weeks** 탭 전환
- Past Weeks: 드롭다운으로 과거 주차 선택
- **Grace Period** (주간 리셋 후 12시간): 새 주차 데이터 대신 이전 주 최종 결과 표시
- 페이지네이션: 50명씩, 최대 500명 (MAX_RANK)
- 각 행: Rank, Trader(nickname/address), Score, Trades, Rank Change
- Genesis Pass 보유자: `GP` 배지 표시
- 갱신: 30초마다 자동 refetch (백그라운드 미실행)

### 4.6 React Query 설정

| 훅 | staleTime | refetchInterval |
|----|-----------|----------------|
| `usePadoScoreLeaderboard` | 15초 | 30초 |
| `usePreviousPadoScoreLeaderboard` | 5분 | 없음 |
| `useAvailableWeeks` | 2분 | 없음 |

---

## 5. EcosystemStatusCard UI

`apps/nasun-website/frontend/src/sections/myAccount/EcosystemStatusCard.tsx`

표시 항목:
1. **점수 요약** (3개 박스): Today / This Week / All Time ecosystem points
2. **Multiplier**: 현재 배수 수치 + 활성화된 NFT 배지
3. **NFT 활성화 현황**: Alliance / Genesis Pass / Battalion 각각 표시
4. **상태 메시지**: 미활성화, 페널티, NFT 추천 등

---

## 6. 구현 완료 현황

### 완료된 기능

- Season 기반 리더보드 관리 (active / paused / ended / archived 상태)
- X 포스트 기반 점수 계산 (Role multiplier, Freshness decay, Consistency bonus)
- Catch-up 메커니즘 (하위 랭크에 높은 Daily Base Score)
- Top Climbers (랭크 변화폭 기준)
- Rank History (7/14/30/90일)
- Username 검색 + 하이라이트
- Telegram 연결 및 검증 (GSI: `telegramUserId-index`)
- Pado Score Leaderboard 주간 랭킹 (Current / Past Weeks)
- Grace Period 처리 (주간 리셋 후 12시간 이전 주 결과 표시)
- Ecosystem Points daily/weekly/all-time 계산
- NFT Multiplier (Alliance / Genesis Pass / Battalion)
- Daily Mission 보너스 및 티어 보너스
- Referral Bonus (referrer 10%, referred 5%)
- Governance Points 추적
- Alliance 페널티 시스템 (7일 유예)
- Nightly RPC Reconciliation (누락 이벤트 복구)
- Snapshot immutability (생성 후 수정 불가)
- Never-reduce invariant (포인트 단조 증가)
- 자가 전송 제외 (Anti-self-transfer)

### 운영 상 주의사항

- Leaderboard V3 공개 조회 상한: 500명
- Matview refresh: 5분마다 (실시간 반영 아님)
- Ecosystem score 캐시: 30초
- NFT 활성화 캐시: 최대 10초 갭
- Alliance 페널티 grace period: 7일 (하드코딩)
- Daily snapshot: UTC 자정에만 생성, 생성 후 immutable
- Staking V2: 특정 cutoff 날짜 이후 데이터만 포함

---

## 7. 환경 변수

### Frontend

| 변수 | 용도 |
|------|------|
| `VITE_LEADERBOARD_V3_API_URL` | Leaderboard V3 Lambda API |
| `VITE_EXPLORER_API_URL` | Ecosystem Score API (explorer-api) |
| `VITE_ECOSYSTEM_API_URL` | NFT 활성화 API (인증 필요) |
| `VITE_TELEGRAM_BOT_ID` | Telegram Login Widget |
| `VITE_NASUN_CHAT_HTTP_URL` | Pado Score Leaderboard API (chat-server) |

### Backend (Lambda)

| 변수 | 용도 |
|------|------|
| `LEADERBOARD_V3_*_TABLE` | 5개 DynamoDB 테이블명 |
| `ECOSYSTEM_ACTIVATIONS_URL` | NFT 활성화 fetch URL |
| `REFERRAL_MAPPINGS_URL` | Referral 매핑 URL |
| `POINTS_DATABASE_URL` | PostgreSQL (nasun_points) |
