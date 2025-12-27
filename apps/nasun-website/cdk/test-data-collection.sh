#!/bin/bash

# X API 데이터 수집 파이프라인 수동 테스트 스크립트
# 작성일: 2025-09-25
# 목적: 실제 프로덕션 데이터 수집 테스트 (Rate Limit 고려)

set -e

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_section() { echo -e "${PURPLE}🚀 $1${NC}"; }

# 설정
TEST_MODE=true
WAIT_BETWEEN_CALLS=30  # Rate Limit 방지용 대기시간 (초)
TARGET_DATE=$(date +%Y-%m-%d)

log_section "================================="
log_section "X API 데이터 수집 파이프라인 테스트"
log_section "================================="
log_info "테스트 날짜: $TARGET_DATE"
log_info "Rate Limit 대기시간: ${WAIT_BETWEEN_CALLS}초"
log_info ""

# AWS 환경 확인
log_info "🔍 AWS 환경 확인 중..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    log_error "AWS 자격 증명이 설정되지 않았습니다"
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "ap-northeast-2")
log_success "AWS 환경: Account $AWS_ACCOUNT, Region $AWS_REGION"
log_info ""

# Lambda 함수 존재 확인 (최신 Step Functions 포함)
log_info "🔍 Lambda 함수 존재 확인 중..."
FUNCTIONS=(
    # 기존 Batch 함수들
    "nasun-cumulative-data-collector-v2"
    "nasun-target-bookmark-collector-v2" 
    "nasun-target-retweet-collector-v2"
    "nasun-cumulative-score-calculator-v2"
    "nasun-cumulative-leaderboard-generator-v2"
    # Step Functions 파이프라인 함수들
    "nasun-get-target-tweets-v2"
    "nasun-collect-engagements-v2"
    "nasun-collect-mentions-v2"
    "nasun-aggregate-results-v2"
    "nasun-handle-failure-v2"
    # API 함수들
    "nasun-get-cumulative-leaderboard-v2"
    "nasun-get-leaderboard-snapshot-v2"
    "nasun-get-excluded-accounts-status-v2"
)

for func in "${FUNCTIONS[@]}"; do
    if aws lambda get-function --function-name "$func" >/dev/null 2>&1; then
        log_success "✓ $func 존재 확인"
    else
        log_error "✗ $func 함수를 찾을 수 없습니다"
        exit 1
    fi
done
log_info ""

# 테스트 함수: Lambda 호출 및 로그 확인
test_lambda_function() {
    local func_name=$1
    local payload=$2
    local description=$3
    
    log_section "테스트: $description"
    log_info "함수: $func_name"
    log_info "페이로드: $payload"
    
    # 호출 시작 시간 기록
    local start_time=$(date +%s)
    
    # Lambda 함수 호출
    log_info "🚀 Lambda 함수 호출 중..."
    local invoke_result="/tmp/${func_name}-result.json"
    
    # Payload를 파일로 저장하여 전달
    local payload_file="/tmp/${func_name}-payload.json"
    echo "$payload" > "$payload_file"
    
    if aws lambda invoke \
        --function-name "$func_name" \
        --payload "file://$payload_file" \
        --cli-read-timeout 600 \
        "$invoke_result"; then
        
        log_success "Lambda 호출 성공"
        
        # 결과 출력
        if [[ -f "$invoke_result" ]]; then
            log_info "📊 결과:"
            cat "$invoke_result" | jq '.' 2>/dev/null || cat "$invoke_result"
            echo ""
        fi
        
        # 최근 로그 조회
        log_info "📋 CloudWatch 로그 확인 중..."
        local log_group="/aws/lambda/$func_name"
        
        # 최근 10분간의 로그 조회
        local log_start_time=$((start_time * 1000))
        local log_end_time=$((($(date +%s) + 60) * 1000))  # 1분 여유
        
        sleep 5  # CloudWatch 로그 전파 대기
        
        if aws logs describe-log-groups --log-group-name-prefix "$log_group" >/dev/null 2>&1; then
            # 최신 로그 스트림 찾기
            local latest_stream=$(aws logs describe-log-streams \
                --log-group-name "$log_group" \
                --order-by LastEventTime \
                --descending \
                --max-items 1 \
                --query 'logStreams[0].logStreamName' \
                --output text)
            
            if [[ "$latest_stream" != "None" && "$latest_stream" != "null" ]]; then
                log_info "로그 스트림: $latest_stream"
                
                # 로그 이벤트 조회
                aws logs get-log-events \
                    --log-group-name "$log_group" \
                    --log-stream-name "$latest_stream" \
                    --start-time "$log_start_time" \
                    --end-time "$log_end_time" \
                    --query 'events[*].message' \
                    --output text | head -50
            else
                log_warning "로그 스트림을 찾을 수 없습니다"
            fi
        else
            log_warning "로그 그룹을 찾을 수 없습니다: $log_group"
        fi
        
        return 0
    else
        log_error "Lambda 호출 실패"
        return 1
    fi
}

