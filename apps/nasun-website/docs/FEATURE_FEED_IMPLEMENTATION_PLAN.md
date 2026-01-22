# Nasun Content Feed Implementation Plan (Leaderboard V3)

## 1. 개요 (Overview)

이 문서는 Leaderboard V3 페이지에 **"Nasun Content Feed"** 기능을 추가하기 위한 구현 계획입니다.
리더보드 테이블 우측에 세로 스택(Vertical Stack) 형태로 피드를 배치하여, 커뮤니티 상위 기여자들의 최신 활동을 시각화하고 사용자 참여를 유도합니다.

### 1.1 목표
*   **시각적 풍부함 제공**: 텍스트 위주의 리더보드에 실제 콘텐츠를 노출하여 시각적 흥미 유발
*   **상위 랭커 노출**: Top 3 랭커와 Top 3 Climber의 콘텐츠를 보여줌으로써 동기 부여
*   **콘텐츠 접근성 향상**: 사용자가 리더보드 페이지를 떠나지 않고도 최신 나선 관련 콘텐츠(Original/Quote)를 확인

---

## 2. 아키텍처 및 디자인 (Architecture & Design)

### 2.1 레이아웃 변경 (Layout)
기존의 중앙 정렬된 단일 컬럼 리더보드 테이블 레이아웃을 **2-Column 레이아웃**으로 변경합니다.

*   **Desktop (lg 이상)**:
    *   **Left (Main)**: Leaderboard Table (약 70~75% 너비)
    *   **Right (Sidebar)**: Nasun Content Feed (320px ~ 360px 고정 너비)
    *   **Sticky Position**: 스크롤 시 피드가 화면에 고정되도록 `sticky` 속성 적용
*   **Mobile/Tablet (lg 미만)**:
    *   리더보드 테이블 하단에 피드 섹션 배치
    *   Sticky 속성 비활성화

```tsx
<div className="flex flex-col lg:flex-row gap-6">
  <div className="flex-1 min-w-0">
    {/* 기존 리더보드 콘텐츠 */}
  </div>
  <div className="w-full lg:w-[320px] xl:w-[360px] lg:flex-shrink-0">
    <div className="lg:sticky lg:top-24">
      <NasunContentFeed seasonId={selectedSeasonId} />
    </div>
  </div>
</div>
```

### 2.2 피드 구성 (Feed Composition)
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

### 2.3 뱃지 시스템 (Badge System)

| 유형 | 뱃지 | 설명 |
|------|------|------|
| Rank 1 | 🥇 | 금메달 |
| Rank 2 | 🥈 | 은메달 |
| Rank 3 | 🥉 | 동메달 |
| Climber | 🚀 | 로켓 아이콘 |

---

## 3. 백엔드 구현 (Backend Implementation)

### 3.1 기존 인프라 분석

새로운 GSI 추가 없이 기존 인덱스 활용 가능:

| Table | GSI | 용도 |
|-------|-----|------|
| Posts | `createdAt-index` (PK=accountId, SK=createdAt) | 계정별 최신 포스트 조회 |
| SeasonAccounts | `seasonId-userScore-index` | Top Rankers 조회 |
| Snapshots | pk={seasonId}#{date} | Top Climbers 계산용 |

### 3.2 신규 API: `GET /v3/feed/featured`

프론트엔드의 N+1 요청 문제를 방지하기 위해, 피드 데이터를 한 번에 조회하는 통합 API를 생성합니다.

*   **Endpoint**: `GET /v3/feed/featured`
*   **Query Params**: `seasonId` (Optional, 기본값은 Active Season)
*   **Response Structure**:

