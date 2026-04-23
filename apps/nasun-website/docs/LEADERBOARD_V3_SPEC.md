# Nasun Community Leaderboard System v3 기획안

## 구현 현황 (2026-02-24 업데이트)

| Phase   | 설명                                 | 상태    |
| ------- | ------------------------------------ | ------- |
| Phase 1 | 데이터 모델 & 백엔드                 | ✅ 완료 |
| Phase 2 | Admin UI                             | ✅ 완료 |
| Phase 3 | 공개 리더보드                        | ✅ 완료 |
| Phase 4 | 프로필 데이터 동기화                 | ✅ 완료 |
| Phase 5 | 시즌 기반 독립 리더보드 (백엔드)     | ✅ 완료 |
| Phase 6 | 시즌 기반 독립 리더보드 (프론트엔드) | ✅ 완료 |
| Phase 7 | Telegram 채널 검증 통합              | ✅ 완료 |

### 현재 라우트

| 라우트                  | 페이지                 | 상태   |
| ----------------------- | ---------------------- | ------ |
| `/wave1/leaderboard`    | 공개 리더보드 (V3)     | Active |
| `/admin/leaderboard-v3` | Admin 포스트 등록/관리 | Active |

### Phase 5 구현 파일

**CDK Stack**

- `cdk/lib/leaderboard-v3-stack.ts` - 테이블 3개, Lambda 6개, EventBridge 스케줄

**Lambda Handlers**

- `lambda-src/leaderboard-v3/src/handlers/admin-seasons.ts` - 시즌 CRUD
- `lambda-src/leaderboard-v3/src/handlers/generate-snapshot.ts` - 일일 스냅샷 생성
- `lambda-src/leaderboard-v3/src/handlers/get-top-climbers.ts` - Top Climbers 조회
- `lambda-src/leaderboard-v3/src/handlers/get-leaderboard.ts` - 시즌/스냅샷 지원 추가
- `lambda-src/leaderboard-v3/src/handlers/create-post.ts` - seasonId 자동 할당

**Services & Types**

- `lambda-src/leaderboard-v3/src/services/dynamodb-client.ts` - 시즌 관련 쿼리 추가
- `lambda-src/leaderboard-v3/src/types/index.ts` - Season, Snapshot, SeasonAccountScore 타입

**DynamoDB Tables**

- `leaderboard-v3-seasons` - 시즌 메타데이터
- `leaderboard-v3-snapshots` - 일일 스냅샷 (TTL 90일)
- `leaderboard-v3-season-accounts` - 시즌별 계정 집계

---

## 1. 개요

### 목적

X API 자동 스크래핑의 계정 차단 리스크를 회피하면서, 관리자의 빠른 정성 판단으로 신뢰 가능한 커뮤니티 참여 순위를 생성하는 큐레이션 시스템.

### 설계 원칙

- ❌ 정량 지표 의존 제거 (likes, impressions, RT 수 등)
- ❌ X API 자동 스크래핑 제거
- ❌ 스팸 블랙리스트 / 관리자 벌점 판정
- ✅ 관리자 빠른 정성 판단만 구조화
- ✅ 긍정 신호만 수집 (부정 판단 제거)
- ✅ 관리자 입력 시간 ≤ 10초 / 포스트
- ✅ v2와 완전 독립적 (기존 시스템 보존)
- ✅ **"막지 말고, 무력화하라"** - log 기반 자연 감쇠

### 핵심 철학

> V3는 "벌점 시스템"이 아니라 **"온기가 식는 시스템"**이다.
> 계속 불을 지피는 사람이 가장 밝게 보일 뿐이다.

---

## 2. Admin 입력 필드

### Field 1: Post URL

- 외부 포스트의 직접 URL (초기 플랫폼: X/Twitter)
- Primary Key로 사용 (정규화 후)
- 중복 포스트 자동 감지
- Username만 URL에서 추출 (API 미사용)

**URL 정규화 규칙**:

- 도메인 통일: `twitter.com` → `x.com`
- 트래킹 파라미터 제거: `?s=20`, `&t=...` 등
- 프로토콜 통일: `http://` → `https://`
- 모바일 주소 처리: `mobile.twitter.com` → `x.com`

**프로필 정보 정책** (v3.1 업데이트):

- Username: URL에서 정규식으로 추출 ✅
- Display Name / Profile Image: **Internal Data Sync** 방식으로 조회
  - 포스트 등록 시 기존 UserProfiles 테이블 조회 (X API 호출 없음)
  - 가입 유저: displayName, profileImageUrl 즉시 표시
  - 미가입 유저: 기본 아바타 표시 → X 로그인 시 자동 업데이트

### Field 2: Account Role (계정 역할 - Radio 단일 선택)

"이 계정은 어떤 역할로 기여했는가?"

| Value        | 설명                                   | Multiplier |
| ------------ | -------------------------------------- | ---------- |
| KOL          | 검증된 영향력 보유 계정                | 2.0x       |
| Proactive CT | 적극적으로 콘텐츠 생성/참여하는 사용자 | 1.5x       |
| Default      | 일반 참여자                            | 1.0x       |

**설계 의도**:

- 단일 축 3단계로 단순화 (클릭 1번)
- Amplifier(단순 RT) 카테고리 제거 - 애초에 단순 RT는 수집 대상에서 자연 배제
- 관리자가 "이 사람이 누구인가?"만 빠르게 판단

**자동 Prefill**:

- 같은 계정이 이미 DB에 존재하면, 마지막 선택값을 자동 채움
- 관리자는 필요 시 수정 가능

**Role 변경 정책**:

- 과거 포스트의 점수는 변하지 않음 (Snapshot 방식)
- 미래 기여만 새로운 Role에 맞게 평가

### Field 3: Content Signals (콘텐츠 신호 - Multi-select)

"이 콘텐츠에 해당하는 신호는?" (복수 선택 가능)

