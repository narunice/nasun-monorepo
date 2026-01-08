# OAuth 2.0 토큰 관리 가이드

**작성일**: 2025-12-04
**버전**: 1.2.0
**작성자**: Claude Code

---

## 📋 목차

1. [환경별 토큰 구성](#환경별-토큰-구성)
2. [Secrets Manager 구조](#secrets-manager-구조)
3. [토큰 자동 갱신 메커니즘](#토큰-자동-갱신-메커니즘)
4. [토큰 만료 시 수동 재인증 절차](#토큰-만료-시-수동-재인증-절차)
5. [문제 진단 및 트러블슈팅](#문제-진단-및-트러블슈팅)
6. [일일 상태 점검](#일일-상태-점검)
7. [알려진 이슈 및 해결 방법](#알려진-이슈-및-해결-방법)

---

## 환경별 토큰 구성

### 개요

| 환경 | AWS 계정 | 타겟 X 계정 | Secret 이름 |
|------|----------|-------------|-------------|
| **개발** | 135808943968 | @Naru010110 | `nasun-twitter-tokens` |
| **프로덕션** | 466841130170 | @Nasun_io | `nasun-twitter-tokens-prod` |

> ✅ **2025-12-04 간소화**: 개발 환경의 중복 Secret (`nasun-twitter-tokens-dev`) 제거. 이제 단일 Secret만 사용합니다.

### 개발 환경 (AWS 135808943968)

**타겟 계정**: @Naru010110 (User ID: 1863020068785004544)

**Secrets Manager**:
- `nasun-twitter-tokens`: Lambda 함수 및 토큰 교환 스크립트가 공통으로 사용

**OAuth 2.0 앱 정보**:
- Client ID: `S1g0aW9HcDZsbDgzSDBDNnFCREI6MTpjaQ`
- Redirect URI: `http://localhost:5174/callback`
- Scopes: `tweet.read users.read follows.read offline.access like.read list.read`

### 프로덕션 환경 (AWS 466841130170)

**타겟 계정**: @Nasun_io

**Secrets Manager**:
- `nasun-twitter-tokens-prod`: Lambda 함수가 사용하는 토큰 저장소

**OAuth 2.0 앱 정보**:
- Client ID: `Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ`
- Redirect URI: `https://nasun.io/callback`
- Scopes: `tweet.read users.read follows.read offline.access like.read list.read`

---

## Secrets Manager 구조

### Secret JSON 스키마

```json
{
  "apiKey": "OAuth 1.0a API Key",
  "apiSecret": "OAuth 1.0a API Secret",
  "accessToken": "OAuth 1.0a Access Token",
  "accessTokenSecret": "OAuth 1.0a Access Token Secret",
  "bearerToken": "App-only Bearer Token",
  "oauth2": {
    "clientId": "OAuth 2.0 Client ID",
    "clientSecret": "OAuth 2.0 Client Secret",
    "userAccessToken": "OAuth 2.0 User Access Token (2시간 유효)",
    "refreshToken": "OAuth 2.0 Refresh Token (6개월 유효)",
    "expiresAt": 1764829385766,
    "lastRefreshed": "2025-12-04T04:23:05.921Z",
    "scope": "tweet.read users.read follows.read offline.access like.read list.read"
  },
  "lastUpdated": "2025-12-04T04:23:05.921Z",
  "version": "2.4-automated"
}
```

### 토큰 유효 기간

| 토큰 종류 | 유효 기간 | 갱신 방법 |
|----------|----------|----------|
| OAuth 2.0 Access Token | **2시간** | Refresh Token으로 자동 갱신 |
| OAuth 2.0 Refresh Token | **6개월** | 수동 재인증 필요 |
| OAuth 1.0a Tokens | 영구 (revoke 전까지) | 수동 재발급 |
| Bearer Token | 영구 (앱 삭제 전까지) | X Developer Portal에서 재생성 |

---

## 토큰 자동 갱신 메커니즘

### Lambda 함수

- **함수 이름**: `nasun-refresh-oauth2-token`
- **실행 주기**: EventBridge 스케줄러로 90분마다 실행
- **갱신 조건**: Access Token 만료 30분 전

### 환경 변수

```bash
# 개발 환경
TWITTER_TOKENS_SECRET_NAME=nasun-twitter-tokens
OAUTH2_CLIENT_ID=S1g0aW9HcDZsbDgzSDBDNnFCREI6MTpjaQ
OAUTH2_REDIRECT_URI=http://localhost:5174/callback

# 프로덕션 환경
TWITTER_TOKENS_SECRET_NAME=nasun-twitter-tokens-prod
OAUTH2_CLIENT_ID=Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ
OAUTH2_REDIRECT_URI=https://nasun.io/callback
```

### 자동 갱신 플로우

```
EventBridge (90분마다)
    ↓
Lambda: nasun-refresh-oauth2-token
    ↓
Secrets Manager에서 토큰 조회
    ↓
만료 30분 전? → No → 종료 (갱신 불필요)
    ↓ Yes
X API /oauth2/token (refresh_token grant)
    ↓
새 Access Token + 새 Refresh Token 발급
    ↓
Secrets Manager 업데이트
    ↓
성공 로그 기록
```

### CloudWatch 모니터링

- **Alarm**: `NASUN-OAuth토큰-갱신실패`
  - Trigger: 10분간 2회 연속 에러 시 알림
  - Action: SNS Topic `nasun-monitoring-alerts`

- **Dashboard**: `NASUN-Operations-Monitoring`
  - OAuth 2.0 Token Refresh - 실행 상태 (90분 주기)
  - OAuth 2.0 Token Refresh - 실행 시간

---

## 토큰 만료 시 수동 재인증 절차

### 언제 수동 재인증이 필요한가?

1. Refresh Token이 만료된 경우 (6개월 미사용)
2. Refresh Token이 revoke된 경우 (비밀번호 변경, 앱 권한 취소 등)
3. Lambda에서 `"Value passed for the token was invalid"` 에러 발생

### Step 1: 자동화 스크립트 실행

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
source .env  # 개발 환경
# source .env.production  # 프로덕션 환경

# 통합 인증 스크립트 실행
npx tsx setup-oauth2-auto.ts
```

> 💡 **Tip**: 만약 5174 포트가 이미 사용 중이라는 에러가 발생하면, 프론트엔드 개발 서버(Vite)를 일시적으로 종료한 후 다시 실행하세요.

### Step 2: 브라우저 인증

1. 스크립트 실행 시 출력되는 **인증 URL**을 브라우저에서 엽니다.
2. 타겟 계정으로 로그인 (개발: @Naru010110, 프로덕션: @Nasun_io)
3. "Authorize app"을 클릭하여 권한을 승인합니다.
4. 인증이 완료되면 브라우저에 "OAuth 2.0 인증 성공!" 메시지가 표시됩니다.

### Step 3: 완료 확인

스크립트가 브라우저의 콜백을 자동으로 수신하여 다음과 같은 작업을 수행합니다:
1. Authorization Code를 Access/Refresh Token으로 교환.
2. 발급된 토큰을 AWS Secrets Manager에 자동 저장.
3. 토큰 소유자 계정 검증.

**출력 예시**:
```
✅ Authorization Code 수신
🔄 즉시 Access Token으로 교환 중...
✅ OAuth 2.0 토큰 발급 성공!
✅ Secrets Manager 업데이트 완료!
✅ 토큰 소유자: @Naru010110 (Naru)
🎉 OAuth 2.0 설정 완료!
```

### Step 4: Lambda 테스트

재인증이 끝난 후 자동 갱신 Lambda를 테스트하여 토큰이 정상적으로 작동하는지 확인합니다.

```bash
# 개발 환경
aws lambda invoke \
  --function-name nasun-refresh-oauth2-token \
  --region ap-northeast-2 \
  /tmp/test-result.json && cat /tmp/test-result.json | jq '.'

# 프로덕션 환경
aws lambda invoke \
  --function-name nasun-refresh-oauth2-token \
  --profile nasun-prod \
  --region ap-northeast-2 \
  /tmp/test-result.json && cat /tmp/test-result.json | jq '.'
```

**정상 응답**:
```json
{
  "success": true,
  "refreshed": false,
  "message": "토큰 갱신 불필요 (남은 시간: 118분)"
}
```

---

## 문제 진단 및 트러블슈팅

### 에러 1: "Value passed for the token was invalid"

**원인**: Refresh Token이 만료되었거나 revoke됨

**해결**: [수동 재인증 절차](#토큰-만료-시-수동-재인증-절차) 수행

### 에러 2: "Secrets Manager can't find the specified secret"

**원인**: Lambda 환경 변수의 Secret 이름이 잘못됨

**진단**:
```bash
# Lambda 환경 변수 확인
aws lambda get-function-configuration \
  --function-name nasun-refresh-oauth2-token \
  --region ap-northeast-2 \
  --query 'Environment.Variables.TWITTER_TOKENS_SECRET_NAME'
```

**해결**: CDK 재배포 또는 Lambda 환경 변수 수동 수정

### 에러 3: 토큰은 유효한데 API 호출 실패

**원인**: Access Token이 새로 갱신되었지만 다른 Lambda가 캐시된 토큰 사용

**해결**: 관련 Lambda 함수 재시작 (코드 변경 없이 설정 업데이트)

### 토큰 상태 빠른 점검

```bash
# 개발 환경
aws secretsmanager get-secret-value \
  --secret-id nasun-twitter-tokens \
  --region ap-northeast-2 \
  --query 'SecretString' --output text | jq -r '
  (.oauth2.expiresAt | tonumber / 1000) as $exp |
  now as $now |
  {
    status: (if $exp > $now then "✅ VALID" else "❌ EXPIRED" end),
    minutes_remaining: (($exp - $now) / 60 | floor),
    last_refreshed: .oauth2.lastRefreshed
  }'

# 프로덕션 환경
aws secretsmanager get-secret-value \
  --secret-id nasun-twitter-tokens-prod \
  --profile nasun-prod \
  --region ap-northeast-2 \
  --query 'SecretString' --output text | jq -r '
  (.oauth2.expiresAt | tonumber / 1000) as $exp |
  now as $now |
  {
    status: (if $exp > $now then "✅ VALID" else "❌ EXPIRED" end),
    minutes_remaining: (($exp - $now) / 60 | floor),
    last_refreshed: .oauth2.lastRefreshed
  }'
```

---

## 일일 상태 점검

### 자동 점검 스크립트

```bash
./daily_health_check.sh
```

이 스크립트는 다음을 확인합니다:
1. 파이프라인 실행 상태 (개발/프로덕션)
2. 데이터 수집 분석 (Mentions, Replies, Likes, Reposts, Quotes)
3. **OAuth 토큰 상태 직접 확인** (Secrets Manager에서 만료 시간 조회) ⭐ 2025-12-04 추가
4. CloudWatch Logs 에러 확인
5. CloudWatch Alarm 상태

> 스크립트가 사용하는 Secret 이름:
> - 개발: `nasun-twitter-tokens`
> - 프로덕션: `nasun-twitter-tokens-prod`

### 수동 점검 체크리스트

- [ ] CloudWatch Dashboard 확인: `NASUN-Operations-Monitoring`
- [ ] CloudWatch Alarm 상태 확인: `NASUN-OAuth토큰-갱신실패`
- [ ] Lambda 실행 로그 검토 (에러 패턴 확인)
- [ ] Secrets Manager 토큰 유효성 확인

---

## 알려진 이슈 및 해결 방법

### ~~이슈 1: 개발 환경에 2개의 Secret 존재~~ ✅ 해결됨 (2025-12-04)

**상황**: 개발 환경에 `nasun-twitter-tokens`와 `nasun-twitter-tokens-dev` 두 개의 Secret이 존재

**해결**:
- `.env` 파일에서 `TWITTER_TOKENS_SECRET_NAME=nasun-twitter-tokens`로 통일
- Lambda가 `nasun-twitter-tokens`를 직접 사용하도록 변경
- `nasun-twitter-tokens-dev` **삭제 완료** (2025-12-04 13:46 KST)

### ~~이슈 2: 프로덕션 Lambda 환경 변수 오류~~ ✅ 해결됨 (2025-12-04)

**상황**: 프로덕션 Lambda의 환경 변수가 개발 환경 값으로 설정됨

**해결**: CDK 프로덕션 재배포 완료
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk
pnpm cdk deploy CdkStack --profile nasun-prod --require-approval never
```

**검증 완료**:
- `TWITTER_TOKENS_SECRET_NAME=nasun-twitter-tokens-prod` ✅
- `OAUTH2_CLIENT_ID=Rzg4WDBrQ250XzRNaGZ1RGFNRm06MTpjaQ` ✅
- `OAUTH2_REDIRECT_URI=https://nasun.io/callback` ✅

---

## 참고 문서

- [OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md) - 2025-11-02 복구 보고서
- [OAUTH_TOKEN_REPLACEMENT_COMPREHENSIVE_REPORT.md](OAUTH_TOKEN_REPLACEMENT_COMPREHENSIVE_REPORT.md) - 토큰 교체 종합 보고서
- [SCHEDULED_TASKS_GUIDE.md](SCHEDULED_TASKS_GUIDE.md) - 스케줄링 작업 가이드

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2025-12-04 | 1.0.0 | 초기 문서 작성, 개발 환경 토큰 복구 완료 |
| 2025-12-04 | 1.1.0 | Secret 관리 구조 간소화 (개발 환경 단일 Secret 통일), 프로덕션 Lambda 환경 변수 수정 완료 |
| 2025-12-04 | 1.2.0 | `nasun-twitter-tokens-dev` 삭제 완료, 프로덕션 토큰 복구 완료, `daily_health_check.sh` 스크립트 업데이트, 토큰 상태 빠른 점검 명령어 수정 |

---

**문서 버전**: 1.2.0
**마지막 업데이트**: 2025-12-04
**작성자**: Claude Code
