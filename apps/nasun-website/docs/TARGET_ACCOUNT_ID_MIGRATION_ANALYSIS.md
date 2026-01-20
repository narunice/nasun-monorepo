# 타겟 계정 식별자 변경 분석 보고서 (Username → User ID)

**문서 버전**: 2.2.0
**최종 수정일**: 2025-12-13
**작성자**: Claude Code
**구현 상태**: Step 1-2 완료 ✅ | Production OAuth 2.0 토큰 발급 완료 ✅

---

## 1. 개요

현재 Nasun Website의 리더보드 시스템은 타겟 트위터 계정(@Naru010110 등)을 기준으로 데이터를 수집합니다.
트위터 핸들(Username)은 사용자가 언제든 변경할 수 있으므로, 변경되지 않는 고유 식별자인 **User ID (Numeric ID)**를 기준으로 시스템을 전환하여 안정성을 확보하고자 합니다.

---

## 2. 현황 분석 (As-Is)

### 2.1 환경 변수 현황

#### Backend (CDK)
| 환경변수 | 설정 위치 | 값 (Dev) | 값 (Prod) | 상태 |
|---------|----------|---------|----------|------|
| `TARGET_USERNAME` | `cdk/.env` Line 9 | `Naru010110` | `Nasun_io` | ✅ 설정됨 |
| `TARGET_USER_ID` | `cdk/.env` Line 10 | `1863020068785004544` | `1725466995565752320` | ✅ 설정됨 |
| `X_TARGET_USERNAME` | `cdk/.env` Line 11 | `Naru010110` | `Nasun_io` | ⚠️ 중복 |
| `X_TARGET_USER_ID` | `cdk/.env` Line 12 | `1863020068785004544` | `1725466995565752320` | ⚠️ 중복 |

#### Frontend
| 환경변수 | 설정 위치 | 값 (Dev) | 값 (Prod) | 상태 |
|---------|----------|---------|----------|------|
| `VITE_TARGET_TWEET_ACCOUNT` | `.env.development` Line 174 | `Naru010110` | `Nasun_io` | ✅ 설정됨 |
| `VITE_TARGET_USER_ID` | - | - | - | ❌ 미설정 (불필요) |

### 2.2 Backend Lambda 사용 패턴

#### USER_ID 의존 (X API 호출용) ✅
| 파일 | 라인 | 함수 | X API 메서드 |
|------|------|------|-------------|
| `get-target-tweets.ts` | 108 | `getUserTweetsWithReplies()` | `v2.tweets.search()` |
| `collect-mentions.ts` | 112 | `collectUserMentions()` | `v2.userMentionTimeline()` |
| `twitter-api.ts` | 548-716 | `getUserTweetsWithReplies()` | `from:{USER_ID}` 쿼리 |
| `twitter-api.ts` | 1229-1317 | `getUserMentions()` | `userMentionTimeline(userId)` |

> ⚠️ **중요**: X API v2는 반드시 numeric User ID를 요구합니다. Username으로는 API 호출 불가.

#### USERNAME 의존 (텍스트 파싱/표시용)
| 파일 | 라인 | 함수 | 용도 |
|------|------|------|------|
| `twitter-api.ts` | 1818 | `validateTargetMentionsInBookmark()` | 멘션 텍스트에서 `@username` 검색 |
| `twitter-api.ts` | 1882-1887 | `extractValidTargetMentions()` | 멘션 유효성 검증 |
| `leaderboard-generator.ts` | 1180 | `applyHardcodedMappings()` | User ID → Username 매핑 폴백 |
| `get-target-tweets.ts` | 106 | 로깅 | 디버그 로그 출력 |

### 2.3 Frontend 사용 패턴

**모든 사용처가 USERNAME만 필요** (User ID 불필요):

| 파일 | 라인 | 용도 | 필요 값 |
|------|------|------|---------|
| `MyRankCard.tsx` | 91, 270 | 공유 메시지, X 프로필 링크 | USERNAME |
| `LeaderboardInfoSection.tsx` | 22-23, 46 | Follow Intent URL | USERNAME |
| `RankHistorySection.tsx` | 236 | 공유 메시지 생성 | USERNAME |
| `Step1WelcomeCard.tsx` | 56, 67 | 공식 계정 링크 | USERNAME |
| `Step3TaskVerificationCard.tsx` | 123-124 | Follow Intent URL | USERNAME |

> ✅ **결론**: Frontend에서는 `https://x.com/{username}`, `twitter.com/intent/follow?screen_name={username}` 등 **URL 구성에 Username이 필수**. User ID는 사용하지 않음.

### 2.4 발견된 버그

#### 🐛 BUG-001: env.ts에 TARGET_USER_ID 검증 누락
```typescript
// 현재 코드 (env.ts Line 232-234)
if (!config.targetUsername) {
  throw new Error("TARGET_USERNAME is required");
}
// ❌ targetUserId 검증이 없음!
```

