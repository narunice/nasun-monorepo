#!/bin/bash
# ==============================================================================
# X/Twitter Token Health Check Script
# ==============================================================================
# Checks the health of all X/Twitter tokens across dev and prod environments.
# Replaces the token-related checks from daily-health-check.sh (DEPRECATED).
#
# Usage:
#   ./scripts/check-x-tokens.sh           # Check both environments (default)
#   ./scripts/check-x-tokens.sh --dev     # Check dev only
#   ./scripts/check-x-tokens.sh --prod    # Check prod only
#   ./scripts/check-x-tokens.sh --help    # Show help
#
# Prerequisites:
#   - AWS CLI with configured profiles (default + nasun-prod)
#   - jq installed
#   - npx tsx available (for verify-oauth-token.ts)
#   - CDK node_modules installed (apps/nasun-website/cdk/)
# ==============================================================================

set -euo pipefail

# Load shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# --- Configuration ---
CDK_DIR="$MONOREPO_ROOT/apps/nasun-website/cdk"

# Lambda
TOKEN_LAMBDA_NAME="nasun-follower-token-refresh"
TOKEN_LOG_GROUP="/aws/lambda/nasun-follower-token-refresh"

# Secrets Manager
DEV_SECRET_NAME="nasun-twitter-tokens"
PROD_SECRET_NAME="nasun-twitter-tokens-prod"

# CloudWatch Alarms (FollowerStack managed)
DEV_ALARM_NAMES=("nasun-follower-token-refresh-error" "nasun-follower-token-not-refreshed-3h" "nasun-follower-token-refresh-dlq" "nasun-follower-invalid-refresh-token" "nasun-follower-secret-update-failure")
PROD_ALARM_NAMES=("nasun-follower-token-refresh-error" "nasun-follower-token-not-refreshed-3h" "nasun-follower-token-refresh-dlq" "nasun-follower-invalid-refresh-token" "nasun-follower-secret-update-failure")

# AWS Profiles
DEV_PROFILE="default"
PROD_PROFILE="nasun-prod"

# Bearer token env files
DEV_ENV_FILE="$CDK_DIR/.env.development"
PROD_ENV_FILE="$CDK_DIR/.env.production"

# EventBridge rule name (must match CDK follower-stack.ts)
EVENTBRIDGE_RULE_NAME="nasun-follower-token-refresh-schedule"

# State tracking
ISSUES_FOUND=0
SKIP_OAUTH_VERIFY=false

# Per-environment schedule state (populated in Step 2)
DEV_SCHEDULE_ENABLED="unknown"
PROD_SCHEDULE_ENABLED="unknown"

# --- Option Parsing ---
CHECK_DEV=true
CHECK_PROD=true

for arg in "$@"; do
  case $arg in
    --dev)
      CHECK_DEV=true
      CHECK_PROD=false
      shift
      ;;
    --prod)
      CHECK_DEV=false
      CHECK_PROD=true
      shift
      ;;
    --help|-h)
      echo "Usage: ./scripts/check-x-tokens.sh [options]"
      echo ""
      echo "Options:"
      echo "  --dev      Check dev environment only"
      echo "  --prod     Check prod environment only"
      echo "  (none)     Check both environments (default)"
      echo "  --help     Show this help"
      echo ""
      echo "Checks:"
      echo "  1. OAuth 2.0 token validity (via verify-oauth-token.ts)"
      echo "  2. Bearer token validity (via X API call)"
      echo "  3. Token refresh Lambda status"
      echo "  4. CloudWatch alarm states"
      exit 0
      ;;
  esac
done

