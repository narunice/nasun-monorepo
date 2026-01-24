# 리더보드 반영 메커니즘 상세 가이드

**작성일**: 2025-10-23
**최종 업데이트**: 2025-12-10
**작성자**: Claude Code
**버전**: 2.3.0

---

## 📋 목차

1. [개요](#개요)
2. [환경 분리 (Environment Separation)](#환경-분리-environment-separation)
3. [핵심 개념: targetDate vs added_at](#핵심-개념-targetdate-vs-added_at)
4. [lastProcessedDate 메커니즘](#lastprocesseddate-메커니즘)
5. [리더보드 타입별 집계 방식](#리더보드-타입별-집계-방식)
6. [실제 사례 분석](#실제-사례-분석)
7. [데이터 복구 시나리오](#데이터-복구-시나리오)
8. [일일 상태 점검 (Daily Health Check)](#일일-상태-점검-daily-health-check)
9. [주의사항 및 FAQ](#주의사항-및-faq)
10. [Activity Bonus/Penalty System](#activity-bonuspenalty-system)

---

## 개요

NASUN 리더보드 시스템은 **논리적 날짜 기반 집계** 방식을 사용합니다. 이는 데이터가 물리적으로 언제 수집됐는지가 아니라, **논리적으로 어느 날짜에 속하는지**를 기준으로 리더보드를 생성합니다.

### 핵심 원칙

> **"트윗이 언제 작성됐는지, 데이터가 언제 수집됐는지는 중요하지 않다. 중요한 것은 데이터가 논리적으로 어느 날짜에 속하는가이다."**

### 주요 특징

- **스냅샷 기반**: 매일 특정 시점의 데이터를 수집하여 "그날의 스냅샷" 생성
- **멱등성 보장**: 같은 `targetDate`로 여러 번 실행해도 중복 처리 방지
- **복구 가능성**: 과거 날짜를 지정하여 누락된 데이터 복구 가능
- **이벤트 점수 안정성**: 복구 시점에 관계없이 일관된 집계

---

## 환경 분리 (Environment Separation)

NASUN 리더보드 시스템은 **Development**와 **Production** 환경으로 분리되어 운영됩니다.

### Development 환경

**AWS 계정**: 135808943968
**API Gateway**: bb4zdy0rwe
**타겟 계정**: @Naru010110 (User ID: 1863020068785004544)
**DynamoDB 테이블**: nasun-leaderboard-data
**Step Functions**: nasun-leaderboard-pipeline
**EventBridge 스케줄**: 매일 09:10 AM KST

**API 엔드포인트 예시**:

```
GET https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE
GET https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE/user/{username}
GET https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE/search?q={query}
```

### Production 환경

**AWS 계정**: 466841130170
**API Gateway**: bumvhwfbj4
**타겟 계정**: @Nasun_io (User ID: 1725466995565752320)
**DynamoDB 테이블**: nasun-leaderboard-data
**Step Functions**: nasun-leaderboard-pipeline
**EventBridge 스케줄**: 매일 09:10 AM KST

**API 엔드포인트 예시**:

```
GET https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE
GET https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE/user/{username}
GET https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/leaderboard/CUMULATIVE/search?q={query}
```

### 환경별 주의사항

1. **타겟 사용자 ID**: 각 환경은 서로 다른 X(Twitter) 계정을 타겟으로 합니다
   - Development: 1863020068785004544 (@Naru010110)
   - Production: 1936784207453507584 (@Nasun_io)

2. **API 엔드포인트**: 환경별로 다른 API Gateway ID를 사용합니다
   - 프론트엔드 `.env` 파일에서 환경별로 올바른 엔드포인트 설정 필수

3. **데이터 분리**: 각 환경의 DynamoDB는 완전히 독립적입니다
   - 크로스 환경 데이터 복구 시 주의 필요

---

## 핵심 개념: targetDate vs added_at

### 1. `targetDate` (파이프라인 입력)

**정의**: 파이프라인 실행 시 지정하는 **논리적 수집 대상 날짜**

**용도**:

- 어느 날짜의 데이터를 수집할지 결정
- DynamoDB의 `lastProcessedDate` 필드로 저장됨
- 리더보드 집계 시 필터링 기준으로 사용

**예시**:

```json
// 파이프라인 입력
{
  "targetDate": "2025-10-21"
}

// DynamoDB 저장
{
  "lastProcessedDate": "2025-10-21"  ← targetDate가 그대로 저장됨
}
```

### 2. `added_at` (실제 수집 시각)

**정의**: 데이터가 **실제로 수집된 물리적 시각** (ISO 8601 형식)

**용도**:

- 디버깅 및 감사(Audit) 목적
- 데이터 신선도 확인
- **리더보드 집계에는 사용되지 않음** ⚠️

**예시**:

```json
{
  "added_at": "2025-10-23T00:31:05.957Z"  ← 실제 수집 시각
}
```

### 3. 핵심 차이점

| 항목      | `targetDate` / `lastProcessedDate`   | `added_at`                           |
| --------- | ------------------------------------ | ------------------------------------ |
| 의미      | 논리적 날짜 (언제 수집했어야 했는가) | 물리적 시각 (실제로 언제 수집했는가) |
| 형식      | YYYY-MM-DD                           | ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)  |
| 용도      | **리더보드 집계**                    | 디버깅, 감사                         |
| 설정 방법 | 파이프라인 입력 파라미터             | 자동 생성 (현재 시각)                |
| 변경 가능 | ✅ 복구 시 과거 날짜 지정 가능       | ❌ 자동 생성 (변경 불가)             |

---

## lastProcessedDate 메커니즘

### 설계 의도

`lastProcessedDate`는 **데이터가 논리적으로 속한 날짜**를 나타냅니다.

#### 왜 `added_at`이 아닌 `targetDate`를 사용하는가?

**문제 상황** (만약 `added_at`을 사용한다면):

```
시나리오 1: 정상 실행
- 2025-10-21 00:00에 파이프라인 실행
- 2025-10-18 트윗 수집
- added_at: 2025-10-21T00:00:00Z
- → EVENT1 리더보드(10/19~10/21)에 포함됨

시나리오 2: 장애 복구
- 2025-10-23 09:30에 누락 데이터 복구
- 동일한 2025-10-18 트윗 수집
- added_at: 2025-10-23T09:30:00Z
- → EVENT2 리더보드(10/22~10/24)에 포함됨 ❌

문제:
- 같은 트윗인데 복구 시점에 따라 다른 이벤트 리더보드에 포함됨
- 이벤트 점수가 "언제 복구했는가"에 따라 달라짐
- 데이터 무결성 문제 발생
```

**해결책** (`targetDate` 사용):

```
시나리오 1: 정상 실행
- 2025-10-21 00:00에 파이프라인 실행
- targetDate: "2025-10-21"
- lastProcessedDate: "2025-10-21"
- → EVENT1 리더보드(10/19~10/21)에 포함됨

시나리오 2: 장애 복구
- 2025-10-23 09:30에 누락 데이터 복구
- targetDate: "2025-10-21" (명시적 지정)
- lastProcessedDate: "2025-10-21"
- → EVENT1 리더보드(10/19~10/21)에 포함됨 ✅

결과:
- 복구 시점과 관계없이 일관된 이벤트 리더보드에 포함
- 데이터 무결성 보장
```

### 데이터 흐름

```
[파이프라인 실행]
    ↓
파라미터: targetDate = "2025-10-21"
    ↓
[데이터 수집]
    ↓
DynamoDB 저장:
  - lastProcessedDate: "2025-10-21"  ← targetDate 복사
  - added_at: "2025-10-23T09:30:00Z"  ← 현재 시각
    ↓
[리더보드 생성]
    ↓
필터링: lastProcessedDate BETWEEN event_start AND event_end
    ↓
EVENT1 (10/19~10/21): ✅ 포함 (lastProcessedDate = 10/21)
EVENT2 (10/22~10/24): ❌ 제외 (lastProcessedDate ≠ 10/22~10/24)
```

### 코드 참조

**파일**: `cdk/lambda-src/x-leaderboard/src/services/recent-activity-tracker.ts`

```typescript
// Line 121
{
  lastProcessedDate: collectionDate, // 멱등성: 마지막 처리 날짜
  added_at: engagement.added_at,     // 실제 수집 시각
  ttl: ttlInSeconds,                 // TTL 추가: 7일 후 자동 삭제
  version: "1.0"
}
```

**파일**: `cdk/lambda-src/x-leaderboard/src/services/delta-calculator.ts`

```typescript
// Line 1321
FilterExpression: "begins_with(sk, :recent) AND lastProcessedDate = :date",
ExpressionAttributeValues: {
  ":recent": "RECENT#",
  ":date": collectionDate  // targetDate가 전달됨
}
```

**파이프라인**: Step Functions State Machine

- **이름**: `nasun-leaderboard-pipeline`
- **트리거**: EventBridge (매일 09:10 AM KST)
- **수동 실행**: AWS Console 또는 AWS CLI

---

## 리더보드 타입별 집계 방식

### 1. 누적 리더보드 (CUMULATIVE)

**파일**: `leaderboard-generator.ts:582-584`

```typescript
if (period === LeaderboardPeriod.CUMULATIVE) {
  console.log("📊 전체 기간 누적 점수 사용");
  const userScores = await this.getAllCumulativeScores();
```

**특징**:

- **기간 제한 없음**: `lastProcessedDate` 필터링 없이 모든 데이터 집계
- **완전 누적**: 시스템 시작부터 현재까지 모든 활동 포함
- **복구 보장**: 언제 수집됐든 무조건 반영됨

**집계 방식**:

```sql
-- DynamoDB에서 USER# 레코드의 누적 점수 직접 조회
SELECT * FROM Table WHERE pk = 'USER#{userId}'
```

### 2. 이벤트 리더보드 (EVENT1, EVENT2)

**파일**: `leaderboard-generator.ts:554-558`

```typescript
FilterExpression: "begins_with(sk, :sk_prefix) AND lastProcessedDate BETWEEN :start_date AND :end_date",
ExpressionAttributeValues: marshall({
  ":sk_prefix": "RECENT#",
  ":start_date": startDateStr,  // 예: "2025-10-19"
  ":end_date": endDateStr,      // 예: "2025-10-21"
}),
```

**특징**:

- **기간 제한 있음**: `lastProcessedDate`가 이벤트 기간 내에 있어야 함
- **스냅샷 방식**: 이벤트 기간 중 파이프라인이 실행된 날짜의 데이터만 집계
- **복구 주의**: `targetDate`를 이벤트 기간 내로 설정해야 반영됨

**집계 방식**:

```sql
-- DynamoDB에서 RECENT# 레코드를 기간 필터링
SELECT * FROM Table
WHERE sk BEGINS_WITH 'RECENT#'
  AND lastProcessedDate BETWEEN '2025-10-19' AND '2025-10-21'
```

**환경 변수** (`.env`):

```bash
EVENT1_START_DATE=2025-10-19
EVENT1_END_DATE=2025-11-18
EVENT2_START_DATE=2025-11-19
EVENT2_END_DATE=2025-12-10
```

---

## 실제 사례 분석

### 사례 1: 정상 자동 실행 (매일 아침)

**상황**:

- 날짜: 2025-10-27 00:00
- 파이프라인: 자동 실행 (EventBridge)
- 수집 대상: 3일 전 트윗 (2025-10-24)

**파이프라인 입력**:

```json
{
  "targetDate": "2025-10-24" // 3일 전
}
```

**데이터 저장**:

```json
{
  "tweet_id": "1979361728044691767",
  "engagement_type": "like",
  "engaging_user_id": "1234567890",
  "lastProcessedDate": "2025-10-24",  ← targetDate
  "added_at": "2025-10-27T00:10:00.000Z"  ← 실제 수집 시각
}
```

**리더보드 반영**:

```
✅ CUMULATIVE: 반영됨
❌ EVENT1 (10/19~10/21): 반영 안됨 (10/24가 기간 밖)
✅ EVENT2 (10/22~10/24): 반영됨 (10/24가 기간 내)
```

---

### 사례 2: 누락 데이터 수동 복구 (오늘)

**상황**:

- 날짜: 2025-10-28 09:30
- 파이프라인: 수동 실행
- 수집 대상: 2025-10-24 트윗의 누락된 좋아요
- 복구 목적: 2025-10-27에 수집했어야 했던 데이터

**파이프라인 입력**:

```json
{
  "targetDate": "2025-10-27" // 복구 대상 날짜 (명시적 지정)
}
```

**데이터 저장**:

```json
{
  "tweet_id": "1979361728044691767",
  "engagement_type": "like",
  "engaging_user_id": "1530806154611261440",
  "lastProcessedDate": "2025-10-27",  ← targetDate (복구 대상 날짜)
  "added_at": "2025-10-28T00:31:05.957Z"  ← 실제 수집 시각 (오늘)
}
```

**리더보드 반영**:

```
✅ CUMULATIVE: 반영됨
❌ EVENT1 (10/19~10/21): 반영 안됨 (lastProcessedDate = 10/27이 기간 밖)
❌ EVENT2 (10/22~10/24): 반영 안됨 (lastProcessedDate = 10/27이 기간 밖)
```

**검증 결과**:

```json
// USER# 레코드 (누적 점수)
{
  "userId": "1530806154611261440",
  "username": "ddtp112",
  "totalScore": "58.45",
  "totalLikes": "2"  ← 복구된 좋아요 포함 ✅
}
```

---

### 사례 3: 잘못된 복구 (targetDate 설정 실수)

**상황**:

- 날짜: 2025-10-28 10:00
- 파이프라인: 수동 실행
- **실수**: `targetDate`를 오늘 날짜로 설정

**파이프라인 입력** (❌ 잘못된 설정):

```json
{
  "targetDate": "2025-10-28" // 오늘 날짜 (잘못됨!)
}
```

**데이터 저장**:

```json
{
  "lastProcessedDate": "2025-10-28",  ← 오늘 날짜
  "added_at": "2025-10-28T10:00:00.000Z"
}
```

**리더보드 반영**:

```
✅ CUMULATIVE: 반영됨
❌ EVENT1 (10/19~10/21): 반영 안됨 (10/28이 기간 밖)
❌ EVENT2 (10/22~10/24): 반영 안됨 (10/28이 기간 밖)
```

**문제**:

- 2025-10-27에 수집했어야 할 데이터가 어느 이벤트에도 포함되지 않음
- 이벤트 점수 왜곡 발생
- **해결**: `targetDate`를 올바른 날짜 (`2025-10-27`)로 재설정 후 재실행

---

## 데이터 복구 시나리오

### 복구 절차

#### 1. 누락 확인

```bash
# 특정 날짜의 데이터 수집 여부 확인
aws dynamodb scan \
  --table-name nasun-leaderboard-data \
  --filter-expression "tweet_id = :tid AND lastProcessedDate = :date" \
  --expression-attribute-values '{":tid": {"S": "TWEET_ID"}, ":date": {"S": "2025-10-21"}}'
```

#### 2. targetDate 결정

```
질문: "이 데이터는 원래 언제 수집했어야 했는가?"
답변: "2025-10-21" (파이프라인이 실행되었어야 했던 날짜)
```

#### 3. 파이프라인 수동 실행

```bash
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:REGION:ACCOUNT:stateMachine:nasun-leaderboard-pipeline" \
  --input '{
    "targetDate": "2025-10-21"
  }'
```

#### 4. 검증

```bash
# 1. 데이터 수집 확인
aws dynamodb scan \
  --table-name nasun-leaderboard-data \
  --filter-expression "tweet_id = :tid AND lastProcessedDate = :date" \
  --expression-attribute-values '{":tid": {"S": "TWEET_ID"}, ":date": {"S": "2025-10-21"}}' \
  | jq '.Items | length'

# 2. 누적 점수 확인
aws dynamodb query \
  --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk": {"S": "USER#USER_ID"}}' \
  | jq '.Items[0] | {totalScore, totalLikes}'

# 3. 이벤트 리더보드 확인
aws dynamodb query \
  --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk": {"S": "LEADERBOARD#EVENT1"}}' \
  | jq '.Items[] | select(.username.S == "USERNAME")'
```

### 복구 시 주의사항

#### ⚠️ targetDate 설정 실수 방지

**잘못된 예**:

```bash
# ❌ 오늘 날짜로 설정 (실제 수집 시각)
{
  "targetDate": "2025-10-28"  # 실행하는 날짜
}
```

**올바른 예**:

```bash
# ✅ 원래 수집했어야 했던 날짜로 설정
{
  "targetDate": "2025-10-27"  # 누락된 데이터가 속한 논리적 날짜
}
```

#### 📋 체크리스트

복구 전 확인사항:

- [ ] 누락된 데이터가 원래 언제 수집되었어야 했는가?
- [ ] 해당 날짜가 어느 이벤트 기간에 속하는가?
- [ ] `targetDate`를 올바르게 설정했는가?
- [ ] 중복 수집 방지를 위해 기존 데이터를 확인했는가?

---

## 일일 상태 점검 (Daily Health Check)

리더보드 시스템의 개발/프로덕션 환경 상태를 종합적으로 점검하는 스크립트입니다. **매일 실행을 권장합니다.**

### 실행 방법

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/x-leaderboard-v2-legacy
./daily_health_check.sh
```

### 점검 항목

**1. 파이프라인 실행 상태 (개발/프로덕션)**

- 오늘 날짜로 성공한 Step Functions 실행 확인
- 시작 시간, 종료 시간, Execution ARN 표시

**2. 데이터 수집 상세 분석 (개발 환경)**

- Active Engagements: Mentions (검색됨), Replies (처리됨)
- Passive Engagements: 원본 포스트 수, Likes, Reposts, Quotes
- 파이프라인 단계별 실패 여부 확인

**3. 누적 리더보드 변경 사항 (프로덕션)**

- 어제 vs 오늘 리더보드 엔트리 수 비교
- 신규 진입자 수 계산

**4. OAuth 토큰 갱신 상태 (개발/프로덕션)**

- CloudWatch 로그에서 토큰 갱신 오류 검색
- CloudWatch 알람 상태 확인 (ALARM/OK/INSUFFICIENT_DATA)
- 토큰 유효성 직접 검증 명령어 안내

### 실행 전 요구사항

```bash
# 1. AWS CLI 설치 확인
aws --version

# 2. nasun-prod 프로필 설정 (~/.aws/credentials)
[nasun-prod]
aws_access_key_id = YOUR_PROD_ACCESS_KEY
aws_secret_access_key = YOUR_PROD_SECRET_KEY

# 3. jq 설치 (JSON 파싱)
sudo apt install jq  # Ubuntu/WSL
brew install jq      # macOS
```

### 출력 예시

```
==================================================
Nasun 리더보드 시스템 일일 상태 점검 보고서 (2025-12-02)
==================================================
==================================================
1. 개발 환경 (AWS Profile: default)
==================================================
--- [개발 환경] 파이프라인 실행 상태 ---
✅ 오늘 실행된 파이프라인을 찾았습니다.
   - 상태: SUCCEEDED
   - 시작 시간: 2025-12-02T00:10:00.000Z
   - 종료 시간: 2025-12-02T00:25:00.000Z

--- [개발 환경] 데이터 수집 상세 분석 ---
✅ 파이프라인의 모든 단계가 성공적으로 완료되었습니다.
📊 Active Engagements:
   - Mentions (검색됨): 15개
   - Replies (처리됨): 8개
📊 Passive Engagements:
   - 원본 포스트 수: 5개
   - Likes: 120개
   - Reposts: 25개
   - Quotes: 3개

--- [개발 환경] 트위터 OAuth 2.0 토큰 자동 갱신 상태 ---
✅ 지난 24시간 동안 로그에서 토큰 갱신 관련 오류가 발견되지 않았습니다.
✅ 모든 관련 알람이 'OK' 또는 'INSUFFICIENT_DATA' 상태입니다.

==================================================
2. 프로덕션 환경 (AWS Profile: nasun-prod)
==================================================
--- [프로덕션 환경] 파이프라인 실행 상태 ---
✅ 오늘 실행된 파이프라인을 찾았습니다.

--- [프로덕션 환경] 누적 리더보드 변경 사항 분석 ---
📊 리더보드 엔트리 수:
   - 어제: 245명
   - 오늘: 248명
   - 신규 진입자: 3명

==================================================
점검 완료
==================================================
```

### 문제 발견 시 대응

**파이프라인 실패**:

```bash
# CloudWatch Logs에서 상세 오류 확인
aws logs tail /aws/lambda/nasun-leaderboard-generator --follow

# 수동 파이프라인 실행
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-2:ACCOUNT:stateMachine:nasun-leaderboard-pipeline" \
  --input '{"targetDate": "2025-12-02"}'
```

**OAuth 토큰 오류**:

```bash
# 토큰 강제 갱신
aws lambda invoke --function-name nasun-refresh-oauth2-token \
  --cli-binary-format raw-in-base64-out \
  --payload '{"forceRefresh": true}' /tmp/response.json && cat /tmp/response.json
```

**관련 문서**:

- [OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md) - OAuth 토큰 복구 가이드
- [SCHEDULED_TASKS_GUIDE.md](SCHEDULED_TASKS_GUIDE.md) - 스케줄링 작업 및 모니터링 가이드

---

## 주의사항 및 FAQ

### ⚠️ 주의사항

1. **`targetDate` ≠ 실제 수집 날짜**
   - `targetDate`는 논리적 날짜 (언제 수집했어야 했는가)
   - 실제 수집 날짜는 `added_at`에 기록됨

2. **이벤트 리더보드는 `lastProcessedDate` 기준**
   - 트윗 작성일(`tweet_created_at`)이 아님
   - 실제 수집 시각(`added_at`)이 아님
   - **`lastProcessedDate` (= `targetDate`)** 기준

3. **복구 시 `targetDate` 신중히 설정**
   - 잘못 설정하면 엉뚱한 이벤트 리더보드에 포함됨
   - 이벤트 점수 왜곡 발생 가능

4. **멱등성 보장**
   - 같은 `targetDate`로 여러 번 실행해도 안전
   - 기존 데이터는 덮어쓰기됨 (Upsert)

### ❓ FAQ

#### Q1: 오늘 수집한 데이터가 왜 오늘 이벤트 리더보드에 없나요?

**A**: `targetDate`가 오늘이 아닌 다른 날짜로 설정되었을 가능성이 높습니다.

**확인 방법**:

```bash
# 데이터의 lastProcessedDate 확인
aws dynamodb scan \
  --table-name nasun-leaderboard-data \
  --filter-expression "tweet_id = :tid" \
  --expression-attribute-values '{":tid": {"S": "TWEET_ID"}}' \
  | jq '.Items[0].lastProcessedDate.S'
```

**해결**:

- 이벤트 기간과 `lastProcessedDate`를 비교
- 필요하면 올바른 `targetDate`로 재실행

---

#### Q2: 누적 리더보드와 이벤트 리더보드의 점수가 다른 이유는?

**A**: 이벤트 리더보드는 특정 기간의 데이터만 집계하기 때문입니다.

**예시**:

```
누적 리더보드 (CUMULATIVE):
  - 기간: 시스템 시작 ~ 현재
  - ddtp112: totalLikes = 2

EVENT1 리더보드 (10/19~10/21):
  - 기간: lastProcessedDate BETWEEN 10/19 AND 10/21
  - ddtp112: totalLikes = 1 (해당 기간 내 수집된 것만)
```

---

#### Q3: 과거 데이터를 복구하면 이벤트 점수가 변경되나요?

**A**: `targetDate`를 어떻게 설정하느냐에 따라 다릅니다.

**시나리오 A** (이벤트 기간 내 `targetDate`):

```json
{
  "targetDate": "2025-10-21"  // EVENT1 기간 내
}
→ EVENT1 리더보드에 반영됨 ✅
```

**시나리오 B** (이벤트 기간 외 `targetDate`):

```json
{
  "targetDate": "2025-10-25"  // EVENT2 종료 후
}
→ 이벤트 리더보드에 반영 안됨 ❌
→ 누적 리더보드에만 반영됨 ✅
```

---

#### Q4: `added_at`은 왜 필요한가요?

**A**: 디버깅, 감사(Audit), 데이터 신선도 확인 용도입니다.

**활용 사례**:

1. **데이터 신선도 확인**:

   ```bash
   # 최근 1시간 이내 수집된 데이터
   added_at > NOW() - 1 HOUR
   ```

2. **파이프라인 지연 감지**:

   ```bash
   # targetDate와 added_at 비교
   targetDate: "2025-10-21"
   added_at: "2025-10-23T09:30:00Z"
   → 2일 지연 발생
   ```

3. **감사 로그**:
   ```bash
   # 누가, 언제, 어떤 데이터를 수집했는지 추적
   ```

---

#### Q5: 왜 `added_at`이 아닌 `targetDate`를 사용하나요?

**A**: 데이터 무결성과 복구 유연성을 보장하기 위해서입니다.

**비교**:

| 시나리오      | `added_at` 사용                     | `targetDate` 사용                  |
| ------------- | ----------------------------------- | ---------------------------------- |
| 정상 실행     | 2025-10-21 수집 → EVENT1 포함       | 2025-10-21 수집 → EVENT1 포함      |
| 복구 (2일 후) | 2025-10-23 수집 → EVENT2 포함 ❌    | targetDate=10/21 → EVENT1 포함 ✅  |
| 결과          | 복구 시점에 따라 다른 이벤트에 포함 | 논리적 날짜 기준으로 일관되게 포함 |

**결론**: `targetDate` 방식이 데이터 무결성을 보장합니다.

---

## Activity Bonus/Penalty System

### 개요

**Activity Bonus/Penalty System**은 리더보드 점수 계산의 최종 단계에서 적용되는 시스템으로, 사용자의 **일관된 활동을 보상**하고 **비활동을 불이익**으로 처리하여 순위의 공정성과 참여 동기를 강화합니다.

### 적용 시점

```
[데이터 수집] → [점수 계산] → [Active Days Tie-Breaker] → [🆕 Activity Bonus/Penalty] → [최종 순위]
```

**처리 순서**:

1. 기본 점수 계산 (Likes, Replies, Reposts, Quotes, Mentions)
2. Community Weight 적용 (한국어/영어 가중치)
3. Active Days Tie-Breaker (동점자 처리)
4. **🆕 Activity Bonus 계산** (최근 7일 활동 기반)
5. **🆕 Inactivity Penalty 계산** (비활동 기간 기반)
6. 최종 점수 재계산 및 정렬

### Activity Bonus (7-Day)

**목적**: 최근 7일간 일관되게 활동한 사용자에게 보너스 점수 부여

**메트릭** (Threshold=3):

- **Threshold**: 3일 (보너스 시작 임계값)
- **Weight per Day**: 0.28 (일당 가중치)
- **Period**: 7일 (집계 기간)
- **Formula**: `(activeDays - threshold + 1) × 0.28`
- **Range**: 0.0 ~ +1.4점

**보너스 테이블**:

| 활동 일수 | 적격 일수 | 보너스 점수 | 커버리지 |
| --------- | --------- | ----------- | -------- |
| 0-2일     | 0         | 0.0         | 30%      |
| 3일       | 1         | +0.3        | 30%      |
| 4일       | 2         | +0.6        | 25%      |
| 5일       | 3         | +0.8        | 15%      |
| 6일       | 4         | +1.1        | 10%      |
| 7일       | 5         | +1.4        | 20%      |

**활동 정의**: 최근 7일 중 하루에 최소 1개 이상의 인게이지먼트 (Likes, Replies, Reposts, Quotes, Mentions)가 있는 날

**계산 예시**:

```typescript
// 사용자가 최근 7일 중 5일 활동
const activeDaysLast7 = 5;
const threshold = 3;
const weightPerDay = 0.28;

// 적격 일수 = 5 - 3 + 1 = 3일
const eligibleDays = activeDaysLast7 - threshold + 1;

// 보너스 = 3 × 0.28 = 0.8점
const bonus = eligibleDays * weightPerDay; // 0.8
```

### Inactivity Penalty (3+ Days)

**목적**: 장기간 비활동 사용자에게 감점을 부여하여 활동 유도

**메트릭** (Threshold=3):

- **Threshold**: 3일 (감점 시작 임계값)
- **Penalty per Day**: 0.3 (일당 감점)
- **Max Penalty**: 5.0 (최대 감점 캡)
- **Formula**: `-min((daysSince - 2) × 0.3, 5.0)`
- **Range**: 0.0 ~ -5.0점

**감점 테이블**:

| 비활동 일수 | 초과 일수 | 계산      | 최종 감점         |
| ----------- | --------- | --------- | ----------------- |
| 0-2일       | 0         | 0 × 0.3   | 0.0               |
| 3일         | 1         | 1 × 0.3   | -0.3              |
| 5일         | 3         | 3 × 0.3   | -0.9              |
| 7일         | 5         | 5 × 0.3   | -1.5              |
| 10일        | 8         | 8 × 0.3   | -2.4              |
| 20일        | 18        | 18 × 0.3  | **-5.0** (capped) |
| 30일+       | 28+       | 28+ × 0.3 | **-5.0** (capped) |

**비활동 정의**: 마지막 인게이지먼트 이후 경과한 일수 (최근 30일 조회, 활동 없으면 30일로 간주)

**계산 예시**:

```typescript
// 사용자가 7일간 비활동
const daysSinceLastActivity = 7;
const threshold = 3;
const penaltyPerDay = 0.3;
const maxPenalty = 5.0;

// 초과 일수 = 7 - (3 - 1) = 7 - 2 = 5일
const excessDays = daysSinceLastActivity - (threshold - 1);

// 감점 = 5 × 0.3 = 1.5점 (5.0 미만이므로 그대로 적용)
const penalty = excessDays * penaltyPerDay; // 1.5
const finalPenalty = -Math.min(penalty, maxPenalty); // -1.5
```

### 최종 점수 계산

```typescript
// 최종 점수 = 기본 점수 + Active Days Score + Activity Bonus + Inactivity Penalty
const finalScore = baseScore + activeDaysScore + activityBonus + inactivityPenalty;

// 예시
const baseScore = 50.0; // 기본 인게이지먼트 점수
const activeDaysScore = 2.5; // Active Days Tie-Breaker (60일 중 25일 활동)
const activityBonus = 0.8; // 최근 7일 중 5일 활동
const inactivityPenalty = 0.0; // 비활동 없음

// 최종 점수 = 50.0 + 2.5 + 0.8 + 0.0 = 53.3
```

### finalScore 최솟값 0 제한 (2025-11-26)

**목적**: 장기간 비활동으로 인한 감점(`inactivityPenalty`)이 최대 -5.0점까지 적용될 수 있어, `totalScore`가 낮은 사용자의 `finalScore`가 음수가 될 수 있는 문제 해결

**구현**:

```typescript
finalScore: Math.max(0, Math.round(newFinalScore * 10) / 10);
```

**효과**:

- 복귀 사용자가 첫 활동에서 즉시 양수 점수 획득 가능
- 리더보드에 음수 점수 표시 방지
- 복귀 사용자의 참여 의욕 향상

### 하이브리드 순위 시스템 (2025-11-29)

**목적**: 동점자가 모두 동일한 순위 번호로 표시되는 문제 해결

**기존 동작** (Standard Competition Ranking):

- 점수가 같은 사용자들은 모두 같은 순위 공유
- 예: 179위, 179위, 179위, 179위, 179위, 179위, **185위** (6명 동점 후 순위 점프)

**하이브리드 순위 시스템**:

- **양수 점수 (> 0)**: Ordinal Ranking - 모든 사용자에게 고유 순위 부여
- **0점**: Standard Competition Ranking - 동점자 동일 순위 유지

**구현**:

```typescript
// 하이브리드 순위 처리
if (i > 0) {
  const currentTotal = (user as any).finalScore;
  const prevTotal = (usersWithActiveDays[i - 1] as any).finalScore;

  if (currentTotal > 0) {
    // 양수 점수: 항상 고유 순위 (Ordinal Ranking)
    currentRank = i + 1;
  } else if (Math.abs(currentTotal - prevTotal) > 0.001) {
    // 0점: 점수가 다를 때만 순위 증가 (Standard Competition)
    currentRank = i + 1;
  }
  // 0점이고 이전 사용자도 0점이면 동일 순위 유지
}
```

**결과**:

- 양수 점수: 179, 180, 181, 182, 183, 184, **185** (tie-breaker인 activeDays로 구분)
- 0점 사용자: 219, 219, 219, ... (동일 순위 공유)

### Threshold=3 설계 선택 이유

**초기 계획**: Activity Bonus Threshold=5일
**사용자 피드백**: "ACTIVITY_BONUS_THRESHOLD_DAYS=5로 계획되어 있는데 감점 시작 임계값에 맞춰서 activity bonus도 3일부터로 설정해줄 수 있어?"

**변경 효과** (Threshold=5 → Threshold=3):

- ✅ **대칭성 확보**: 보너스와 감점 모두 3일에서 시작
- ✅ **커버리지 증가**: 보너스 수혜자 45% → 70% (+25%)
- ✅ **가중치 조정**: 0.2 → 0.28 (최대 보너스 1.4 유지)
- ✅ **사용자 친화적**: 더 많은 사용자가 보너스 혜택

### DynamoDB 데이터 필드

**새로 추가된 필드** (LeaderboardGenerator 출력):

```json
{
  "pk": "LEADERBOARD#CUMULATIVE#2025-10-27",
  "sk": "RANK#00001",
  "username": "johndoe",
  "totalScore": 50.0,

  // 🆕 Activity Bonus/Penalty 필드
  "activityBonus": 0.8, // Activity Bonus 점수
  "inactivityPenalty": 0.0, // Inactivity Penalty 점수 (음수 또는 0)
  "activeDaysLast7": 5, // 최근 7일 중 활동 일수
  "daysSinceLastActivity": 0, // 마지막 활동 이후 경과일
  "finalScore": 53.3, // 최종 점수 (totalScore + activeDaysScore + activityBonus + inactivityPenalty)

  // 기존 필드들
  "activeDays": 25, // Active Days Tie-Breaker (60일 기준)
  "activeDaysScore": 2.5
  // ...
}
```

### 환경 변수

**설정 파일**: `cdk/.env`

```bash
# Activity Bonus (7-Day)
ACTIVITY_BONUS_ENABLED=true
ACTIVITY_BONUS_WEIGHT_PER_DAY=0.28
ACTIVITY_BONUS_THRESHOLD_DAYS=3
ACTIVITY_BONUS_PERIOD_DAYS=7

# Inactivity Penalty (3+ Days)
INACTIVITY_PENALTY_ENABLED=true
INACTIVITY_PENALTY_THRESHOLD=3
INACTIVITY_PENALTY_PER_DAY=0.3
INACTIVITY_PENALTY_MAX=5.0
```

**Feature Flag 비활성화** (롤백 시):

```bash
ACTIVITY_BONUS_ENABLED=false
INACTIVITY_PENALTY_ENABLED=false
```

### 성능 최적화

**Promise.all 병렬 처리**:

```typescript
// 모든 사용자의 Activity Bonus를 동시에 계산
const usersWithBonus = await Promise.all(
  users.map(async (user) => {
    const activeDaysLast7 = await calculator.getActiveDaysInLast7Days(user.userId);
    const bonus = calculateActivityBonus(activeDaysLast7, config);
    return { ...user, activityBonus: bonus, activeDaysLast7 };
  })
);
```

**성능 향상**:

- 순차 처리: 100명 × 500ms = 50초
- 병렬 처리: max(500ms) = 0.5초
- **100배 성능 향상**

### 검증 방법

**CloudWatch 로그**:

```
🎁 [Activity Bonus] Calculating for 100 users...
📈 [Activity Bonus] { activeDaysLast7: 5, threshold: 3, weightPerDay: 0.28, eligibleDays: 3, bonus: 0.8 }
✅ [Activity Bonus] Completed

⚠️ [Inactivity Penalty] Calculating for 100 users...
📉 [Inactivity Penalty] { daysSinceLastActivity: 7, threshold: 3, penaltyPerDay: 0.3, maxPenalty: 5.0, excessDays: 5, finalPenalty: -1.5 }
✅ [Inactivity Penalty] Completed
```

**DynamoDB 쿼리**:

```bash
aws dynamodb query \
  --table-name nasun-leaderboard-data \
  --key-condition-expression "pk = :pk AND begins_with(sk, :sk_prefix)" \
  --expression-attribute-values '{
    ":pk": {"S": "LEADERBOARD#CUMULATIVE#2025-10-28"},
    ":sk_prefix": {"S": "RANK#"}
  }' \
  --limit 10 | jq '.Items[] | {
    user: .username.S,
    totalScore: .totalScore.N,
    activityBonus: .activityBonus.N,
    inactivityPenalty: .inactivityPenalty.N,
    finalScore: .finalScore.N
  }'
```

### 관련 문서

- **[구현 계획서](ACTIVITY_BONUS_PENALTY_IMPLEMENTATION_PLAN.md)** - Activity Bonus/Penalty System 구현 계획 (v1.1.0)
- **[검증 보고서](ACTIVITY_BONUS_PENALTY_VERIFICATION_REPORT.md)** - 시스템 검증 및 테스트 결과
- **[종합 보고서](ACTIVITY_BONUS_PENALTY_COMPREHENSIVE_REPORT.md)** - Gemini AI 독립 검증용 종합 보고서 (1,448줄)
- **[CLAUDE.md](../CLAUDE.md)** - 프로젝트 전체 가이드 (v2.5.7)

---

## 설계 철학 요약

### ✅ 장점

1. **논리적 일관성**: 데이터는 "언제 수집했어야 했는가"를 기준으로 분류
2. **멱등성 보장**: 같은 `targetDate`로 재실행해도 중복 없음
3. **복구 유연성**: 과거 날짜 데이터를 복구할 때 논리적 날짜 지정 가능
4. **이벤트 점수 안정성**: 복구 시점에 관계없이 일관된 집계
5. **데이터 무결성**: 같은 데이터는 항상 같은 이벤트 리더보드에 포함

### ⚠️ 잠재적 혼란

1. **직관과 다름**: "오늘 수집했으니 오늘 리더보드에 반영될 것"이라는 기대와 불일치
2. **복구 시 주의 필요**: `targetDate`를 잘못 설정하면 엉뚱한 이벤트에 포함됨
3. **문서화 중요**: `added_at` vs `lastProcessedDate`의 차이를 명확히 이해해야 함

### 🎯 핵심 메시지

> **이것은 버그가 아니라 의도된 설계입니다.**
>
> 시스템은 **스냅샷 기반**으로 동작하며, 매일 특정 시점의 데이터를 수집하여 "그날의 스냅샷"을 생성합니다. 리더보드는 물리적 수집 시각이 아닌 **논리적 날짜**를 기준으로 집계되므로, 데이터 복구 시에도 일관된 결과를 보장합니다.

---

## 참고 문서

- **[LEADERBOARD_EVENT_ADDITION_GUIDE.md](LEADERBOARD_EVENT_ADDITION_GUIDE.md)** - 리더보드 Season 추가/제거 종합 가이드 (환경변수, 백엔드, 프론트엔드, My Account 페이지)
- **[OAUTH2_SCOPE_UPDATE_REPORT.md](OAUTH2_SCOPE_UPDATE_REPORT.md)** - OAuth 2.0 scope 업데이트 및 리더보드 반영 메커니즘 분석
- **[OAUTH_TOKEN_REPLACEMENT_COMPREHENSIVE_REPORT.md](OAUTH_TOKEN_REPLACEMENT_COMPREHENSIVE_REPORT.md)** - OAuth 토큰 교체 종합 보고서
- **[PHASE1_BUG_FIX_REPORT.md](PHASE1_BUG_FIX_REPORT.md)** - Phase 1 버그 수정 보고서
- **[OCTOBER_28_BUG_FIXES_AND_IMPROVEMENTS.md](OCTOBER_28_BUG_FIXES_AND_IMPROVEMENTS.md)** - 2025-10-28 버그 수정 및 개선사항
- **[CLAUDE.md](../CLAUDE.md)** - 프로젝트 전체 가이드

---

**문서 종료**
