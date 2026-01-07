# 디버그 보고서: Nasun 리더보드 개발 환경 파이프라인 정상화 및 토큰 복구

**일시**: 2026년 1월 7일  
**환경**: 개발 환경 (AWS Profile: default)  
**문제 파이프라인**: `nasun-leaderboard-pipeline`  
**해결 실행 ID**: `272a1ad2-c92f-432a-a7e3-955b918a75a1`

---

## 📋 문제 개요

2026년 1월 7일 오전 헬스 체크 결과, 개발 환경에서 다음과 같은 치명적 문제들이 보고됨:
1. **파이프라인 실행 실패**: 오늘 날짜로 성공적으로 실행된 파이프라인 없음.
2. **OAuth 2.0 토큰 만료**: `nasun-twitter-tokens` 시크릿의 토큰 상태가 `EXPIRED`.
3. **자동 갱신 실패**: `nasun-refresh-oauth2-token` Lambda가 400 Error (`invalid_request`)와 함께 Refresh Token 무효화 보고.
4. **리더보드 데이터 동기화 지연**: 파이프라인은 성공했으나, 웹사이트에서 최신 데이터가 즉시 반영되지 않고 이전 데이터(캐시)가 표시됨.

---

## 🔍 조사 및 근본 원인 분석

### 1. 토큰 무효화 (Invalid Refresh Token)
CloudWatch 로그 분석 결과, `nasun-refresh-oauth2-token` Lambda 실행 시 Twitter API로부터 `400 Bad Request` 응답을 받음.
- **원인**: 이전 세션의 디버깅 과정에서 토큰 동기화가 깨졌거나, Refresh Token Rotation 과정에서 새 토큰 저장에 실패하여 기존 Refresh Token이 무효화됨.

### 2. 환경 변수 설정 불일치 (Configuration Drift)
개발 환경의 주요 Lambda 함수들이 잘못된 설정을 참조하고 있음을 확인:
- **시크릿 이름**: `TWITTER_TOKENS_SECRET_NAME`이 `nasun-twitter-tokens-prod`로 설정되어 있었음 (개발 환경인데 운영용 시크릿 참조).
- **인증 설정**: 일부 Lambda에서 `ENABLE_OAUTH2_AUTHENTICATION`이 누락되거나 잘못 설정됨.

### 3. API Gateway 캐시 무효화 실패
리더보드 생성 Lambda(`nasun-leaderboard-generator`)가 실행 완료 후 캐시를 비워야(Flush) 하지만, 잘못된 API ID를 참조하고 있었음.
- **잘못된 ID**: `bumvhwfbj4` (유효하지 않거나 다른 환경의 ID)
- **실제 ID**: `bb4zdy0rwe` (NASUN API Gateway)
- **결과**: 파이프라인이 성공해도 API Gateway의 30분 캐시 설정으로 인해 사용자는 이전 데이터를 계속 보게 됨.

---

## 🔧 해결 조치 사항

### 1단계: OAuth 2.0 수동 재인증
무효화된 Refresh Token을 복구하기 위해 수동 인증 절차 수행:
- `setup-oauth2-auto.ts` 스크립트를 사용하여 `@Naru010110` 계정으로 재인증.
- 새롭게 발급된 Access/Refresh Token을 `nasun-twitter-tokens` 시크릿에 저장 완료.

### 2단계: Lambda 환경 변수 일괄 수정
개발 환경 파이프라인에 참여하는 모든 Lambda의 설정을 정상화:
- **수정 대상**:
  - `nasun-refresh-oauth2-token`
  - `nasun-collect-likes`
  - `nasun-collect-retweets`
  - `nasun-collect-mentions`
  - `nasun-collect-quotes`
  - `nasun-collect-mention-details`
- **수정 내용**:
  - `TWITTER_TOKENS_SECRET_NAME`: `nasun-twitter-tokens` (개발 전용 시크릿)
  - `OAUTH2_CLIENT_ID`: 개발용 Client ID 적용
  - `OAUTH2_REDIRECT_URI`: `http://localhost:5174/callback`
  - `ENABLE_OAUTH2_AUTHENTICATION`: `true`

### 3단계: 자동 갱신 메커니즘 검증
`nasun-refresh-oauth2-token` Lambda를 `forceRefresh: true` 옵션으로 강제 실행:
- **결과**: `success: true, refreshed: true`
- **확인**: 신규 발급된 토큰이 시크릿 매니저에 정상적으로 저장되고 자동 갱신 프로세스가 복구됨을 확인.

### 4단계: API Gateway 설정 수정 및 캐시 수동 무효화
- **Lambda 수정**: `nasun-leaderboard-generator`의 환경 변수 `API_GATEWAY_ID`를 `bb4zdy0rwe`로 업데이트.
- **수동 무효화**: `aws apigateway flush-stage-cache` 명령어를 통해 현재 `prod` 스테이지의 캐시를 즉시 제거.
- **결과**: API 호출 시 30분 전 데이터 대신 오전 11시 44분 업데이트된 최신 데이터가 즉시 반환됨을 확인.

---

## ✅ 최종 검증 결과

### 파이프라인 수동 실행
- **실행 ID**: `272a1ad2-c92f-432a-a7e3-955b918a75a1`
- **상태**: `SUCCEEDED`
- **데이터 수집**: 10건의 신규 멘션 데이터 수집 및 처리 완료.

### 수정 전후 비교

| 항목 | 수정 전 | 수정 후 | 상태 |
|------|---------|---------|------|
| **토큰 상태** | EXPIRED (Invalid) | **VALID** | ✅ 해결 |
| **참조 시크릿** | nasun-twitter-tokens-prod | **nasun-twitter-tokens** | ✅ 해결 |
| **데이터 수집** | 0건 | **10건 (Mentions)** | ✅ 해결 |
| **자동 갱신** | 실패 (400 Error) | **성공** | ✅ 해결 |
| **데이터 동기화** | 캐시 지연 (30분) | **즉시 반영 (Flush)** | ✅ 해결 |

---

## 🛡️ 향후 재발 방지 대책

1. **CDK 환경 변수 동기화**: CDK 배포 시 환경별(`dev`, `prod`) 시크릿 이름이 정확히 분리되어 주입되도록 `cdk.json` 및 관련 stack 코드 재검토.
2. **헬스 체크 모니터링 강화**: 데일리 헬스 체크 스크립트에서 토큰 만료 7일 전부터 '주의' 알림을 보내도록 임계값 조정.
3. **수동 인증 가이드 최신화**: `doc/OAUTH_TOKEN_MANAGEMENT_GUIDE.md`에 이번에 발생한 포트 충돌 및 해결 방법을 업데이트.

---

**작성자**: Junie AI Assistant (Powered by Gemini)  
**작성일**: 2026-01-07  
**검토 상태**: ✅ 검증 완료 및 정상화 확인