**영향**: User ID가 유효하지 않아도 Lambda가 시작되어, X API 호출 시 401/403 에러 발생 가능.

---

## 3. 개선 제안 (To-Be)

### 3.1 핵심 전략

```
┌─────────────────────────────────────────────────────────────┐
│  User ID = "Single Source of Truth" (시스템 내부 로직)      │
│  Username = "Display Only" (UI 표시, 외부 링크)             │
└─────────────────────────────────────────────────────────────┘
```

| 구분 | User ID | Username |
|------|---------|----------|
| **용도** | X API 호출, DB 조회, 데이터 수집 | UI 표시, X 링크, 공유 메시지 |
| **특성** | 불변 (permanent) | 가변 (사용자 변경 가능) |
| **필수도** | 필수 (API 의존) | 필수 (UI 의존) |
| **저장 위치** | Backend 환경변수 | Backend + Frontend 환경변수 |

### 3.2 상세 변경 제안

#### A. Backend (CDK & Lambda)

**1. env.ts 검증 로직 강화** (우선순위: 높음)
```typescript
// 추가할 코드 (env.ts Line 234 이후)
if (!config.targetUserId) {
  throw new Error("TARGET_USER_ID is required");
}

// User ID 형식 검증 (숫자만 허용)
if (!/^\d+$/.test(config.targetUserId)) {
  throw new Error("TARGET_USER_ID must be numeric format");
}
```

**2. 환경 변수 정리** (우선순위: 낮음)
```bash
# 현재 (중복 존재)
TARGET_USERNAME=Naru010110
TARGET_USER_ID=1863020068785004544
X_TARGET_USERNAME=Naru010110      # 중복
X_TARGET_USER_ID=1863020068785004544  # 중복

# 권장 (통일)
TARGET_USERNAME=Naru010110
TARGET_USER_ID=1863020068785004544
# X_ 접두사 제거하여 일관성 확보
```

**3. 안전장치 추가** (선택사항)
```typescript
// Lambda 시작 시 Username과 User ID 일치 검증
const userFromApi = await twitterService.getUserByUsername(config.targetUsername);
if (userFromApi.id !== config.targetUserId) {
  console.warn(`⚠️ Username 변경 감지: ${config.targetUsername} → ${userFromApi.username}`);
  // 관리자 알림 발송 (SNS)
}
```

#### B. Frontend

**변경 불필요** ✅

| 제안 | 이유 |
|------|------|
| ~~`VITE_TARGET_USER_ID` 추가~~ | ❌ Frontend에서 User ID를 사용하는 로직 없음 |
| 기존 `VITE_TARGET_TWEET_ACCOUNT` 유지 | ✅ X 링크, Intent URL에 Username 필수 |

#### C. 문서화

`CLAUDE.md` 또는 별도 가이드에 다음 내용 추가:
```markdown
### 타겟 계정 환경변수 가이드

| 환경변수 | 용도 | 예시 값 |
|---------|------|---------|
| `TARGET_USER_ID` | X API 호출 (numeric ID 필수) | `1863020068785004544` |
| `TARGET_USERNAME` | 로깅, 텍스트 파싱 | `Naru010110` |

⚠️ X API는 Username으로 호출 불가! 반드시 numeric User ID 사용
```

---

## 4. 실행 계획 (Action Plan)

### Phase 1: 버그 수정 (필수) ✅ 완료 (2025-12-13)

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 1 | `targetUserId` 검증 로직 추가 | `env.ts` Line 253-258 | ✅ 완료 |
| 2 | User ID 형식 검증 (숫자만) 추가 | `env.ts` Line 256-258 | ✅ 완료 |

**구현 내용** (경고만 출력, 기존 동작 유지):
```typescript
// env.ts Line 253-258
if (!config.targetUserId) {
  console.warn("⚠️ TARGET_USER_ID not set, using default value. X API calls may fail.");
} else if (!/^\d+$/.test(config.targetUserId)) {
  console.warn(`⚠️ TARGET_USER_ID should be numeric format, got: "${config.targetUserId}"`);
}
```

### Phase 2: 코드 정리 (권장) - 부분 완료 ✅

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3 | `X_TARGET_*` 중복 환경변수 제거 | `cdk/.env`, `cdk-stack.ts` | ⏳ 대기 (Step 3) |
| 4 | 코드 주석에 USERNAME vs USER_ID 용도 명시 | `env.ts`, `twitter-api.ts` | ✅ 완료 |

**구현 내용**:
- `env.ts` 상단에 환경변수 가이드 주석 추가 (Line 1-18)
- `twitter-api.ts`에 3개 메서드 JSDoc 추가:
  - `getUserTweets()` (Line 411-420)
  - `getUserTweetsWithReplies()` (Line 542-549)
  - `getUserMentions()` (Line 1231-1241)