# --- Banner ---
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  X/Twitter Token Health Check                             ║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Target: ${YELLOW}@Nasun_io${CYAN} (1725466995565752320)                   ║${NC}"
if [ "$CHECK_DEV" = true ] && [ "$CHECK_PROD" = true ]; then
echo -e "${CYAN}║  Scope:  ${YELLOW}Development + Production${NC}"
elif [ "$CHECK_DEV" = true ]; then
echo -e "${CYAN}║  Scope:  ${YELLOW}Development${NC}"
else
echo -e "${CYAN}║  Scope:  ${YELLOW}Production${NC}"
fi
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# ==============================================================================
# Step 1: Prerequisites
# ==============================================================================
log_step 1 6 "Prerequisites"

# Check aws CLI
if ! command -v aws &> /dev/null; then
  log_error "aws CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
fi
log_success "aws CLI found"

# Check jq
if ! command -v jq &> /dev/null; then
  log_error "jq not found. Install: sudo apt install jq"
fi
log_success "jq found"

# Check CDK directory
if [ ! -d "$CDK_DIR" ]; then
  log_error "CDK directory not found: $CDK_DIR"
fi
log_success "CDK directory found"

# Check CDK node_modules (needed for verify-oauth-token.ts)
if [ ! -d "$CDK_DIR/node_modules" ]; then
  log_warning "CDK node_modules not found. OAuth 2.0 verification will be skipped."
  log_warning "Run: cd $CDK_DIR && pnpm install"
  SKIP_OAUTH_VERIFY=true
else
  log_success "CDK node_modules found"
fi

# ==============================================================================
# Check Functions
# ==============================================================================

# --- EventBridge Schedule Check ---
# Returns "ENABLED", "DISABLED", or "NOT_FOUND"
check_eventbridge_schedule() {
  local profile=$1
  local -a profile_args=()
  [ "$profile" != "default" ] && profile_args=(--profile "$profile")

  set +e
  local rule_state
  rule_state=$(aws events describe-rule \
    --name "$EVENTBRIDGE_RULE_NAME" \
    "${profile_args[@]}" \
    --region ap-northeast-2 \
    --query "State" --output text 2>/dev/null)
  local exit_code=$?
  set -e

  if [ $exit_code -ne 0 ] || [ -z "$rule_state" ] || [ "$rule_state" = "None" ]; then
    echo "NOT_FOUND"
  else
    echo "$rule_state"
  fi
}

# --- OAuth 2.0 Token Check ---
check_oauth2_token() {
  local env_flag=$1   # "dev" or "prod"
  local profile=$2

  if [ "$SKIP_OAUTH_VERIFY" = true ]; then
    log_warning "[$env_flag] OAuth 2.0 verification skipped (CDK node_modules missing)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    return
  fi

  local -a cmd=(npx tsx scripts/verify-oauth-token.ts "--env=$env_flag")

  set +e
  if [ "$profile" != "default" ]; then
    (cd "$CDK_DIR" && AWS_PROFILE="$profile" "${cmd[@]}" 2>&1)
  else
    (cd "$CDK_DIR" && "${cmd[@]}" 2>&1)
  fi
  local exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    log_warning "[$env_flag] OAuth 2.0 token has issues (exit code: $exit_code)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    log_success "[$env_flag] OAuth 2.0 token is valid"
  fi
}

# --- Bearer Token Check ---
check_bearer_token() {
  local env_name=$1
  local env_file=$2

  if [ ! -f "$env_file" ]; then
    log_warning "[$env_name] .env file not found: $env_file"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    return
  fi

  local bearer_token
  bearer_token=$(grep "^TWITTER_BEARER_TOKEN=" "$env_file" | cut -d'=' -f2- | tr -d '[:space:]')

  if [ -z "$bearer_token" ]; then
    log_warning "[$env_name] TWITTER_BEARER_TOKEN not set in .env file"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    return
  fi

  # Lightweight check: user lookup by username (App-Only auth, 300 req/15min)
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer $bearer_token" \
    "https://api.twitter.com/2/users/by/username/Nasun_io" 2>/dev/null || echo "000")

  case "$http_code" in
    200)
      log_success "[$env_name] Bearer token is valid (HTTP $http_code)"
      ;;
    401)
      log_warning "[$env_name] Bearer token expired or invalid (HTTP 401)"
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
      ;;
    403)
      log_warning "[$env_name] Bearer token insufficient permissions (HTTP 403)"
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
      ;;
    429)
      log_warning "[$env_name] X API rate limit exceeded (HTTP 429) — cannot verify, skipping"
      ;;
    000)
      log_warning "[$env_name] X API connection failed (timeout)"
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
      ;;
    *)
      log_warning "[$env_name] Bearer token check failed (HTTP $http_code)"
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
      ;;
  esac
}

