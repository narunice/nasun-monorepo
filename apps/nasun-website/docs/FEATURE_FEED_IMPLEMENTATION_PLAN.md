# Nasun Content Feed Implementation Plan (Updated)

## 1. 개요 (Overview)

이 문서는 Leaderboard V3 페이지에 **"My Rank Card"** 와 **"Nasun Content Feed"** 기능을 완성하기 위한 계획입니다.
현재 시스템은 Top Rankers의 포스트만 노출되고 있어, **Top Climbers(순위 급상승자)**의 콘텐츠도 함께 노출하여 커뮤니티의 역동성을 보여주고자 합니다.

### 1.1 현재 현황 및 문제점 (Current Status)
*   **구현 상태**: `get-featured-feed.ts` 핸들러에 Top Rankers와 Top Climbers 로직이 모두 존재함.
*   **문제점**:
    1.  **엄격한 로직**: 현재 코드는 비교 기간(7일 전)에 기록이 없는 신규 진입자(New Entry)를 Climber 계산에서 제외함 (`if (!previous) continue`).
    2.  **데이터 부족**: 시즌 초기에는 7일 전 스냅샷이 없어 비교 대상이 존재하지 않음.
    3.  **결과**: Climbers 리스트가 0명으로 계산되어 피드에 노출되지 않음.

### 1.2 목표 (Goals)
*   **Top Climbers 노출 보장**: 데이터가 부족한 시즌 초기에도 1일 전 데이터 등을 활용하여 Climbers를 계산 및 노출.
*   **신규 진입자 포함**: 이전에 랭킹에 없던 사용자가 갑자기 상위권에 진입한 경우도 Climber로 인정.
*   **풍부한 피드 제공**: Top 3 Rankers + Top 3 Climbers = 최대 6명의 최신 포스트 노출.

---

## 2. 구현 계획 (Implementation Plan)

### 2.1 백엔드 로직 개선 (`get-featured-feed.ts`)

기존 핸들러를 수정하여 다음 로직을 적용합니다.

#### A. 스마트 스냅샷 선택 (Smart Snapshot Selection)
7일 전 데이터가 없으면 1일 전 데이터를 사용하는 Fallback 로직을 추가합니다.

```typescript
// 로직 예시
const todayDate = getTodayDateString();
const currentSnapshot = await getSnapshot(seasonId, todayDate);

// 1순위: 7일 전
let previousDate = getDateNDaysAgo(7);
let previousSnapshot = await getSnapshot(seasonId, previousDate);

// 2순위: 데이터 없으면 1일 전 (Fallback)
if (previousSnapshot.size === 0) {
  console.log('7-day snapshot missing, falling back to 1-day');
  previousDate = getDateNDaysAgo(1);
  previousSnapshot = await getSnapshot(seasonId, previousDate);
}
```

#### B. Top Climbers 알고리즘 개선
`get-top-climbers.ts`의 로직을 참고하여 **신규 진입자(New Entry)** 처리를 추가합니다.

*   **기존**: `if (!previous) continue;` (제외)
*   **변경**:
    ```typescript
    if (!previous) {
      // New Entry: 랭킹 밖에서 진입한 것으로 간주
      rankChange = 0; // 또는 가상의 하위 랭킹과 비교
      direction = 'new';
    } else {
      rankChange = previous.rank - current.rank;
      // ...
    }
    ```
*   **정렬 우선순위**:
    1.  `rankChange` (순위 상승폭) 큰 순서
    2.  `currentRank` (현재 순위) 높은 순서 (New Entry 간 비교 시)

### 2.2 피드 구성 정책 (Feed Policy)

1.  **Top Rankers (3명)**: 현재 시즌 누적 점수 1~3위
2.  **Top Climbers (3명)**: 선택된 기간(1일 또는 7일) 동안 순위 상승폭이 큰 3명
3.  **중복 제거**: Ranker 리스트에 이미 있는 사용자가 Climber에도 포함된 경우, Climber 리스트에서 제외하고 다음 순위자를 선택하지 않음 (최대 6명이지만 중복 시 줄어들 수 있음).
    *   *업데이트*: 중복 시 해당 카드는 하나만 표시하되, 뱃지(🥇 + 🚀)는 모두 표시.

---

## 3. 아키텍처 및 디자인 (Architecture & Design)

### 3.1 레이아웃 (Layout)
*   **Desktop**: 우측 사이드바 (`sticky`)에 My Rank Card와 Content Feed 배치.
*   **Mobile**: Content Feed는 리더보드 하단에 배치.

### 3.2 뱃지 시스템 (Badge System)
`get-featured-feed.ts`에서 각 포스트 작성자에게 뱃지를 부여하여 프론트엔드에 전달합니다.

| Role | Badge | Badge ID |
|------|-------|----------|
| Rank 1 | 🥇 | `rank-1` |
| Rank 2 | 🥈 | `rank-2` |
| Rank 3 | 🥉 | `rank-3` |
| Climber | 🚀 | `climber-1`, `climber-2`, `climber-3` |

---

## 4. 데이터 흐름 (Data Flow)

1.  **Frontend**: `useFeaturedFeed` Hook 호출 (`GET /v3/feed/featured`)
2.  **Lambda (`get-featured-feed`)**:
    *   `SeasonAccounts`에서 Top 3 Rankers 조회
    *   `Snapshots`에서 Today vs Previous(7d or 1d) 비교하여 Top 3 Climbers 계산
    *   중복 사용자 병합 (뱃지 합치기)
    *   `Posts` 테이블에서 각 사용자의 최신 포스트(`createdAt-index`) 조회
    *   `createdAt` 내림차순 정렬하여 반환
3.  **Frontend**: 받은 데이터를 `FeedPostCard` 컴포넌트로 렌더링

---

## 5. 단계별 적용 (Action Items)

### Step 1: 백엔드 수정
- [ ] `cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts` 수정
    - [ ] Snapshot Fallback 로직 추가 (7d -> 1d)
    - [ ] `calculateTopClimbers` 함수 개선 (New Entry 포함)
    - [ ] 로깅 강화 (Climbers 계산 결과 확인용)

### Step 2: 배포 및 검증
- [ ] `leaderboard-v3-stack` 배포
- [ ] CloudWatch Logs 확인: "Falling back to 1-day snapshot" 로그 확인
- [ ] API 응답 확인: `climber-*` 뱃지를 가진 아이템이 포함되는지 확인

### Step 3: 프론트엔드 확인
- [ ] 사이드바 피드에 로켓(🚀) 아이콘이 표시된 포스트가 노출되는지 확인

---

## 6. API 명세 (API Specification)

### `GET /v3/feed/featured`

**Response Example:**

```json
{
  "success": true,
  "seasonId": "SEASON1",
  "items": [
    {
      "type": "post",
      "postId": "12345...",
      "author": {
        "username": "fast_climber",
        "displayName": "Fast Climber",
        "badges": ["climber-1"]  // 🚀 Climber 뱃지
      },
      "content": {
        "postType": "original",
        "text": "Just joined Nasun and climbing fast! 🚀",
        "createdAt": "2025-10-23T10:00:00Z"
      }
    },
    {
      "type": "post",
      "postId": "67890...",
      "author": {
        "username": "top_ranker",
        "badges": ["rank-1", "climber-3"] // 🥇 + 🚀 (중복인 경우)
      },
      // ...
    }
  ]
}
```