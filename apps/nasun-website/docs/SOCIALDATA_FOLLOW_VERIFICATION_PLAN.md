# Battalion NFT Follow 검증: SocialData API 통합 계획

## 최종 결과: 현재 구현 유지 (2026-01-19)

**SocialData API가 deprecated 되어 Follow 검증 기능 구현 불가.**

```
GET https://api.socialdata.tools/twitter/user/{source}/following/{target}
→ {"status":"error","message":"Deprecated: this endpoint is no longer available."}
```

X Legal Team의 요구로 비공개 데이터 관련 엔드포인트가 모두 중단됨.

### 현재 상태 (유지)
- **Follow**: 권장 (Intent URL로 유도, 필수 아님)
- **Like**: 필수 (X API v2로 검증)
- **Retweet**: 필수 (X API v2로 검증)

---

## (Archived) 개요

Battalion NFT 이벤트에서 사용자가 타겟 계정(@Nasun_io)을 팔로우했는지 검증하는 기능을 추가합니다.
X API Basic Plan($175/month)에서 followers/following 엔드포인트 접근이 불가능하므로 SocialData API를 활용합니다.

### 문서 정보
- **작성일**: 2026-01-19
- **작성자**: Claude Code
- **상태**: ~~계획 단계~~ → **취소 (API Deprecated)**

### 롤백 포인트
```bash
git stash list
# stash@{0}: On main: rollback-point: before SocialData API follow verification implementation
# 롤백 방법: git stash pop
```

---

## 1. 배경

### 1.1 X API Basic Plan 제약사항

X API Basic Plan에서 다음 엔드포인트들이 `client-not-enrolled` 에러를 반환합니다:

| 엔드포인트 | 용도 | 에러 |
|-----------|------|------|
| `GET /2/users/:id/followers` | 타겟 계정의 팔로워 목록 | 403 client-not-enrolled |
| `GET /2/users/:id/following` | 사용자의 팔로잉 목록 | 403 client-not-enrolled |
| `GET /1.1/friendships/show` | 두 계정 간 관계 확인 | 453 limited v1.1 endpoints |

### 1.2 현재 검증 가능한 태스크

| 태스크 | X API 엔드포인트 | 상태 |
|--------|-----------------|------|
| Like | `GET /2/users/:id/liked_tweets` | ✅ 작동 |
| Retweet | `GET /2/tweets/:id/retweeted_by` | ✅ 작동 |
| Follow | - | ❌ 검증 불가 (현재 "권장"으로 표시) |

### 1.3 현재 구현 상태

```typescript
// Step3TaskVerificationCard.tsx (Line 119-122)
// Follow는 X API Basic Plan 미지원으로 제거됨
const tasks: Array<{ type: TaskType; label: string }> = [
  { type: "LIKE", label: t("step3.tasks.like") },
  { type: "RETWEET", label: t("step3.tasks.retweet") },
];
```

Follow는 Intent URL 버튼으로 팔로우 화면을 열어주지만, 실제 검증은 수행하지 않습니다.

---

## 2. 해결책: SocialData API

### 2.1 SocialData API 소개

