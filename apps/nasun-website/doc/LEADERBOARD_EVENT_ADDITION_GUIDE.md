# 리더보드 이벤트 추가 가이드

**Last Updated**: 2025-12-13
**Version**: 3.0.0

이 문서는 리더보드 시스템에 새로운 이벤트 기간(EVENT3, EVENT4 등)을 **추가하거나 제거**하는 방법을 설명합니다.

> ⚠️ **중요**: 새 이벤트를 추가하려면 **백엔드**와 **프론트엔드** 모두 수정이 필요합니다.
> 백엔드만 수정하면 API Config에는 표시되지만 실제 데이터가 생성되지 않고,
> 프론트엔드만 수정하면 탭은 보이지만 데이터가 없습니다.

---

## 📋 목차

1. [개요](#개요)
2. [아키텍처 이해](#아키텍처-이해)
3. [새 이벤트 추가 단계](#새-이벤트-추가-단계)
4. [Season 제거 방법](#season-제거-방법)
5. [체크리스트](#체크리스트)

---

## 개요

현재 리더보드 시스템은 다음 4개의 기간을 지원합니다:

| 기간 ID | 이름 | 설명 |
|---------|------|------|
| `CUMULATIVE` | All Time | 전체 누적 리더보드 |
| `EVENT1` | Season 1 | 1차 이벤트 (2025-10-19 ~ 2025-11-18) |
| `EVENT2` | Season 2 | 2차 이벤트 (2025-11-19 ~ 2025-12-10) |
| `EVENT3` | Season 3 | 3차 이벤트 (2025-12-11 ~ 2025-12-30) |

---

## 아키텍처 이해

### 설정 흐름

```
[cdk/.env]
  ↓ (환경 변수)
[Lambda: get-leaderboard-config]
  ↓ (API 응답)
[Frontend: useLeaderboardConfig]
  ↓ (React Query 캐싱)
[UI Components]
```

### 핵심 파일

#### 백엔드 (CDK/Lambda)

| 파일 | 역할 | 필수 |
|------|------|:----:|
| `cdk/.env` | 이벤트 날짜 및 표시 설정 | ✅ |
| `cdk/lib/cdk-stack.ts` | Lambda 환경 변수 전달 | ✅ |
| `cdk/lambda-src/x-leaderboard/src/utils/env.ts` | 환경 변수 로딩 및 타입 정의 | ✅ |
| `cdk/lambda-src/x-leaderboard/src/types/leaderboard.ts` | `getEventPeriodConfigs()` 함수 | ✅ |
| `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts` | 리더보드 생성 로직 | ✅ |
| `cdk/lambda-src/x-leaderboard/src/handlers/api/get-leaderboard-config.ts` | API 핸들러 | ✅ |

#### 프론트엔드

| 파일 | 역할 | 필수 |
|------|------|:----:|
| `frontend/src/types/leaderboard.d.ts` | TypeScript 타입 | ✅ |
| `frontend/src/components/app/Leaderboard/types/leaderboard.ts` | CumulativePeriod enum | ✅ |
| `frontend/src/assets/locales/*/leaderboard.json` | 번역 | ✅ |
| `frontend/src/assets/locales/*/myAccount.json` | 번역 | ✅ |
| `frontend/src/components/app/myAccount/RankHistorySection.tsx` | My Account 페이지 | ✅ |

---

## 새 이벤트 추가 단계

### Step 1: 백엔드 환경 변수 추가

**파일**: `cdk/.env` (및 `.env.production`)

```bash
# 기존 설정
EVENT1_START_DATE=2025-10-19
EVENT1_END_DATE=2025-11-18
EVENT2_START_DATE=2025-11-19
EVENT2_END_DATE=2025-12-10

# 🆕 새 이벤트 추가
EVENT3_START_DATE=2025-12-11
EVENT3_END_DATE=2026-01-10

# VISIBLE_LEADERBOARDS에 EVENT3 추가
VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1,EVENT2,EVENT3
```

### Step 2: Lambda 환경 변수 타입 추가

**파일**: `cdk/lambda-src/x-leaderboard/src/utils/env.ts`

```typescript
// EnvConfigV2 인터페이스에 추가 (약 line 54-58)
interface EnvConfigV2 {
  // ... 기존 필드들
  event1StartDate: string;
  event1EndDate: string;
  event2StartDate: string;
  event2EndDate: string;
  // 🆕 새 이벤트 추가
  event3StartDate: string;
  event3EndDate: string;
}

// getEnvConfigV2 함수에 추가 (약 line 141-145)
event3StartDate: getEnvVar("EVENT3_START_DATE", "2025-12-11"),
event3EndDate: getEnvVar("EVENT3_END_DATE", "2026-01-10"),
```

### Step 3: 이벤트 기간 설정 함수 수정 ⭐ **NEW in v3.0.0**

**파일**: `cdk/lambda-src/x-leaderboard/src/types/leaderboard.ts`

이 파일의 `getEventPeriodConfigs()` 함수에 새 이벤트를 추가해야 합니다. 이 함수는 리더보드 생성기에서 이벤트 기간 정보를 가져올 때 사용됩니다.

```typescript
// getEventPeriodConfigs() 함수에 추가 (line ~135-148)
export function getEventPeriodConfigs(): Record<LeaderboardPeriod, EventPeriodConfig | null> {
  const config = getEnvConfigV2();

  return {
    [LeaderboardPeriod.CUMULATIVE]: null,
    [LeaderboardPeriod.EVENT1]: {
      period: LeaderboardPeriod.EVENT1,
      name: "1차 이벤트",
      description: "1차 이벤트 기간 (환경변수 기반)",
      startDate: config.event1StartDate,
      endDate: config.event1EndDate
    },
    [LeaderboardPeriod.EVENT2]: {
      period: LeaderboardPeriod.EVENT2,
      name: "2차 이벤트",
      description: "2차 이벤트 기간 (환경변수 기반)",
      startDate: config.event2StartDate,
      endDate: config.event2EndDate
    },
    // 🆕 새 이벤트 추가
    [LeaderboardPeriod.EVENT3]: {
      period: LeaderboardPeriod.EVENT3,
      name: "3차 이벤트",
      description: "3차 이벤트 기간 (환경변수 기반)",
      startDate: config.event3StartDate,
      endDate: config.event3EndDate
    }
  };
}
```

### Step 4: 리더보드 생성 로직 수정 ⭐ **NEW in v3.0.0**

**파일**: `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts`

이 파일에서 두 가지를 수정해야 합니다:

#### 4.1. 새 이벤트 생성 메서드 추가

`generateEvent2Leaderboard()` 메서드 아래에 새 메서드를 추가합니다:

```typescript
// generateEvent2Leaderboard() 아래에 추가
async generateEvent3Leaderboard(collectedEngagements?: any[]) {
  // 3차 이벤트 기간 리더보드
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[LeaderboardPeriod.EVENT3];
  if (!config) {
    throw new Error("Event3 configuration not found");
  }

  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);

  // 이벤트 종료 여부 확인 (오늘 날짜 > 종료일)
  const today = new Date().toISOString().split('T')[0];
  const eventEndDate = config.endDate.split('T')[0];
  const isEventEnded = today > eventEndDate;

  console.log(`📅 [EVENT3] 이벤트 종료 상태 확인`, {
    today,
    eventEndDate,
    isEventEnded,
    ttlPolicy: isEventEnded ? '영구 보관 (10년)' : '임시 보관 (1년)'
  });

  return this.generatePeriodLeaderboard(
    LeaderboardPeriod.EVENT3,
    startDate,
    endDate,
    config.description,
    config,
    collectedEngagements,
    isEventEnded
  );
}
```

#### 4.2. generateAllLeaderboards() 메서드 수정

`generateAllLeaderboards()` 메서드에 EVENT3 처리 로직을 추가합니다:

```typescript
// generateAllLeaderboards() 내 EVENT2 처리 블록 아래에 추가
// 3차 이벤트 기간인지 확인 후 생성
const event3Config = eventPeriodConfigs[LeaderboardPeriod.EVENT3];
if (event3Config && this.isWithinEventPeriod(today, event3Config.startDate, event3Config.endDate, "EVENT3")) {
  console.log(`📅 3차 이벤트 진행 중 (${event3Config.startDate} ~ ${event3Config.endDate})`);
  results.event3 = await this.generateEvent3Leaderboard(collectedEngagements);
} else {
  // 이벤트 기간 외: 종료 또는 미시작
  const endDate = new Date(event3Config?.endDate || "");
  endDate.setHours(23, 59, 59, 999);

  if (event3Config && today > endDate) {
    console.log(`⏭️ 3차 이벤트 종료됨 (종료일: ${event3Config.endDate})`);
  } else {
    console.log("🏆 3차 이벤트 기간이 아직 시작되지 않았지만 메타데이터를 생성합니다.");
  }

  await this.clearPeriodLeaderboard(LeaderboardPeriod.EVENT3);

  if (event3Config) {
    await this.saveLeaderboardMetadata(
      LeaderboardPeriod.EVENT3,
      0,
      event3Config.description,
      new Date(event3Config.startDate),
      new Date(event3Config.endDate)
    );
  }

  results.event3 = { period: "EVENT3", entriesGenerated: 0, topScore: 0, description: event3Config?.description || "3차 이벤트" };
}

// 로그에도 event3 추가
console.log("🏆 모든 리더보드 생성 완료", {
  cumulative: results.cumulative.entriesGenerated,
  event1: results.event1.entriesGenerated,
  event2: results.event2.entriesGenerated,
  event3: results.event3.entriesGenerated  // 🆕 추가
});
```

### Step 5: API 핸들러 수정

**파일**: `cdk/lambda-src/x-leaderboard/src/handlers/api/get-leaderboard-config.ts`

```typescript
// LEADERBOARD_DEFINITIONS 배열에 추가 (line 7-11)
const LEADERBOARD_DEFINITIONS = [
  { id: 'CUMULATIVE', name: 'All Time' },
  { id: 'EVENT1', name: 'Season 1' },
  { id: 'EVENT2', name: 'Season 2' },
  // 🆕 새 이벤트 추가
  { id: 'EVENT3', name: 'Season 3' },
];

// 날짜 매핑 로직에 추가 (line 22-28)
if (lb.id === 'EVENT1') {
  startDate = config.event1StartDate;
  endDate = config.event1EndDate;
} else if (lb.id === 'EVENT2') {
  startDate = config.event2StartDate;
  endDate = config.event2EndDate;
// 🆕 새 이벤트 추가
} else if (lb.id === 'EVENT3') {
  startDate = config.event3StartDate;
  endDate = config.event3EndDate;
}
```

### Step 6: 프론트엔드 타입 추가

**파일**: `frontend/src/types/leaderboard.d.ts`

```typescript
// LeaderboardPeriodId 타입에 추가 (line 1)
export type LeaderboardPeriodId = 'CUMULATIVE' | 'EVENT1' | 'EVENT2' | 'EVENT3';
```

**파일**: `frontend/src/components/app/Leaderboard/types/leaderboard.ts`

```typescript
// CumulativePeriod enum에 추가 (line 44-48)
export enum CumulativePeriod {
  CUMULATIVE = 'cumulative',
  EVENT1 = 'event1',
  EVENT2 = 'event2',
  // 🆕 새 이벤트 추가
  EVENT3 = 'event3',
}
```

### Step 7: 프론트엔드 번역 추가

**파일**: `frontend/src/assets/locales/en/leaderboard.json`

```json
{
  "periods": {
    "cumulative": "All Time",
    "event1": "Season 1",
    "event2": "Season 2",
    "event3": "Season 3"
  }
}
```

**파일**: `frontend/src/assets/locales/ko/leaderboard.json`

```json
{
  "periods": {
    "cumulative": "전체 누적",
    "event1": "시즌 1",
    "event2": "시즌 2",
    "event3": "시즌 3"
  }
}
```

**파일**: `frontend/src/assets/locales/en/myAccount.json`

```json
{
  "rankHistory": {
    "periods": {
      "cumulative": "All Time",
      "event1": "Season 1",
      "event2": "Season 2",
      "event3": "Season 3"
    }
  }
}
```

**파일**: `frontend/src/assets/locales/ko/myAccount.json`

```json
{
  "rankHistory": {
    "periods": {
      "cumulative": "전체 누적",
      "event1": "시즌 1",
      "event2": "시즌 2",
      "event3": "시즌 3"
    }
  }
}
```

### Step 8: 프론트엔드 UI 컴포넌트 수정

#### 8.1. Leaderboard 페이지

**파일**: `frontend/src/components/app/Leaderboard/components/CumulativePeriodSelector.tsx`

리더보드 페이지의 탭 선택기에는 자동으로 EVENT3이 표시됩니다. 백엔드 API (`get-leaderboard-config`)가 `visible: true`인 리더보드만 반환하면, `useLeaderboardConfig` Hook이 자동으로 필터링하여 탭을 생성합니다.

**특별한 수정 불필요** - 동적 구성 시스템이 자동 처리합니다.

#### 8.2. My Account 페이지

My Account 페이지의 Rank History 섹션은 **수동으로 수정**이 필요합니다.

##### 8.2.1. RankHistorySection.tsx 수정 (2곳)

**파일**: `frontend/src/components/app/myAccount/RankHistorySection.tsx`

**수정 위치 1**: `allOptions` 배열에 EVENT3 추가 (Line 90-95)

```typescript
const allOptions = [
  { value: CumulativePeriod.CUMULATIVE, label: t("rankHistory.periods.cumulative") },
  { value: CumulativePeriod.EVENT1, label: t("rankHistory.periods.event1") },
  { value: CumulativePeriod.EVENT2, label: t("rankHistory.periods.event2") },
  { value: CumulativePeriod.EVENT3, label: t("rankHistory.periods.event3") },  // ✅ 추가
];
```

**수정 위치 2**: `periodName` 계산에 EVENT3 케이스 추가 (Line 237-245)

```typescript
const periodName =
  selectedPeriod === CumulativePeriod.CUMULATIVE
    ? t("rankHistory.periods.cumulative")
    : selectedPeriod === CumulativePeriod.EVENT1
    ? t("rankHistory.periods.event1")
    : selectedPeriod === CumulativePeriod.EVENT2
    ? t("rankHistory.periods.event2")
    : t("rankHistory.periods.event3");  // ✅ EVENT3 케이스 추가
```

**영향 범위**: "리더보드 미참여" 메시지에서 올바른 시즌명 표시

##### 8.2.2. RankHistoryStatsCard.tsx 수정 (1곳)

**파일**: `frontend/src/components/app/Leaderboard/components/RankHistoryStatsCard.tsx`

**수정 위치**: 타이틀 렌더링에 EVENT3 케이스 추가 (Line 57-65)

```typescript
<h5 className="font-medium uppercase">
  {period === CumulativePeriod.CUMULATIVE
    ? t("rankHistory.leaderboardTitles.cumulative")
    : period === CumulativePeriod.EVENT1
    ? t("rankHistory.leaderboardTitles.event1")
    : period === CumulativePeriod.EVENT2
    ? t("rankHistory.leaderboardTitles.event2")
    : t("rankHistory.leaderboardTitles.event3")}  // ✅ EVENT3 케이스 추가
</h5>
```

**기대 효과**:
- EVENT3 선택 시 "시즌 3 리더보드" / "Season 3 Leaderboard" 정확히 표시
- 더 이상 EVENT2 타이틀로 폴백되지 않음

---

### Step 9: 배포

```bash
# 1. 백엔드 배포
cd cdk
pnpm deploy:dev  # 또는 pnpm deploy:prod

# 2. 프론트엔드 빌드 및 배포
cd ../frontend
npm run build
# (S3 또는 호스팅 서비스에 배포)
```

---

## Season 제거 방법

리더보드에서 특정 Season을 숨기고 싶을 때는 `VISIBLE_LEADERBOARDS` 환경 변수에서 제거하면 됩니다.

**파일**: `cdk/.env`

```bash
# 모든 리더보드 표시 (기본)
VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1,EVENT2,EVENT3

# EVENT2를 숨기고 싶을 때
VISIBLE_LEADERBOARDS=CUMULATIVE,EVENT1,EVENT3

# CUMULATIVE도 함께 숨기고 싶을 때
VISIBLE_LEADERBOARDS=EVENT1,EVENT3

# 오직 EVENT3만 표시하고 싶을 때
VISIBLE_LEADERBOARDS=EVENT3
```

### 동작 방식

1. 백엔드 API (`get-leaderboard-config`)가 `visible: false`로 반환
2. 프론트엔드는 `availableLeaderboards` 필터링으로 자동 숨김
3. **프론트엔드 재배포 불필요** - API 기반 동적 구성

### 적용 범위

- ✅ **Leaderboard 페이지**: 자동 필터링 (동적 구성)
- ✅ **My Account 페이지**: 자동 필터링 (`RankHistorySection.tsx` Line 102-106)

### 스마트 기본값 동작

CUMULATIVE가 숨겨지면 다음 우선순위로 기본 탭이 선택됩니다:

1. **진행 중인 이벤트** - 오늘 날짜가 `startDate` ~ `endDate` 사이인 이벤트
2. **가장 최근 종료된 이벤트** - 종료된 이벤트 중 `endDate`가 가장 최근인 것
3. **첫 번째 visible 리더보드** - 위 조건에 해당하는 것이 없을 때
4. **Fallback** - 'cumulative' (모든 조건이 실패할 경우)

이 로직은 다음 파일에 구현되어 있습니다:
- `frontend/src/components/app/Leaderboard/utils/getSmartDefaultPeriod.ts`
- `frontend/src/components/app/Leaderboard/hooks/useSmartDefaultPeriod.ts`

---

## 체크리스트

새 이벤트 추가 시 확인 사항:

### 백엔드 (6개 파일)
- [ ] `cdk/.env`에 `EVENT{N}_START_DATE`, `EVENT{N}_END_DATE` 추가
- [ ] `cdk/.env`의 `VISIBLE_LEADERBOARDS`에 `EVENT{N}` 추가
- [ ] `cdk/lib/cdk-stack.ts`에 Lambda 환경 변수 추가 (여러 Lambda에 전달)
- [ ] `env.ts`에 타입(`EnvConfigV2`) 및 파싱 로직(`getEnvConfigV2`) 추가
- [ ] `leaderboard.ts`의 `getEventPeriodConfigs()` 함수에 EVENT{N} 추가 ⭐ **v3.0.0 추가**
- [ ] `leaderboard-generator.ts`에 `generateEvent{N}Leaderboard()` 메서드 추가 ⭐ **v3.0.0 추가**
- [ ] `leaderboard-generator.ts`의 `generateAllLeaderboards()`에 EVENT{N} 처리 로직 추가 ⭐ **v3.0.0 추가**
- [ ] `get-leaderboard-config.ts`에 `LEADERBOARD_DEFINITIONS` 추가
- [ ] `get-leaderboard-config.ts`에 날짜 매핑 로직 추가
- [ ] CDK 배포 (`pnpm deploy:dev` 또는 `pnpm deploy:prod`)

### 프론트엔드
- [ ] `leaderboard.d.ts`에 `LeaderboardPeriodId` 타입 추가
- [ ] `leaderboard.ts`에 `CumulativePeriod` enum 값 추가
- [ ] `leaderboard.json` (en/ko)에 번역 추가
- [ ] `myAccount.json` (en/ko)에 번역 추가
- [ ] **My Account 페이지 수정** (v2.0.0 추가):
  - [ ] `RankHistorySection.tsx`: `allOptions` 배열에 EVENT{N} 추가
  - [ ] `RankHistorySection.tsx`: `periodName` 계산에 EVENT{N} 케이스 추가
  - [ ] `RankHistoryStatsCard.tsx`: 타이틀 렌더링에 EVENT{N} 케이스 추가
- [ ] 프론트엔드 빌드 및 배포

### 검증
- [ ] API 응답 확인: `GET /api/leaderboard/config`
- [ ] **Leaderboard 페이지** 검증:
  - [ ] 새 탭이 표시되는지 확인
  - [ ] 탭 클릭 시 데이터가 정상 로딩되는지 확인
- [ ] **My Account 페이지** 검증 (v2.0.0 추가):
  - [ ] RankHistorySection에서 새 탭이 표시되는지 확인
  - [ ] 새 탭 선택 시 데이터가 정상 로딩되는지 확인
  - [ ] RankHistoryStatsCard에서 올바른 타이틀이 표시되는지 확인 (예: "시즌 3 리더보드")
  - [ ] "리더보드 미참여" 메시지에서 올바른 시즌명이 표시되는지 확인
  - [ ] 스냅샷 모드 동작 확인 (이벤트 종료 시 최신 스냅샷 자동 폴백)
- [ ] 스마트 기본값 동작 확인 (진행 중인 이벤트가 기본 선택되는지)

---

## 참고 문서

- [LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md](LEADERBOARD_DYNAMIC_CONFIG_IMPLEMENTATION_REPORT.md) - 동적 설정 구현 보고서
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 전체 가이드

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 3.0.0 | 2025-12-13 | **리더보드 생성 로직 추가**: `leaderboard.ts`의 `getEventPeriodConfigs()` 수정 (Step 3), `leaderboard-generator.ts`의 생성 메서드 및 `generateAllLeaderboards()` 수정 (Step 4) 추가. 백엔드/프론트엔드 모두 수정 필요함을 강조하는 경고 메시지 추가. |
| 2.0.0 | 2025-12-10 | **종합 가이드로 업그레이드**: My Account 페이지 수정 방법 추가 (Step 8.2), Season 제거 방법 섹션 추가, 검증 체크리스트 확장 (My Account 5개 항목 추가) |
| 1.0.0 | 2025-12-01 | 최초 작성 |
