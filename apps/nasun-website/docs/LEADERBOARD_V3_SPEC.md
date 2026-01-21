# Nasun Community Leaderboard System v3 기획안

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

| Value | 설명 | Multiplier |
|-------|------|------------|
| KOL | 검증된 영향력 보유 계정 | 2.0x |
| Proactive CT | 적극적으로 콘텐츠 생성/참여하는 사용자 | 1.5x |
| Default | 일반 참여자 | 1.0x |

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

| Signal | 설명 | Bonus |
|--------|------|-------|
| Standard Mention | 일반 언급 (기본 체크, locked) | +0 |
| High Quality Insight | 분석, 통찰, 유용한 정보 | +1 |
| Memorable Creative | 이미지, 영상, 밈, AI 아트 | +1 |
| High Reach | 조회수/확산이 눈에 띄게 높음 | +1 |

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
| 시나리오 | 계산 | 점수 |
|----------|------|------|
| KOL + Insight + Creative + High Reach | (1 × 2.0) + 3 | 5.0 |
| KOL + Standard Only | (1 × 2.0) + 0 | 2.0 |
| Proactive CT + Insight + High Reach | (1 × 1.5) + 2 | 3.5 |
| Default + Standard Only | (1 × 1.0) + 0 | 1.0 |

### 3-2. 유저 총점 (UserScore) - 스팸 방지 & 꾸준함 보상

```
UserScore = RawScore × ConsistencyBonus × FreshnessMultiplier
```

#### RawScore (log 기반 감쇠 적용)
```
RawScore = Σ(PostScore) × log₂(PostCount + 1) / PostCount
```

| 실제 포스트 수 | Effective Multiplier | 효과 |
|---------------|---------------------|------|
| 1 | 1.00 | 100% |
| 2 | 0.79 | 79% |
| 4 | 0.58 | 58% |
| 8 | 0.40 | 40% |
| 16 | 0.26 | 26% |

**핵심**: 많이 올려도 점수가 선형 증가하지 않음 → 스팸 자연 억제

#### ConsistencyBonus (꾸준함 보상)
```
ConsistencyBonus = 1 + log₂(UniqueActiveDays + 1) × 0.1
```

| Active Days | Bonus |
|-------------|-------|
| 1 | 1.10 |
| 3 | 1.20 |
| 7 | 1.30 |
| 14 | 1.40 |
| 30 | 1.50 (cap) |

**핵심**: 매일 1개 > 하루 10개

#### FreshnessMultiplier (시간 기반 감쇠)
```
FreshnessMultiplier = 1 / (1 + DaysSinceLastPost / 14)
```

| 마지막 활동 | Multiplier |
|------------|------------|
| 오늘 | 1.00 |
| 7일 전 | 0.67 |
| 14일 전 | 0.50 |
| 30일 전 | 0.32 |
| 60일 전 | 0.19 |

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
  postId: string;           // UUID
  platform: 'twitter' | 'discord' | 'farcaster';
  postUrl: string;          // Unique, 정규화된 URL
  postUrlRaw: string;       // 원본 URL (디버깅용)
  accountId: string;        // FK to Account
  accountRole: 'kol' | 'proactive_ct' | 'default';
  contentSignals: ('standard' | 'insight' | 'creative' | 'high_reach')[];
  baseScore: number;        // 1.0
  roleMultiplier: number;   // 1.0 / 1.5 / 2.0
  signalBonus: number;      // 0 ~ 3
  postScore: number;        // baseScore × roleMultiplier + signalBonus
  createdAt: string;        // ISO timestamp
  createdBy: string;        // Admin username
}
```

### 4-B. Account Table
```typescript
interface Account {
  accountId: string;        // UUID
  platform: 'twitter' | 'discord' | 'farcaster';
  username: string;         // Unique per platform (= X handle)
  lastKnownRole: 'kol' | 'proactive_ct' | 'default';

  // 프로필 정보 (Internal Data Sync - UserProfiles 테이블에서 조회)
  displayName?: string;     // X display name (from UserProfiles)
  profileImageUrl?: string; // X profile image URL (from UserProfiles)
  isRegistered?: boolean;   // 나선 웹사이트 가입 여부

  // 집계 필드 (Post 등록 시 자동 업데이트)
  totalPostScore: number;   // Σ(PostScore)
  postCount: number;        // 등록된 포스트 수
  signalCountTotal: number; // Insight + Creative + High Reach 총 횟수
  uniqueActiveDays: number; // 고유 활동일 수

