# Nasun Referral System

이 문서는 나선(Nasun) 웹사이트 리퍼럴 시스템의 기술 문서입니다. 실제 구현 코드를 기반으로 작성되었습니다.

---

## 1. 시스템 개요

Nasun 리퍼럴 시스템은 사용자가 새로운 사용자를 초대하고, 초대된 사용자의 온체인 활동에 따라 보너스 포인트(Ecosystem Points)를 획득할 수 있도록 설계된 시스템입니다.

초기 Devnet 단계에서는 어뷰징 방지를 위해 특정 자격을 갖춘 사용자에게만 리퍼럴 코드를 발급하는 **Eligibility Gate**를 운영합니다.

보너스 지급은 `REFERRAL_REWARD_ENABLED=true` 환경변수가 설정된 경우에만 활성화됩니다.

---

## 2. 아키텍처

리퍼럴 시스템은 AWS CDK 기반 서버리스 아키텍처로 구성되어 있습니다.

### 2.1 데이터베이스 (DynamoDB)

**`nasun-referral-codes`** - 리퍼럴 코드와 발급자 맵핑

| 키/속성 | 타입 | 설명 |
|---------|------|------|
| `referralCode` (PK) | String | 8자리 대문자 알파뉴메릭 |
| `identityId` | String | 코드 발급자의 Cognito identityId |

**`nasun-referrals`** - 초대 관계 저장 (1:1)

| 키/속성 | 타입 | 설명 |
|---------|------|------|
| `referredIdentityId` (PK) | String | 초대받은 사용자 |
| `referrerIdentityId` | String | 초대한 사용자 |
| `status` | String | `PENDING` / `ACTIVATED` |
| `appliedAt` | String | ISO8601 타임스탬프 |
| `activatedAt` | String | ISO8601 타임스탬프 (ACTIVATED 전환 시) |

GSI `referrerIdentityId-index`: 초대자별 초대 목록 조회용

