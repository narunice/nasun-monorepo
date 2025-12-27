# NASUN 프로젝트 자동화 작업 가이드 (Scheduled Tasks Guide)

**문서 버전**: 1.2.0
**작성일**: 2025-10-30
**최종 업데이트**: 2025-11-02 ✅ **OAuth 토큰 모니터링 시스템 추가**
**작성자**: Gemini, Claude Code

이 문서는 NASUN 웹사이트 프로젝트 내에서 AWS EventBridge에 의해 자동으로 실행되는 모든 스케줄링 작업에 대한 기술적인 설명과 가이드를 제공합니다.

> ⚠️ **환경 분리 참고 사항**:
> NASUN 프로젝트는 개발 환경과 프로덕션 환경이 완전히 분리되어 있습니다. 각 환경은 독립적인 AWS 계정, X API 앱, 타겟 계정을 사용하며, 아래 설명된 모든 스케줄된 작업도 환경별로 독립적으로 실행됩니다.
>
> - **개발 환경**: AWS 계정 135808943968, 타겟 계정 @Naru010110
> - **프로덕션 환경**: AWS 계정 466841130170, 타겟 계정 @Nasun_io
>
> 자세한 환경별 설정은 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)를 참조하세요.

---

## 📋 목차

1. [매일 실행되는 작업 (Daily Tasks)](#1-매일-실행되는-작업-daily-tasks)
   - [1.1. 리더보드 데이터 수집 파이프라인](#11-리더보드-데이터-수집-파이프라인)
   - [1.2. 커뮤니티 멤버 목록 동기화](#12-커뮤니티-멤버-목록-동기화)
   - [1.3. 비활성 계정 영구 삭제](#13-비활성-계정-영구-삭제)
2. [기타 주기적 작업 (Other Periodic Tasks)](#2-기타-주기적-작업-other-periodic-tasks)
   - [2.1. OAuth 2.0 토큰 자동 갱신](#21-oauth-20-토큰-자동-갱신)
   - [2.2. 가격 정보 업데이트](#22-가격-정보-업데이트)
   - [2.3. 커뮤니티 분류 배치 작업](#23-커뮤니티-분류-배치-작업)
3. [모니터링 및 알림 (Monitoring & Alerts)](#3-모니터링-및-알림-monitoring--alerts)
   - [3.1. OAuth 토큰 갱신 실패 감지](#31-oauth-토큰-갱신-실패-감지)
   - [3.2. CloudWatch Dashboard](#32-cloudwatch-dashboard)
   - [3.3. SNS 알림 설정](#33-sns-알림-설정)

---

## 1. 매일 실행되는 작업 (Daily Tasks)

### 1.1. 리더보드 데이터 수집 파이프라인

-   **목적**: 프로젝트의 핵심 기능으로, X(Twitter) 활동 데이터를 수집, 처리, 점수화하여 일일 리더보드를 생성합니다.
-   **실행 주기**: **매일 오전 9시 10분 (KST)**
-   **상태**: ✅ **정상** (2025-10-30 검증 완료)
-   **작동 방식**:
    -   **CDK 스택**: `CdkStack`
    -   **EventBridge 규칙**: `nasun-daily-data-collection`
    -   **트리거 대상**: `nasun-leaderboard-pipeline` Step Functions 상태 머신
    -   **설명**: 지정된 시간에 EventBridge가 Step Functions 파이프라인을 트리거합니다. 이 파이프라인은 여러 Lambda 함수를 조율하여 데이터 수집, 처리, 점수 계산, 리더보드 생성까지의 전체 과정을 자동화합니다.
-   **검증 내역**: 2025-10-30 심층 분석 결과, 모든 파이프라인 단계(토큰 갱신, 데이터 수집, 중복 방지, 점수 계산, 리더보드 생성)가 의도대로 정상 작동하고 있음을 확인했습니다. 과거 데이터 불일치 문제는 일회성 테스트로 인한 것임을 규명하고, 데이터 재수집을 통해 해결했습니다.

### 1.2. 커뮤니티 멤버 목록 동기화

-   **목적**: 웹사이트에 가입하고 X 계정을 연동한 사용자를 "인증된 커뮤니티 멤버"로 식별하여 리더보드에 '✓' 뱃지를 표시하기 위한 목록을 최신 상태로 유지합니다.
-   **실행 주기**: **매일 자정 (00:00 KST)**
-   **작동 방식**:
    -   **CDK 스택**: `CdkStack`
    -   **EventBridge 규칙**: `nasun-sync-community-members-daily`
    -   **트리거 대상**: `nasun-sync-community-members` Lambda 함수
    -   **설명**: 매일 자정, `UserProfiles` 테이블을 스캔하여 X 계정이 연동된 사용자를 `nasun-leaderboard-data` 테이블의 `COMMUNITY_MEMBERS` 목록으로 동기화합니다.

### 1.3. 비활성 계정 영구 삭제

-   **목적**: 사용자가 웹사이트에서 탈퇴한 후 30일이 지난 비활성 계정 정보를 개인정보 보호 및 데이터 관리 차원에서 영구적으로 삭제합니다.
-   **실행 주기**: **매일 오전 3시 (KST)**
-   **작동 방식**:
    -   **CDK 스택**: `CommonStack`
    -   **EventBridge 규칙**: `PurgeAccountsRule`
    -   **트리거 대상**: `nasun-purge-deactivated-accounts` Lambda 함수
    -   **설명**: 매일 오전 3시, 탈퇴 후 30일이 경과한 사용자 정보를 찾아 데이터베이스에서 삭제합니다.

## 2. 기타 주기적 작업 (Other Periodic Tasks)

### 2.1. OAuth 2.0 토큰 자동 갱신

-   **목적**: X API와 통신하는 데 사용되는 OAuth 2.0 토큰이 만료되지 않도록 자동으로 갱신하여 24/7 서비스 연속성을 보장하는 가장 중요한 백그라운드 작업입니다.
-   **실행 주기**: **90분마다**
-   **상태**: ✅ **정상** (2025-11-02 복구 완료 및 모니터링 강화)
-   **작동 방식**:
    -   **CDK 스택**: `CdkStack`
    -   **EventBridge 규칙**: `TokenRefreshSchedule`
    -   **트리거 대상**: `nasun-refresh-oauth2-token` Lambda 함수
    -   **설명**: X API의 Access Token 유효 기간(120분)보다 짧은 90분 주기로 갱신을 시도하여, 토큰 만료로 인한 API 호출 실패를 원천적으로 방지합니다.
-   **검증 내역**:
    -   **2025-11-02 복구 작업**: 개발 환경에서 Refresh Token이 revoked되어 11시간 동안 갱신 실패가 발생했던 문제를 긴급 복구했습니다. 수동 OAuth 재인증을 통해 새로운 토큰을 발급받아 정상화했습니다.
    -   **모니터링 강화**: CloudWatch Alarm(`NASUN-OAuth토큰-갱신실패`)을 추가하여 10분간 2회 연속 실패 시 즉시 알림을 받도록 개선했습니다. 이를 통해 문제 감지 시간을 11시간 → 10분으로 98.5% 단축했습니다.
    -   자세한 내용은 [OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](./OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md)를 참조하세요.
-   **재발 방지**:
    -   **Dead Letter Queue (DLQ)**: EventBridge Rule에 DLQ 연결 (최대 3회 재시도, 10분 이내)
    -   **CloudWatch Alarm**: 10분간 2회 연속 실패 시 SNS 알림
    -   **CloudWatch Dashboard**: 실행 상태 및 실행 시간 실시간 모니터링
    -   **정기 점검**: 매주 토큰 상태 및 CloudWatch 메트릭 확인 권장

### 2.2. 가격 정보 업데이트

-   **목적**: NFT 또는 기타 자산의 가격 정보를 외부 소스로부터 주기적으로 가져와 업데이트합니다.
-   **실행 주기**: **매시간**
-   **상태**: ✅ **정상** (2025-10-30 검증 및 오류 수정 완료)
-   **작동 방식**:
    -   **CDK 스택**: `CommonStack`
    -   **EventBridge 규칙**: `PriceUpdateRule`
    -   **트리거 대상**: `priceUpdaterLambda` Lambda 함수
    -   **설명**: 매시간 정각에 실행되어 가격 정보를 최신 상태로 유지합니다.
-   **검증 내역**: 2025-10-30 조사 결과, `Runtime.ImportModuleError`(의존성 누락) 및 `AccessDeniedException`(DB 쓰기 권한 부족) 오류로 인해 작업이 실패하고 있었음. 의존성 재설치, IAM 권한 추가 및 재배포를 통해 오류를 해결하고 정상 작동을 확인함.

### 2.3. 커뮤니티 분류 배치 작업

-   **목적**: 사용자들의 트윗 언어 등을 재분석하여 '한국 커뮤니티'와 '글로벌 커뮤니티'로 분류하는 작업을 수행합니다. 이 분류는 점수 계산 시 차등 가중치를 적용하는 데 사용됩니다.
-   **실행 주기**: **매주 일요일 오전 3시 (KST)**
-   **상태**: ✅ **정상** (2025-10-30 검증 완료)
-   **작동 방식**:
    -   **CDK 스택**: `CdkStack`
    -   **EventBridge 규칙**: `nasun-community-classification-weekly`
    -   **트리거 대상**: `nasun-community-classifier-batch` Lambda 함수
    -   **설명**: 일주일에 한 번, 모든 사용자를 대상으로 언어 분석을 다시 실행하여 커뮤니티 분류를 업데이트합니다.
-   **검증 내역**: 2025-10-30 조사 결과, 가장 최근 실행인 10월 26일(일) 로그를 통해 작업이 정상적으로 시작되어 오류 없이 완료되었음을 확인했습니다.

---

## 3. 모니터링 및 알림 (Monitoring & Alerts)

### 3.1. OAuth 토큰 갱신 실패 감지

**목적**: OAuth 2.0 토큰 갱신 실패를 조기에 감지하여 서비스 중단을 방지합니다.

**CloudWatch Alarm 설정**:
-   **알람명**: `NASUN-OAuth토큰-갱신실패`
-   **Metric**: Lambda Errors (`nasun-refresh-oauth2-token`)
-   **임계값**: 1회 에러
-   **Period**: 5분
-   **EvaluationPeriods**: 2회 연속 (총 10분)
-   **Action**: SNS 알림 (`nasun-monitoring-alerts`)

**작동 방식**:
1. Lambda 함수 실행 시 에러 발생
2. CloudWatch Metrics에 에러 기록
3. 5분간 1회 에러 감지
4. 다시 5분간 1회 에러 감지 (총 10분간 2회)
5. CloudWatch Alarm 상태 변경: `OK` → `ALARM`
6. SNS Topic으로 알림 발송 (이메일/SMS)

**효과**:
- **이전**: 11시간 동안 방치 (2025-11-02 사례)
- **개선**: 10분 내 감지 및 알림
- **개선율**: 98.5% (660분 → 10분)

**알람 상태 확인**:
```bash
aws cloudwatch describe-alarms \
  --alarm-names "NASUN-OAuth토큰-갱신실패" \
  --region ap-northeast-2 \
  --query 'MetricAlarms[0].{Name:AlarmName, State:StateValue}'
```

**알람 상태별 의미**:
- `OK`: 정상 (에러 없음)
- `INSUFFICIENT_DATA`: 데이터 부족 (Lambda 실행 없음 또는 초기 상태)
- `ALARM`: 경고 (10분간 2회 연속 에러)

### 3.2. CloudWatch Dashboard

**목적**: OAuth 토큰 갱신 상태를 실시간으로 시각화하여 트렌드를 파악합니다.

**Dashboard URL**:
```
https://console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#dashboards:name=NASUN-Operations-Monitoring
```

**추가된 위젯** (2025-11-02):

**1. OAuth 2.0 Token Refresh - 실행 상태 (90분 주기)**
- **Metrics**:
  - 실행 횟수 (Invocations)
  - 실패 횟수 (Errors)
- **Period**: 30분
- **Statistic**: Sum
- **용도**: 정상 실행 여부 및 에러 빈도 확인

**2. OAuth 2.0 Token Refresh - 실행 시간**
- **Metrics**:
  - 평균 실행 시간 (Duration - Average)
  - 최대 실행 시간 (Duration - Maximum)
- **Period**: 30분
- **Statistic**: Average, Maximum
- **용도**: 성능 트렌드 및 타임아웃 위험 감지

**정기 점검 권장 사항**:
- **주기**: 매주 월요일
- **확인 항목**:
  1. 실행 횟수: 주당 112회 (90분 × 16회/일 × 7일) 정상
  2. 실패 횟수: 0회 정상
  3. 평균 실행 시간: 500-700ms 정상
  4. 최대 실행 시간: 1000ms 이하 정상

### 3.3. SNS 알림 설정

**목적**: CloudWatch Alarm 발생 시 개발팀에게 즉시 알림을 전달합니다.

**SNS Topic**:
- **이름**: `nasun-monitoring-alerts`
- **ARN**: `arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts`

**알림 구독 방법**:

**1. 이메일 구독** (권장):
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region ap-northeast-2
```

이메일로 구독 확인 링크가 발송되며, 클릭하여 구독을 완료합니다.

**2. SMS 구독** (선택, 추가 비용 발생):
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts \
  --protocol sms \
  --notification-endpoint +821012345678 \
  --region ap-northeast-2
```

**3. Webhook 구독** (Slack/Discord 등):
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  --region ap-northeast-2
```

**알림 메시지 예시**:
```
ALARM: "NASUN-OAuth토큰-갱신실패" in Asia Pacific (Seoul)

OAuth 2.0 토큰 갱신이 10분간 2회 이상 실패. Refresh Token이 revoked되었거나 X API 장애 가능성.

Alarm Details:
- State: ALARM
- Threshold: >= 1.0 for 2 datapoints within 10 minutes
- Metric: Errors (nasun-refresh-oauth2-token)
- Period: 5 minutes

Recommended Actions:
1. CloudWatch Logs 확인: /aws/lambda/nasun-refresh-oauth2-token
2. 긴급 복구: OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md 참조
3. 근본 원인 조사: X Developer Portal 설정 확인
```

**구독 확인**:
```bash
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:ap-northeast-2:135808943968:nasun-monitoring-alerts \
  --region ap-northeast-2 \
  --query 'Subscriptions[].{Protocol:Protocol, Endpoint:Endpoint, Status:SubscriptionArn}'
```

**구독 해제**:
```bash
aws sns unsubscribe \
  --subscription-arn YOUR_SUBSCRIPTION_ARN \
  --region ap-northeast-2
```

---

## 관련 문서

- **[OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md](./OAUTH_TOKEN_RECOVERY_AND_MONITORING_REPORT.md)** - OAuth 토큰 복구 및 모니터링 강화 완료 보고서 (2025-11-02)
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 환경별 배포 가이드 (개발/프로덕션 분리)
- **[BUILD_CONFIGURATION_GUIDE.md](./BUILD_CONFIGURATION_GUIDE.md)** - 빌드 설정 가이드
- **[LAMBDA_CREATION_GUIDE.md](./LAMBDA_CREATION_GUIDE.md)** - Lambda 함수 생성 가이드
- **[CLAUDE.md](../CLAUDE.md)** - 프로젝트 전체 가이드

---

**문서 버전**: 1.2.0
**최종 업데이트**: 2025-11-02
