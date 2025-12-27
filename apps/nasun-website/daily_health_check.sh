#!/bin/bash

# Nasun Leaderboard Daily Health Check Script
# ============================================
#
# 이 스크립트는 Nasun 리더보드 시스템의 개발 및 프로덕션 환경의
# 주요 구성 요소가 정상적으로 작동하는지 종합적으로 점검합니다.
#
# 실행 전 요구사항:
# 1. AWS CLI 설치 및 인증 설정
# 2. 'nasun-prod' AWS 프로필 설정
# 3. 'jq' 설치 권장 (JSON 파싱에 사용)

set -e # 오류 발생 시 스크립트 중단

# --- 구성 변수 ---
PIPELINE_NAME="nasun-leaderboard-pipeline"
TABLE_NAME="nasun-leaderboard-data"
TOKEN_LAMBDA_NAME="nasun-refresh-oauth2-token"
TOKEN_LOG_GROUP="/aws/lambda/nasun-refresh-oauth2-token"
DEV_ALARMS=("NASUN-OAuth토큰-갱신실패" "nasun-oauth2-token-refresh-failure" "nasun-oauth2-invalid-refresh-token")
PROD_ALARMS=("nasun-oauth2-token-refresh-failure" "nasun-oauth2-invalid-refresh-token")

# --- Secret 이름 (2025-12-04 간소화) ---
DEV_SECRET_NAME="nasun-twitter-tokens"
PROD_SECRET_NAME="nasun-twitter-tokens-prod"

# --- 날짜 변수 ---
TODAY_START=$(date -u +"%Y-%m-%dT00:00:00Z")
YESTERDAY_DATE=$(date -d "yesterday" +"%Y-%m-%d")
YESTERDAY_PK="LEADERBOARD#CUMULATIVE#${YESTERDAY_DATE}"
CUMULATIVE_PK="LEADERBOARD#CUMULATIVE"
START_TIME_24H_AGO=$(date -d "24 hours ago" +%s%3N)

# --- 도우미 함수 ---
function print_header() {
    echo "=================================================="
    echo "$1"
    echo "=================================================="
}

function print_subheader() {
    echo "--- $1 ---"
}

# --- 점검 함수 ---

# 1. 파이프라인 상태 확인
function check_pipeline_status() {
    local profile=$1
    local env_name=$2
    print_subheader "[$env_name] 파이프라인 실행 상태"

    local state_machine_arn=$(aws stepfunctions list-state-machines --profile "$profile" --query "stateMachines[?name=='$PIPELINE_NAME'].stateMachineArn" --output text)
    if [ -z "$state_machine_arn" ]; then
        echo "오류: $env_name 환경에서 '$PIPELINE_NAME' Step Functions 상태 머신을 찾을 수 없습니다."
        return
    fi

    local execution=$(aws stepfunctions list-executions --profile "$profile" \
        --state-machine-arn "$state_machine_arn" \
        --query "executions[?starts_with(startDate, '$(date -u +%Y-%m-%d)') && status=='SUCCEEDED'] | [0]" --output json)

    if [ -z "$execution" ] || [ "$execution" == "null" ]; then
        echo "❌ 오늘 날짜로 성공적으로 실행된 파이프라인이 없습니다."
    else
        local start_date=$(echo "$execution" | jq -r '.startDate')
        local stop_date=$(echo "$execution" | jq -r '.stopDate')
        local status=$(echo "$execution" | jq -r '.status')
        EXECUTION_ARN=$(echo "$execution" | jq -r '.executionArn') # 전역 변수로 저장

        echo "✅ 오늘 실행된 파이프라인을 찾았습니다."
        echo "   - 상태: $status"
        echo "   - 시작 시간: $start_date"
        echo "   - 종료 시간: $stop_date"
        echo "   - Execution ARN: $EXECUTION_ARN"
    fi
    echo ""
}

