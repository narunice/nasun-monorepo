# Leaderboard 기능 완료 히스토리

**Last Updated**: 2025-12-13
**Version**: v2.1.0
**프로젝트**: X(Twitter) 리더보드 시스템
**기간**: 2025-10-20 ~ 현재
**상태**: ✅ 구현 완료 (지속적 개선 중)

> **📝 복원 노트**: 이 문서는 2025-10-29에 Git commit b34ac02~1에서 복원되었습니다.
> Phase 1-5의 리더보드 기능 구현 히스토리를 상세히 기록하고 있습니다.

---

## 📋 목차

1. [Phase 1: 버그 수정 및 기본 시스템 안정화](#phase-1-버그-수정-및-기본-시스템-안정화)
2. [Phase 1-2: 사용자 랭킹 검색 시스템](#phase-1-2-사용자-랭킹-검색-시스템)
3. [Phase 2: 프로필 복구 시스템](#phase-2-프로필-복구-시스템)
4. [Phase 3: 자동완성 기능](#phase-3-자동완성-기능)
5. [Phase 3: 랭킹 변동 표시](#phase-3-랭킹-변동-표시)
6. [Phase 3-4: 소셜 공유 기능](#phase-3-4-소셜-공유-기능)
7. [Phase 5: Rank History 그래프 (My Account)](#phase-5-rank-history-그래프-my-account)
8. [스코어링 메트릭 최적화 (Option 2)](#스코어링-메트릭-최적화-option-2)
9. [최종 아키텍처](#최종-아키텍처)
10. [Phase 4: Event 3 (Season 3) 추가](#phase-4-event-3-season-3-추가)
11. [Bug Fix: 탭 동기화 Race Condition 수정](#bug-fix-탭-동기화-race-condition-수정)

---

## Phase 1: 버그 수정 및 기본 시스템 안정화

### 완료 일자
2025-10-22

### 주요 버그 수정

#### BUG-001: Active Days Field Name Mismatch (Critical)
**문제**: 모든 사용자의 활동일수가 0으로 계산됨
**원인**: FilterExpression에서 `addedAt` 참조, 실제 DynamoDB는 `added_at` (snake_case)
**해결**:
```typescript
// Before
ExpressionAttributeNames: { '#addedAt': 'addedAt' }

// After
ExpressionAttributeNames: { '#added_at': 'added_at' }
```
**파일**: `active-days-calculator.ts:133-135`

#### BUG-002: Score Weight Environment Variable Inconsistency (Critical)
**문제**: Score Calculator와 Leaderboard Generator가 다른 점수 가중치 사용
**해결**: 환경 변수 통일
```typescript
SCORE_WEIGHT_LIKES: 0.5
SCORE_WEIGHT_REPLIES: 1.0
SCORE_WEIGHT_REPOSTS: 1.0
SCORE_WEIGHT_QUOTES: 1.6
SCORE_WEIGHT_MENTIONS: 2
```
**파일**: `cdk-stack.ts:172-176, 195`

---

## Phase 1-2: 사용자 랭킹 검색 시스템

### 완료 일자
2025-10-23

### 구현 내용 (58/95 항목 완료, 61%)

#### 1. MyRankCard - 나의 랭킹 카드
4가지 시나리오 완벽 대응:
1. ✅ Twitter 미연동
2. ✅ 랭크 없음 (참여 필요)
3. ✅ 정상 랭크 표시
4. ✅ 스냅샷 모드 (이벤트 종료 시)

```typescript
const { data: myRank, isLoading, error } = useMyRank(
  xUsername,
  selectedPeriod,
  isAuthenticated
);
```

#### 2. UserSearchBox - 하이브리드 검색
**특징**:
- 정확 일치 우선 (Exact Match)
- 부분 일치 폴백 (Partial Match)
- 대소문자 무관
- @ 기호 자동 제거
- 최대 5개 결과

```typescript
const { data: searchResults, isLoading } = useUserSearch(
  searchQuery,
  selectedPeriod,
  isAuthenticated
);
```

#### 3. Backend API
**엔드포인트**:
- `GET /leaderboard/{period}/user/{username}` - 특정 사용자 랭킹 조회
- `GET /leaderboard/{period}/search?q={query}` - 사용자 검색
- `GET /leaderboard/{period}/autocomplete?q={query}` - 자동완성

**DynamoDB GSI**: `username-period-index`

#### 4. URL 공유 및 하이라이트
```
https://nasun.io/leaderboard?user=Fall2026&highlight=true
```

**기능**:
- URL 파라미터로 사용자 지정
- 자동 하이라이트 (6초, Yellow 배경, pulse 애니메이션)
- 부드러운 스크롤 (scrollIntoView)
- 다크 모드 지원

**Hooks**:
```typescript
// URL 관리
const { user, highlight, updateUrl, removeUser } = useUrlParams();

// 하이라이트 타이머
const { isHighlighted, startHighlight, stopHighlight } = useHighlight(username);
```

#### 5. 평균 API 응답 시간
- getUserRank: 300-600ms
- searchUsers: 300-700ms
- autocomplete: 150-300ms ⚡

---

## Phase 2: 프로필 복구 시스템

### 완료 일자
2025-10-22

### 구현 내용
34명의 사용자 프로필 이미지 복구 실패 → 조사 및 분석

**원인**: X API 제한 또는 계정 상태 변경

**향후 개선 방향**: 프로필 캐싱 메커니즘 강화

---

## Phase 3: 자동완성 기능

### 완료 일자
2025-10-23

### 구현 내용 (8/8 항목 완료)

#### 1. 실시간 자동완성
```typescript
const { suggestions, isLoading } = useAutocomplete(
  debouncedQuery, // 300ms debounce
  selectedPeriod
);
```

**특징**:
- Debounce 300ms (타이핑 중 불필요한 API 호출 방지)
- AbortController (이전 요청 취소)
- 최대 5개 제안
- 키보드 지원 (ArrowUp, ArrowDown, Enter, Escape)

#### 2. 전용 API 엔드포인트
```
GET /leaderboard/{period}/autocomplete?q={query}&limit=5
```

**최적화**:
- ProjectionExpression: username, profileImageUrl만 조회 (속도 향상)
- Limit 5로 제한
- API 호출 75% 절감 효과

#### 3. 드롭다운 UI
- 프로필 이미지 + 사용자명
- 클릭 또는 Enter로 선택
- ESC로 닫기
- 포커스 아웃 시 자동 닫기

---

## Phase 3: 랭킹 변동 표시

### 완료 일자
2025-10-23

### 구현 내용 (전체 완료)

#### 1. Frontend: RankChangeIndicator 컴포넌트
**파일**: `frontend/src/components/app/Leaderboard/components/RankChangeIndicator.tsx`

**기능**:
- 4가지 direction 표시: `up` (↑), `down` (↓), `same` (=), `new` (New)
- 2가지 variant: `full` (전체 텍스트), `short` (아이콘만)
- 다크 모드 지원 (green/red/gray/blue colors)

**사용 예시**:
```typescript
// CumulativeLeaderboardRow.tsx에서 사용
<RankChangeIndicator rankChange={entry.rankChange} variant="short" />

// RankChangeData 타입
interface RankChangeData {
  direction: 'up' | 'down' | 'same' | 'new';
  amount: number;
}
```

**컴포넌트 구조**:
```typescript
const RankChangeIndicator: React.FC<RankChangeIndicatorProps> = ({ rankChange, variant = "full" }) => {
  const { direction, amount } = rankChange;

  const getShortText = () => ({
    up: `↑ ${amount}`,
    down: `↓ ${amount}`,
    same: "=",
    new: "New",
  }[direction]);

  const directionConfig = {
    up: { color: "text-green-600 dark:text-green-400" },
    down: { color: "text-red-600 dark:text-red-400" },
    same: { color: "text-gray-600 dark:text-gray-400" },
    new: { color: "text-blue-600 dark:text-blue-400" },
  };

  return <span className={config.color}>{text}</span>;
};
```

#### 2. Frontend: useRankChanges Hook
**파일**: `frontend/src/components/app/Leaderboard/hooks/useRankChanges.ts`

**기능**:
- React Query 기반 캐싱 (30분 staleTime, 1시간 gcTime)
- 전체 랭킹 변동 데이터 조회
- 4가지 편의 함수 제공

**캐싱 전략**:
```typescript
{
  staleTime: 30 * 60 * 1000, // 30분 (랭킹 변동은 자주 바뀌지 않음)
  gcTime: 60 * 60 * 1000,    // 1시간
  retry: 2,                   // 2회 재시도
}
```

**편의 함수**:
```typescript
interface UseRankChangesResult {
  data: RankChangesData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;

  // 🎯 편의 함수들
  getUserRankChange: (username: string) => RankChange | null;
  getNewEntries: () => RankChange[];
  getTopRisers: (limit?: number) => RankChange[];
  getTopFallers: (limit?: number) => RankChange[];
}
```

**사용 예시**:
```typescript
// MyRankCard에서 사용
const { data, getUserRankChange } = useRankChanges({
  period: 'CUMULATIVE',
  enabled: true,
});

const myChange = getUserRankChange('Fall2026');
// myChange = { direction: 'up', amount: 5 }
```

#### 3. Backend: Lambda 함수
**함수명**: `nasun-rank-changes`
**Handler**: `get-rank-changes.ts`
**작성일**: 2025-10-23
**최종 수정**: 2025-10-26

**API 엔드포인트**:
```
GET /leaderboard/{period}/rank-changes
```

**계산 로직**:
1. 오늘 리더보드 조회 (전체, 최대 500명)
2. 어제 스냅샷 조회 (`getLeaderboardSnapshot`)
3. 어제 데이터를 Map으로 변환 (빠른 조회)
4. 각 사용자별 랭킹 변동 계산:
   - 신규 진입: `direction = 'new'`
   - 순위 상승: `diff > 0` → `direction = 'up'`
   - 순위 하락: `diff < 0` → `direction = 'down'`
   - 순위 동일: `diff = 0` → `direction = 'same'`

**응답 구조**:
```typescript
{
  success: true,
  data: {
    period: "CUMULATIVE",
    comparisonDate: "2025-10-25", // 어제 날짜
    changes: [
      {
        username: "Fall2026",
        userId: "1503536552164556804",
        currentRank: 42,
        previousRank: 47,
        rankChange: 5,          // 5계단 상승
        direction: "up",
        currentScore: 123.45,
        previousScore: 120.30,
        scoreChange: 3.15
      },
      // ...
    ],
    total: 130,                 // 전체 사용자 수
    summary: {
      new: 10,                  // 신규 진입
      up: 50,                   // 순위 상승
      down: 40,                 // 순위 하락
      same: 30                  // 순위 동일
    }
  },
  meta: {
    apiVersion: "1.0",
    duration: "245ms",
    timestamp: "2025-10-26T12:00:00.000Z"
  }
}
```

#### 4. CumulativeLeaderboardRow에서 사용
**파일**: `frontend/src/components/app/Leaderboard/components/CumulativeLeaderboardRow.tsx`

**테이블 컬럼 추가** (line 107-110):
```tsx
{/* 순위 변동 */}
<td className="p-3 text-center">
  <RankChangeIndicator rankChange={entry.rankChange} variant="short" />
</td>
```

**데이터 플로우**:
```
[Backend] nasun-rank-changes Lambda
    ↓
[API] GET /leaderboard/cumulative/rank-changes
    ↓
[Hook] useRankChanges (React Query 캐싱)
    ↓
[MyRankCard] getUserRankChange('Fall2026')
    ↓
[RankChangeIndicator] ↑ 5 (녹색)
```

---

## Phase 3-4: 소셜 공유 기능

### 완료 일자
2025-10-23

### 구현 내용 (9/9 항목 완료)

#### 1. X(Twitter) 공유
```typescript
const shareToX = () => {
  const text = `I'm ranked #${rank} in the NASUN Leaderboard! 🎉`;
  const url = `https://nasun.io/leaderboard?user=${username}&highlight=true`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(twitterUrl, '_blank', 'width=550,height=420');
};
```

#### 2. 링크 복사
```typescript
const copyLink = async () => {
  const url = `https://nasun.io/leaderboard?user=${username}&highlight=true`;
  await navigator.clipboard.writeText(url);
  toast.success('Link copied to clipboard!');
};
```

#### 3. 이미지 생성 (향후 구현)
- html2canvas 라이브러리 사용
- 랭킹 카드 PNG 이미지 생성
- 다운로드 또는 공유

---

## Phase 5: Rank History 그래프 (My Account)

### 완료 일자
2025-10-26

### 구현 내용 (전체 완료)

#### 1. Backend: 일일 랭킹 히스토리 저장
**DynamoDB 스키마**:
```typescript
{
  pk: "USER#{userId}",                    // 예: "USER#1503536552164556804"
  sk: "RANK_HISTORY#{period}#{date}",     // 예: "RANK_HISTORY#CUMULATIVE#2025-10-26"
  userId: "1503536552164556804",
  username: "overclocksalmon",
  period: "CUMULATIVE",
  date: "2025-10-26",                     // YYYY-MM-DD
  rank: 42,
  totalScore: 123.45,
  totalLikes: 100,
  totalReplies: 50,
  totalReposts: 30,
  totalQuotes: 20,
  totalMentions: 10,
  displayName: "overclocksalmon",
  profileImageUrl: "https://...",
  followersCount: 15000,
  dominantLanguage: "en",
  ttl: 1730851200,                        // 1년 후 자동 삭제
  lastUpdated: "2025-10-26T00:10:00.000Z"
}
```

**저장 시점**: 리더보드 생성 시 자동 저장 (매일 09:10 AM KST)

**Lambda 함수**: `leaderboard-generator.ts`
```typescript
// BatchWriteItem으로 효율적 저장 (최대 25개씩)
await saveRankHistoryBatch(historyItems);
```

#### 2. Backend: 랭킹 히스토리 조회 API
**엔드포인트**: `GET /leaderboard/{period}/user/{username}/history?days=7`

**Lambda 함수**: `nasun-get-user-rank-history`
**Handler**: `get-user-rank-history.ts`

**기능**:
- DynamoDB Query (BETWEEN 조건)로 효율적 조회 (1회 API 호출로 전체 히스토리)
- **7가지 통계 자동 계산**:
  - `bestRank`: 최고 순위 (가장 낮은 rank 번호)
  - `worstRank`: 최저 순위 (가장 높은 rank 번호)
  - `averageRank`: 평균 순위 (소수점 첫째자리)
  - `currentRank`: 현재 순위
  - `totalDays`: 총 일수 (히스토리 데이터 개수)
  - `scoreIncrease`: 점수 증가량 (마지막 점수 - 첫 점수)
  - `rankImprovement`: 순위 개선 (첫 순위 - 마지막 순위, 양수면 개선)
- 에러 처리 (USER_NOT_FOUND, NO_HISTORY)

**응답 예시**:
```typescript
{
  success: true,
  data: {
    history: [
      { date: "2025-10-26", rank: 42, totalScore: 123.45, ... },
      { date: "2025-10-25", rank: 45, totalScore: 120.30, ... },
      // ...
    ],
    stats: {
      bestRank: 42,
      worstRank: 50,
      averageRank: 45.3,
      currentRank: 42,
      totalDays: 7,
      scoreIncrease: 10.5,
      rankImprovement: 8
    }
  },
  processingTimeMs: 245,
  timestamp: "2025-10-26T12:46:30.000Z"
}
```

#### 3. Frontend: RankHistoryChart 컴포넌트
**파일**: `frontend/src/components/app/Leaderboard/components/RankHistoryChart.tsx`
**라이브러리**: recharts v3.0.0

**특징**:
- **LineChart**: 순위(rank) 변화 추이만 표시
- **Y축 반전**: reversed={true} (낮은 순위가 위로)
- **반응형 디자인**: ResponsiveContainer
- **다크 모드 지원**: Tailwind dark: 클래스
- **Custom Tooltip**: 날짜, 순위, 점수 표시
- **날짜 포맷**: 한국어 "10월 26일", 영어 "10/26"
- **자동 Y축 범위**: 최소/최대 순위에 10% 패딩 추가

```typescript
<RankHistoryChart
  history={data.history}
  height={400}
/>
```

**차트 데이터**:
```typescript
interface ChartDataPoint {
  date: string;         // YYYY-MM-DD
  rank: number;         // 차트에 표시되는 값 (Y축)
  score: number;        // Tooltip에만 표시
  displayDate: string;  // X축 레이블 (M월 D일 또는 M/D)
}
```

**주요 설정**:
- **Line color**: blue-500 (rgb(59, 130, 246))
- **Stroke width**: 3px
- **Dot size**: r=4 (normal), r=6 (active)
- **Grid**: strokeDasharray="3 3"

#### 4. Frontend: RankHistorySection 컴포넌트
**파일**: `frontend/src/components/app/Leaderboard/components/RankHistorySection.tsx`
**위치**: My Account 페이지 (Twitter 계정 연동 시에만 표시)

**기능**:
- **3개 탭**: Cumulative, Event1, Event2 (기간별 전환)
- **날짜 범위 선택**: 7일, 14일, 30일, 90일, 365일
- **2개 통계 카드** (UI 표시):
  - `bestRank`: 최고 순위 (파란색 카드)
  - `averageRank`: 평균 순위 (회색 카드)
- **차트**: 순위 변화 추이 (RankHistoryChart)
- **Share on X**: 차트 스크린샷 공유 버튼
- **5가지 상태 처리**:
  - X 계정 미연결 (파란색 안내)
  - 리더보드 미참여 (노란색 안내)
  - 로딩 중 (SectionLoading)
  - 에러 (빨간색 안내)
  - 히스토리 없음 (회색 안내)

```typescript
<RankHistorySection username={user.twitterHandle} />
```

**통계 카드 UI** (line 254-272):
```tsx
{/* 최고 순위 */}
<div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
  <p className="text-xs text-blue-600 dark:text-blue-400">
    {t("rankHistory.stats.bestRank")}
  </p>
  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
    {isKorean ? `${data.stats.bestRank}위` : `#${data.stats.bestRank}`}
  </p>
</div>

{/* 평균 순위 */}
<div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
  <p className="text-xs text-gray-600 dark:text-gray-400">
    {t("rankHistory.stats.averageRank")}
  </p>
  <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
    {isKorean ? `${data.stats.averageRank}위` : `#${data.stats.averageRank}`}
  </p>
</div>
```

**참고**: `scoreIncrease`, `rankImprovement`는 백엔드에서 계산되지만 **UI에는 표시되지 않음** (향후 추가 가능)

#### 5. Frontend: Share on X 기능
**컴포넌트**: `ShareRankHistoryButton`

**기능**:
1. **html2canvas로 차트 스크린샷 캡처** (scale: 2 for 고해상도)
2. **Clipboard API로 이미지 복사** (ClipboardItem)
3. **X intent URL 열기** (새 창, 550x420)
4. **Toast 알림** (성공, 사용 안내)

**플로우**:
```
[버튼 클릭] → [차트 캡처] → [클립보드 복사] → [X 창 열기]
            → [Toast: "이미지 복사됨"]
            → [Toast: "Ctrl+V로 붙여넣기"]
```

**공유 메시지 예시**:
```
NASUN에서 나의 랭킹 히스토리를 확인해보세요! 📊

@overclocksalmon - 전체 (최근 7일)

https://nasun.io/my-account
```

#### 6. React Query Hook
```typescript
const { data, isLoading, error, isEmpty } = useUserRankHistory({
  username: 'overclocksalmon',
  period: 'CUMULATIVE',
  days: 7,
  enabled: true,
});
```

**캐싱 전략**:
- staleTime: 5분 (5분간 재요청 없이 캐시 사용)
- gcTime: 15분 (15분간 캐시 유지)
- retry: 1 (1회 재시도)

#### 7. i18n 지원
**파일**: `frontend/src/assets/locales/{en,ko}/myAccount.json`
**언어**: 한국어, 영어

**번역 항목**:
- 섹션 제목: "LEADERBOARD HISTORY" / "리더보드 히스토리"
- 탭 레이블: "Cumulative" / "전체", "Event1" / "이벤트1", "Event2" / "이벤트2"
- 날짜 범위: "7 Days" / "7일", "2 Weeks" / "2주", "4 Weeks" / "4주", "3 Months" / "3개월", "1 Year" / "1년"
- 통계 레이블 (UI 표시):
  - `bestRank`: "Best Rank" / "최고 순위"
  - `averageRank`: "Average Rank" / "평균 순위"
- 차트 레이블:
  - Y축: "Rank" / "순위"
  - Tooltip: "Rank", "Score" / "순위", "점수"
- Share 버튼: "Share on X" / "X에 공유"
- 상태 메시지:
  - 미연결: "Connect your X account..." / "X 계정을 연결하세요..."
  - 미참여: "Not participating..." / "아직 참여하지 않았습니다..."
  - 데이터 없음: "No data available" / "데이터가 없습니다"

### 배포 결과
- ✅ Lambda 함수: `nasun-get-user-rank-history` (Active)
- ✅ API Gateway: `GET /api/leaderboard/{period}/user/{username}/history`
- ✅ CloudWatch Log Group: `/aws/lambda/nasun-get-user-rank-history`
- ✅ 배포 시간: 79.33초

### 관련 문서
- [RANK_HISTORY_PHASE1_2_COMPLETION_REPORT.md](./RANK_HISTORY_PHASE1_2_COMPLETION_REPORT.md) - Backend 구현 보고서
- [RANK_HISTORY_PHASE3_5_COMPLETION_REPORT.md](./RANK_HISTORY_PHASE3_5_COMPLETION_REPORT.md) - Frontend 구현 보고서

---

## 스코어링 메트릭 최적화 (Option 2)

### 완료 일자
2025-10-26

### 구현 배경
AI 분석 기반 스코어링 메트릭 제안을 받아 현재 시스템과 비교 분석 후, 총점이 너무 커지는 문제를 해결하기 위해 Option 2 (1/5 스케일 다운)을 선택하여 구현.

### 변경 내용

#### 1. 인게이지먼트 점수 (1/5 축소)
```typescript
// Before (Phase 1 버그 수정 후)
SCORE_WEIGHT_LIKES: "0.5"
SCORE_WEIGHT_REPLIES: "1.0"
SCORE_WEIGHT_REPOSTS: "1.0"
SCORE_WEIGHT_QUOTES: "1.6"
SCORE_WEIGHT_MENTIONS: "2"

// After (Option 2 적용)
SCORE_WEIGHT_LIKES: "0.2"    // 비율: 1
SCORE_WEIGHT_REPLIES: "0.4"  // 비율: 2
SCORE_WEIGHT_REPOSTS: "0.4"  // 비율: 2
SCORE_WEIGHT_QUOTES: "0.6"   // 비율: 3
SCORE_WEIGHT_MENTIONS: "0.5" // 비율: 2.5
```

**파일**: `cdk-stack.ts:191-195, 230-234`, `env.ts:147-151`, `community.ts:272`

#### 2. 언어 가중치 미세 조정
```typescript
// Before
KOREAN_LANGUAGE_MULTIPLIER: "1.2"

// After
KOREAN_LANGUAGE_MULTIPLIER: "1.02"
```

**이유**: logBase로 이미 차별화(한국: 8, 글로벌: 30)되므로, 언어 가중치는 최소화하여 과도한 우대 방지

**파일**: `cdk-stack.ts:173`, `community.ts:272`

### 결정 근거

#### ✅ 장점
1. **직관적인 점수 범위**: 1-200점 (기존 100-800점 대비 80% 감소)
2. **비율 완벽 유지**: 1:2:2:3:2.5 (인게이지먼트 타입 간 상대적 가치 동일)
3. **균형잡힌 커뮤니티**: 한국어 우위 1.57배 → 1.34배 (34% 더 높음)
4. **관리 용이성**: 향후 가중치 조정 시에도 비슷한 범위 유지

#### 🎯 점수 범위 목표 달성
- 소규모 사용자: 1-10점 ✅
- 중규모 사용자: 10-50점 ✅
- 대규모 사용자: 50-200점 ✅

### 시뮬레이션 결과

#### 시나리오: 동일 활동 비교 (한국 vs 글로벌)
**조건**: 팔로워 10,000명, Likes 20, Replies 10, Quotes 5

**한국어 사용자**:
```
baseScore = 11
followerWeight = 4.43
languageMultiplier = 1.02
totalScore = 11 × 4.43 × 1.02 = 49.70
```

**영어 사용자**:
```
baseScore = 11
followerWeight = 3.38
languageMultiplier = 1.0
totalScore = 11 × 3.38 × 1.0 = 37.18
```

**한국어 우위**: 49.70 / 37.18 = **1.34배 (34% 더 높음)** ✅

**비교**:
- 이전 (언어 가중치 1.15): 1.51배 (51% 더 높음)
- 현재 (언어 가중치 1.02): 1.34배 (34% 더 높음)
- **차이의 대부분은 logBase(8 vs 30)에서 발생**, 언어 가중치는 보조적 역할

### 관련 문서
- [SCORING_METRICS_ANALYSIS.md](./SCORING_METRICS_ANALYSIS.md) - 상세 분석 보고서
- [LEADERBOARD_SCORING-METRICS_v2.3.md](./LEADERBOARD_SCORING-METRICS_v2.3.md) - 업데이트된 점수 메트릭 문서

---

## 최종 아키텍처

### Frontend 컴포넌트 구조
```
[CumulativeLeaderboard]
├── [MyRankCard] → useMyRank
├── [UserSearchBox] → useUserSearch, useAutocomplete
│   └── [AutocompleteDropdown]
├── [LeaderboardTable]
│   └── [CumulativeLeaderboardRow] → isHighlighted
└── [ShareButtons] → shareToX, copyLink
```

### Backend API 구조
```
GET /leaderboard/{period}/user/{username}
├→ DynamoDB Query: username-period-index
└→ Response: { rank, totalScore, profileImageUrl, ... }

GET /leaderboard/{period}/search?q={query}
├→ DynamoDB Query: username-period-index (exact match)
├→ Fallback: Scan + filter (partial match)
└→ Response: [{ rank, username, totalScore, ... }]

GET /leaderboard/{period}/autocomplete?q={query}&limit=5
├→ DynamoDB Query: username-period-index
├→ ProjectionExpression: username, profileImageUrl
└→ Response: [{ username, profileImageUrl }]
```

### Custom Hooks
```typescript
// API 호출
useMyRank(username, period) → React Query
useUserSearch(query, period) → React Query
useAutocomplete(query, period) → React Query with debounce

// URL 관리
useUrlParams() → { user, highlight, updateUrl, removeUser }

// UI 상태
useHighlight(username) → { isHighlighted, startHighlight }
```

### DynamoDB 스키마
```typescript
// GSI: username-period-index
{
  pk: "USER#fall2026",
  sk: "PERIOD#cumulative",
  username: "fall2026", // GSI PK (소문자)
  period: "cumulative", // GSI SK
  rank: 42,
  totalScore: 123.4,
  profileImageUrl: "https://...",
  displayName: "Fall2026",
  // ... other fields
}
```

---

## 참고 문서

### 구현 계획서
- [USER_RANK_SEARCH_IMPLEMENTATION_PLAN.md](./USER_RANK_SEARCH_IMPLEMENTATION_PLAN.md) - 초기 계획서

### 시스템 가이드
- [LEADERBOARD_MECHANISM_GUIDE.md](./LEADERBOARD_MECHANISM_GUIDE.md) - 리더보드 메커니즘 상세 가이드
- [LEADERBOARD_MONITORING_OPERATIONS_GUIDE.md](./LEADERBOARD_MONITORING_OPERATIONS_GUIDE.md) - 모니터링 및 운영 가이드
- [LEADERBOARD_SCORING-METRICS_v2.3.md](./LEADERBOARD_SCORING-METRICS_v2.3.md) - 점수 계산 메트릭

### 개발 가이드
- [BUILD_CONFIGURATION_GUIDE.md](./BUILD_CONFIGURATION_GUIDE.md) - 빌드 및 배포 가이드
- [LAMBDA_CREATION_GUIDE.md](./LAMBDA_CREATION_GUIDE.md) - Lambda 함수 생성 가이드

---

## 주요 기능 요약

✅ **완료된 주요 기능**:
- 사용자 랭킹 검색 (정확 일치 + 부분 일치)
- 실시간 자동완성 (Debounce 300ms, 최대 5개 제안)
- 랭킹 변동 표시 (↑↓= 아이콘)
- URL 공유 및 하이라이트 (6초 자동 강조, 다크 모드 지원)
- 소셜 공유 (X/Twitter, 링크 복사)
- **Rank History 그래프** (My Account 페이지)
  - 3개 탭 (Cumulative, Event1, Event2)
  - 날짜 범위 선택 (7일, 2주, 4주, 3개월, 1년)
  - 통계 요약 (최고 순위, 평균 순위, 점수 증가, 순위 변화)
  - Share on X 기능 (스크린샷 캡처 + 클립보드 복사)
- 스코어링 메트릭 최적화 (1/5 스케일 다운)

---

**최종 업데이트**: 2025-10-26
**작성자**: Claude Code

## Phase 4: Event 3 (Season 3) 추가

### 완료 일자
2025-12-09

### 구현 내용
새로운 리더보드 시즌 'Season 3' 추가

#### 1. Backend
- **Environment**: `EVENT3` 시작/종료일 설정
- **Config API**: `get-leaderboard-config` 핸들러에 EVENT3 추가
- **Visibility**: `VISIBLE_LEADERBOARDS`에 EVENT3 포함

#### 2. Frontend
- **Types**: `LeaderboardPeriodId` 및 `CumulativePeriod`에 `EVENT3` 추가
- **Translations**: 한국어/영어 로케일 파일에 "Season 3" / "시즌 3" 추가

#### 3. Event Details
- **Period**: 2025-12-11 ~ 2025-12-30
- **Name**: Season 3

---

## Bug Fix: 탭 동기화 Race Condition 수정

### 완료 일자
2025-12-13

### 문제 설명

**증상**: `/leaderboard` (URL 파라미터 없이) 접속 시 Season 3 탭이 활성화되지만 테이블은 Overall Cumulative 데이터가 표시됨

**두 가지 버그**:
1. ✅ `?period=event3` URL 접속 시: 테이블은 Season 3 ✓, 탭 활성화 표시 안 됨 ✗ → **대소문자 불일치로 수정 완료**
2. ✅ URL 파라미터 없이 접속 시: Season 3 탭 활성화 ✓, 테이블은 Overall Cumulative ✗ → **Race Condition으로 수정 완료**

### 근본 원인 분석

#### 원인 1: 대소문자 불일치 (Bug 1)
- URL 파라미터: `period=EVENT3` (대문자)
- `CumulativePeriod` enum 값: `event3` (소문자)
- 비교 시 불일치 발생

**해결**: `effectivePeriod` 계산 시 `toLowerCase()` 적용

#### 원인 2: useEffect Dependency Array Race Condition (Bug 2)

**Race Condition 타임라인**:
| 시점 | skipFetch | currentPeriod | 동작 |
|------|-----------|---------------|------|
| 1. 초기 로드 | `true` | `cumulative` | fetch 건너뜀 ✅ |
| 2. Smart Default 로딩 완료 | `false` | `cumulative` | ❌ **cumulative fetch 시작** |
| 3. currentPeriod 업데이트 | `false` | `event3` | event3 fetch 시작 |
| 결과 | - | - | cumulative 응답이 나중에 도착하면 덮어씀 |

**문제 코드**:
```typescript
// useLeaderboardManager.tsx
useEffect(() => {
  if (skipFetch) return;
  dataManager.fetchLeaderboard(1, state.currentPeriod);
}, [state.currentPeriod, skipFetch]); // ← skipFetch가 dependency에 있음!
```

- `skipFetch`가 `true` → `false`로 변경될 때 useEffect 실행
- 이 시점에 `currentPeriod`는 아직 `cumulative` (event3로 변경되기 전)
- 불필요한 cumulative fetch 발생

### 해결 방법

#### 수정 1: 대소문자 정규화
**파일**: `CumulativeLeaderboard.tsx`
```typescript
const urlPeriod = params.period.toLowerCase() as CumulativePeriod;
```

#### 수정 2: skipFetch를 dependency에서 제거
**파일**: `useLeaderboardManager.tsx` (Line 137)
```typescript
// Before
}, [state.currentPeriod, skipFetch]);

// After
}, [state.currentPeriod]); // ⚠️ skipFetch는 dependency에서 제외!
```

#### 수정 3: 스마트 기본값 로딩 중 early return
**파일**: `CumulativeLeaderboard.tsx` (Line 206-217)
```typescript
if (isDefaultPeriodLoading && !params.period) {
  return <SectionLoading />;
}
```

#### 수정 4: useUrlParams 초기값 즉시 읽기
**파일**: `useUrlParams.ts`
```typescript
// 초기값을 searchParams에서 직접 읽기 (useEffect 대기 없이 즉시 사용 가능)
const [params, setParams] = useState<LeaderboardUrlParams>(getParamsFromSearchParams);
```

### 수정된 파일
- `frontend/src/components/app/Leaderboard/components/CumulativeLeaderboard.tsx`
- `frontend/src/components/app/Leaderboard/hooks/useLeaderboardManager.tsx`
- `frontend/src/components/app/Leaderboard/hooks/useUrlParams.ts`

### 핵심 교훈
1. **React useEffect dependency array 주의**: 상태 변경 순서와 타이밍 고려
2. **Race Condition 디버깅**: 콘솔 로그 타임라인 분석이 핵심
3. **대소문자 정규화**: URL 파라미터와 enum 값 비교 시 항상 정규화

---