### 2.2 API 엔드포인트

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/referral/my-code` | Cognito JWT | 자신의 코드 조회 또는 Lazy 발급 |
| POST | `/referral/apply` | Cognito JWT | 리퍼럴 코드 적용 |
| GET | `/referral/my-stats` | Cognito JWT | 리퍼럴 통계 및 초대 목록 조회 |
| GET | `/internal/referral-mappings` | API Key | (Admin) 활성화된 리퍼럴 맵핑 전체 조회 |
| POST | `/internal/referral-activate` | API Key | (Admin) PENDING -> ACTIVATED 전환 |

---

## 3. 핵심 비즈니스 로직

### 3.1 리퍼럴 코드 발급 자격 (Eligibility Gate)

다음 4가지 경로 중 하나를 만족해야 리퍼럴 코드를 발급받을 수 있습니다.

| 경로 | 조건 |
|------|------|
| **Path 1 (Governance)** | 거버넌스 투표에 참여한 이력이 있는 경우 |
| **Path 2 (Genesis Pass)** | Genesis Pass NFT를 보유한 경우 |
| **Path 3 (Admin Bonus)** | 관리자 부여 보너스 포인트 >= 40점 |
| **Path 4 (Triple Social)** | X, Google, Telegram 모두 연동 + 관리자 보너스 >= 25점 |

우선순위: P1 > P2 > P3 > P4. Path 조건을 만족하지 못하면 API 응답에 불충족 이유(hint)가 포함됩니다.

소스: [`cdk/lambda-src/referral/handler/src/eligibility.ts`](../cdk/lambda-src/referral/handler/src/eligibility.ts)

### 3.2 리퍼럴 코드 생성

- 형식: 8자리 대문자 알파뉴메릭 (A-Z, 0-9)
- 생성 알고리즘: `crypto.randomBytes(5)` -> base-36 변환 -> toUpperCase -> 8자리 패딩
- 충돌 시 최대 3회 재시도
- DynamoDB `ConditionExpression`으로 중복 코드 원자적 방지
- 1인당 최대 **100명**까지 초대 가능 (Lambda 레벨 제한)

### 3.3 리퍼럴 코드 적용 및 자동 캡처

1. **URL 캡처**: `?ref=CODE` 파라미터 감지 -> `localStorage`에 7일간 저장
2. **자동 적용**: 로그인 완료 후 `/referral/apply` API 자동 호출
3. **코드 길이 허용**: 8자리 (표준) 또는 6자리 코드 모두 수락 (레거시 호환)
4. **자기 초대 차단**: 자신 및 연결된 계정(`collectLinkedIdentityIds`)의 코드 사용을 서버 측에서 차단

소스: [`frontend/src/hooks/useReferralCapture.ts`](../frontend/src/hooks/useReferralCapture.ts)

### 3.4 리퍼럴 활성화 (Activation)

코드 적용 직후에는 `PENDING` 상태입니다. 보너스 지급을 위해 `ACTIVATED` 상태로 전환이 필요합니다.

- **활성화 조건**: 초대받은 사용자가 최소 **5일** 이상의 서로 다른 날짜에 온체인 활동을 기록해야 합니다.
- **활성화 프로세스**: Explorer API 포인트 스캐너가 조건 충족 사용자를 탐지하면 `/internal/referral-activate` 호출하여 상태 전환
- **배치 제한**: 단일 활성화 요청당 최대 100개 identityId

소스: [`cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts`](../cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts)

### 3.5 보너스 포인트 산정

보너스는 Explorer API 포인트 스캐너가 일별로 계산합니다.

**지급 구조:**

| 대상 | 보너스 | 설정 상수 |
|------|--------|----------|
| 초대자 (Referrer) | 초대받은 사용자 당일 base_points의 10% | `REFERRAL_L1_BONUS_RATE = 0.1` |
| 초대받은 사용자 (Referred) | 자신의 당일 base_points의 10% | `REFERRAL_L1_REFERRED_BONUS_RATE = 0.1` |

> **주의**: 스캐너 코드 주석 일부에 "5%"로 잘못 표기된 부분이 있으나, 실제 상수값은 `0.1` (10%)입니다.

**한도 및 유효 기간:**

| 항목 | 값 | 비고 |
|------|-----|------|
| 일일 상한 | **50점** | **초대자와 초대받은 사용자 각각 독립적으로 적용** |
| 유효 기간 | 180일 | `appliedAt` 기준. 레거시 레코드(appliedAt 없음)는 만료되지 않음 |

> `REFERRAL_DAILY_BONUS_CAP = 50`은 초대자 보너스와 초대받은 사용자 보너스에 **별도 적용**됩니다. 따라서 한 사용자가 같은 날 초대자이면서 초대받은 사용자이면 두 보너스 합산 최대 100점이 가능합니다.

**Ecosystem Score 반영 (개인 누적 점수):**

리퍼럴 보너스는 사용자의 개인 누적 ecosystem points (`/score` 엔드포인트의 `allTime` /
`weekly` / `daily`) 계산 시 **50% 비중**으로 반영됩니다. l1-bonus와 l1-referred-bonus
양쪽 모두 포함.

```
ecosystemScore += referralBonusTotal * REFERRAL_ECOSYSTEM_SCALING_FACTOR (기본값: 0.5)
```

`REFERRAL_ECOSYSTEM_SCALING` 환경변수로 오버라이드 가능합니다.

**리더보드 통합:**

| 리더보드 | 반영 방식 |
|---|---|
| **나선 에코시스템 주간 리더보드** ([nasun.io/community/nasun-ecosystem-leaderboard](https://nasun.io/community/nasun-ecosystem-leaderboard)) | 추천인 보너스(`activity_type='l1-bonus'`)만 `weekly_score`에 `× 2/3`로 가산. 추천받은 사용자 보너스(`l1-referred-bonus`)는 제외 (referee 본인 활동이 이미 리더보드에 반영되므로 중복 차단). 상수: `REFERRER_BONUS_LEADERBOARD_FACTOR = 2/3` |
| **Pado DeFi 리더보드** | 미반영 (DeepBook 거래 이벤트만 집계) |
| **Community Leaderboard V3** | 미반영 (DynamoDB 기반 시즌별 소셜 큐레이션) |

상세: [ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md](../doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md#referrer-bonus-score)

소스: [`apps/network-explorer/api-server/src/config/referral.ts`](../../../network-explorer/api-server/src/config/referral.ts), [`apps/network-explorer/api-server/src/scanner/referral-bonus.ts`](../../../network-explorer/api-server/src/scanner/referral-bonus.ts)

### 3.6 리퍼럴 캐시 (스캐너)

포인트 스캐너는 활성화된 리퍼럴 맵핑을 인메모리 캐시로 유지합니다.

- 캐시 갱신 주기: **3시간** (`REFERRAL_CACHE_REFRESH_MS = 3h`)
- `/internal/referral-mappings` API 호출로 ACTIVATED 상태 레코드만 로드
- 180일 만료 필터는 API 서버 측에서 적용

---

## 4. 보안 및 신뢰성

| 항목 | 구현 |
|------|------|
| Atomic Ops | DynamoDB `ConditionExpression`으로 중복 코드 생성 및 중복 적용 방지 |
| Collision Retry | 코드 생성 충돌 시 최대 3회 재시도 |
| JWT Authorizer | 공용 API: Cognito JWT로 사용자 신원 검증 |
| API Key Auth | 관리자 API: `x-api-key`로 외부 노출 차단 |
| Self-Referral Block | 본인 및 연결 계정의 코드 적용 서버 측 차단 |
| PENDING -> ACTIVATED | DynamoDB Conditional Update로 상태 전이만 허용 (역방향 불가) |

---

## 5. 관련 파일

| 파일 | 역할 |
|------|------|
| `cdk/lambda-src/referral/handler/src/index.ts` | 공용 API 핸들러 (my-code, apply, my-stats) |
| `cdk/lambda-src/referral/handler/src/eligibility.ts` | Eligibility Gate 로직 |
| `cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` | Internal API (referral-mappings, referral-activate) |
| `cdk/lib/referral-stack.ts` | CDK 인프라 정의 |
| `frontend/src/hooks/useReferralCapture.ts` | URL 캡처 및 자동 적용 훅 |
| `frontend/src/services/referralApi.ts` | 프론트엔드 API 클라이언트 |
| `apps/network-explorer/api-server/src/config/referral.ts` | 보너스 설정 상수 |
| `apps/network-explorer/api-server/src/scanner/referral-bonus.ts` | 포인트 스캐너 보너스 계산 |