[SocialData](https://socialdata.tools)는 X(Twitter) 데이터를 제공하는 서드파티 API 서비스입니다.
공식 X API의 제약을 우회하여 팔로워/팔로잉 관계를 확인할 수 있습니다.

### 2.2 Verify User Following 엔드포인트

**URL**: `GET https://api.socialdata.tools/twitter/user/{source_user_id}/following/{target_user_id}`

**특징**:
- 전체 팔로워 목록을 스크래핑하지 않고 즉시 결과 반환
- 최소 지연시간으로 정확한 결과 제공

### 2.3 요청/응답 예시

```bash
# Request
curl -X GET "https://api.socialdata.tools/twitter/user/1234567890/following/1863020068785004544" \
  -H "Authorization: Bearer <SOCIALDATA_API_KEY>"

# Response (200 OK)
{
  "status": "success",
  "source_user_id": "1234567890",
  "target_user_id": "1863020068785004544",
  "is_following": true
}
```

### 2.4 비용 및 제한

| 항목 | 값 |
|------|-----|
| 비용 | ~$0.0002/요청 ($0.20/1,000건) |
| Rate Limit | 120 req/min |
| 인증 | Bearer Token (API Key) |

### 2.5 HTTP 상태 코드

| 코드 | 의미 | 처리 |
|------|------|------|
| 200 | 성공 | `is_following` 값 사용 |
| 402 | 크레딧 부족 | 에러 메시지 표시 |
| 404 | 사용자 없음 | `is_following: false` 처리 |
| 422 | 유효성 검사 실패 | 에러 메시지 표시 |
| 429 | Rate Limit 초과 | **재시도 메시지 + 지수 백오프** |
| 500 | 서버 오류 | 재시도 또는 에러 메시지 |

### 2.6 Rate Limit 고려사항

**제한**: 120 req/min (초당 2건)

**병목 시나리오**: 이벤트 오픈 직후 500명 동시 요청 시 380명 에러 발생 가능

**대응 전략**:
1. HTTP 429 에러 명시적 처리
2. 지수 백오프(Exponential Backoff) 재시도 로직
3. 프론트엔드에 "잠시 후 다시 시도해주세요" 메시지

---

## 3. 시스템 아키텍처

### 3.1 현재 구조

```
Frontend (Step 3)
    ↓
[Verify Tasks Button]
    ↓
useBattalionNftVerification()
    ↓
battalionNftApi.verifyEligibilityApi()
    ↓
Backend Lambda: verify-eligibility
    ↓
┌──────────────────────────────┐
│ VerificationService          │
│ └─ XApiClient.verifyAll()    │ ← Like, Retweet만 검증
│    ├─ checkLiked()           │
│    └─ checkRetweeted()       │
└──────────────────────────────┘
```

### 3.2 변경 후 구조

```
Frontend (Step 3)
    ↓
[Verify Tasks Button]
    ↓
useBattalionNftVerification()
    ↓
battalionNftApi.verifyEligibilityApi()
    ↓
Backend Lambda: verify-eligibility
    ↓
┌──────────────────────────────────────────┐
│ VerificationService                       │
│ ├─ SocialDataClient.checkFollowing()     │ ← 신규: Follow 검증
│ └─ XApiClient.verifyAll()                │
│    ├─ checkLiked()                       │
│    └─ checkRetweeted()                   │
└──────────────────────────────────────────┘
```

---

## 4. 구현 계획

### 4.1 파일 구조 변경

```
apps/nasun-website/cdk/lambda-src/nft-event/verify-eligibility/src/
├── services/
│   ├── xApiClient.ts          # 기존 (Like, Retweet)
│   ├── socialDataClient.ts    # 신규 (Follow)
│   └── verificationService.ts # 수정 (Follow 검증 추가)
├── index.ts                   # 수정 (환경변수)
└── utils/
    └── env.ts                 # 수정 (환경변수)
```

### 4.2 수정 파일 목록

| 순서 | 파일 | 변경 내용 |
|------|------|----------|
| 1 | `.env.development`, `.env.production` | `SOCIALDATA_API_KEY` 추가 |
| 2 | `utils/env.ts` | 환경변수 타입 추가 |
| 3 | `services/socialDataClient.ts` | **신규** - SocialData API 클라이언트 |
| 4 | `services/verificationService.ts` | Follow 검증 로직 추가 |
| 5 | `index.ts` | 환경변수 로드 |
| 6 | `cards/Step3TaskVerificationCard.tsx` | Follow 태스크 UI 복원 |
| 7 | CDK Stack | Lambda 환경변수 추가 |
| 8 | AWS Secrets Manager | API Key 저장 |

### 4.3 핵심 파일 경로

| 위치 | 파일 | 역할 |
|------|------|------|
| Frontend | `frontend/src/components/app/wave1/battalion-nft/cards/Step3TaskVerificationCard.tsx` | 태스크 UI |
| Frontend | `frontend/src/hooks/useBattalionNftVerification.ts` | API 호출 hook |
| Frontend | `frontend/src/services/battalionNftApi.ts` | API 클라이언트 |
| Backend | `cdk/lambda-src/nft-event/verify-eligibility/src/index.ts` | Lambda 핸들러 |
| Backend | `cdk/lambda-src/nft-event/verify-eligibility/src/services/xApiClient.ts` | X API 클라이언트 |
| Backend | `cdk/lambda-src/nft-event/verify-eligibility/src/services/verificationService.ts` | 검증 로직 |

---

## 5. 상세 구현

### 5.1 SocialData API Client (신규)

**파일**: `cdk/lambda-src/nft-event/verify-eligibility/src/services/socialDataClient.ts`

```typescript
/**
 * SocialData API Client
 * X API의 Follow 검증 기능을 대체하는 서드파티 API 클라이언트
 *
 * @see https://docs.socialdata.tools/social-actions/verify-user-following/
 */

const SOCIALDATA_BASE_URL = 'https://api.socialdata.tools';

interface SocialDataFollowResponse {
  status: 'success' | 'error';
  source_user_id: string;
  target_user_id: string;
  is_following: boolean;
  message?: string;
}

export class SocialDataClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SocialData API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * 사용자가 타겟 계정을 팔로우하고 있는지 확인
   * @param sourceUserId - 확인할 사용자의 X User ID
   * @param targetUserId - 팔로우 대상 계정의 X User ID
   * @returns 팔로우 여부 (true/false)
   */
  async checkFollowing(sourceUserId: string, targetUserId: string): Promise<boolean> {
    const url = `${SOCIALDATA_BASE_URL}/twitter/user/${sourceUserId}/following/${targetUserId}`;

    console.log(`[SocialData] Checking if ${sourceUserId} follows ${targetUserId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 402) {
      throw new Error('SocialData API: Insufficient credits');
    }

    if (response.status === 429) {
      throw new Error('SocialData API: Rate limit exceeded. Please try again in a moment.');
    }

    if (response.status === 404) {
      // 사용자를 찾을 수 없음 = 팔로우하지 않음으로 처리
      console.log(`[SocialData] User ${sourceUserId} not found, assuming not following`);
      return false;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SocialData API error: ${response.status} - ${errorText}`);
    }

    const data: SocialDataFollowResponse = await response.json();

    console.log(`[SocialData] Result: is_following = ${data.is_following}`);
    return data.is_following;
  }
}
```

### 5.2 VerificationService 수정

**파일**: `cdk/lambda-src/nft-event/verify-eligibility/src/services/verificationService.ts`

```diff
+ import { SocialDataClient } from './socialDataClient';

  export class VerificationService {
    private xApiClient: XApiClient;
+   private socialDataClient: SocialDataClient | null;
    private taskTracker: TaskTracker;
    private targetTweetId: string;
+   private targetUserId: string;

    constructor(
      xApiClient: XApiClient,
      taskTracker: TaskTracker,
      targetTweetId: string,
+     targetUserId: string,
+     socialDataApiKey?: string,
    ) {
      this.xApiClient = xApiClient;
+     this.socialDataClient = socialDataApiKey
+       ? new SocialDataClient(socialDataApiKey)
+       : null;
      this.taskTracker = taskTracker;
      this.targetTweetId = targetTweetId;
+     this.targetUserId = targetUserId;
    }

    async verifyAllTasks(
      xUserId: string,
      walletAddress: string,
      xUsername: string
    ): Promise<VerifyEligibilityResponse> {
      const tasks: TaskStatus[] = [];

+     // 1. Follow 검증 (SocialData API)
+     let hasFollowed = false;
+     if (this.socialDataClient) {
+       try {
+         hasFollowed = await this.socialDataClient.checkFollowing(xUserId, this.targetUserId);
+         tasks.push({
+           taskType: 'FOLLOW',
+           completed: hasFollowed,
+           message: hasFollowed ? undefined : `Please follow @Nasun_io`,
+         });
+       } catch (error: any) {
+         console.error('[VerificationService] Follow check failed:', error.message);
+         tasks.push({
+           taskType: 'FOLLOW',
+           completed: false,
+           message: 'Unable to verify follow status. Please try again.',
+         });
+       }
+     }

-     // Like/Retweet 검증 (X API)
+     // 2. Like/Retweet 검증 (X API)
      const { hasLiked, hasRetweeted } = await this.xApiClient.verifyAll(
        xUserId,
        this.targetTweetId
      );

      tasks.push({
        taskType: 'LIKE',
        completed: hasLiked,
        message: hasLiked ? undefined : 'Please like the event post',
      });

      tasks.push({
        taskType: 'RETWEET',
        completed: hasRetweeted,
        message: hasRetweeted ? undefined : 'Please retweet the event post',
      });

      // 태스크 상태 저장
      for (const task of tasks) {
        await this.taskTracker.saveTaskStatus(walletAddress, task);
      }

-     const eligible = hasLiked && hasRetweeted;
+     const eligible = hasFollowed && hasLiked && hasRetweeted;

      return {
        success: true,
        eligible,
        tasks,
        message: eligible ? 'All tasks completed!' : 'Please complete all required tasks',
      };
    }
  }
```

### 5.3 Lambda Handler 수정

**파일**: `cdk/lambda-src/nft-event/verify-eligibility/src/index.ts`

```diff
  // 환경변수
  const config = {
    xBearerToken: process.env.X_API_BEARER_TOKEN!,
    targetTweetId: process.env.X_TARGET_TWEET_ID!,
    targetUserId: process.env.X_TARGET_USER_ID!,
+   socialDataApiKey: process.env.SOCIALDATA_API_KEY,  // Optional
    // ...
  };

  // VerificationService 생성
  const verificationService = new VerificationService(
    xApiClient,
    taskTracker,
    config.targetTweetId,
+   config.targetUserId,
+   config.socialDataApiKey,
  );
```

### 5.4 Frontend Task 목록 복원

**파일**: `frontend/src/components/app/wave1/battalion-nft/cards/Step3TaskVerificationCard.tsx`

```diff
- // Follow는 X API Basic Plan 미지원으로 제거
  const tasks: Array<{ type: TaskType; label: string }> = [
+   { type: "FOLLOW", label: t("step3.tasks.follow", { account: targetAccount }) },
    { type: "LIKE", label: t("step3.tasks.like") },
    { type: "RETWEET", label: t("step3.tasks.retweet") },
  ];

- {/* Follow Recommendation (Not Required) */}
- <div className="flex text-nasun-white items-center justify-between p-4 ...">
-   ...
- </div>
```

### 5.5 환경변수 설정

**방법 1: AWS Secrets Manager (권장)**
```bash
# Secret 생성
aws secretsmanager create-secret \
  --name nasun/socialdata-api-key \
  --secret-string '{"apiKey":"<YOUR_SOCIALDATA_API_KEY>"}'
```

**방법 2: .env 파일**
```bash
# .env.production
SOCIALDATA_API_KEY=<YOUR_SOCIALDATA_API_KEY>
```

### 5.6 CDK Stack 수정

**파일**: `cdk/lib/nft-event-stack.ts` (또는 해당 스택)

```diff
  const verifyEligibilityLambda = new lambda.Function(this, 'VerifyEligibility', {
    // ...
    environment: {
      X_API_BEARER_TOKEN: process.env.X_API_BEARER_TOKEN!,
      X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID!,
      X_TARGET_USER_ID: process.env.X_TARGET_USER_ID!,
+     SOCIALDATA_API_KEY: process.env.SOCIALDATA_API_KEY!,
      // ...
    },
  });
```

---

## 6. 검증 방법

### 6.1 로컬 테스트

```bash
# 1. SocialData API 키 설정
export SOCIALDATA_API_KEY="your-api-key"

# 2. 직접 API 테스트
curl -X GET "https://api.socialdata.tools/twitter/user/1863020068785004544/following/1725466995565752320" \
  -H "Authorization: Bearer $SOCIALDATA_API_KEY"

# 3. Lambda 로컬 테스트
cd apps/nasun-website/cdk/lambda-src/nft-event/verify-eligibility
npx ts-node -e "
  const { SocialDataClient } = require('./src/services/socialDataClient');
  const client = new SocialDataClient(process.env.SOCIALDATA_API_KEY);
  client.checkFollowing('1863020068785004544', '1725466995565752320')
    .then(result => console.log('Is following:', result))
    .catch(err => console.error('Error:', err));
"
```

### 6.2 통합 테스트

1. 개발 서버 실행: `pnpm dev:nasun-website`
2. Battalion NFT 페이지 접속
3. X 계정 연결
4. Step 3 (Task Verification) 진행
5. **기대 결과**:
   - Follow, Like, Retweet 3개 태스크 표시
   - "Verify Tasks" 클릭 시 3개 모두 검증
   - 모두 완료 시 "Next Step" 버튼 활성화

### 6.3 에러 케이스 테스트

| 케이스 | 조건 | 예상 동작 |
|--------|------|----------|
| API 키 누락 | `SOCIALDATA_API_KEY` 미설정 | Follow 검증 스킵 (기존 동작) |
| 잔액 부족 | 402 응답 | 에러 메시지 표시 |
| 사용자 없음 | 404 응답 | `is_following: false` 처리 |
| 네트워크 오류 | 타임아웃/연결 실패 | 에러 메시지 + 재시도 유도 |
| Rate Limit | 429 응답 | "잠시 후 다시 시도해주세요" + 백오프 |

### 6.4 UX 고려사항: 데이터 전파 지연

팔로우 직후 검증 시 SocialData 캐싱 또는 X 데이터 전파 지연으로 실패할 수 있습니다.

**권장 메시지**:
```
"팔로우 후 약 10초 뒤에 다시 시도해주세요."
"If verification fails, please wait 10 seconds after following and try again."
```

**구현 위치**: `Step3TaskVerificationCard.tsx`의 에러 메시지 영역

---

## 7. 구현 순서

| 순서 | 작업 | 설명 |
|------|------|------|
| 1 | SocialData 계정 생성 | https://socialdata.tools 에서 가입 |
| 2 | API 키 발급 | Dashboard에서 API Key 생성 |
| 3 | API 키 테스트 | cURL로 직접 호출하여 동작 확인 |
| 4 | `socialDataClient.ts` 생성 | SocialData API 클라이언트 구현 |
| 5 | `verificationService.ts` 수정 | Follow 검증 로직 통합 |
| 6 | `index.ts` 환경변수 추가 | Lambda에서 API 키 로드 |
| 7 | Frontend UI 수정 | Follow 태스크 복원 |
| 8 | AWS Secrets Manager 저장 | API 키 보안 저장 |
| 9 | CDK 스택 환경변수 추가 | Lambda 환경변수 설정 |
| 10 | 로컬 테스트 | 전체 플로우 테스트 |
| 11 | CDK 배포 | 개발/프로덕션 배포 |
| 12 | 프로덕션 테스트 | 실제 환경에서 검증 |

---

## 8. 비용 예상

| 시나리오 | 팔로우 검증 횟수 | 비용 |
|----------|----------------|------|
| 1,000명 참가자 × 1회 | 1,000 | $0.20 |
| 1,000명 × 3회 재시도 | 3,000 | $0.60 |
| 10,000명 참가자 × 1회 | 10,000 | $2.00 |
| 10,000명 × 3회 재시도 | 30,000 | $6.00 |

**월간 예상 비용**: $2 ~ $10 (이벤트 규모에 따라)

**비교**: X API Pro Plan = $5,000/month

---

## 9. Fallback 전략

SocialData API 장애 또는 API 키 미설정 시:

1. **Follow 태스크를 "권장"으로 표시** (현재 구현과 동일)
2. **Like + Retweet만 필수로 검증**
3. **관리자가 수동으로 팔로우 확인** (allowlist 최종 승인 전)

```typescript
// verificationService.ts
if (!this.socialDataClient) {
  // Fallback: Follow 검증 스킵
  console.log('[VerificationService] SocialData not configured, skipping follow check');
  // Follow 태스크를 tasks 배열에 추가하지 않음
  // Frontend에서 "권장" 배지로 표시
}
```

### 9.1 Soft Fail vs Hard Fail 정책

**현재 계획 (Hard Fail)**: API 에러 시 `completed: false` → 사용자 진행 불가

**대안 (Soft Fail)**: 서드파티 장애 시 검증 통과 또는 "권장" 처리

| 정책 | 장점 | 단점 |
|------|------|------|
| Hard Fail | 검증 무결성 보장 | SocialData 장애 시 이벤트 중단 |
| Soft Fail | 사용자 경험 우선 | 팔로우 안 한 사용자 통과 가능 |

**권장**: 초기에는 Hard Fail로 운영하고, SocialData 안정성이 검증되면 유지.
장애 빈도가 높을 경우 Soft Fail로 전환 검토.

### 9.2 환경변수 킬 스위치

```typescript
// Kill Switch: 환경변수 제거만으로 기능 비활성화
this.socialDataClient = socialDataApiKey
  ? new SocialDataClient(socialDataApiKey)
  : null;
```

`SOCIALDATA_API_KEY` 환경변수를 제거하면 즉시 Follow 검증 기능이 비활성화됩니다.

---

## 10. 보안 고려사항

### 10.1 API 키 보호

- **절대 프론트엔드에 노출하지 않음**
- AWS Secrets Manager에 저장
- Lambda 환경변수로 주입
- `.env` 파일은 `.gitignore`에 포함

### 10.2 Rate Limiting

- SocialData 기본 제한: 120 req/min
- 사용자당 검증 횟수 제한 고려 (예: 3회/시간)
- DynamoDB에 검증 시도 기록

### 10.3 로깅

- 사용자 ID 로깅 시 마스킹 고려
- API 응답 전체를 로깅하지 않음
- 에러 상황만 상세 로깅

---

## 11. 참고 자료

- [SocialData API Documentation](https://docs.socialdata.tools/)
- [Verify User Following Endpoint](https://docs.socialdata.tools/social-actions/verify-user-following/)
- [SocialData Pricing](https://docs.socialdata.tools/getting-started/pricing/)
- [X API v2 Rate Limits](https://developer.x.com/en/docs/twitter-api/rate-limits)

---

## 부록: X API 제약사항 디버깅 히스토리

### 테스트 결과

1. **Bearer Token (App-only)**
   ```
   GET /2/users/:id/followers → 403 client-not-enrolled
   ```

2. **OAuth 2.0 User Context (타겟 계정)**
   ```
   GET /2/users/:id/followers → 403 client-not-enrolled
   ```

3. **OAuth 2.0 User Context (사용자 본인)**
   ```
   GET /2/users/:id/following → 403 client-not-enrolled
   ```

4. **v1.1 friendships/show**
   ```
   GET /1.1/friendships/show.json → 453 limited v1.1 endpoints only
   ```

### 결론

X API Basic Plan($175/month)에서는 followers/following 관련 모든 엔드포인트가 차단됩니다.
Pro Plan($5,000/month) 또는 서드파티 API(SocialData) 사용이 필요합니다.