| Signal               | 설명                          | Bonus |
| -------------------- | ----------------------------- | ----- |
| Standard Mention     | 일반 언급 (기본 체크, locked) | +0    |
| High Quality Insight | 분석, 통찰, 유용한 정보       | +1    |
| Memorable Creative   | 이미지, 영상, 밈, AI 아트     | +1    |
| High Reach           | 조회수/확산이 눈에 띄게 높음  | +1    |

**설계 의도**:

- 아무것도 체크 안 하면 → Standard Mention 자동 적용
- 모든 보너스 신호가 동일한 +1 가중치 (단순화)
- High Reach: 관리자가 "이건 터졌다"고 정성적으로 판단
- 최대 보너스: +3 (Insight + Creative + High Reach 모두 체크 시)

---

## 3. 점수 계산 공식

### 3-1. 포스트 단위 점수 (PostScore)

```
PostScore = Base × RoleMultiplier + SignalBonus

Base = 1
RoleMultiplier = { KOL: 2.0, Proactive CT: 1.5, Default: 1.0 }
SignalBonus = { High Quality: +1, Creative: +1, High Reach: +1 }
```

### 포스트 점수 예시

| 시나리오                              | 계산          | 점수 |
| ------------------------------------- | ------------- | ---- |
| KOL + Insight + Creative + High Reach | (1 × 2.0) + 3 | 5.0  |
| KOL + Standard Only                   | (1 × 2.0) + 0 | 2.0  |
| Proactive CT + Insight + High Reach   | (1 × 1.5) + 2 | 3.5  |
| Default + Standard Only               | (1 × 1.0) + 0 | 1.0  |

### 3-2. 유저 총점 (UserScore) - 스팸 방지 & 꾸준함 보상

```
UserScore = RawScore × ConsistencyBonus × FreshnessMultiplier
```

#### RawScore (log 기반 감쇠 적용)

```
RawScore = Σ(PostScore) × log₂(PostCount + 1) / PostCount
```

| 실제 포스트 수 | Effective Multiplier | 효과 |
| -------------- | -------------------- | ---- |
| 1              | 1.00                 | 100% |
| 2              | 0.79                 | 79%  |
| 4              | 0.58                 | 58%  |
| 8              | 0.40                 | 40%  |
| 16             | 0.26                 | 26%  |

**핵심**: 많이 올려도 점수가 선형 증가하지 않음 → 스팸 자연 억제

#### ConsistencyBonus (꾸준함 보상)

```
ConsistencyBonus = 1 + log₂(UniqueActiveDays + 1) × 0.1
```

| Active Days | Bonus      |
| ----------- | ---------- |
| 1           | 1.10       |
| 3           | 1.20       |
| 7           | 1.30       |
| 14          | 1.40       |
| 30          | 1.50 (cap) |

**핵심**: 매일 1개 > 하루 10개

#### FreshnessMultiplier (시간 기반 감쇠)

```
FreshnessMultiplier = 1 / (1 + DaysSinceLastPost / 14)
```

| 마지막 활동 | Multiplier |
| ----------- | ---------- |
| 오늘        | 1.00       |
| 7일 전      | 0.67       |
| 14일 전     | 0.50       |
| 30일 전     | 0.32       |
| 60일 전     | 0.19       |

**핵심**: 점수가 사라지는 게 아니라 **영향력이 서서히 식음**

### 3-3. 동점자 처리 (Tie-break)

정렬 우선순위:

1. **UserScore** (총점)
2. **EffectivePosts** = log₂(PostCount + 1)
3. **SignalCountTotal** (Insight + Creative + High Reach 체크 횟수)
4. **UniqueActiveDays** (고유 활동일 수)
5. **LastActivityTimestamp** (최신 활동 우선)

---

## 4. 데이터 모델

### 4-A. Post Table

```typescript
interface Post {
  postId: string; // UUID
  platform: "twitter" | "discord" | "farcaster";
  postUrl: string; // Unique, 정규화된 URL
  postUrlRaw: string; // 원본 URL (디버깅용)
  accountId: string; // FK to Account
  accountRole: "kol" | "proactive_ct" | "default";
  contentSignals: ("standard" | "insight" | "creative" | "high_reach")[];
  baseScore: number; // 1.0
  roleMultiplier: number; // 1.0 / 1.5 / 2.0
  signalBonus: number; // 0 ~ 3
  postScore: number; // baseScore × roleMultiplier + signalBonus
  createdAt: string; // ISO timestamp
  createdBy: string; // Admin username
}
```

### 4-B. Account Table

```typescript
interface Account {
  accountId: string; // UUID
  platform: "twitter" | "discord" | "farcaster";
  username: string; // Unique per platform (= X handle)
  lastKnownRole: "kol" | "proactive_ct" | "default";

  // 프로필 정보 (Internal Data Sync - UserProfiles 테이블에서 조회)
  displayName?: string; // X display name (from UserProfiles)
  profileImageUrl?: string; // X profile image URL (from UserProfiles)
  isRegistered?: boolean; // 나선 웹사이트 가입 여부

  // 집계 필드 (Post 등록 시 자동 업데이트)
  totalPostScore: number; // Σ(PostScore)
  postCount: number; // 등록된 포스트 수
  signalCountTotal: number; // Insight + Creative + High Reach 총 횟수
  uniqueActiveDays: number; // 고유 활동일 수

  // 계산된 점수 (리더보드 갱신 시 계산)
  effectivePosts: number; // log₂(postCount + 1)
  rawScore: number; // totalPostScore × effectivePosts / postCount
  consistencyBonus: number; // 1 + log₂(uniqueActiveDays + 1) × 0.1
  freshnessMultiplier: number; // 1 / (1 + daysSinceLastPost / 14)
  userScore: number; // rawScore × consistencyBonus × freshnessMultiplier

  firstSeenAt: string;
  lastSeenAt: string; // 마지막 포스트 등록일
}
```

### 4-C. Leaderboard Table (Snapshot)

