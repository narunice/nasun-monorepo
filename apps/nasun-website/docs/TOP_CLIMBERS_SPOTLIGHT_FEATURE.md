# Top Climbers Spotlight Feature

**작성일**: 2025-11-23
**버전**: 1.0.0
**작성자**: Claude Code

---

## 📋 목차

1. [개요](#개요)
2. [기능 설명](#기능-설명)
3. [구현 세부사항](#구현-세부사항)
4. [컴포넌트 구조](#컴포넌트-구조)
5. [사용법](#사용법)
6. [UI/UX 개선사항](#uiux-개선사항)

---

## 개요

Top Climbers Spotlight는 지정된 기간 동안 리더보드 순위가 가장 많이 상승한 상위 5명의 사용자를 표시하는 기능입니다. 사용자는 TimeRangeSelector를 통해 Today, 7D, 4W, 3M 네 가지 시간 범위 중 하나를 선택하여 해당 기간의 상위 순위 상승자를 확인할 수 있습니다.

### 주요 특징

- ✅ **실시간 순위 변동 추적**: 선택한 기간 동안의 순위 상승폭 계산
- ✅ **반응형 그리드 레이아웃**: 모바일(1열) → 태블릿(3열) → 데스크톱(5열)
- ✅ **시간 범위 필터링**: Today, 7D, 4W, 3M 중 선택
- ✅ **이벤트 리더보드 제한**: 이벤트 기간에는 4W, 3M 비활성화
- ✅ **다크 모드 지원**: 전체 UI에서 다크 모드 완벽 지원
- ✅ **국제화**: 한국어/영어 완벽 번역

---

## 기능 설명

### 1. Top Climbers 카드

각 상위 순위 상승자는 `ClimberCard` 컴포넌트로 표시됩니다:

**표시 정보**:
- 프로필 이미지
- 사용자명 (@handle)
- 현재 순위 (#1, #2, ...)
- 순위 상승폭 (예: ↑45 또는 +45)
- "View in Leaderboard" 버튼

**상호작용**:
- 카드 클릭 시 해당 사용자가 있는 리더보드 페이지로 이동
- 6초간 노란색 하이라이트 효과 (pulse 애니메이션)

### 2. TimeRangeSelector

사용자가 조회할 시간 범위를 선택하는 컴포넌트입니다.

**시간 범위 옵션**:
- **Today**: 오늘 하루 동안의 순위 변동
- **7D**: 최근 7일 동안의 순위 변동
- **4W**: 최근 4주 동안의 순위 변동
- **3M**: 최근 3개월 동안의 순위 변동

**이벤트 제한**:
- EVENT1, EVENT2 기간에는 4W, 3M 옵션이 비활성화됩니다.
- 이벤트 리더보드는 단기간(Today, 7D)만 지원합니다.

### 3. 빈 상태 처리

**로딩 상태**:
```tsx
<SectionLoading showLayout={false} />
```

**에러 상태**:
- 빨간색 배경의 에러 메시지
- Trophy 아이콘과 함께 표시
- 에러 메시지 자세히 표시

**빈 상태** (순위 상승자 없음):
- TrendingUp 아이콘
- "No rank improvements found in this period" 메시지
- "Try selecting a different time range" 안내

---

## 구현 세부사항

### 파일 구조

```
frontend/src/components/app/Leaderboard/
├── components/
│   ├── TopClimbersSpotlight.tsx      # 메인 컨테이너
│   ├── TimeRangeSelector.tsx         # 시간 범위 선택기
│   ├── ClimberCard.tsx               # 개별 카드
│   └── CumulativeLeaderboard.tsx     # 통합 (spotlight 포함)
├── hooks/
│   ├── useTopClimbers.ts             # 데이터 fetch Hook
│   ├── useLeaderboardManager.tsx     # 전체 관리 Hook
│   └── useHighlight.ts               # 하이라이트 효과 Hook
└── types/
    └── leaderboard.ts                # 타입 정의
```

### 핵심 컴포넌트

#### TopClimbersSpotlight.tsx

```tsx
<TopClimbersSpotlight
  period={CumulativePeriod.CUMULATIVE}
  initialTimeRange="today"
  limit={5}
  onViewUserRank={(page, username) => {
    // 리더보드 테이블로 이동
    handleViewUserRank(page, username);
  }}
/>
```

**Props**:
- `period`: 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
- `initialTimeRange`: 초기 시간 범위 (기본값: "today")
- `limit`: 표시할 climbers 수 (기본값: 5)
- `onViewUserRank`: 리더보드 테이블로 점프하는 핸들러

#### TimeRangeSelector.tsx

```tsx
<TimeRangeSelector
  selectedTimeRange={selectedTimeRange}
  onTimeRangeChange={handleTimeRangeChange}
  period={period}
  loading={isLoading}
  compact={true}  // 작은 버튼 모드
/>
```

**Compact 모드**:
- `compact={true}`: 작은 버튼 그룹 (TopClimbersSpotlight용)
- `compact={false}`: 큰 버튼 그룹 (일반 필터용)

**스타일**:
- Border: `border-nasun-c4`
- Background: `bg-black/60` (compact 모드)
- Active Button: `bg-nasun-c4/80`
- Disabled Button: `opacity-40 cursor-not-allowed`

### API 엔드포인트

**GET** `/api/leaderboard/{period}/top-climbers`

**Query Parameters**:
```typescript
{
  timeRange: 'today' | '7d' | '4w' | '3m',
  limit?: number  // 기본값: 5
}
```

**Response**:
```typescript
{
  climbers: Array<{
    userId: string;
    username: string;
    displayName: string;
    profileImageUrl: string;
    currentRank: number;
    rankChange: number;  // 양수: 상승, 음수: 하락
    previousRank: number;
    currentScore: number;
  }>;
  metadata: {
    period: string;
    timeRange: string;
    totalCount: number;
    calculatedAt: string;
  };
}
```

### React Query 캐싱

```typescript
// useTopClimbers.ts
const { data, isLoading, error } = useQuery({
  queryKey: ['topClimbers', period, timeRange, limit],
  queryFn: () => fetchTopClimbers(period, timeRange, limit),
  staleTime: 5 * 60 * 1000,  // 5분
  gcTime: 15 * 60 * 1000,    // 15분
});
```

**캐싱 전략**:
- `staleTime`: 5분 (리더보드 업데이트 주기와 동일)
- `gcTime`: 15분 (메모리 효율성)
- `queryKey`: period, timeRange, limit로 구분

---

## 컴포넌트 구조

### 계층 구조

```
CumulativeLeaderboard (페이지)
└── TopClimbersSpotlight (섹션)
    ├── TimeRangeSelector (필터)
    └── ClimberCard (그리드 × 5)
        └── [사용자 카드]
```

### 데이터 흐름

```
useTopClimbers Hook
  ↓ (React Query)
API: /top-climbers?timeRange=7d&limit=5
  ↓
TopClimbersSpotlight
  ↓ (map)
ClimberCard (× 5)
  ↓ (onClick)
onViewUserRank(page, username)
  ↓
CumulativeLeaderboard
  ↓
useLeaderboardManager.handleViewUserRank()
  ↓
- setCurrentPage(page)
- startHighlight(username, 6000ms)
- scrollIntoView({ behavior: 'smooth' })
```

---

## 사용법

### 1. 기본 사용

```tsx
import TopClimbersSpotlight from './components/TopClimbersSpotlight';

function CumulativeLeaderboard() {
  const manager = useLeaderboardManager(50, CumulativePeriod.CUMULATIVE);

  return (
    <>
      <TopClimbersSpotlight
        period={manager.currentPeriod}
        onViewUserRank={manager.handlers.handleViewUserRank}
      />

      <LeaderboardTable entries={manager.entries} />
    </>
  );
}
```

### 2. 이벤트 리더보드

```tsx
<TopClimbersSpotlight
  period={CumulativePeriod.EVENT1}
  initialTimeRange="today"
  limit={5}
  onViewUserRank={handleViewUserRank}
/>
// 4W, 3M 자동 비활성화됨
```

### 3. 커스텀 limit

```tsx
<TopClimbersSpotlight
  period={period}
  limit={10}  // 상위 10명 표시
  onViewUserRank={handleViewUserRank}
/>
```

---

## UI/UX 개선사항

### 이번 구현에서 적용된 주요 개선사항

#### 1. 스타일 통일화

**Before**:
- 각 컴포넌트마다 다른 폰트 설정 (font-rubik, font-founders)
- 불일치하는 배경색 및 border 색상

**After**:
- ✅ 글로벌 CSS 추종 (커스텀 폰트 제거)
- ✅ 통일된 디자인 시스템 (border-nasun-c4, bg-black/60)
- ✅ 일관된 spacing (mb-8 md:mb-10 xl:mb-12)

#### 2. TimeRange 레이블 간략화

**Before**: "7 Days", "4 Weeks", "3 Months"
**After**: "7D", "4W", "3M"

**이유**: 모바일 화면에서 공간 절약 + 간결한 UI

#### 3. 테이블 스크롤바 개선

**Before**:
- 스크롤바가 테이블 border 밖에 표시
- rounded 모서리 적용 안 됨

**After**:
- ✅ 스크롤바가 테이블 border 내부에 표시
- ✅ rounded-xl 모서리가 스크롤바에도 적용
- ✅ 수평 스크롤 정상 작동

**구현**:
```tsx
// Table.tsx
<div className="rounded-xl overflow-hidden border">
  <div className="overflow-x-auto">
    <table className="w-full min-w-[1200px]">
      {children}
    </table>
  </div>
</div>
```

#### 4. Snapshot Viewer 배경색 통일

**Before**: `bg-black`
**After**: `bg-black/60` (TimeRangeSelector와 동일)

**이유**: 전체 UI에서 일관된 반투명 배경 사용

#### 5. 반응형 여백 개선

```tsx
// TopClimbersSpotlight.tsx
<div className="mb-8 md:mb-10 xl:mb-12">
  {/* content */}
</div>
```

**효과**:
- 모바일: 32px (mb-8)
- 태블릿: 40px (md:mb-10)
- 데스크톱: 48px (xl:mb-12)

---

## 커밋 히스토리

```bash
f6f4c4c - refactor: Improve spacing and code formatting
f1a3ab4 - fix(Table): Apply rounded corners to scrollbar area
9052fee - fix(Table): Fix horizontal scrollbar position and enable scrolling
e03cf26 - feat(LeaderboardTable): Add horizontal scrollbar for table overflow
2d988a0 - style(DatePicker): Change background to bg-black/60 for snapshot viewer
b9adbf9 - refactor(Leaderboard): Remove custom font-family settings
0f4b80d - refactor(TopClimbers): Simplify TimeRange labels and remove description
22a18e9 - refactor(TopClimbers): Remove average improvement and update TimeRangeSelector styling
```

---

## 향후 개선 가능성

### Phase 2 (추후 고려사항)

1. **순위 변동 애니메이션**:
   - 실시간으로 순위 변동 애니메이션 표시
   - Framer Motion 활용

2. **더 많은 시간 범위 옵션**:
   - Custom range picker (시작일 ~ 종료일)
   - 1 Month, 6 Months, 1 Year 추가

3. **소셜 공유 기능**:
   - "Share my rank improvement" 버튼
   - 이미지 생성 (순위 상승 자랑용)

4. **필터링 옵션**:
   - 커뮤니티 멤버만 보기
   - 언어별 필터링

5. **성과 배지**:
   - "🔥 Hot Climber" (1일 10등 이상 상승)
   - "🚀 Rocket" (1주일 50등 이상 상승)

---

## 트러블슈팅

### 문제 1: 스크롤바가 테이블 밖에 표시됨

**증상**: 스크롤바가 테이블의 rounded border 밖으로 나감

**해결**: Table 컴포넌트를 두 개의 div로 분리
```tsx
<div className="overflow-hidden">  {/* 외부: rounded 클리핑 */}
  <div className="overflow-x-auto"> {/* 내부: 스크롤 */}
    <table>{children}</table>
  </div>
</div>
```

### 문제 2: 이벤트 리더보드에서 4W, 3M 활성화됨

**증상**: 이벤트 기간에 4W, 3M 옵션 클릭 가능

**해결**: `isEventLeaderboard` 체크 로직 추가
```tsx
const isEventLeaderboard =
  period === CumulativePeriod.EVENT1 ||
  period === CumulativePeriod.EVENT2;

const isTimeRangeDisabled = (timeRange: TimeRange) => {
  if (isEventLeaderboard && (timeRange === '4w' || timeRange === '3m')) {
    return true;
  }
  return false;
};
```

### 문제 3: TopClimbers 데이터가 로딩되지 않음

**확인사항**:
1. API 엔드포인트 확인: `/api/leaderboard/{period}/top-climbers`
2. React Query queryKey 확인: `['topClimbers', period, timeRange, limit]`
3. 백엔드 Lambda 함수 확인: `nasun-get-top-climbers`

---

## 관련 문서

- **CLAUDE.md**: 프로젝트 전체 가이드
- **LEADERBOARD_MECHANISM_GUIDE.md**: 리더보드 반영 메커니즘
- **PHASE1_2_USER_RANK_SEARCH_COMPLETION_REPORT.md**: 사용자 검색 기능
- **HOMEPAGE_LOADING_PATTERN_GUIDE.md**: 로딩 패턴 가이드

---

**문서 버전**: 1.0.0
**마지막 업데이트**: 2025-11-23
**작성자**: Claude Code