# 1. 기본 인게이지먼트 데이터 수집 테스트
log_section "=========================================="
log_section "1. 기본 인게이지먼트 데이터 수집 테스트"
log_section "=========================================="

PAYLOAD_DATA_COLLECTOR='{"targetDate":"'$TARGET_DATE'","testMode":true,"forceFullCollection":false}'

if test_lambda_function "nasun-cumulative-data-collector-v2" "$PAYLOAD_DATA_COLLECTOR" "기본 인게이지먼트 수집 (likes, replies, reposts, quotes, mentions)"; then
    log_success "✅ 기본 인게이지먼트 수집 테스트 완료"
else
    log_error "❌ 기본 인게이지먼트 수집 테스트 실패"
fi

log_info "⏱️  Rate Limit 방지를 위해 ${WAIT_BETWEEN_CALLS}초 대기..."
sleep $WAIT_BETWEEN_CALLS

# 2. 타겟 북마크 수집 테스트
log_section "=============================="
log_section "2. 타겟 북마크 수집 테스트"
log_section "=============================="

PAYLOAD_BOOKMARK_COLLECTOR='{"targetDate":"'$TARGET_DATE'","testMode":true}'

if test_lambda_function "nasun-target-bookmark-collector-v2" "$PAYLOAD_BOOKMARK_COLLECTOR" "타겟 계정 → 사용자 북마크 수집 (4.0점)"; then
    log_success "✅ 타겟 북마크 수집 테스트 완료"
else
    log_error "❌ 타겟 북마크 수집 테스트 실패"
fi

log_info "⏱️  Rate Limit 방지를 위해 ${WAIT_BETWEEN_CALLS}초 대기..."
sleep $WAIT_BETWEEN_CALLS

# 3. 타겟 리트윗 수집 테스트
log_section "=============================="
log_section "3. 타겟 리트윗 수집 테스트" 
log_section "=============================="

PAYLOAD_RETWEET_COLLECTOR='{"targetDate":"'$TARGET_DATE'","testMode":true}'

if test_lambda_function "nasun-target-retweet-collector-v2" "$PAYLOAD_RETWEET_COLLECTOR" "타겟 계정 → 사용자 리트윗 수집 (6.0점)"; then
    log_success "✅ 타겟 리트윗 수집 테스트 완료"
else
    log_error "❌ 타겟 리트윗 수집 테스트 실패"
fi

log_info "⏱️  Rate Limit 방지를 위해 ${WAIT_BETWEEN_CALLS}초 대기..."
sleep $WAIT_BETWEEN_CALLS

# 4. 점수 계산 테스트
log_section "===================="
log_section "4. 점수 계산 테스트"
log_section "===================="

PAYLOAD_SCORE_CALCULATOR='{"targetDate":"'$TARGET_DATE'","testMode":true,"engagementsProcessed":0}'

if test_lambda_function "nasun-cumulative-score-calculator-v2" "$PAYLOAD_SCORE_CALCULATOR" "수집된 데이터 점수 계산"; then
    log_success "✅ 점수 계산 테스트 완료"
else
    log_error "❌ 점수 계산 테스트 실패"
fi

# 5. Step Functions 파이프라인 테스트
log_section "==============================="
log_section "5. Step Functions 파이프라인 테스트"
log_section "==============================="

log_info "🔄 Step Functions 데이터 수집 파이프라인 실행 중..."

# Step Functions State Machine ARN
STATE_MACHINE_ARN="arn:aws:states:ap-northeast-2:$AWS_ACCOUNT:stateMachine:nasun-data-collection-pipeline-v2"

# Step Functions 실행 입력 데이터
STEP_FUNCTIONS_INPUT="{\"targetDate\":\"$TARGET_DATE\",\"testMode\":true}"

log_info "🚀 State Machine 실행 중..."
log_info "ARN: $STATE_MACHINE_ARN"
log_info "Input: $STEP_FUNCTIONS_INPUT"