```typescript
interface LeaderboardEntry {
  period: string; // e.g., 'v3-week-2026-03', 'v3-alltime'
  rank: number;
  accountId: string;
  username: string;
  displayName?: string; // X display name (from UserProfiles)
  profileImageUrl?: string; // X profile image URL (from UserProfiles)
  isRegistered?: boolean; // 나선 웹사이트 가입 여부
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;
  snapshotAt: string;
}
```

---

## 5. Admin UI 설계

### 입력 폼 (Single Column, Fast Input)

```
┌─────────────────────────────────────────┐
│  Post URL                               │
│  [_____________________________________]│
│  (Paste & Auto-detect)                  │
│  ✓ @username detected                   │
├─────────────────────────────────────────┤
│  Account Role                           │
│  ○ KOL                                  │
│  ○ Proactive CT                         │
│  ● Default                              │
├─────────────────────────────────────────┤
│  Content Signals                        │
│  ☑ Standard Mention (locked)            │
│  ☐ High Quality Insight                 │
│  ☐ Memorable Creative                   │
│  ☐ High Reach                           │
├─────────────────────────────────────────┤
│  Preview: @username | Post: 1.0pt       │
├─────────────────────────────────────────┤
│  [ Save & Next ]     [ Skip ]           │
└─────────────────────────────────────────┘
```

**키보드 단축키**:

- `1` / `2` / `3`: Account Role 선택 (KOL / Proactive CT / Default)
- `Q` / `W` / `E`: Content Signal 토글 (Insight / Creative / High Reach)
- `Enter`: Save & Next
- `Esc`: Skip

### UX 규칙

- URL 붙여넣기 → 즉시 정규화 + 중복 체크 + 계정 조회
- 기존 계정 발견 시 Account Role 자동 채움
- 키보드 단축키 지원
- 저장 후 입력창 자동 초기화
- 실시간 점수 미리보기
- Smart Paste: 페이지 포커스 시 클립보드 자동 붙여넣기 (선택적)

---

## 6. 리더보드 UI

### 공개 리더보드 페이지

- 라우트: `/wave1/leaderboard`
- 시즌 선택기: 시즌별 독립 리더보드 조회
- 컬럼: Rank, Username, Score, Posts, Active Days, Last Active
- 검색: username으로 검색
- Top Climbers Spotlight: 순위 상승자 하이라이트
- Featured Feed: 큐레이팅된 포스트 피드

### 내 랭킹 카드

- 로그인한 사용자의 X username 연동 시 표시
- 현재 순위, 점수, 등록된 포스트 수

### 커뮤니티 설명 문구

> "Nasun ecosystem Leaderboard는 많이 올리는 것보다 **꾸준히 참여하는 것**을 더 중요하게 봅니다.
> 활동을 멈추면 점수가 사라지는 것은 아니지만, 현재 시즌에서의 영향력은 시간이 지나며 자연스럽게 줄어듭니다."

---

## 7. 기술 구현 방향

### 프론트엔드

- 위치: `apps/nasun-website/frontend/src/features/leaderboard-v3/`
- v2와 완전 독립된 디렉토리 구조
- 공통 UI 컴포넌트만 재사용 (OuterBox, Button 등)

### 백엔드

- 위치: `apps/nasun-website/cdk/lambda-src/leaderboard-v3/`
- 새 DynamoDB 테이블: `leaderboard-v3-posts`, `leaderboard-v3-accounts`
- API Gateway 새 리소스: `/v3/leaderboard/*`
- GSI: `posts` 테이블에 `createdAt` 기준 GSI (기간별 집계용)

### Admin 인증

- 환경변수 `LEADERBOARD_V3_ADMIN_PASSWORD`로 단순 인증
- 브라우저 sessionStorage에 인증 상태 저장
- 향후: CloudFront/WAF IP 제한 또는 Cognito Admin Group 연동

---

## 8. 의도적으로 제거한 요소

- ❌ Like / RT / View 수 (정량 지표)
- ❌ X API 자동 스크래핑
- ❌ X API를 통한 프로필 정보 조회
- ❌ 부정 판단 필드 (Not good 등)
- ❌ 스팸 블랙리스트 / 관리자 벌점
- ❌ 관리자 장문 코멘트
- ❌ 복잡한 가중치 알고리즘 (커뮤니티 언어 가중치 등)

---

## 9. 향후 확장 여지 (v3.2+)

| Feature                 | 설명                      | 우선순위 | 상태                   |
| ----------------------- | ------------------------- | -------- | ---------------------- |
| 시즌 기반 리더보드      | 독립적 시즌 관리          | **P0**   | ✅ Phase 5+6 완료      |
| Daily Snapshots         | 매일 스냅샷 자동 생성     | **P0**   | ✅ Phase 5 완료        |
| Top Climbers            | 순위 상승자 하이라이트    | **P1**   | ✅ Phase 5+6 완료      |
| Rank Change Indicators  | ↑↓=✨ 순위 변동 표시      | **P1**   | ✅ Phase 5+6 완료      |
| User Search + Highlight | 사용자 검색 + 자동 스크롤 | **P2**   | ✅ Phase 6 완료        |
| Snapshot Date Picker    | 과거 날짜 스냅샷 조회     | **P2**   | ✅ Phase 5 백엔드 완료 |
| Bulk Import             | CSV 일괄 업로드           | Medium   | 미정                   |
| 플랫폼 확장             | Discord, Farcaster        | Medium   | 미정                   |
| Account Badges          | Community Organizer 등    | Low      | 미정                   |
| 온체인 연동             | NFT Badge 발급            | Low      | 미정                   |

---

## 10. 구현 순서

### Phase 1: 데이터 모델 & 백엔드

1. URL 정규화 유틸리티 구현 (최우선)
2. DynamoDB 테이블 생성 (posts, accounts)
   - GSI: `createdAt` 기준 (기간별 집계)
3. Lambda 핸들러 구현
   - POST /v3/posts - 포스트 등록 (계정 없으면 자동 생성)
   - GET /v3/accounts/:username - 계정 조회 (자동 prefill용)
   - GET /v3/leaderboard - 리더보드 조회
