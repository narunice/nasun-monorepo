# Nasun Content Feed Implementation Plan (Leaderboard V3)

## 1. 개요 (Overview)

이 문서는 Leaderboard V3 페이지에 **"My Rank Card"** 와 **"Nasun Content Feed"** 기능을 추가하기 위한 구현 계획입니다.
리더보드 테이블 우측에 세로 스택(Vertical Stack) 형태로 사이드바를 배치하여, 로그인 사용자의 순위와 커뮤니티 상위 기여자들의 최신 활동을 시각화합니다.

### 1.1 목표
*   **개인화된 경험**: 로그인 사용자에게 자신의 순위와 점수를 즉시 확인할 수 있는 카드 제공
*   **시각적 풍부함 제공**: 텍스트 위주의 리더보드에 실제 콘텐츠를 노출하여 시각적 흥미 유발
*   **상위 랭커 노출**: Top 3 랭커와 Top 3 Climber의 콘텐츠를 보여줌으로써 동기 부여
*   **콘텐츠 접근성 향상**: 사용자가 리더보드 페이지를 떠나지 않고도 최신 나선 관련 콘텐츠(Original/Quote)를 확인

### 1.2 사이드바 구성

```
┌─────────────────────────────┐
│      MY RANK CARD           │  ← 로그인 사용자 전용
│  (순위, 점수, 프로필)         │
├─────────────────────────────┤
│      COMMUNITY FEED         │  ← 항상 표시 (Live 데이터)
│  [FeedPostCard 1]           │
│  [FeedPostCard 2]           │
│  [FeedPostCard 3]           │
│  ...                        │
└─────────────────────────────┘
```

---

## 2. 아키텍처 및 디자인 (Architecture & Design)

### 2.1 레이아웃 변경 (Layout)
기존의 중앙 정렬된 단일 컬럼 리더보드 테이블 레이아웃을 **2-Column 레이아웃**으로 변경합니다.

*   **Desktop (lg 이상)**:
    *   **Left (Main)**: Leaderboard Table (약 70~75% 너비)
    *   **Right (Sidebar)**: My Rank Card + Nasun Content Feed (320px ~ 360px 고정 너비)
    *   **Sticky Position**: 스크롤 시 사이드바가 화면에 고정되도록 `sticky` 속성 적용
*   **Mobile/Tablet (lg 미만)**:
    *   리더보드 테이블 하단에 사이드바 섹션 배치
    *   Sticky 속성 비활성화

```tsx
<div className="flex flex-col lg:flex-row gap-6">
  <div className="flex-1 min-w-0">
    {/* 기존 리더보드 콘텐츠 */}
  </div>
  <div className="w-full lg:w-[320px] xl:w-[360px] lg:flex-shrink-0">
    <div className="lg:sticky lg:top-24 space-y-4">
      <MyRankCardV3 seasonId={selectedSeasonId} />
      <NasunContentFeed seasonId={selectedSeasonId} />
    </div>
  </div>
</div>
```

### 2.2 스냅샷 모드 동작

**결정**: 스냅샷(과거 날짜) 조회 시에도 사이드바는 **항상 Live 데이터**를 표시합니다.

| 모드 | 리더보드 테이블 | My Rank Card | Content Feed |
|------|----------------|--------------|--------------|
| Live | 현재 순위 | 현재 내 순위 | 오늘 기준 피드 |
| Snapshot (과거) | 과거 순위 | 현재 내 순위 | 오늘 기준 피드 |

**이유**: 레이아웃 일관성 유지, 피드/카드 숨김 시 페이지 흐트러짐 방지

---

## 3. My Rank Card V3 구현

### 3.1 V2 레거시 분석 결과

V2의 `MyRankCard.tsx`는 다음 기능을 제공합니다:
- **상태 분기**: `no_twitter`, `not_ranked`, `ranked`, `error`
- **데이터 표시**: 순위, 점수, 프로필 이미지, 순위 변동
- **인증 확인**: `useAuth` hook으로 `user.twitterHandle` 확인
- **API 호출**: `GET /api/leaderboard/{period}/user/{username}`
- **캐싱**: React Query (staleTime: 30분)