# --- Token Refresh Lambda Check ---
check_refresh_lambda() {
  local env_name=$1
  local profile=$2
  local -a profile_args=()
  [ "$profile" != "default" ] && profile_args=(--profile "$profile")

  # Lambda existence check
  set +e
  local lambda_exists
  lambda_exists=$(aws lambda get-function-configuration \
    --function-name "$TOKEN_LAMBDA_NAME" \
    "${profile_args[@]}" \
    --region ap-northeast-2 \
    --query "FunctionName" --output text 2>/dev/null)
  local lambda_exit=$?
  set -e

  if [ $lambda_exit -ne 0 ] || [ -z "$lambda_exists" ] || [ "$lambda_exists" = "None" ]; then
    log_warning "[$env_name] Lambda '$TOKEN_LAMBDA_NAME' not found"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    return
  fi
  log_success "[$env_name] Lambda '$TOKEN_LAMBDA_NAME' exists"

  # Recent invocations (last 3 hours — should have at least 2 since it runs every 70 min)
  local three_hours_ago
  three_hours_ago=$(date -u -d "3 hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-3H +"%Y-%m-%dT%H:%M:%SZ")
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  set +e
  local invocation_sum
  invocation_sum=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Invocations \
    --dimensions Name=FunctionName,Value="$TOKEN_LAMBDA_NAME" \
    --start-time "$three_hours_ago" \
    --end-time "$now" \
    --period 10800 \
    --statistics Sum \
    "${profile_args[@]}" \
    --region ap-northeast-2 \
    --query 'Datapoints[0].Sum' --output text 2>/dev/null || echo "None")
  set -e

  if [ "$invocation_sum" = "None" ] || [ "$invocation_sum" = "0" ] || [ "$invocation_sum" = "0.0" ]; then
    log_warning "[$env_name] Lambda not invoked in the last 3 hours (EventBridge issue?)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    local count
    count=$(printf "%.0f" "$invocation_sum" 2>/dev/null || echo "$invocation_sum")
    log_success "[$env_name] Lambda invoked ${count} time(s) in last 3 hours"
  fi

  # Recent errors in CloudWatch Logs (last 24 hours)
  local start_time_24h
  start_time_24h=$(date -d "24 hours ago" +%s000 2>/dev/null || echo "0")

  if [ "$start_time_24h" = "0" ]; then
    start_time_24h=$(( $(date +%s) * 1000 - 86400000 ))
  fi

  set +e
  local log_errors
  log_errors=$(aws logs filter-log-events \
    --log-group-name "$TOKEN_LOG_GROUP" \
    --start-time "$start_time_24h" \
    --filter-pattern '?"ERROR" ?"Token refresh failed" ?"invalid_request" ?"invalid_grant"' \
    "${profile_args[@]}" \
    --region ap-northeast-2 \
    --query "events" --output json 2>/dev/null || echo "[]")
  set -e

  local error_count
  error_count=$(echo "$log_errors" | jq 'length' 2>/dev/null || echo "0")

  if [ "$error_count" -gt 0 ]; then
    log_warning "[$env_name] ${error_count} token refresh error(s) in the last 24 hours"
    echo "  Recent errors:"
    echo "$log_errors" | jq -r '.[-3:][].message' 2>/dev/null | head -20
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    log_success "[$env_name] No token refresh errors in the last 24 hours"
  fi
}