4. 점수 계산 로직 구현 (log 감쇠, ConsistencyBonus, FreshnessMultiplier)

### Phase 2: Admin UI

5. Admin 로그인 (Password 인증)
6. Admin 입력 폼 컴포넌트
7. URL 정규화 + 중복 체크 + 계정 자동 조회
8. 점수 미리보기
9. 데이터 수정/삭제 기능

### Phase 3: 공개 리더보드

10. 리더보드 페이지 (/leaderboard-v3)
11. 기간 선택 (Weekly / Monthly / All-time)
12. 사용자 검색
13. 내 랭킹 카드 (X 연동 시)

### Phase 4: 프로필 데이터 표시 (Internal Data Sync) ✅ 완료

14. UserProfiles 테이블에 GSI 추가 (`twitterHandle-index`)
15. create-post Lambda에서 UserProfiles 조회 로직 추가
16. auth-twitter callback Lambda에서 리더보드 프로필 동기화
17. 프론트엔드 프로필 이미지 및 displayName 표시

### Phase 5: 시즌 기반 독립 리더보드 (백엔드) ✅ 완료

18. DynamoDB 테이블 생성 (seasons, snapshots, season-accounts)
19. Posts 테이블 GSI 추가 (`seasonId-createdAt-index`)
20. admin-seasons Lambda (시즌 CRUD)
21. create-post Lambda 수정 (seasonId 자동 할당)
22. generate-snapshot Lambda + EventBridge 스케줄 (매일 09:00 KST)
23. get-top-climbers Lambda
24. get-leaderboard Lambda 수정 (시즌/스냅샷 지원)

### Phase 6: 시즌 기반 독립 리더보드 (프론트엔드) ✅ 완료

25. Admin 시즌 관리 UI
26. 시즌 선택기 컴포넌트
27. Top Climbers Spotlight 컴포넌트
28. Rank Change Indicator 컴포넌트
29. Featured Feed (NasunContentFeed)
30. My Rank Sidebar

### Phase 6 구현 파일

**Page**

- `frontend/src/pages/LeaderboardV3Page.tsx` - 공개 리더보드 페이지

**Components**

- `frontend/src/features/leaderboard-v3/components/LeaderboardV3.tsx` - 메인 컴포넌트
- `frontend/src/features/leaderboard-v3/components/SeasonSelector.tsx` - 시즌 선택기
- `frontend/src/features/leaderboard-v3/components/TopClimbersV3.tsx` - Top Climbers Spotlight
- `frontend/src/features/leaderboard-v3/components/LeaderboardV3Row.tsx` - 랭킹 Row (Rank Change 포함)
- `frontend/src/features/leaderboard-v3/components/main/LeaderboardMainContent.tsx` - 메인 콘텐츠 영역
- `frontend/src/features/leaderboard-v3/components/sidebar/MyRank/` - My Rank 카드
- `frontend/src/features/leaderboard-v3/components/NasunContentFeed.tsx` - Featured Feed
- `frontend/src/features/leaderboard-v3/components/FeedPostCard.tsx` - 피드 포스트 카드
- `frontend/src/features/leaderboard-v3/components/UserSearchBoxV3.tsx` - 사용자 검색

**Hooks**

- `frontend/src/features/leaderboard-v3/hooks/useSeasons.ts` - 시즌 목록 조회
- `frontend/src/features/leaderboard-v3/hooks/useSeasonLeaderboard.ts` - 시즌 리더보드 조회
- `frontend/src/features/leaderboard-v3/hooks/useTopClimbersV3.ts` - Top Climbers 조회
- `frontend/src/features/leaderboard-v3/hooks/useMyRank.ts` - 내 랭킹 조회
- `frontend/src/features/leaderboard-v3/hooks/useFeaturedFeed.ts` - Featured Feed 조회
- `frontend/src/features/leaderboard-v3/hooks/useUserSearchV3.ts` - 사용자 검색

**Services**

- `frontend/src/features/leaderboard-v3/services/leaderboardV3Api.ts` - API 클라이언트

---

## 11. 프로필 데이터 동기화 (Internal Data Sync)

### 개요

외부 X API 호출 없이 기존 웹사이트 인증 인프라를 활용하여 프로필 데이터를 가져오는 전략.

### 핵심 원리

- 포스트 등록 시 X API 호출 ❌
- 대신 기존 `UserProfiles` 테이블 조회 ✅
- 미가입 유저: 기본 아바타로 표시 → X 로그인 시 자동 업데이트

### UserProfiles 테이블 구조

```typescript
// 기존 테이블 (from auth-twitter Lambda)
interface UserProfile {
  identityId: string; // PK - Cognito Identity ID
  provider: string; // 'Twitter' | 'Google' | 'MetaMask'
  username: string; // Display name (X API의 name 필드)
  twitterHandle: string; // @handle (X API의 username 필드)
  twitterId: string; // X numeric ID
  profileImageUrl: string; // X profile image URL
  // ...
}
```

### GSI 추가 (twitterHandle-index)

- Partition Key: `twitterHandle` (String)
- Projected Attributes: `username`, `profileImageUrl`, `identityId`
- 목적: X handle로 빠른 조회

### 데이터 흐름

```
[Case A: 가입 유저]
Admin 포스트 등록 → X handle 추출 → UserProfiles 조회 (GSI)
→ displayName, profileImageUrl 발견 → leaderboard-v3-accounts에 저장
→ 리더보드에 프로필 표시 ✅

[Case B: 미가입 유저]
Admin 포스트 등록 → X handle 추출 → UserProfiles 조회 (GSI)
→ 발견 안됨 → 기본 이미지로 리더보드 등록
→ (추후) 유저가 X 로그인 → callback Lambda가 리더보드 프로필 업데이트
→ 리더보드에 프로필 표시 ✅
```

### 장점