# Step Functions 실행
EXECUTION_ARN=$(aws stepfunctions start-execution \
    --state-machine-arn "$STATE_MACHINE_ARN" \
    --name "test-execution-$(date +%Y%m%d-%H%M%S)" \
    --input "$STEP_FUNCTIONS_INPUT" \
    --query 'executionArn' \
    --output text 2>/dev/null)

if [[ -n "$EXECUTION_ARN" ]]; then
    log_success "✅ Step Functions 실행 시작됨"
    log_info "실행 ARN: $EXECUTION_ARN"
    
    # 실행 상태 모니터링 (최대 60초)
    log_info "⏱️  실행 상태 모니터링 중..."
    for i in {1..12}; do
        STATUS=$(aws stepfunctions describe-execution \
            --execution-arn "$EXECUTION_ARN" \
            --query 'status' \
            --output text 2>/dev/null)
        
        case "$STATUS" in
            "SUCCEEDED")
                log_success "✅ Step Functions 실행 완료!"
                
                # 실행 결과 출력
                OUTPUT=$(aws stepfunctions describe-execution \
                    --execution-arn "$EXECUTION_ARN" \
                    --query 'output' \
                    --output text 2>/dev/null)
                
                if [[ -n "$OUTPUT" && "$OUTPUT" != "None" ]]; then
                    log_info "📊 실행 결과:"
                    echo "$OUTPUT" | jq . 2>/dev/null || echo "$OUTPUT"
                fi
                break
                ;;
            "FAILED")
                log_error "❌ Step Functions 실행 실패"
                
                # 오류 정보 출력
                ERROR=$(aws stepfunctions describe-execution \
                    --execution-arn "$EXECUTION_ARN" \
                    --query '{error:error,cause:cause}' \
                    --output json 2>/dev/null)
                
                if [[ -n "$ERROR" ]]; then
                    log_error "오류 정보:"
                    echo "$ERROR" | jq . 2>/dev/null || echo "$ERROR"
                fi
                break
                ;;
            "RUNNING")
                log_info "  ⏳ 실행 중... ($i/12)"
                sleep 5
                ;;
            *)
                log_warning "  ⚠️  상태: $STATUS"
                sleep 5
                ;;
        esac
    done
    
    if [[ "$STATUS" == "RUNNING" ]]; then
        log_warning "⏱️  실행이 아직 진행 중입니다. AWS Step Functions 콘솔에서 확인하세요."
    fi
    
else
    log_error "❌ Step Functions 실행 시작 실패"
fi

log_info "⏱️  Rate Limit 방지를 위해 ${WAIT_BETWEEN_CALLS}초 대기..."
sleep $WAIT_BETWEEN_CALLS

# 6. DynamoDB 데이터 확인
log_section "========================"
log_section "6. DynamoDB 데이터 확인"
log_section "========================"

log_info "🗄️  DynamoDB 테이블에서 오늘 수집된 데이터 확인 중..."

TABLE_NAME="nasun-leaderboard-cumulative-v2"

# 오늘 수집된 데이터 개수 확인
log_info "📊 테이블: $TABLE_NAME"

# 최근 데이터 몇 개 샘플 조회
log_info "🔍 최근 수집된 데이터 샘플 (최대 5개):"
aws dynamodb scan \
    --table-name "$TABLE_NAME" \
    --filter-expression "begins_with(sk, :recent)" \
    --expression-attribute-values '{":recent":{"S":"RECENT#"}}' \
    --max-items 5 \
    --query 'Items[*].{UserId:pk.S,EngagementType:engagementType.S,TweetId:tweetId.S,Username:username.S,DisplayName:displayName.S,AddedAt:addedAt.S}' \
    --output table 2>/dev/null || log_warning "데이터 조회 중 오류 발생 또는 데이터가 없습니다"

# 7. 테스트 결과 요약
log_section "=================="
log_section "7. 테스트 결과 요약"
log_section "=================="

log_info "📊 테스트 완료 시간: $(date)"
log_info "🎯 타겟 계정: Naru010110"
log_info "📅 테스트 날짜: $TARGET_DATE"

echo ""
log_success "🎉 X API 데이터 수집 파이프라인 테스트 완료!"
echo ""
log_info "📋 다음 단계:"
echo "  1. CloudWatch에서 각 Lambda 함수의 상세 로그 확인"
echo "  2. DynamoDB에서 실제 저장된 데이터 품질 확인"  
echo "  3. Rate Limit 상태 모니터링"
echo "  4. 오류가 있다면 해당 Lambda 함수 개별 디버깅"
echo ""

# 임시 파일 정리
rm -f /tmp/nasun-*-result.json

log_success "✅ 테스트 스크립트 실행 완료!"