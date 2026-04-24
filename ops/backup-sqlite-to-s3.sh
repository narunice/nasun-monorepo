#!/usr/bin/env bash
# SQLite online backup via SSH pipe-through to S3.
# Runs on local WSL hub; streams dump from EC2 without temp files.
set -euo pipefail

BUCKET="nasun-leaderboard-backups-466841130170"
PREFIX="sqlite"
PROFILE="nasun-prod"
REGION="ap-northeast-2"
SSH_KEY="$HOME/.ssh/.awskey/nasun-prod-key"
EC2_HOST="ec2-user@43.200.67.52"
DB_DIR="/home/ec2-user/nasun-chat-server/data"
LOG="$HOME/nasun-backups/backup.log"
DATE=$(date -u +%Y%m%d)

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

upload_db() {
  local dbname="$1"
  local s3key="s3://${BUCKET}/${PREFIX}/${dbname}-${DATE}.sql.gz"
  log "START sqlite-backup $dbname"

  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=30 "$EC2_HOST" \
    "sqlite3 ${DB_DIR}/${dbname}.db '.dump'" \
    | gzip \
    | aws s3 cp - "$s3key" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --storage-class STANDARD \
        --content-encoding gzip \
        --content-type "application/x-sql"

  log "DONE sqlite-backup $dbname -> $s3key"
}

VALID_DBS=("chat" "leaderboard")

if [[ $# -gt 0 ]]; then
  # Validate argument to prevent passing arbitrary strings to remote sqlite3
  valid=0
  for v in "${VALID_DBS[@]}"; do [[ "$1" == "$v" ]] && valid=1; done
  if [[ $valid -eq 0 ]]; then
    echo "Usage: $0 [chat|leaderboard]" >&2; exit 1
  fi
  upload_db "$1"
else
  for db in "${VALID_DBS[@]}"; do upload_db "$db"; done
fi