# --- CloudWatch Alarms Check ---
check_cloudwatch_alarms() {
  local env_name=$1
  local profile=$2
  shift 2
  local alarms=("$@")
  local -a profile_args=()
  [ "$profile" != "default" ] && profile_args=(--profile "$profile")

  if [ ${#alarms[@]} -eq 0 ]; then
    log_info "[$env_name] No alarms to check"
    return
  fi

  set +e
  local alarm_states
  alarm_states=$(aws cloudwatch describe-alarms \
    --alarm-names "${alarms[@]}" \
    "${profile_args[@]}" \
    --region ap-northeast-2 \
    --query "MetricAlarms[].{Name:AlarmName, State:StateValue}" \
    --output json 2>/dev/null || echo "[]")
  set -e

  local alarm_count
  alarm_count=$(echo "$alarm_states" | jq '[.[] | select(.State == "ALARM")] | length' 2>/dev/null || echo "0")

  if [ "$alarm_count" -gt 0 ]; then
    log_warning "[$env_name] ${alarm_count} alarm(s) in ALARM state:"
    echo "$alarm_states" | jq -r '.[] | select(.State == "ALARM") | "  - \(.Name): \(.State)"' 2>/dev/null
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    local total
    total=$(echo "$alarm_states" | jq 'length' 2>/dev/null || echo "0")
    if [ "$total" -gt 0 ]; then
      log_success "[$env_name] All ${total} alarm(s) OK"
    else
      log_info "[$env_name] No matching alarms found in CloudWatch"
    fi
  fi
}

# ==============================================================================
# Step 2: EventBridge Schedule Status
# ==============================================================================
log_step 2 6 "EventBridge Schedule Status"

if [ "$CHECK_DEV" = true ]; then
  DEV_SCHEDULE_ENABLED=$(check_eventbridge_schedule "$DEV_PROFILE")
  if [ "$DEV_SCHEDULE_ENABLED" = "ENABLED" ]; then
    log_success "[dev] Token refresh schedule is ENABLED"
  elif [ "$DEV_SCHEDULE_ENABLED" = "DISABLED" ]; then
    log_info "[dev] Token refresh schedule is DISABLED (by design: dev/prod share OAuth app)"
  else
    log_warning "[dev] EventBridge rule '$EVENTBRIDGE_RULE_NAME' not found"
  fi
fi

if [ "$CHECK_PROD" = true ]; then
  PROD_SCHEDULE_ENABLED=$(check_eventbridge_schedule "$PROD_PROFILE")
  if [ "$PROD_SCHEDULE_ENABLED" = "ENABLED" ]; then
    log_success "[prod] Token refresh schedule is ENABLED"
  elif [ "$PROD_SCHEDULE_ENABLED" = "DISABLED" ]; then
    log_warning "[prod] Token refresh schedule is DISABLED (unexpected for production!)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    log_warning "[prod] EventBridge rule '$EVENTBRIDGE_RULE_NAME' not found"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi

# ==============================================================================
# Step 3: OAuth 2.0 Token Verification
# ==============================================================================
log_step 3 6 "OAuth 2.0 Token Verification"

if [ "$CHECK_DEV" = true ]; then
  echo -e "\n${CYAN}-- Development --${NC}"
  if [ "$DEV_SCHEDULE_ENABLED" = "DISABLED" ]; then
    log_info "[dev] OAuth 2.0 check skipped (schedule disabled, token managed by prod)"
  else
    check_oauth2_token "dev" "$DEV_PROFILE"
  fi
fi

if [ "$CHECK_PROD" = true ]; then
  echo -e "\n${CYAN}-- Production --${NC}"
  check_oauth2_token "prod" "$PROD_PROFILE"
fi

# ==============================================================================
# Step 4: Bearer Token Verification
# ==============================================================================
log_step 4 6 "Bearer Token Verification"

if [ "$CHECK_DEV" = true ]; then
  check_bearer_token "dev" "$DEV_ENV_FILE"
fi

if [ "$CHECK_PROD" = true ]; then
  check_bearer_token "prod" "$PROD_ENV_FILE"
fi

# ==============================================================================
# Step 5: Token Refresh Lambda Status
# ==============================================================================
log_step 5 6 "Token Refresh Lambda Status"

if [ "$CHECK_DEV" = true ]; then
  echo -e "\n${CYAN}-- Development --${NC}"
  if [ "$DEV_SCHEDULE_ENABLED" = "DISABLED" ]; then
    log_info "[dev] Lambda invocation check skipped (schedule disabled)"
  else
    check_refresh_lambda "dev" "$DEV_PROFILE"
  fi
fi

if [ "$CHECK_PROD" = true ]; then
  echo -e "\n${CYAN}-- Production --${NC}"
  check_refresh_lambda "prod" "$PROD_PROFILE"
fi

# ==============================================================================
# Step 6: CloudWatch Alarms
# ==============================================================================
log_step 6 6 "CloudWatch Alarms"

if [ "$CHECK_DEV" = true ]; then
  if [ "$DEV_SCHEDULE_ENABLED" = "DISABLED" ]; then
    # Filter out schedule-dependent alarms when schedule is intentionally disabled
    DEV_ALARMS_FILTERED=()
    DEV_ALARMS_SKIPPED=()
    for alarm in "${DEV_ALARM_NAMES[@]}"; do
      case "$alarm" in
        *not-refreshed*|*token-refresh-error*|*token-refresh-dlq*|*invalid-refresh-token*|*secret-update-failure*)
          DEV_ALARMS_SKIPPED+=("$alarm")
          ;;
        *)
          DEV_ALARMS_FILTERED+=("$alarm")
          ;;
      esac
    done
    if [ ${#DEV_ALARMS_SKIPPED[@]} -gt 0 ]; then
      log_info "[dev] Skipping ${#DEV_ALARMS_SKIPPED[@]} alarm(s) (schedule disabled)"
    fi
    if [ ${#DEV_ALARMS_FILTERED[@]} -gt 0 ]; then
      check_cloudwatch_alarms "dev" "$DEV_PROFILE" "${DEV_ALARMS_FILTERED[@]}"
    fi
  else
    check_cloudwatch_alarms "dev" "$DEV_PROFILE" "${DEV_ALARM_NAMES[@]}"
  fi
fi

if [ "$CHECK_PROD" = true ]; then
  check_cloudwatch_alarms "prod" "$PROD_PROFILE" "${PROD_ALARM_NAMES[@]}"
fi

# ==============================================================================
# Summary
# ==============================================================================
echo ""
if [ "$ISSUES_FOUND" -gt 0 ]; then
  echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  X/Twitter token check complete: ${ISSUES_FOUND} issue(s) found            ║${NC}"
  echo -e "${RED}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${RED}║  Elapsed: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
  echo -e "${RED}║                                                            ║${NC}"
  echo -e "${RED}║  Fix: ${CYAN}cd apps/nasun-website/cdk${NC}"
  echo -e "${RED}║       ${CYAN}npx tsx scripts/verify-oauth-token.ts --env=dev${NC}"
  echo -e "${RED}║       ${CYAN}AWS_PROFILE=nasun-prod npx tsx scripts/verify-oauth-token.ts --env=prod${NC}"
  echo -e "${RED}║  Docs: ${CYAN}apps/nasun-website/cdk/docs/OAUTH2_TOKEN_MANAGEMENT.md${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 1
else
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  X/Twitter token check complete: all tokens healthy       ║${NC}"
  echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  Elapsed: ${CYAN}$(get_elapsed_time $START_TIME)${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  exit 0
fi