1. **API 비용/Rate Limit 절약**: 포스트 등록 시 X API 호출 0회
2. **데이터 최신화**: 유저가 로그인할 때마다 프로필 갱신
3. **가입 유도 효과**: "로그인하면 프로필이 표시됩니다" 안내 가능

### 수정 대상 파일

| 파일                                                                | 변경 내용                             |
| ------------------------------------------------------------------- | ------------------------------------- |
| `cdk/lib/common-stack.ts`                                           | UserProfiles GSI 추가                 |
| `cdk/lambda-src/leaderboard-v3/src/types/index.ts`                  | Account 인터페이스에 프로필 필드 추가 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/create-post.ts`         | UserProfiles 조회 로직                |
| `cdk/lambda-src/auth-twitter/src/handlers/callback.ts`              | 리더보드 프로필 동기화                |
| `frontend/src/features/leaderboard-v3/components/LeaderboardV3.tsx` | 프로필 UI                             |

---

## 12. 검증 계획

### 기능 테스트

- [ ] Post 등록 → 점수 계산 정확성
- [ ] URL 정규화 (twitter.com → x.com, 파라미터 제거)
- [ ] 중복 URL 감지
- [ ] 기존 계정 Role 자동 채움
- [ ] log 감쇠 정확성 (8개 포스트 → ~40% 효율)
- [ ] ConsistencyBonus 계산 (7일 활동 → 1.30x)
- [ ] FreshnessMultiplier 계산 (14일 미활동 → 0.50x)
- [ ] 동점자 Tie-break 순서

### 프로필 동기화 테스트

- [ ] 가입 유저 포스트 등록 → 프로필 즉시 표시
- [ ] 미가입 유저 포스트 등록 → 기본 아바타 표시
- [ ] 미가입 유저 X 로그인 → 리더보드 프로필 자동 업데이트
- [ ] 프로필 변경 후 재로그인 → 리더보드 프로필 갱신

### 성능 테스트

- [ ] 관리자 1명이 시간당 300+ 포스트 입력 가능
- [ ] 리더보드 조회 < 500ms

### UX 테스트

- [ ] 입력 시간 ≤ 10초/포스트
- [ ] 키보드만으로 전체 플로우 완료 가능

---

## 12. 시뮬레이션 예시 (5명 비교)

| 유저  | Posts        | Active Days | Last Active | Raw | Consistency | Freshness | **Final** |
| ----- | ------------ | ----------- | ----------- | --- | ----------- | --------- | --------- |
| Alice | 10 (avg 2.0) | 10          | 오늘        | 6.6 | 1.35        | 1.00      | **8.9**   |
| Bob   | 20 (avg 1.5) | 5           | 7일 전      | 6.5 | 1.26        | 0.67      | **5.5**   |
| Carol | 5 (avg 3.0)  | 5           | 오늘        | 5.8 | 1.26        | 1.00      | **7.3**   |
| Dave  | 30 (avg 1.0) | 3           | 14일 전     | 4.9 | 1.20        | 0.50      | **2.9**   |
| Eve   | 3 (avg 2.0)  | 3           | 오늘        | 3.2 | 1.20        | 1.00      | **3.8**   |

**결과**: Alice(꾸준 + 고품질) > Carol(소량 + 고품질) > Bob(다량 + 오래됨) > Eve(소량 + 신규) > Dave(스팸성 + 비활성)

---

## 13. 시즌 기반 독립 리더보드 시스템 (Phase 5) ✅ 백엔드 구현 완료

### 개요

V2 시스템에서는 이벤트 기간 리더보드가 전체 누적 데이터의 날짜 필터링에 의존했다.
V3에서는 **시즌별 완전 독립 계산** 방식을 채택하여 더 유연하고 관리하기 쉬운 구조를 구현한다.

### 구현 상태 (2026-01-24)

| 항목                  | 상태 | 파일                                |
| --------------------- | ---- | ----------------------------------- |
| DynamoDB 테이블 (3개) | ✅   | `leaderboard-v3-stack.ts`           |
| Posts 테이블 GSI      | ✅   | `seasonId-createdAt-index`          |
| 시즌 CRUD Lambda      | ✅   | `admin-seasons.ts`                  |
| 스냅샷 생성 Lambda    | ✅   | `generate-snapshot.ts`              |
| Top Climbers Lambda   | ✅   | `get-top-climbers.ts`               |
| 리더보드 시즌 지원    | ✅   | `get-leaderboard.ts`                |
| EventBridge 스케줄    | ✅   | 매일 09:00 KST                      |
| 프론트엔드 UI         | ✅   | Phase 6 완료 (`/wave1/leaderboard`) |

### V2 vs V3 비교

| 항목             | V2 (의존적)               | V3 (독립적)        |
| ---------------- | ------------------------- | ------------------ |
| 이벤트 점수 계산 | 누적 데이터 → 날짜 필터링 | 시즌별 개별 집계   |
| 데이터 의존성    | 누적 테이블 필수          | 시즌 테이블만 조회 |
| 시즌 간 간섭     | 가능                      | 불가능             |
| 쿼리 복잡도      | 높음                      | 낮음               |

### V3 시즌 특징

1. **포스트 귀속**: 각 포스트는 생성 시점의 활성 시즌에 자동 귀속
2. **독립 집계**: 시즌별로 별도의 계정 집계 레코드 유지
3. **접근 제어**: 사용자는 현재 시즌만 조회, 관리자만 누적(All-time) 조회 가능
4. **스냅샷 기반**: 매일 자동 스냅샷으로 순위 변동 추적

### 시즌 상태 전이

```
upcoming ──► active ──► ended ──► archived
    │           │          │          │
    │           │          │          └─ 데이터 압축, TTL 적용
    │           │          └─ 최종 스냅샷 생성, 읽기 전용
    │           └─ 포스트 수집 중, 매일 스냅샷
    └─ 관리자만 포스트 등록 가능