  // 계산된 점수 (리더보드 갱신 시 계산)
  effectivePosts: number;   // log₂(postCount + 1)
  rawScore: number;         // totalPostScore × effectivePosts / postCount
  consistencyBonus: number; // 1 + log₂(uniqueActiveDays + 1) × 0.1
  freshnessMultiplier: number; // 1 / (1 + daysSinceLastPost / 14)
  userScore: number;        // rawScore × consistencyBonus × freshnessMultiplier

  firstSeenAt: string;
  lastSeenAt: string;       // 마지막 포스트 등록일
}
```

### 4-C. Leaderboard Table (Snapshot)
```typescript
interface LeaderboardEntry {
  period: string;           // e.g., 'v3-week-2026-03', 'v3-alltime'
  rank: number;
  accountId: string;
  username: string;
  displayName?: string;     // X display name (from UserProfiles)
  profileImageUrl?: string; // X profile image URL (from UserProfiles)
  isRegistered?: boolean;   // 나선 웹사이트 가입 여부
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
- v2와 독립된 새 라우트: `/leaderboard-v3`
- 기간 선택: Weekly / Monthly / All-time
- 컬럼: Rank, Username, Score, Posts, Active Days, Last Active
- 검색: username으로 검색

### 내 랭킹 카드
- 로그인한 사용자의 X username 연동 시 표시
- 현재 순위, 점수, 등록된 포스트 수

### 커뮤니티 설명 문구
> "Nasun Leaderboard는 많이 올리는 것보다 **꾸준히 참여하는 것**을 더 중요하게 봅니다.
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

## 9. 향후 확장 여지 (v3.1+)

| Feature | 설명 | 우선순위 |
|---------|------|----------|
| Bulk Import | CSV 일괄 업로드 | High |
| 플랫폼 확장 | Discord, Farcaster | Medium |
| 시즌별 스냅샷 | Weekly/Monthly 자동 저장 | Medium |
| Season Reset | 시즌 리셋과 연계 | Medium |
| Account Badges | Community Organizer 등 | Low |
| 온체인 연동 | NFT Badge 발급 | Low |

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

### Phase 4: 프로필 데이터 표시 (Internal Data Sync)
14. UserProfiles 테이블에 GSI 추가 (`twitterHandle-index`)
15. create-post Lambda에서 UserProfiles 조회 로직 추가
16. auth-twitter callback Lambda에서 리더보드 프로필 동기화
17. 프론트엔드 프로필 이미지 및 displayName 표시

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
  identityId: string;        // PK - Cognito Identity ID
  provider: string;          // 'Twitter' | 'Google' | 'MetaMask'
  username: string;          // Display name (X API의 name 필드)
  twitterHandle: string;     // @handle (X API의 username 필드)
  twitterId: string;         // X numeric ID
  profileImageUrl: string;   // X profile image URL
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

| 파일 | 변경 내용 |
|------|----------|
| `cdk/lib/common-stack.ts` | UserProfiles GSI 추가 |
| `cdk/lambda-src/leaderboard-v3/src/types/index.ts` | Account 인터페이스에 프로필 필드 추가 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/create-post.ts` | UserProfiles 조회 로직 |
| `cdk/lambda-src/auth-twitter/src/handlers/callback.ts` | 리더보드 프로필 동기화 |
| `frontend/src/features/leaderboard-v3/components/LeaderboardV3.tsx` | 프로필 UI |

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

| 유저 | Posts | Active Days | Last Active | Raw | Consistency | Freshness | **Final** |
|------|-------|-------------|-------------|-----|-------------|-----------|-----------|
| Alice | 10 (avg 2.0) | 10 | 오늘 | 6.6 | 1.35 | 1.00 | **8.9** |
| Bob | 20 (avg 1.5) | 5 | 7일 전 | 6.5 | 1.26 | 0.67 | **5.5** |
| Carol | 5 (avg 3.0) | 5 | 오늘 | 5.8 | 1.26 | 1.00 | **7.3** |
| Dave | 30 (avg 1.0) | 3 | 14일 전 | 4.9 | 1.20 | 0.50 | **2.9** |
| Eve | 3 (avg 2.0) | 3 | 오늘 | 3.2 | 1.20 | 1.00 | **3.8** |

**결과**: Alice(꾸준 + 고품질) > Carol(소량 + 고품질) > Bob(다량 + 오래됨) > Eve(소량 + 신규) > Dave(스팸성 + 비활성)