### 3.2 V3 적용 설계

#### A. 상태 분기 (4가지)

| 상태 | 조건 | UI 표시 |
|------|------|---------|
| `no_twitter` | 비로그인 또는 Twitter 미연동 | "X 계정 연동" 버튼 |
| `not_ranked` | 로그인했으나 시즌에 순위 없음 | "나선 트윗 찾기" 버튼 |
| `ranked` | 정상적으로 순위 존재 | 순위 정보 카드 |
| `error` | API 호출 실패 | 에러 메시지 |

#### B. 표시 데이터

```typescript
interface MyRankV3Data {
  rank: number;
  userScore: number;
  postCount: number;
  username: string;
  originalUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
  rankChange?: {
    direction: 'up' | 'down' | 'same' | 'new';
    amount: number;
  };
}
```

#### C. 신규 API: `GET /v3/leaderboard/my-rank`

*   **Endpoint**: `GET /v3/leaderboard/my-rank`
*   **Query Params**:
    - `seasonId` (Optional, 기본값은 Active Season)
    - `username` (Required, Twitter handle)
*   **Response Structure**:

```json
{
  "success": true,
  "data": {
    "status": "ranked",
    "rank": 42,
    "userScore": 156.75,
    "postCount": 12,
    "username": "john_doe",
    "originalUsername": "John_Doe",
    "displayName": "John Doe",
    "profileImageUrl": "https://...",
    "rankChange": {
      "direction": "up",
      "amount": 5
    },
    "totalUsers": 150
  }
}
```

### 3.3 UI 디자인

```tsx
// Ranked 상태 (그래디언트 배경)
<div className="bg-gradient-to-r from-nasun-c5/20 to-nasun-c4/40
               border border-nasun-c4/50 rounded-xl p-4">
  <h4 className="text-sm font-medium uppercase text-nasun-white/70 mb-3">
    MY RANK
  </h4>

  {/* 순위 & 점수 */}
  <div className="flex items-baseline gap-2 mb-2">
    <span className="text-3xl font-bold text-nasun-c3">#{rank}</span>
    <RankChangeIndicator rankChange={rankChange} />
  </div>
  <div className="text-nasun-white/70 mb-4">
    {userScore.toFixed(2)} points
  </div>

  {/* 프로필 */}
  <div className="flex items-center gap-3 pt-3 border-t border-nasun-c4/50">
    <img src={profileImageUrl} className="w-10 h-10 rounded-full" />
    <div>
      <div className="font-medium text-nasun-white">{displayName}</div>
      <div className="text-sm text-nasun-white/60">@{username}</div>
    </div>
  </div>
</div>

// 미연동/미랭크 상태 (파란 배경)
<div className="bg-nasun-c4/30 border border-nasun-white/20 rounded-xl p-4">
  {/* CTA 버튼 */}
</div>
```

---

## 4. Content Feed 구현

### 4.1 피드 구성 (Feed Composition)
피드는 다음 사용자들의 **가장 최근 포스트 1개씩**을 수집하여 최신순으로 정렬합니다.

1.  **Top Rankers**: 현재 시즌 리더보드 1~3위
2.  **Top Climbers**: 현재 시즌 기준 순위 상승 상위 3명

> **중복 처리**: 한 사용자가 Top Ranker이자 Top Climber인 경우, 한 번만 표시합니다.

```typescript
// 중복 제거 알고리즘
const rankerIds = await getTopRankers(seasonId, 3);
const climberIds = await getTopClimbers(seasonId, 3);
const uniqueClimberIds = climberIds.filter(id => !rankerIds.includes(id));
const targetAccountIds = [...rankerIds, ...uniqueClimberIds].slice(0, 6);
```

### 4.2 뱃지 시스템 (Badge System)

| 유형 | 뱃지 | 설명 |
|------|------|------|
| Rank 1 | 🥇 | 금메달 |
| Rank 2 | 🥈 | 은메달 |
| Rank 3 | 🥉 | 동메달 |
| Climber | 🚀 | 로켓 아이콘 |

