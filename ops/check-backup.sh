#!/usr/bin/env bash
# Daily backup health check. Verifies today's backup files exist in S3.
# On failure, publishes to SNS for alerting.
set -euo pipefail

BUCKET="nasun-leaderboard-backups-466841130170"
PROFILE="nasun-prod"
REGION="ap-northeast-2"
SNS_TOPIC="arn:aws:sns:ap-northeast-2:466841130170:nasun-monitoring-alerts"
LOG="$HOME/nasun-backups/backup.log"
DATE=$(date -u +%Y%m%d)

FAILURES=()

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] CHECK $*" >> "$LOG"; }

check_s3_object() {
  local key="$1"
  if aws s3 ls "s3://${BUCKET}/${key}" --profile "$PROFILE" --region "$REGION" &>/dev/null; then
    log "OK $key"
  else
    log "MISSING $key"
    FAILURES+=("$key")
  fi
}

# Daily DynamoDB exports
for table in ZkLoginUsers UserProfiles UserWallets leaderboard-v3-snapshots zklogin-salts; do
  check_s3_object "daily/${table}-${DATE}.json.gz"
done

# SQLite backups (may lag by 1 day on first check)
for db in chat leaderboard; do
  check_s3_object "sqlite/${db}-${DATE}.sql.gz"
done

TOTAL=7
MISSING_COUNT=${#FAILURES[@]}
OK_COUNT=$((TOTAL - MISSING_COUNT))

# Publish CloudWatch metric for dashboard/alarm use
aws cloudwatch put-metric-data \
  --namespace "NasunBackup" \
  --metric-name "DailyBackupOKCount" \
  --value "$OK_COUNT" \
  --unit Count \
  --profile "$PROFILE" \
  --region "$REGION" \
  >> "$LOG" 2>&1 || true

if [[ $MISSING_COUNT -gt 0 ]]; then
  MSG="[nasun-backup] MISSING ${MISSING_COUNT} backup(s) for ${DATE}: ${FAILURES[*]}"
  log "ALERT: $MSG"
  aws sns publish \
    --topic-arn "$SNS_TOPIC" \
    --subject "Nasun Backup Missing - ${DATE}" \
    --message "$MSG" \
    --profile "$PROFILE" \
    --region "$REGION" \
    >> "$LOG" 2>&1
  exit 1
fi

log "ALL OK for ${DATE} (${OK_COUNT}/${TOTAL})"