# 2. 데이터 수집 상세 분석 (개발/프로덕션 공통)
function analyze_pipeline_data() {
    local execution_arn=$1
    local profile=$2
    local env_name=$3
    print_subheader "[$env_name] 데이터 수집 상세 분석"

    if [ -z "$execution_arn" ]; then
        echo "파이프라인 실행 정보가 없어 분석을 건너뜁니다."
        return
    fi

    local history=$(aws stepfunctions get-execution-history --profile "$profile" --execution-arn "$execution_arn" --output json)

    # 오류 확인
    local failed_steps=$(echo "$history" | jq '[.events[] | select(.type | endswith("Failed"))] | length')
    if [ "$failed_steps" -gt 0 ]; then
        echo "❌ 파이프라인 실행 중 ${failed_steps}개의 실패한 단계가 발견되었습니다."
    else
        echo "✅ 파이프라인의 모든 단계가 성공적으로 완료되었습니다."
    fi

    # Step Functions 최종 output에서 collectedEngagements 추출
    local execution_output=$(aws stepfunctions describe-execution --profile "$profile" \
        --execution-arn "$execution_arn" --query 'output' --output text 2>/dev/null)

    # engagement_type별 개수 집계
    local reply_count=$(echo "$execution_output" | jq '[.collectedEngagements[]? | select(.engagement_type == "reply")] | length // 0' 2>/dev/null)
    local mention_count=$(echo "$execution_output" | jq '[.collectedEngagements[]? | select(.engagement_type == "mention")] | length // 0' 2>/dev/null)

    echo "📊 Active Engagements (수집됨):"
    echo "   - Replies: ${reply_count:-0}개"
    echo "   - Mentions: ${mention_count:-0}개"

    # GetTargetTweets 결과에서 타겟 포스트 수 추출
    local target_posts=$(echo "$history" | jq -r '
        [.events[] | select(.type == "TaskSucceeded") | .taskSucceededEventDetails.output] |
        map(fromjson? // {}) |
        map(.Payload.tweets // []) |
        map(length) |
        add // 0
    ')

    # Passive Engagements 추출
    local likes_collected=$(echo "$history" | jq -r '
        [.events[] | select(.type == "TaskSucceeded") | .taskSucceededEventDetails.output] |
        map(fromjson? // {}) |
        map(.Payload.totalLikes // 0) |
        add // 0
    ')

    local reposts_collected=$(echo "$history" | jq -r '
        [.events[] | select(.type == "TaskSucceeded") | .taskSucceededEventDetails.output] |
        map(fromjson? // {}) |
        map(.Payload.totalRetweets // 0) |
        add // 0
    ')

    local quotes_collected=$(echo "$history" | jq -r '
        [.events[] | select(.type == "TaskSucceeded") | .taskSucceededEventDetails.output] |
        map(fromjson? // {}) |
        map(.Payload.totalQuotes // 0) |
        add // 0
    ')

    echo "📊 Passive Engagements:"
    echo "   - 원본 포스트 수: ${target_posts:-0}개"
    echo "   - Likes: ${likes_collected:-0}개"
    echo "   - Reposts: ${reposts_collected:-0}개"
    echo "   - Quotes: ${quotes_collected:-0}개"
    echo ""
}

# 3. 누적 리더보드 변경 사항 분석 (개발/프로덕션 공통)
function analyze_leaderboard_changes() {
    local profile=$1
    local env_name=$2
    print_subheader "[$env_name] 누적 리더보드 변경 사항 분석"

    local yesterday_count=$(aws dynamodb query --profile "$profile" \
        --table-name "$TABLE_NAME" \
        --key-condition-expression "pk = :pk" \
        --expression-attribute-values '{":pk":{"S":"'"$YESTERDAY_PK"'"}}' \
        --select COUNT --query "Count" --output text 2>/dev/null)

    local today_count=$(aws dynamodb query --profile "$profile" \
        --table-name "$TABLE_NAME" \
        --key-condition-expression "pk = :pk" \
        --expression-attribute-values '{":pk":{"S":"'"$CUMULATIVE_PK"'"}}' \
        --select COUNT --query "Count" --output text 2>/dev/null)

    echo "📊 리더보드 엔트리 수:"
    echo "   - 어제: ${yesterday_count:-0}명"
    echo "   - 오늘: ${today_count:-0}명"

    if [ -n "$today_count" ] && [ -n "$yesterday_count" ]; then
        local new_entrants=$((today_count - yesterday_count))
        echo "   - 신규 진입자: ${new_entrants}명"
    fi
    echo "   - (참고: 개별 순위 및 점수 변동 분석은 스크립트 범위를 벗어납니다.)"
    echo ""
}

# 4. OAuth 토큰 갱신 상태 확인
function check_oauth_token_status() {
    local profile=$1
    local env_name=$2
    local alarm_names_ref=$3 # Variable holding the name of the array
    local secret_name=$4     # Secret 이름
    local alarms=("${!alarm_names_ref[@]}") # Indirect expansion to get array elements
    print_subheader "[$env_name] 트위터 OAuth 2.0 토큰 자동 갱신 상태"

    # Secrets Manager에서 토큰 상태 직접 확인
    echo "🔐 Secrets Manager에서 토큰 상태를 확인합니다... (Secret: $secret_name)"
    local token_info=$(aws secretsmanager get-secret-value --profile "$profile" \
        --secret-id "$secret_name" \
        --region ap-northeast-2 \
        --query 'SecretString' --output text 2>/dev/null)

    if [ -n "$token_info" ]; then
        local expires_at=$(echo "$token_info" | jq -r '.oauth2.expiresAt // 0')
        local last_refreshed=$(echo "$token_info" | jq -r '.oauth2.lastRefreshed // "N/A"')
        local current_time=$(date +%s)
        local expires_at_sec=$((expires_at / 1000))
        local remaining_min=$(( (expires_at_sec - current_time) / 60 ))

        if [ "$remaining_min" -gt 0 ]; then
            echo "✅ 토큰 상태: VALID"
            echo "   - 남은 시간: ${remaining_min}분"
            echo "   - 마지막 갱신: $last_refreshed"
        else
            echo "❌ 토큰 상태: EXPIRED"
            echo "   - 마지막 갱신: $last_refreshed"
            echo "   ⚠️  수동 재인증이 필요합니다! (doc/OAUTH_TOKEN_MANAGEMENT_GUIDE.md 참조)"
        fi
    else
        echo "❌ Secret을 조회할 수 없습니다: $secret_name"
    fi
    echo ""

    # CloudWatch 로그 확인
    echo "🔎 CloudWatch 로그에서 오류를 확인합니다..."
    local log_errors=$(aws logs filter-log-events --profile "$profile" \
        --log-group-name "$TOKEN_LOG_GROUP" \
        --start-time "$START_TIME_24H_AGO" \
        --filter-pattern '? "ERROR" ? "Token refresh failed" ? "invalid_request" ? "ResourceNotFoundException"' \
        --query "events" --output json 2>/dev/null)

    if [ -n "$log_errors" ] && [ "$(echo "$log_errors" | jq 'length')" -gt 0 ]; then
        echo "❌ 지난 24시간 동안 토큰 갱신 오류가 발견되었습니다:"
        echo "$log_errors" | jq -r '.[-3:][].message' | head -20
    else
        echo "✅ 지난 24시간 동안 로그에서 토큰 갱신 관련 오류가 발견되지 않았습니다."
    fi
    echo ""

    # CloudWatch 알람 상태 확인
    echo "🔔 CloudWatch 알람 상태를 확인합니다..."
    local alarm_states=$(aws cloudwatch describe-alarms --profile "$profile" \
        --alarm-names "${alarms[@]}" --query "MetricAlarms[].{Name:AlarmName, State:StateValue}" --output json 2>/dev/null)

    if [ -n "$alarm_states" ] && echo "$alarm_states" | jq -e '.[] | select(.State == "ALARM")' > /dev/null 2>&1; then
        echo "❌ 하나 이상의 토큰 갱신 관련 알람이 'ALARM' 상태입니다:"
        echo "$alarm_states" | jq '.'
    else
        echo "✅ 모든 관련 알람이 'OK' 또는 'INSUFFICIENT_DATA' 상태입니다."
    fi
    echo ""
}


# --- 메인 실행 로직 ---
print_header "Nasun 리더보드 시스템 일일 상태 점검 보고서 ($(date +'%Y-%m-%d'))"

# 1. 개발 환경 점검
print_header "1. 개발 환경 (AWS Profile: default)"
EXECUTION_ARN=""  # 변수 초기화
check_pipeline_status "default" "개발 환경"
if [ -n "$EXECUTION_ARN" ]; then
    analyze_pipeline_data "$EXECUTION_ARN" "default" "개발 환경"
fi
analyze_leaderboard_changes "default" "개발 환경"
check_oauth_token_status "default" "개발 환경" "DEV_ALARMS" "$DEV_SECRET_NAME"


# 2. 프로덕션 환경 점검
print_header "2. 프로덕션 환경 (AWS Profile: nasun-prod)"
EXECUTION_ARN=""  # 변수 초기화
check_pipeline_status "nasun-prod" "프로덕션 환경"
if [ -n "$EXECUTION_ARN" ]; then
    analyze_pipeline_data "$EXECUTION_ARN" "nasun-prod" "프로덕션 환경"
fi
analyze_leaderboard_changes "nasun-prod" "프로덕션 환경"
check_oauth_token_status "nasun-prod" "프로덕션 환경" "PROD_ALARMS" "$PROD_SECRET_NAME"

print_header "점검 완료"