### Phase 3: 안전장치 (선택)

| # | 작업 | 파일 | 우선순위 |
|---|------|------|---------|
| 5 | Username 변경 감지 로직 추가 | `get-target-tweets.ts` | 🟢 낮음 |
| 6 | 변경 감지 시 SNS 알림 추가 | `cdk-stack.ts` | 🟢 낮음 |

### Phase 4: 검증

| # | 작업 | 환경 |
|---|------|------|
| 7 | Staging 배포 후 파이프라인 실행 | Staging |
| 8 | CloudWatch 로그에서 에러 확인 | Staging |
| 9 | 리더보드 데이터 정상 수집 확인 | Staging |

---

## 5. 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│  Step Functions Workflow                                    │
└─────────────────────────────────────────────────────────────┘

1️⃣ get-target-tweets.ts
   │
   ├─ config.targetUserId: "1863020068785004544" ──┐
   │                                               │
   │  getUserTweetsWithReplies(targetUser.id)      │
   │  → X API: from:1863020068785004544            │ USER_ID 사용
   │  → ❌ from:Naru010110 불가                    │
   │                                               │
   └─ config.targetUsername: "Naru010110" ─────────┼─── 로깅용
                                                   │
2️⃣ collect-mentions.ts                            │
   │                                               │
   ├─ collectUserMentions(targetUser.id)           │
   │  → X API: userMentionTimeline(186302...)      │ USER_ID 사용
   │                                               │
   └─ validateTargetMentionsInBookmark(            │
        [config.targetUsername]                    │
      )                                            │
      → 텍스트에서 @Naru010110 검색 ───────────────┘ USERNAME 사용

3️⃣ Frontend (React)
   │
   └─ VITE_TARGET_TWEET_ACCOUNT: "Naru010110"
      → https://x.com/Naru010110 ──────────────────── USERNAME 사용
      → twitter.com/intent/follow?screen_name=...
```

---

## 6. 롤백 계획

문제 발생 시:

```bash
# 1. env.ts 변경 롤백
git checkout HEAD~1 -- cdk/lambda-src/x-leaderboard/src/utils/env.ts

# 2. Lambda 재빌드 및 배포
cd cdk/lambda-src/x-leaderboard && npm run build && cd ../..
pnpm cdk deploy CdkStack --require-approval never

# 3. 파이프라인 수동 실행으로 검증
aws stepfunctions start-execution --state-machine-arn <ARN> --input '{}'
```

---

## 7. 참고 자료

- **X API v2 Documentation**: https://developer.x.com/en/docs/twitter-api
- **User ID 조회 도구**: https://tweeterid.com/
- **관련 Lambda 코드**:
  - `cdk/lambda-src/x-leaderboard/src/utils/env.ts`
  - `cdk/lambda-src/x-leaderboard/src/services/twitter-api.ts`
  - `cdk/lambda-src/x-leaderboard/src/handlers/batch/get-target-tweets.ts`

---

## 8. Production 환경 설정 완료 (2025-12-13)

### 8.1 타겟 계정 정보

| 항목 | 값 | 비고 |
|------|-----|------|
| **Username** | `Nasun_io` | 프로덕션 최종 핸들 |
| **User ID** | `1725466995565752320` | 변경 없음 (영구 식별자) |

### 8.2 OAuth 2.0 토큰 발급 완료

- **대상 계정**: @Nasun_io
- **발급 일시**: 2025-12-13 12:37 UTC
- **Scope**: `follows.read offline.access list.read like.read users.read tweet.read`
- **토큰 유효기간**:
  - Access Token: 2시간 (자동 갱신)
  - Refresh Token: 90일

### 8.3 Secrets Manager 업데이트

| Secret Name | Version | 상태 |
|-------------|---------|------|
| `nasun-twitter-tokens-prod` | `2.5-gensol` | ✅ 완료 |

**업데이트된 필드**:
- `oauth2.clientSecret`: `.env.production`과 동기화
- `oauth2.userAccessToken`: @Nasun_io 토큰
- `oauth2.refreshToken`: @Nasun_io 토큰
- `oauth2.expiresAt`: 2025-12-13T14:37:09.000Z
- `oauth2.lastRefreshed`: 2025-12-13T12:37:09.000Z

### 8.4 Username 변경 시 참고사항

> ⚠️ **중요**: Username 변경 시:
> 1. **토큰 재발급 불필요**: User ID가 동일하므로 기존 토큰 유효
> 2. **환경변수만 변경**: `.env.production`의 `TARGET_USERNAME`, `X_TARGET_USERNAME`
> 3. **Frontend 환경변수 변경**: `VITE_TARGET_TWEET_ACCOUNT`
> 4. **재배포 필요**: CDK + Frontend
>
> **현재 상태**: `Nasun_io`가 프로덕션 최종 핸들로 설정됨 (2026-01-20)