---

## 5. 백엔드 구현 (Backend Implementation)

### 5.1 기존 인프라 분석

새로운 GSI 추가 없이 기존 인덱스 활용 가능:

| Table | GSI | 용도 |
|-------|-----|------|
| Posts | `createdAt-index` (PK=accountId, SK=createdAt) | 계정별 최신 포스트 조회 |
| SeasonAccounts | `seasonId-userScore-index` | Top Rankers / My Rank 조회 |
| Snapshots | pk={seasonId}#{date} | Top Climbers / Rank Change 계산용 |
| Accounts | `platform-username-index` | username으로 accountId 조회 |

### 5.2 신규 API 1: `GET /v3/leaderboard/my-rank`

*   **Endpoint**: `GET /v3/leaderboard/my-rank`
*   **Query Params**: `seasonId`, `username`
*   **Lambda Handler**: `get-my-rank.ts`

**로직 흐름:**
1.  `username`으로 `Accounts` 테이블에서 `accountId` 조회
2.  `SeasonAccounts` 테이블에서 해당 계정의 점수 조회
3.  모든 참가자 점수를 비교하여 순위 계산 (또는 캐싱된 스냅샷 활용)
4.  어제 스냅샷과 비교하여 `rankChange` 계산
5.  결과 반환

### 5.3 신규 API 2: `GET /v3/feed/featured` (이미 CDK에 정의됨)

*   **Endpoint**: `GET /v3/feed/featured`
*   **Query Params**: `seasonId` (Optional, 기본값은 Active Season)
*   **Lambda Handler**: `get-featured-feed.ts`

**로직 흐름:**
1.  **시즌 확인**: `seasonId`가 없으면 `getActiveSeason()` 호출
2.  **Top Rankers 조회**: `SeasonAccounts` GSI 쿼리 (limit 3)
3.  **Top Climbers 조회**: 스냅샷 비교 (limit 3)
4.  **중복 제거**: Ranker와 Climber 중복 사용자 필터링
5.  **포스트 조회**: `Posts` 테이블에서 각 계정의 최신 포스트 1개씩 조회
6.  **병합 및 정렬**: `createdAt` 내림차순으로 정렬하여 반환

### 5.4 Edge Case 처리

| 케이스 | 처리 방안 |
|--------|-----------|
| 포스트 없는 사용자 | 해당 사용자 건너뛰기 |
| 시즌 초반 스냅샷 없음 | Top Climbers 제외, Top Rankers만 표시 |
| My Rank API 실패 | 카드에 에러 메시지 표시, 피드는 정상 동작 |
| Feed API 실패 | 피드에 에러 메시지 표시, My Rank는 정상 동작 |
| 비로그인 사용자 | My Rank에 로그인 CTA 표시 |

### 5.5 CDK Stack 업데이트

```typescript
// 추가 Lambda: get-my-rank
const getMyRankLambda = new NodejsFunction(this, 'LeaderboardV3GetMyRankFunction', {
  ...nodejsFunctionDefaults,
  functionName: `${envPrefix}nasun-leaderboard-v3-get-my-rank`,
  entry: path.join(lambdaSrcPath, 'handlers', 'get-my-rank.ts'),
  handler: 'handler',
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
  description: 'Leaderboard V3: Get my rank for logged-in user',
});

// API Route
const myRankResource = leaderboardResource.addResource('my-rank');
myRankResource.addMethod('GET', new apigw.LambdaIntegration(getMyRankLambda));

// DynamoDB 권한
this.accountsTable.grantReadData(getMyRankLambda);
this.seasonAccountsTable.grantReadData(getMyRankLambda);
this.snapshotsTable.grantReadData(getMyRankLambda);
this.seasonsTable.grantReadData(getMyRankLambda);
```

---

## 6. 프론트엔드 구현 (Frontend Implementation)

### 6.1 타입 정의 추가 (`types/index.ts`)