```

### 시즌 간 갭 처리

- 활성 시즌이 없는 기간: 공개 리더보드에 "No active season" 표시
- 관리자는 `upcoming` 상태의 시즌에 미리 포스트 등록 가능
- 겹치는 시즌은 허용하지 않음 (날짜 중복 검증)

---

## 14. 스냅샷 시스템

### 개요

Top Climbers 기능과 순위 변동 표시를 위해 매일 리더보드 스냅샷을 생성한다.

### 스냅샷 생성 타이밍

- **시간**: 매일 09:00 KST (00:00 UTC)
- **트리거**: EventBridge Scheduler
- **대상**: 활성(active) 상태인 시즌의 리더보드

### 스냅샷 생성 프로세스

```
1. 활성 시즌 조회 (status = 'active')
2. 해당 시즌의 Season-Account 레코드 전체 조회
3. 각 계정의 userScore 계산
   - FreshnessMultiplier는 스냅샷 시점 기준
4. 점수 내림차순 정렬 → 순위 부여
5. 전일 스냅샷 조회 → rankChange 계산
6. Snapshots 테이블에 BatchWrite (상위 500명)
7. Seasons 테이블 메타데이터 업데이트
   - totalPosts, totalAccounts, topScore
```

### Rank Change 계산

```typescript
interface RankChange {
  direction: "up" | "down" | "same" | "new";
  amount: number;
}

function calculateRankChange(
  currentRank: number,
  previousRank?: number,
): RankChange {
  if (previousRank === undefined) {
    return { direction: "new", amount: 0 };
  }
  const change = previousRank - currentRank;
  if (change > 0) return { direction: "up", amount: change };
  if (change < 0) return { direction: "down", amount: Math.abs(change) };
  return { direction: "same", amount: 0 };
}
```

### 스냅샷 보존 정책

| 스냅샷 유형                | 보존 기간   | TTL    |
| -------------------------- | ----------- | ------ |
| 일반 스냅샷                | 90일        | 적용   |
| 최종 스냅샷 (시즌 종료 시) | 영구        | 미적용 |
| 아카이브된 시즌            | 관리자 결정 | 선택적 |

### 스냅샷 데이터 구조

```typescript
interface DailySnapshot {
  pk: string; // "{seasonId}#{date}" e.g., "SEASON1#2026-01-21"
  sk: string; // "RANK#{rank:04d}"
  accountId: string;
  username: string;
  platform: Platform;
  userScore: number;
  rank: number;
  previousDayRank?: number;
  rankChange: RankChange;
  // Score breakdown
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  // Profile (denormalized)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  // Meta
  snapshotDate: string; // YYYY-MM-DD
  snapshotTime: string; // ISO timestamp
  ttl?: number; // Unix timestamp for auto-delete
}
```

---

## 15. Top Climbers 기능

### 개요

일정 기간 동안 순위가 가장 많이 상승한 사용자 5명을 하이라이트하는 기능.
사용자 참여 동기 부여와 커뮤니티 활성화를 목적으로 한다.

### 시간 범위 옵션

| 옵션  | 설명        | 비교 대상                  |
| ----- | ----------- | -------------------------- |
| Today | 지난 24시간 | 어제 스냅샷 vs 오늘 스냅샷 |
| 7D    | 지난 7일    | 7일 전 스냅샷 vs 오늘      |
| 4W    | 지난 4주    | 28일 전 스냅샷 vs 오늘     |

### Top Climbers 계산

```typescript
interface TopClimber {
  rank: number; // 1-5
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  currentRank: number;
  previousRank: number;
  rankImprovement: number; // previousRank - currentRank
  currentScore: number;
  previousScore: number;
  scoreChange: number;
  percentageIncrease: number;
}