```json
{
  "success": true,
  "items": [
    {
      "type": "post",
      "postId": "post-123",
      "author": {
        "username": "crypto_whale",
        "displayName": "Crypto Whale",
        "profileImageUrl": "https://...",
        "badges": ["rank-1"]
      },
      "content": {
        "platform": "twitter",
        "postUrl": "https://x.com/...",
        "signals": ["creative", "insight"],
        "createdAt": "2026-01-22T10:00:00Z"
      }
    },
    {
      "type": "post",
      "postId": "post-124",
      "author": {
        "username": "newbie_climber",
        "displayName": "Rising Star",
        "profileImageUrl": "https://...",
        "badges": ["climber-1"]
      },
      "content": {
        "platform": "twitter",
        "postUrl": "https://x.com/...",
        "signals": ["insight"],
        "createdAt": "2026-01-22T09:30:00Z"
      }
    }
  ],
  "calculatedAt": "2026-01-22T12:00:00Z"
}
```

### 3.3 Lambda Handler: `get-featured-feed.ts`

`apps/nasun-website/cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts`

**로직 흐름:**
1.  **시즌 확인**: `seasonId`가 없으면 `getActiveSeason()` 호출
2.  **Top Rankers 조회**: `SeasonAccounts` GSI 쿼리 (limit 3)
    - 기존 `getSeasonAccountScores()` 로직 재사용
3.  **Top Climbers 조회**: 스냅샷 비교 (limit 3)
    - 기존 `get-top-climbers.ts` 로직 모듈화하여 재사용
4.  **중복 제거**: Ranker와 Climber 중복 사용자 필터링
5.  **포스트 조회**:
    - 식별된 Account ID 리스트(최대 6명)에 대해 `Posts` 테이블 조회
    - `createdAt-index` GSI 사용 (PK=accountId, SK=createdAt DESC, Limit: 1)
6.  **병합 및 정렬**: 조회된 포스트들을 `createdAt` 내림차순으로 정렬하여 반환

### 3.4 Edge Case 처리

| 케이스 | 처리 방안 |
|--------|-----------|
| 포스트 없는 사용자 | 해당 사용자 건너뛰기 (최대 6명 → 실제 포스트 있는 사용자만) |
| 시즌 초반 스냅샷 없음 | Top Climbers 제외, Top Rankers만 표시 |
| API 실패 | 피드 영역에 "Failed to load" 표시, 리더보드는 정상 동작 |

### 3.5 CDK Stack 업데이트
*   `LeaderboardV3Stack`에 새로운 Lambda 및 API Gateway 리소스 추가
*   DynamoDB 테이블 권한 부여:
    - `Posts` (read)
    - `SeasonAccounts` (read)
    - `Snapshots` (read)
    - `Seasons` (read)

---

## 4. 프론트엔드 구현 (Frontend Implementation)

### 4.1 타입 정의 (`types/index.ts`)

```typescript
// Badge types
export type BadgeType = 'rank-1' | 'rank-2' | 'rank-3' | 'climber-1' | 'climber-2' | 'climber-3';

// Featured feed item
export interface FeaturedFeedItem {
  type: 'post';
  postId: string;
  author: {
    username: string;
    displayName?: string;
    profileImageUrl?: string;
    badges: BadgeType[];
  };
  content: {
    platform: Platform;
    postUrl: string;
    signals: ContentSignal[];
    createdAt: string;
  };
}

// Featured feed response
export interface FeaturedFeedResponse {
  success: boolean;
  items: FeaturedFeedItem[];
  calculatedAt: string;
}
```

### 4.2 서비스 계층 (`leaderboardV3Api.ts`)

```typescript
export async function getFeaturedFeed(seasonId?: string): Promise<FeaturedFeedResponse> {
  const params = new URLSearchParams();
  if (seasonId) params.set('seasonId', seasonId);

  const response = await fetch(`${API_BASE_URL}/v3/feed/featured?${params}`);
  return response.json();
}
```

### 4.3 Hook (`useFeaturedFeed.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { getFeaturedFeed } from '../services/leaderboardV3Api';