```typescript
// My Rank Types
export type MyRankStatus = 'no_twitter' | 'not_ranked' | 'ranked' | 'error';

export interface MyRankV3Data {
  status: MyRankStatus;
  rank?: number;
  userScore?: number;
  postCount?: number;
  username?: string;
  originalUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
  rankChange?: RankChange;
  totalUsers?: number;
}

export interface MyRankV3Response {
  success: boolean;
  data: MyRankV3Data;
}
```

### 6.2 서비스 계층 (`leaderboardV3Api.ts`)

```typescript
export async function getMyRankV3(
  seasonId: string,
  username: string
): Promise<MyRankV3Response> {
  const params = new URLSearchParams({ seasonId, username });
  const response = await fetch(`${API_BASE_URL}/v3/leaderboard/my-rank?${params}`);
  return response.json();
}

export async function getFeaturedFeed(seasonId?: string): Promise<FeaturedFeedResponse> {
  const params = new URLSearchParams();
  if (seasonId) params.set('seasonId', seasonId);
  const response = await fetch(`${API_BASE_URL}/v3/feed/featured?${params}`);
  return response.json();
}
```

### 6.3 Hooks

#### A. `useMyRankV3.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getMyRankV3 } from '../services/leaderboardV3Api';

export function useMyRankV3(seasonId?: string) {
  const { user, isAuthenticated } = useAuth();
  const twitterHandle = user?.twitterHandle;

  return useQuery({
    queryKey: ['my-rank-v3', seasonId, twitterHandle],
    queryFn: async () => {
      if (!twitterHandle || !seasonId) return null;
      return getMyRankV3(seasonId, twitterHandle);
    },
    enabled: isAuthenticated && !!twitterHandle && !!seasonId,
    staleTime: 5 * 60 * 1000, // 5분
  });
}
```

#### B. `useFeaturedFeed.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { getFeaturedFeed } from '../services/leaderboardV3Api';