async function getTopClimbers(
  seasonId: string,
  timeRange: "today" | "7d" | "4w",
  limit: number = 5,
): Promise<TopClimber[]> {
  const today = getTodayDate();
  const compareDate = getCompareDate(today, timeRange);

  const currentSnapshot = await getSnapshot(seasonId, today);
  const previousSnapshot = await getSnapshot(seasonId, compareDate);

  const climbers = currentSnapshot
    .map((current) => {
      const previous = previousSnapshot.find(
        (p) => p.accountId === current.accountId,
      );
      if (!previous) return null; // New entry, not a climber

      const improvement = previous.rank - current.rank;
      if (improvement <= 0) return null; // Not improved

      return {
        ...current,
        previousRank: previous.rank,
        rankImprovement: improvement,
        previousScore: previous.userScore,
        scoreChange: current.userScore - previous.userScore,
        percentageIncrease:
          ((current.userScore - previous.userScore) / previous.userScore) * 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rankImprovement - a.rankImprovement)
    .slice(0, limit);

  return climbers.map((c, i) => ({ ...c, rank: i + 1 }));
}
```

### UI 표시 요소

각 Top Climber 카드에 표시되는 정보:

1. **순위 뱃지**: #1 ~ #5
2. **프로필**: 이미지 + 이름 + @username
3. **현재 순위**: 현재 리더보드 순위
4. **순위 상승**: "+47 positions" 형태
5. **점수 변화**: 현재 점수 vs 이전 점수
6. **상승률**: "+125%" 형태
7. **액션 버튼**: "View in Leaderboard" (해당 사용자로 스크롤)

### 캐싱 정책

- **캐시 시간**: 30분 (스냅샷 기반이므로 자주 변하지 않음)
- **캐시 키**: `top-climbers:{seasonId}:{timeRange}`

---

## 16. DynamoDB 스키마 확장

### 신규 테이블 1: `leaderboard-v3-seasons`

```typescript
interface Season {
  seasonId: string; // PK: "SEASON1", "SEASON2"
  sk: string; // SK: "METADATA"
  name: string; // "Season 1"
  description?: string;
  startDate: string; // "2026-01-01"
  endDate: string; // "2026-01-31"
  status: "upcoming" | "active" | "ended" | "archived";
  isDefault: boolean; // 현재 공개 시즌
  totalPosts?: number;
  totalAccounts?: number;
  topScore?: number;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}
```

### 신규 테이블 2: `leaderboard-v3-snapshots`

| Key | Type        | Description         |
| --- | ----------- | ------------------- |
| pk  | String (PK) | `{seasonId}#{date}` |
| sk  | String (SK) | `RANK#{rank:04d}`   |

### 신규 테이블 3: `leaderboard-v3-season-accounts`

| Key | Type        | Description                             |
| --- | ----------- | --------------------------------------- |
| pk  | String (PK) | `SEASON#{seasonId}#ACCOUNT#{accountId}` |
| sk  | String (SK) | `SCORE`                                 |

### 기존 테이블 확장: `leaderboard-v3-posts`

추가 필드:

- `seasonId: string` - 포스트가 속한 시즌

추가 GSI:

- **Name**: `seasonId-createdAt-index`
- **PK**: `seasonId`
- **SK**: `createdAt`
- **Projection**: ALL

---

## 17. API 엔드포인트 확장 ✅ 구현 완료

### Admin 시즌 관리 ✅

```
POST   /v3/admin/seasons                      # 시즌 생성
GET    /v3/admin/seasons                      # 시즌 목록
GET    /v3/admin/seasons/{seasonId}           # 시즌 상세
PATCH  /v3/admin/seasons/{seasonId}           # 시즌 수정
DELETE /v3/admin/seasons/{seasonId}           # 시즌 삭제 (포스트 없을 때만)
POST   /v3/admin/seasons/{seasonId}/activate  # 수동 활성화
POST   /v3/admin/seasons/{seasonId}/end       # 수동 종료
```

### Public 리더보드 ✅

```
GET    /v3/leaderboard                        # 현재 시즌 (실시간 계산)
GET    /v3/leaderboard?seasonId=...           # 특정 시즌
GET    /v3/leaderboard?snapshotDate=...       # 과거 스냅샷
GET    /v3/leaderboard?cumulative=true        # 전체 누적 (관리자 인증 필요)
GET    /v3/leaderboard/top-climbers           # Top Climbers
```

### Telegram 채널 검증 ✅ (Phase 7)

```
POST   /v3/leaderboard/verify-telegram        # Telegram 인증 + 채널 멤버십 검증
GET    /v3/leaderboard/telegram-status         # Telegram 연결 상태 조회
POST   /v3/leaderboard/disconnect-telegram     # Telegram 연결 해제
```

### Query Parameters

**GET /v3/leaderboard**

- `seasonId`: string (optional, default: active season)
- `snapshotDate`: string `YYYY-MM-DD` (optional, 과거 스냅샷 조회)
- `cumulative`: `true` (관리자 전용, Authorization 필요)
- `limit`: number (default: 100, max: 500)
- `offset`: number (default: 0)
- `breakdown`: `true` (점수 상세 내역 포함)

**GET /v3/leaderboard/top-climbers**

- `range`: `today` | `7d` | `4w` (default: `7d`)
- `seasonId`: string (optional, default: active season)
- `limit`: number (default: 10, max: 50)

---

## 18. 구현 우선순위

### P0 (필수) ✅ 백엔드 완료

| 기능                   | 이유                                    | 상태                      |
| ---------------------- | --------------------------------------- | ------------------------- |
| Daily Snapshots        | Top Climbers 및 순위 변동의 기반 데이터 | ✅ `generate-snapshot.ts` |
| Season/Event 기간 관리 | 사용자 대상 리더보드의 핵심             | ✅ `admin-seasons.ts`     |

### P1 (높음) ✅ 백엔드 완료

| 기능                           | 이유                  | 상태                     |
| ------------------------------ | --------------------- | ------------------------ |
| Top Climbers Spotlight         | 사용자 참여 동기 부여 | ✅ `get-top-climbers.ts` |
| Rank Change Indicators (↑↓=✨) | 순위 변동 시각화      | ✅ `get-leaderboard.ts`  |

### P2 (중간) ✅ 완료

| 기능                         | 이유           | 상태                     |
| ---------------------------- | -------------- | ------------------------ |
| Snapshot Date Picker         | 과거 랭킹 조회 | ✅ `?snapshotDate=` 쿼리 |
| User Search + Auto-highlight | UX 편의성      | ✅ `UserSearchBoxV3.tsx` |

### P3 (낮음)

| 기능                | 이유                      | 상태                 |
| ------------------- | ------------------------- | -------------------- |
| My Rank Card        | 로그인 시 사이드바에 표시 | ✅ `sidebar/MyRank/` |
| Rank History Charts | 분석용                    | ⏳ 미정              |

---

## 19. 마이그레이션 전략

### Step 1: LEGACY 시즌 생성

기존 포스트를 "LEGACY" 시즌으로 일괄 할당:

```typescript
const legacySeason: Season = {
  seasonId: "LEGACY",
  sk: "METADATA",
  name: "Legacy (Pre-Season)",
  description: "Posts created before season system",
  startDate: "2026-01-01", // 가장 오래된 포스트 날짜
  endDate: new Date().toISOString().split("T")[0],
  status: "ended",
  isDefault: false,
  createdAt: new Date().toISOString(),
  createdBy: "system",
};
```

### Step 2: 기존 포스트 마이그레이션

```typescript
async function migrateExistingPosts() {
  const posts = await scanAllPosts();
  for (const post of posts) {
    await updatePost(post.postId, { seasonId: "LEGACY" });
  }
}
```

### Step 3: Season-Account 재계산

LEGACY 시즌의 집계 데이터 생성:

```typescript
async function rebuildSeasonAccounts(seasonId: string) {
  const posts = await getPostsBySeason(seasonId);
  const accountMap = new Map();

  for (const post of posts) {
    // 계정별로 집계
    aggregatePostToAccount(accountMap, post);
  }

  // Season-Account 레코드 생성
  await batchWriteSeasonAccounts(seasonId, accountMap);
}
```

### Step 4: 첫 실제 시즌 생성

```typescript
const season1: Season = {
  seasonId: "SEASON1",
  sk: "METADATA",
  name: "Season 1",
  description: "First official season",
  startDate: "2026-02-01",
  endDate: "2026-02-28",
  status: "upcoming",
  isDefault: true,
  createdAt: new Date().toISOString(),
  createdBy: "admin",
};
```

---

## 20. Phase 5 검증 계획

### 시즌 관리 테스트

- [ ] 시즌 CRUD 정상 작동
- [ ] 날짜 중복 검증
- [ ] 상태 전이 (upcoming → active → ended)
- [ ] 활성 시즌 자동 감지

### 스냅샷 테스트

- [ ] 매일 09:00 KST 자동 생성
- [ ] Rank Change 계산 정확성
- [ ] TTL 적용 (90일)
- [ ] 최종 스냅샷 영구 보존

### Top Climbers 테스트

- [ ] 시간 범위별 정확한 계산 (today/7d/4w)
- [ ] 신규 진입자 제외 (climber가 아님)
- [ ] 상위 5명 정렬

### 성능 테스트

- [ ] 스냅샷 생성 < 30초 (500명 기준)
- [ ] Top Climbers 조회 < 1초
- [ ] 시즌별 리더보드 조회 < 500ms

---

## 21. Phase 7: Telegram 채널 검증 통합 ✅ 구현 완료

### 목적

커뮤니티 참여도를 높이기 위해 Telegram 채널 멤버십 검증을 LeaderboardV3Stack에 통합. 리더보드에서 Telegram 채널 가입자에게 하늘색 체크마크 배지를 표시하여 커뮤니티 가시성을 제공합니다.

### 설계 결정

- **LeaderboardV3Stack에 배치**: 기존 `link-account` Lambda 대신 LeaderboardV3Stack에 전용 핸들러를 생성. verify-telegram이 이미 UserProfiles + Accounts + SeasonAccounts 3개 테이블에 쓰기 권한을 보유하므로, Telegram 관련 로직을 한 곳에 응집.
- **Cognito Identity 미생성**: Telegram은 독립적인 로그인 수단이 아니라, 기존 인증 사용자의 **계정 연결(Link)** 방식으로만 동작.

### Lambda 핸들러

| Lambda                | 파일                              | 역할                                                        |
| --------------------- | --------------------------------- | ----------------------------------------------------------- |
| `verify-telegram`     | `handlers/verify-telegram.ts`     | Telegram Login Widget 인증 + 채널 멤버십 검증 + DB 업데이트 |
| `telegram-status`     | `handlers/telegram-status.ts`     | JWT → identityId로 UserProfiles 조회 → 연결 상태 반환       |
| `disconnect-telegram` | `handlers/disconnect-telegram.ts` | 연결 해제 (UserProfiles + Accounts + SeasonAccounts 정리)   |

### 데이터 모델 변경

**UserProfiles 테이블 (추가 필드):**

| 필드               | 타입    | 설명                      |
| ------------------ | ------- | ------------------------- |
| `isTelegramMember` | Boolean | Telegram 채널 멤버십 상태 |
| `telegramUserId`   | String  | Telegram User ID          |
| `telegramUsername` | String  | Telegram @username        |

**GSI 추가: `telegramUserId-index`**

- Partition Key: `telegramUserId`
- Projection: KEYS_ONLY
- 목적: 중복 계정 검사 시 O(1) Query (full table Scan 대체)

**Accounts 테이블 (리더보드 연동):**

- `isTelegramMember`: Boolean — 리더보드 표시용
- `telegramUserId`, `telegramUsername`: 프로필 동기화

**SeasonAccounts 테이블:**

- `isTelegramMember`: Boolean — 시즌별 리더보드 표시용

### 검증 흐름 (verify-telegram)

1. JWT 토큰에서 `identityId` 추출 (Cognito JWKS 검증)
2. Telegram Login Widget 데이터의 HMAC-SHA256 해시 검증
3. `auth_date` 유효성 검증 (5분 이내)
4. Telegram Bot API `getChatMember`로 채널 멤버십 확인
5. `telegramUserId-index` GSI Query로 중복 검사
6. UserProfiles 업데이트 (`isTelegramMember`, `telegramUserId`, `telegramUsername`)
7. twitterHandle 존재 시 Accounts + SeasonAccounts 동기화

### 프론트엔드 변경

| 파일                          | 변경 내용                                                                |
| ----------------------------- | ------------------------------------------------------------------------ |
| `hooks/useTelegramVerify.tsx` | connect/disconnect/status 로직, Telegram Login Widget 스크립트 동적 로드 |
| `ProfileHeroCard.tsx`         | Telegram AccountItem 행 추가 (5번째 Connected Account)                   |
| `components/AccountItem.tsx`  | "telegram" provider 지원, 하늘색(#26A5E4) 브랜딩                         |
| `components/AccountIcons.tsx` | Telegram 아이콘 추가                                                     |
| `components/StatusBadges.tsx` | Telegram 멤버십 배지 추가                                                |

### 환경 변수

| 변수                             | 위치          | 설명                        |
| -------------------------------- | ------------- | --------------------------- |
| `TELEGRAM_BOT_TOKEN_SECRET_NAME` | CDK .env      | Secrets Manager 시크릿 이름 |
| `TELEGRAM_CHANNEL_USERNAME`      | CDK .env      | 검증 대상 채널              |
| `VITE_TELEGRAM_BOT_ID`           | Frontend .env | Login Widget Bot ID         |

### Phase 7 검증 계획

- [x] Telegram Login Widget 팝업 인증 정상 작동
- [x] HMAC-SHA256 해시 검증 통과
- [x] 채널 미가입 시 에러 메시지 표시
- [x] 채널 가입 후 재시도 시 성공
- [x] 중복 계정 방지 (GSI Query)
- [x] Disconnect 후 재연결 가능
- [x] 리더보드 하늘색 체크마크 표시/제거
- [x] Dev + Prod 배포 완료