export function useFeaturedFeed(seasonId?: string) {
  return useQuery({
    queryKey: ['featured-feed', seasonId],
    queryFn: () => getFeaturedFeed(seasonId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!seasonId,
  });
}
```

### 4.4 UI 컴포넌트

#### A. `FeedPostCard.tsx`
개별 포스트를 보여주는 카드 컴포넌트입니다.

*   **디자인**:
    *   Nasun Design System (`nasun-c4` border, glassmorphism bg) 적용
    *   **Header**: 프로필 이미지, 이름, 뱃지(🥇 Rank 1, 🚀 Climber 등)
    *   **Content**: 포스트 메타데이터(Type, Signals, Date) 표시
    *   **Action**: "View on X" 버튼 (외부 링크)

#### B. `NasunContentFeed.tsx`
피드 전체 컨테이너입니다.

*   **Header**: "Community Feed" 타이틀
*   **List**: `FeedPostCard` 목록 렌더링
*   **Loading State**: 스켈레톤 UI (3개 카드)
*   **Error State**: "Failed to load feed" 메시지
*   **Empty State**: "No recent posts" 메시지

---

## 5. 수정할 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `get-featured-feed.ts` (신규) | Featured Feed API 핸들러 |
| `leaderboard-v3-stack.ts` | Lambda, API Gateway 추가 |
| `types/index.ts` (lambda) | `FeaturedFeedItem`, `FeaturedFeedResponse` 타입 |
| `types/index.ts` (frontend) | 동일 타입 추가 |
| `leaderboardV3Api.ts` | `getFeaturedFeed()` 함수 |
| `useFeaturedFeed.ts` (신규) | React Query hook |
| `FeedPostCard.tsx` (신규) | 포스트 카드 컴포넌트 |
| `NasunContentFeed.tsx` (신규) | 피드 컨테이너 컴포넌트 |
| `LeaderboardV3.tsx` | 2-Column 레이아웃 적용 |

---

## 6. 단계별 구현 순서 (Phases)

### Phase 1: Backend API 구현
1.  `get-featured-feed.ts` 핸들러 작성
    *   Top Rankers 조회 로직 (SeasonAccounts GSI)
    *   Top Climbers 조회 로직 (기존 코드 모듈화)
    *   Posts 조회 로직 (createdAt-index GSI)
2.  `leaderboard-v3-stack.ts`에 Lambda 및 API 정의
3.  CDK 배포 및 API 테스트

### Phase 2: Frontend 서비스 & 훅 구현
1.  `types/index.ts`에 피드 관련 타입 정의
2.  `leaderboardV3Api.ts`에 API 호출 함수 추가
3.  `useFeaturedFeed.ts` 훅 작성

### Phase 3: UI 컴포넌트 개발
1.  `FeedPostCard` 컴포넌트 디자인 및 구현
2.  `NasunContentFeed` 컨테이너 구현

### Phase 4: 레이아웃 통합 및 테스트
1.  `LeaderboardV3.tsx` 페이지 레이아웃 수정 (2-Column)
2.  반응형 동작 확인
3.  Edge case 테스트

---

## 7. 검증 (Verification)

### 7.1 Backend 테스트
```bash
curl "https://API_URL/v3/feed/featured?seasonId=SEASON1"
```

### 7.2 Frontend 확인
- [ ] Desktop (lg+): 2-Column 레이아웃, 피드 sticky
- [ ] Tablet/Mobile: 리더보드 테이블 하단에 피드 섹션 표시
- [ ] 피드 로딩 중: 스켈레톤 UI 표시
- [ ] 피드 API 에러: 에러 메시지 표시 (리더보드 영향 없음)
- [ ] 뱃지: Ranker(금/은/동), Climber(로켓) 구분 확인
- [ ] 포스트 클릭: X(Twitter) 새 탭에서 열림

---

## 8. 결정된 사항 요약

| 항목 | 결정 |
|------|------|
| 모바일 디자인 | 하단 배치 |
| 뱃지 표시 | Ranker/Climber 구분 (금/은/동 메달 + 로켓) |
| 캐시 정책 | staleTime 5분 |
| 새 GSI 필요 여부 | 불필요 (기존 인덱스 활용) |
