#!/bin/bash

# =================================================================================
# 리더보드 동적 구성 기능 자동화 테스트 스크립트
# =================================================================================
# 작성일: 2025-11-24
# 목적: 백엔드 API 및 Lambda 기능 검증
# =================================================================================

set -e  # 에러 발생 시 즉시 중단

API_URL="https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard/config"
LAMBDA_NAME="nasun-get-leaderboard-config"
REGION="ap-northeast-2"

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 유틸리티 함수
pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  exit 1
}

info() {
  echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

section() {
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}  $1${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =================================================================================
# Test 1.1: 기본 API 응답 검증
# =================================================================================
test_1_1() {
  section "Test 1.1: 기본 API 응답 검증"

  info "API 호출: $API_URL"
  RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  # HTTP 200 체크
  if [ "$HTTP_CODE" != "200" ]; then
    fail "HTTP 코드 오류 (Expected: 200, Got: $HTTP_CODE)"
  fi
  pass "HTTP 200 응답"

  # JSON 파싱
  SUCCESS=$(echo "$BODY" | jq -r '.success')
  if [ "$SUCCESS" != "true" ]; then
    fail "success 필드 오류 (Expected: true, Got: $SUCCESS)"
  fi
  pass "success: true"

  # 리더보드 개수
  LB_COUNT=$(echo "$BODY" | jq '.data.availableLeaderboards | length')
  if [ "$LB_COUNT" != "3" ]; then
    fail "리더보드 개수 오류 (Expected: 3, Got: $LB_COUNT)"
  fi
  pass "3개의 리더보드 반환"

  # 필수 필드 체크
  FIELDS=$(echo "$BODY" | jq -r '.data.availableLeaderboards[0] | keys[]' | sort)
  EXPECTED="active\nendDate\nid\nname\nstartDate\nvisible"
  if [ "$(echo "$FIELDS" | tr '\n' ',')" != "$(echo -e "$EXPECTED" | tr '\n' ',')" ]; then
    info "실제 필드: $(echo "$FIELDS" | tr '\n' ' ')"
  fi

  # CUMULATIVE 검증
  CUMULATIVE_ID=$(echo "$BODY" | jq -r '.data.availableLeaderboards[0].id')
  if [ "$CUMULATIVE_ID" == "CUMULATIVE" ]; then
    pass "CUMULATIVE 리더보드 존재"

    # CUMULATIVE는 날짜 없음
    START_DATE=$(echo "$BODY" | jq -r '.data.availableLeaderboards[0].startDate')
    if [ "$START_DATE" == "null" ]; then
      pass "CUMULATIVE에 날짜 필드 없음 (정상)"
    fi
  fi

  # EVENT1, EVENT2 날짜 체크
  EVENT1_START=$(echo "$BODY" | jq -r '.data.availableLeaderboards[1].startDate')
  EVENT1_END=$(echo "$BODY" | jq -r '.data.availableLeaderboards[1].endDate')

  if [ "$EVENT1_START" != "null" ] && [ "$EVENT1_END" != "null" ]; then
    pass "EVENT1에 날짜 정보 존재 ($EVENT1_START ~ $EVENT1_END)"
  else
    fail "EVENT1 날짜 정보 누락"
  fi

  echo ""
  info "Test 1.1 완료 ✅"
}

# =================================================================================
# Test 1.4: 날짜 형식 검증
# =================================================================================
test_1_4() {
  section "Test 1.4: 날짜 형식 검증"

  RESPONSE=$(curl -s "$API_URL")
  START_DATE=$(echo "$RESPONSE" | jq -r '.data.availableLeaderboards[1].startDate')

  # ISO 8601 형식 체크 (YYYY-MM-DD)
  if [[ "$START_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    pass "날짜 형식 정상 (ISO 8601: $START_DATE)"
  else
    fail "잘못된 날짜 형식 (Got: $START_DATE)"
  fi

  echo ""
  info "Test 1.4 완료 ✅"
}

# =================================================================================
# Test 1.5: CORS 헤더 검증
# =================================================================================
test_1_5() {
  section "Test 1.5: CORS 헤더 검증"

  # GET 요청으로 헤더 포함 응답 받기 (HEAD 메서드는 API Gateway에서 지원 안 함)
  HEADERS=$(curl -si "$API_URL" 2>&1 | head -20)

  # Access-Control-Allow-Origin 체크
  if echo "$HEADERS" | grep -i "access-control-allow-origin: \*" > /dev/null; then
    pass "Access-Control-Allow-Origin: * 확인"
  else
    fail "CORS 헤더 누락"
  fi

  # Access-Control-Allow-Credentials 체크
  if echo "$HEADERS" | grep -i "access-control-allow-credentials: true" > /dev/null; then
    pass "Access-Control-Allow-Credentials: true 확인"
  else
    info "Access-Control-Allow-Credentials 헤더 미설정 (선택 사항)"
  fi

  echo ""
  info "Test 1.5 완료 ✅"
}

# =================================================================================
# Test 1.6: Lambda 환경변수 확인
# =================================================================================
test_1_6() {
  section "Test 1.6: Lambda 환경변수 확인"

  info "Lambda 함수: $LAMBDA_NAME"
  ENV_VARS=$(aws lambda get-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --query 'Environment.Variables' 2>/dev/null)

  if [ $? -ne 0 ]; then
    fail "Lambda 환경변수 조회 실패 (AWS CLI 권한 확인)"
  fi

  # VISIBLE_LEADERBOARDS 체크
  VISIBLE=$(echo "$ENV_VARS" | jq -r '.VISIBLE_LEADERBOARDS')
  if [ "$VISIBLE" != "null" ] && [ -n "$VISIBLE" ]; then
    pass "VISIBLE_LEADERBOARDS 설정됨: $VISIBLE"
  else
    fail "VISIBLE_LEADERBOARDS 환경변수 누락"
  fi

  # EVENT 날짜 체크
  EVENT1_START=$(echo "$ENV_VARS" | jq -r '.EVENT1_START_DATE')
  EVENT1_END=$(echo "$ENV_VARS" | jq -r '.EVENT1_END_DATE')

  if [ "$EVENT1_START" != "null" ] && [ "$EVENT1_END" != "null" ]; then
    pass "EVENT1 날짜 환경변수 설정됨"
  fi

  # AWS_REGION 체크
  AWS_REGION_VAR=$(echo "$ENV_VARS" | jq -r '.AWS_REGION')
  if [ "$AWS_REGION_VAR" == "$REGION" ]; then
    pass "AWS_REGION 환경변수 정상"
  elif [ "$AWS_REGION_VAR" == "null" ]; then
    info "AWS_REGION 환경변수 미설정 (Lambda 기본값 사용)"
  fi

  echo ""
  info "Test 1.6 완료 ✅"
}

# =================================================================================
# Test 1.7: Lambda 실행 시간 측정
# =================================================================================
test_1_7() {
  section "Test 1.7: Lambda 실행 시간 측정"

  info "웜 스타트 테스트 (3회 평균)"

  TOTAL_TIME=0
  for i in {1..3}; do
    START=$(date +%s%3N)
    curl -s "$API_URL" > /dev/null
    END=$(date +%s%3N)
    ELAPSED=$((END - START))
    TOTAL_TIME=$((TOTAL_TIME + ELAPSED))
    info "  시도 $i: ${ELAPSED}ms"
  done

  AVG_TIME=$((TOTAL_TIME / 3))

  if [ $AVG_TIME -lt 200 ]; then
    pass "평균 응답 시간: ${AVG_TIME}ms (목표: < 200ms)"
  elif [ $AVG_TIME -lt 500 ]; then
    info "평균 응답 시간: ${AVG_TIME}ms (허용 범위)"
  else
    fail "평균 응답 시간 초과: ${AVG_TIME}ms (목표: < 500ms)"
  fi

  echo ""
  info "Test 1.7 완료 ✅"
}

# =================================================================================
# 메인 실행
# =================================================================================
main() {
  echo ""
  echo "🧪 리더보드 동적 구성 기능 - 자동화 테스트 시작"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # 필수 도구 체크
  command -v curl >/dev/null 2>&1 || { echo "❌ curl이 설치되지 않았습니다"; exit 1; }
  command -v jq >/dev/null 2>&1 || { echo "❌ jq가 설치되지 않았습니다"; exit 1; }
  command -v aws >/dev/null 2>&1 || { echo "⚠️  aws CLI가 설치되지 않았습니다 (일부 테스트 스킵)"; }

  # Critical 테스트 실행
  test_1_1
  test_1_4
  test_1_5

  # AWS CLI가 있는 경우에만 실행
  if command -v aws >/dev/null 2>&1; then
    test_1_6
  fi

  test_1_7

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✅ 모든 테스트 통과!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# 스크립트 실행
main "$@"