export function useFeaturedFeed(seasonId?: string) {
  return useQuery({
    queryKey: ['featured-feed', seasonId],
    queryFn: () => getFeaturedFeed(seasonId),
    staleTime: 5 * 60 * 1000, // 5분
    enabled: !!seasonId,
  });
}
```

### 6.4 UI 컴포넌트

#### A. `MyRankCardV3.tsx`

로그인 사용자의 순위를 보여주는 카드 컴포넌트입니다.

*   **상태별 UI**:
    *   `no_twitter`: 파란 배경 + "X 계정 연동" 버튼
    *   `not_ranked`: 파란 배경 + "나선 트윗 찾기" 버튼
    *   `ranked`: 그래디언트 배경 + 순위/점수/프로필
    *   `error`: 에러 메시지

#### B. `FeedPostCard.tsx`

개별 포스트를 보여주는 카드 컴포넌트입니다.

*   **디자인**:
    *   Nasun Design System (`nasun-c4` border, glassmorphism bg) 적용
    *   **Header**: 프로필 이미지, 이름, 뱃지(🥇 Rank 1, 🚀 Climber 등)
    *   **Content**: 포스트 메타데이터(Type, Signals, Date) 표시
    *   **Action**: "View on X" 버튼 (외부 링크)

#### C. `NasunContentFeed.tsx`

피드 전체 컨테이너입니다.

*   **Header**: "Community Feed" 타이틀
*   **List**: `FeedPostCard` 목록 렌더링
*   **Loading State**: 스켈레톤 UI (3개 카드)
*   **Error State**: "Failed to load feed" 메시지
*   **Empty State**: "No recent posts" 메시지

#### D. `LeaderboardSidebar.tsx`

My Rank Card와 Content Feed를 묶는 컨테이너입니다.

```tsx
export function LeaderboardSidebar({ seasonId }: { seasonId: string }) {
  return (
    <div className="space-y-4">
      <MyRankCardV3 seasonId={seasonId} />
      <NasunContentFeed seasonId={seasonId} />
    </div>
  );
}
```

---

## 7. 수정할 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `get-my-rank.ts` (신규) | My Rank API 핸들러 |
| `get-featured-feed.ts` (기존) | Featured Feed API 핸들러 |
| `leaderboard-v3-stack.ts` | My Rank Lambda, API Gateway 추가 |
| `types/index.ts` (lambda) | `MyRankV3Data`, `MyRankV3Response` 타입 |
| `types/index.ts` (frontend) | 동일 타입 추가 |
| `leaderboardV3Api.ts` | `getMyRankV3()`, `getFeaturedFeed()` 함수 |
| `useMyRankV3.ts` (신규) | My Rank React Query hook |
| `useFeaturedFeed.ts` (신규) | Featured Feed React Query hook |
| `MyRankCardV3.tsx` (신규) | My Rank 카드 컴포넌트 |
| `FeedPostCard.tsx` (신규) | 포스트 카드 컴포넌트 |
| `NasunContentFeed.tsx` (신규) | 피드 컨테이너 컴포넌트 |
| `LeaderboardSidebar.tsx` (신규) | 사이드바 컨테이너 컴포넌트 |
| `LeaderboardV3.tsx` | 2-Column 레이아웃 적용 |

---

## 8. 단계별 구현 순서 (Phases)

### Phase 1: Backend - My Rank API
1.  `get-my-rank.ts` 핸들러 작성
2.  `leaderboard-v3-stack.ts`에 Lambda 및 API 정의
3.  CDK 배포 및 API 테스트

### Phase 2: Backend - Featured Feed API
1.  `get-featured-feed.ts` 핸들러 작성 (이미 CDK에 정의됨)
2.  CDK 배포 및 API 테스트

### Phase 3: Frontend - Types & Services
1.  `types/index.ts`에 My Rank 및 Feed 관련 타입 정의
2.  `leaderboardV3Api.ts`에 API 호출 함수 추가
3.  `useMyRankV3.ts`, `useFeaturedFeed.ts` 훅 작성

### Phase 4: Frontend - UI Components
1.  `MyRankCardV3` 컴포넌트 구현
2.  `FeedPostCard` 컴포넌트 구현
3.  `NasunContentFeed` 컨테이너 구현
4.  `LeaderboardSidebar` 컨테이너 구현

### Phase 5: Layout Integration & Testing
1.  `LeaderboardV3.tsx` 페이지 레이아웃 수정 (2-Column)
2.  반응형 동작 확인
3.  Edge case 테스트

---

## 9. 검증 (Verification)

### 9.1 Backend 테스트
```bash
# My Rank API
curl "https://API_URL/v3/leaderboard/my-rank?seasonId=SEASON1&username=john_doe"

# Featured Feed API
curl "https://API_URL/v3/feed/featured?seasonId=SEASON1"
```

### 9.2 Frontend 확인
- [ ] Desktop (lg+): 2-Column 레이아웃, 사이드바 sticky
- [ ] Tablet/Mobile: 리더보드 테이블 하단에 사이드바 표시
- [ ] My Rank - 로그인 상태: 순위/점수/프로필 표시
- [ ] My Rank - 비로그인 상태: "X 계정 연동" CTA 표시
- [ ] My Rank - 순위 없음: "나선 트윗 찾기" CTA 표시
- [ ] Feed 로딩 중: 스켈레톤 UI 표시
- [ ] Feed API 에러: 에러 메시지 표시 (My Rank 영향 없음)
- [ ] 뱃지: Ranker(금/은/동), Climber(로켓) 구분 확인
- [ ] 포스트 클릭: X(Twitter) 새 탭에서 열림
- [ ] Snapshot 모드: 사이드바는 항상 Live 데이터 표시

---

## 10. 결정된 사항 요약

| 항목 | 결정 |
|------|------|
| 모바일 디자인 | 하단 배치 |
| Snapshot 모드 | 사이드바 숨기지 않음, 항상 Live 데이터 표시 |
| 뱃지 표시 | Ranker/Climber 구분 (금/은/동 메달 + 로켓) |
| 캐시 정책 | staleTime 5분 |
| 새 GSI 필요 여부 | 불필요 (기존 인덱스 활용) |
| My Rank 인증 | useAuth hook의 user.twitterHandle 사용 |
