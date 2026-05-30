#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# verify-pipeline-dev.sh
# 리더보드 파이프라인 검증 스크립트 (Dev 환경)
#
# 사용법:
#   ./verify-pipeline-dev.sh              # 오늘 날짜 검증
#   ./verify-pipeline-dev.sh 2025-12-01   # 특정 날짜 검증
#
# 출력:
#   - 콘솔 출력
#   - /tmp/pipeline-report-YYYY-MM-DD.txt
# ═══════════════════════════════════════════════════════════════

set -e

# ─────────────────────────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────────────────────────
REGION="ap-northeast-2"
# Load AWS account ID from gitignored .env.development (real ID is not committed).
# Script must run from apps/nasun-website/cdk/ (the deploy.sh / pnpm wrappers cd there).
ENV_FILE="$(dirname "$0")/../.env.development"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ ERROR: $ENV_FILE not found. Create it with AWS_ACCOUNT_ID=<12-digit-id>." >&2
  exit 1
fi
AWS_ACCOUNT_ID=$(grep "^AWS_ACCOUNT_ID=" "$ENV_FILE" | cut -d'=' -f2)
if [[ -z "$AWS_ACCOUNT_ID" || ! "$AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "❌ ERROR: AWS_ACCOUNT_ID in $ENV_FILE is missing or not a valid 12-digit ID." >&2
  exit 1
fi
TARGET_DATE="${1:-$(date +%Y-%m-%d)}"
SECRET_NAME="nasun-twitter-tokens-dev"
STATE_MACHINE_NAME="nasun-leaderboard-pipeline"
STATE_MACHINE_ARN="arn:aws:states:${REGION}:${AWS_ACCOUNT_ID}:stateMachine:${STATE_MACHINE_NAME}"
TARGET_USERNAME="Nasun_io"
TARGET_USER_ID="1725466995565752320"
REPORT_FILE="/tmp/pipeline-report-${TARGET_DATE}.txt"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────
# 유틸리티 함수
# ─────────────────────────────────────────────────────────────────
print_header() {
    local msg="$1"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "  $msg"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    local num="$1"
    local title="$2"
    echo ""
    echo -e "${BLUE}[$num] $title${NC}"
    echo "────────────────────────────────────────"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "   $1"
}

# tee를 사용하여 콘솔과 파일에 동시 출력
log_and_print() {
    echo -e "$1" | tee -a "$REPORT_FILE"
}

# ─────────────────────────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────────────────────────

# 리포트 파일 초기화
> "$REPORT_FILE"

{
print_header "📊 리더보드 파이프라인 검증 리포트"
echo "  📅 검증 대상 날짜: $TARGET_DATE"
echo "  🎯 타겟 계정: @$TARGET_USERNAME"
echo "  🕐 검증 시간: $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')"

# ═══════════════════════════════════════════════════════════════
# Section 1: OAuth 2.0 토큰 상태
# ═══════════════════════════════════════════════════════════════
print_section "1/6" "OAuth 2.0 토큰 상태"

# Secret에서 토큰 정보 가져오기
TOKEN_INFO=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query 'SecretString' \
    --output text 2>/dev/null)

if [ -z "$TOKEN_INFO" ]; then
    print_error "Secret을 가져올 수 없습니다: $SECRET_NAME"
else
    EXPIRES_AT=$(echo "$TOKEN_INFO" | jq -r '.oauth2.expiresAt // 0')
    LAST_REFRESHED=$(echo "$TOKEN_INFO" | jq -r '.oauth2.lastRefreshed // "N/A"')
    SCOPE=$(echo "$TOKEN_INFO" | jq -r '.oauth2.scope // "N/A"')

    CURRENT_TIME_MS=$(date +%s%3N)

    if [ "$EXPIRES_AT" -gt "$CURRENT_TIME_MS" ]; then
        REMAINING_MINS=$(( (EXPIRES_AT - CURRENT_TIME_MS) / 60000 ))
        print_success "토큰 상태: VALID"
        print_info "만료까지: ${REMAINING_MINS}분"
    else
        EXPIRED_MINS=$(( (CURRENT_TIME_MS - EXPIRES_AT) / 60000 ))
        print_error "토큰 상태: EXPIRED (${EXPIRED_MINS}분 전 만료)"
    fi
    print_info "마지막 갱신: $LAST_REFRESHED"
    print_info "Scope: $SCOPE"

    # Bearer Token 추출 (Public 카운트 비교용)
    BEARER_TOKEN=$(echo "$TOKEN_INFO" | jq -r '.bearerToken // empty')
fi

# ═══════════════════════════════════════════════════════════════
# Section 2: 파이프라인 실행 상태
# ═══════════════════════════════════════════════════════════════
print_section "2/6" "파이프라인 실행 상태"

# 최근 실행 조회 (해당 날짜)
EXECUTIONS=$(aws stepfunctions list-executions \
    --state-machine-arn "$STATE_MACHINE_ARN" \
    --region "$REGION" \
    --max-results 10 \
    --output json 2>/dev/null)

# 해당 날짜의 실행 찾기
EXECUTION_ARN=""
EXECUTION_STATUS=""
START_TIME=""
STOP_TIME=""

while read -r line; do
    EXEC_ARN=$(echo "$line" | jq -r '.executionArn')
    EXEC_START=$(echo "$line" | jq -r '.startDate')
    EXEC_DATE=$(echo "$EXEC_START" | cut -d'T' -f1)

    if [ "$EXEC_DATE" == "$TARGET_DATE" ]; then
        EXECUTION_ARN="$EXEC_ARN"
        START_TIME="$EXEC_START"
        EXECUTION_STATUS=$(echo "$line" | jq -r '.status')
        STOP_TIME=$(echo "$line" | jq -r '.stopDate // "N/A"')
        break
    fi
done < <(echo "$EXECUTIONS" | jq -c '.executions[]')

if [ -z "$EXECUTION_ARN" ]; then
    print_warning "해당 날짜($TARGET_DATE)의 파이프라인 실행을 찾을 수 없습니다"
else
    EXEC_NAME=$(basename "$EXECUTION_ARN")

    if [ "$EXECUTION_STATUS" == "SUCCEEDED" ]; then
        print_success "상태: $EXECUTION_STATUS"
    elif [ "$EXECUTION_STATUS" == "RUNNING" ]; then
        print_warning "상태: $EXECUTION_STATUS (실행 중)"
    else
        print_error "상태: $EXECUTION_STATUS"
    fi

    print_info "실행 ID: $EXEC_NAME"

    # 시간 변환 (KST)
    START_KST=$(TZ=Asia/Seoul date -d "$START_TIME" '+%H:%M:%S KST' 2>/dev/null || echo "$START_TIME")
    print_info "시작: $START_KST"

    if [ "$STOP_TIME" != "N/A" ] && [ "$STOP_TIME" != "null" ]; then
        STOP_KST=$(TZ=Asia/Seoul date -d "$STOP_TIME" '+%H:%M:%S KST' 2>/dev/null || echo "$STOP_TIME")
        print_info "종료: $STOP_KST"

        # 소요 시간 계산
        START_SEC=$(date -d "$START_TIME" +%s 2>/dev/null || echo 0)
        STOP_SEC=$(date -d "$STOP_TIME" +%s 2>/dev/null || echo 0)
        if [ "$START_SEC" -gt 0 ] && [ "$STOP_SEC" -gt 0 ]; then
            DURATION=$((STOP_SEC - START_SEC))
            DURATION_MIN=$((DURATION / 60))
            DURATION_SEC=$((DURATION % 60))
            print_info "소요: ${DURATION_MIN}분 ${DURATION_SEC}초"
        fi
    fi

    # 실행 시간 범위 저장 (로그 조회용)
    if [ -n "$START_TIME" ]; then
        EXEC_START_MS=$(date -d "$START_TIME" +%s%3N 2>/dev/null || echo 0)
        if [ "$STOP_TIME" != "N/A" ] && [ "$STOP_TIME" != "null" ]; then
            EXEC_END_MS=$(date -d "$STOP_TIME" +%s%3N 2>/dev/null || echo $(date +%s%3N))
        else
            EXEC_END_MS=$(date +%s%3N)
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
# Section 3: Active Engagements (멘션)
# ═══════════════════════════════════════════════════════════════
print_section "3/6" "Active Engagements (멘션)"

if [ -n "$EXEC_START_MS" ] && [ -n "$EXEC_END_MS" ]; then
    # collect-mentions 로그에서 멘션 수 조회
    MENTIONS_LOG=$(aws logs filter-log-events \
        --log-group-name "/aws/lambda/nasun-collect-mentions" \
        --start-time "$EXEC_START_MS" \
        --end-time "$EXEC_END_MS" \
        --filter-pattern "mentionCount" \
        --region "$REGION" \
        --query 'events[*].message' \
        --output text 2>/dev/null | head -5)

    if [ -n "$MENTIONS_LOG" ]; then
        # 멘션 수 추출
        MENTION_COUNT=$(echo "$MENTIONS_LOG" | grep -oP '"mentionCount":\s*\K\d+' | head -1 || echo "0")
        API_CALLS=$(echo "$MENTIONS_LOG" | grep -oP '"apiCallCount":\s*\K\d+' | head -1 || echo "0")

        echo -e "📨 수집된 멘션: ${GREEN}${MENTION_COUNT:-0}개${NC}"
        print_info "API 호출: ${API_CALLS:-0}회"

        # 날짜 범위 추출
        DATE_RANGE=$(echo "$MENTIONS_LOG" | grep -oP '"dateRange":\s*"\K[^"]+' | head -1 || echo "N/A")
        print_info "날짜 범위: $DATE_RANGE"
    else
        print_warning "멘션 수집 로그를 찾을 수 없습니다"
    fi
else
    print_warning "파이프라인 실행 시간을 확인할 수 없습니다"
fi

# ═══════════════════════════════════════════════════════════════
# Section 4: Passive Engagements 타겟 포스트
# ═══════════════════════════════════════════════════════════════
print_section "4/6" "Passive Engagements 타겟 포스트"

TARGET_TWEET_IDS=()

if [ -n "$EXEC_START_MS" ] && [ -n "$EXEC_END_MS" ]; then
    # get-target-tweets 로그에서 트윗 목록 조회
    TARGET_TWEETS_LOG=$(aws logs filter-log-events \
        --log-group-name "/aws/lambda/nasun-get-target-tweets" \
        --start-time "$EXEC_START_MS" \
        --end-time "$EXEC_END_MS" \
        --filter-pattern "Passive" \
        --region "$REGION" \
        --query 'events[*].message' \
        --output text 2>/dev/null | head -20)

    if [ -n "$TARGET_TWEETS_LOG" ]; then
        # 트윗 수 추출
        PASSIVE_COUNT=$(echo "$TARGET_TWEETS_LOG" | grep -oP 'Passive 트윗:\s*\K\d+' | head -1 || echo "0")
        echo -e "📋 수집 대상 트윗: ${GREEN}${PASSIVE_COUNT:-0}개${NC}"

        # 날짜 범위 추출
        PASSIVE_RANGE=$(echo "$TARGET_TWEETS_LOG" | grep -oP '범위:\s*\K[0-9-]+ ~ [0-9-]+' | head -1 || echo "N/A")
        print_info "날짜 범위: $PASSIVE_RANGE (3일 전)"

        # Tweet ID 목록 조회
        TWEET_IDS_LOG=$(aws logs filter-log-events \
            --log-group-name "/aws/lambda/nasun-get-target-tweets" \
            --start-time "$EXEC_START_MS" \
            --end-time "$EXEC_END_MS" \
            --filter-pattern "Tweet ID" \
            --region "$REGION" \
            --query 'events[*].message' \
            --output text 2>/dev/null | head -30)

        if [ -n "$TWEET_IDS_LOG" ]; then
            echo ""
            echo "   Tweet ID            | isReply"
            echo "   ────────────────────┼────────"

            # Tweet ID 추출 및 표시
            while IFS= read -r line; do
                TWEET_ID=$(echo "$line" | grep -oP 'Tweet ID:\s*\K\d+' || continue)
                IS_REPLY=$(echo "$line" | grep -oP 'isReply:\s*\K(true|false)' || echo "N/A")
                if [ -n "$TWEET_ID" ]; then
                    printf "   %-19s | %s\n" "$TWEET_ID" "$IS_REPLY"
                    TARGET_TWEET_IDS+=("$TWEET_ID")
                fi
            done <<< "$TWEET_IDS_LOG"
        fi
    else
        print_warning "타겟 트윗 로그를 찾을 수 없습니다"
    fi
else
    print_warning "파이프라인 실행 시간을 확인할 수 없습니다"
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: Engagements 수집 결과 (Step Functions 출력에서 직접 조회)
# ═══════════════════════════════════════════════════════════════
print_section "5/6" "Engagements 수집 결과"

TOTAL_LIKES=0
TOTAL_RETWEETS=0
TOTAL_QUOTES=0
TOTAL_REPLIES=0
TOTAL_MENTIONS=0

if [ -n "$EXECUTION_ARN" ]; then
    # Step Functions 실행 출력에서 직접 engagement 데이터 조회
    EXEC_OUTPUT=$(aws stepfunctions describe-execution \
        --execution-arn "$EXECUTION_ARN" \
        --region "$REGION" \
        --query 'output' \
        --output text 2>/dev/null)

    if [ -n "$EXEC_OUTPUT" ] && [ "$EXEC_OUTPUT" != "None" ]; then
        # engagement_type별 카운트
        TOTAL_LIKES=$(echo "$EXEC_OUTPUT" | jq '[.collectedEngagements[] | select(.engagement_type == "like")] | length' 2>/dev/null || echo "0")
        TOTAL_RETWEETS=$(echo "$EXEC_OUTPUT" | jq '[.collectedEngagements[] | select(.engagement_type == "repost")] | length' 2>/dev/null || echo "0")
        TOTAL_QUOTES=$(echo "$EXEC_OUTPUT" | jq '[.collectedEngagements[] | select(.engagement_type == "quote")] | length' 2>/dev/null || echo "0")
        TOTAL_REPLIES=$(echo "$EXEC_OUTPUT" | jq '[.collectedEngagements[] | select(.engagement_type == "reply")] | length' 2>/dev/null || echo "0")
        TOTAL_MENTIONS=$(echo "$EXEC_OUTPUT" | jq '[.collectedEngagements[] | select(.engagement_type == "mention")] | length' 2>/dev/null || echo "0")

        # 전체 engagement 수
        TOTAL_ALL=$(echo "$EXEC_OUTPUT" | jq '.collectedEngagements | length' 2>/dev/null || echo "0")

        print_success "Step Functions 출력에서 데이터 조회 성공"
    else
        print_warning "Step Functions 출력이 없습니다"
    fi

    echo ""
    echo "   타입      | 수집 수"
    echo "   ──────────┼─────────"
    printf "   Likes     | %7d\n" "${TOTAL_LIKES:-0}"
    printf "   Retweets  | %7d\n" "${TOTAL_RETWEETS:-0}"
    printf "   Quotes    | %7d\n" "${TOTAL_QUOTES:-0}"
    printf "   Replies   | %7d\n" "${TOTAL_REPLIES:-0}"
    printf "   Mentions  | %7d\n" "${TOTAL_MENTIONS:-0}"
    echo "   ──────────┼─────────"
    printf "   합계      | %7d\n" "${TOTAL_ALL:-0}"

    # 상위 참여자 표시
    if [ -n "$EXEC_OUTPUT" ] && [ "$EXEC_OUTPUT" != "None" ]; then
        echo ""
        echo "   📊 상위 참여자 (engagement 수 기준):"
        echo "$EXEC_OUTPUT" | jq -r '
            [.collectedEngagements[] | {username: .engaging_username, type: .engagement_type}]
            | group_by(.username)
            | map({username: .[0].username, count: length})
            | sort_by(-.count)
            | .[:5][]
            | "      @\(.username): \(.count)개"
        ' 2>/dev/null || echo "      (데이터 없음)"
    fi
else
    print_warning "파이프라인 실행을 찾을 수 없습니다"
fi

# ═══════════════════════════════════════════════════════════════
# Section 6: Public 카운트 비교 (배치 API 사용)
# ═══════════════════════════════════════════════════════════════
print_section "6/6" "Public 카운트 비교"

if [ -z "$BEARER_TOKEN" ]; then
    print_warning "Bearer Token이 없어 Public 카운트 비교를 건너뜁니다"
elif [ ${#TARGET_TWEET_IDS[@]} -eq 0 ]; then
    print_warning "타겟 트윗 ID가 없어 Public 카운트 비교를 건너뜁니다"
else
    echo ""
    echo "   Tweet ID            | 공개 Likes | 공개 Retweets | 공개 Quotes"
    echo "   ────────────────────┼────────────┼───────────────┼─────────────"

    # 배치 API 사용 (최대 100개 트윗을 1회 요청으로 조회)
    IDS_JOINED=$(IFS=,; echo "${TARGET_TWEET_IDS[*]}")

    BATCH_RESPONSE=$(curl -s "https://api.x.com/2/tweets?ids=${IDS_JOINED}&tweet.fields=public_metrics" \
        -H "Authorization: Bearer ${BEARER_TOKEN}" 2>/dev/null)

    if echo "$BATCH_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
        # 성공: 각 트윗별로 결과 표시
        for TWEET_ID in "${TARGET_TWEET_IDS[@]}"; do
            TWEET_DATA=$(echo "$BATCH_RESPONSE" | jq -r --arg id "$TWEET_ID" '.data[] | select(.id == $id)')

            if [ -n "$TWEET_DATA" ]; then
                PUBLIC_LIKES=$(echo "$TWEET_DATA" | jq -r '.public_metrics.like_count // 0')
                PUBLIC_RETWEETS=$(echo "$TWEET_DATA" | jq -r '.public_metrics.retweet_count // 0')
                PUBLIC_QUOTES=$(echo "$TWEET_DATA" | jq -r '.public_metrics.quote_count // 0')

                printf "   %-19s | %10d | %13d | %11d\n" "$TWEET_ID" "$PUBLIC_LIKES" "$PUBLIC_RETWEETS" "$PUBLIC_QUOTES"
            else
                # 해당 트윗이 응답에 없는 경우 (삭제됨 등)
                printf "   %-19s | ⚠️  트윗을 찾을 수 없음\n" "$TWEET_ID"
            fi
        done

        echo ""
        print_success "배치 API로 ${#TARGET_TWEET_IDS[@]}개 트윗 조회 완료 (1회 API 호출)"
    else
        # 에러 발생
        ERROR_MSG=$(echo "$BATCH_RESPONSE" | jq -r '.errors[0].message // .detail // "Unknown error"' 2>/dev/null)
        print_error "API 호출 실패: $ERROR_MSG"

        # Rate limit 에러인 경우 안내
        if echo "$ERROR_MSG" | grep -qi "rate\|too many"; then
            echo ""
            print_info "Rate Limit 안내:"
            print_info "  - X API Basic Plan: 300 requests / 15 min"
            print_info "  - 15분 후 다시 시도하세요"

            # Rate Limit 헤더 확인 (가능한 경우)
            RESET_TIME=$(echo "$BATCH_RESPONSE" | jq -r '.title // empty' 2>/dev/null)
            if [ -n "$RESET_TIME" ]; then
                print_info "  - 메시지: $RESET_TIME"
            fi
        fi
    fi

    echo ""
    print_info "※ 수집된 데이터는 3일 전 시점의 스냅샷입니다"
    print_info "※ 현재 Public 카운트와 차이가 있을 수 있습니다"
fi

# ═══════════════════════════════════════════════════════════════
# 최종 요약
# ═══════════════════════════════════════════════════════════════
echo ""
print_header "검증 완료"
echo "  📁 리포트 저장: $REPORT_FILE"
echo "  🕐 완료 시간: $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S KST')"

# 전체 상태 요약
echo ""
if [ "$EXECUTION_STATUS" == "SUCCEEDED" ]; then
    print_success "파이프라인 실행 성공"
elif [ "$EXECUTION_STATUS" == "RUNNING" ]; then
    print_warning "파이프라인 실행 중"
else
    print_error "파이프라인 실행 실패 또는 없음"
fi

} 2>&1 | tee "$REPORT_FILE"

echo ""
echo -e "${GREEN}리포트가 저장되었습니다: $REPORT_FILE${NC}"
