#!/usr/bin/env bash
#
# nasun-ai-runtime dead-man switch (PR1.A).
#
# Runs hourly via prod EC2 crontab. Pages out to Telegram if the runtime
# stdout log has not been touched within DEAD_MAN_MAX_AGE seconds (default
# 12h). Designed as the long-tail safety net for log-watcher.sh — if the
# pm2 process is wedged in a state that doesn't emit any error pattern,
# log-watcher stays quiet but the log file mtime stops advancing.
#
# Why mtime instead of api-server / DDB lookup:
#   - api-server isn't guaranteed to be running on the same EC2 as the
#     trader runtime (Plan v5 §H6 — operator confirms during deploy)
#   - DDB query needs an IAM role + AWS CLI on the box; mtime needs nothing
#
# A real heartbeat is recorded by the runtime each cycle (~30 min), so
# 12h with no log line means the runtime is dead or wedged.
#
# Environment (sourced from ~/.nasun-ai-runtime.env if present):
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_ALERT_CHAT_ID
#   DEAD_MAN_MAX_AGE      seconds, default 43200 (12h)
#   DEAD_MAN_COOLDOWN     seconds between alerts, default 21600 (6h)
#
# Install (prod EC2):
#   chmod +x ~/nasun-ai-runtime/scripts/dead-man.sh
#   (crontab -l 2>/dev/null; echo "5 * * * * /home/ec2-user/nasun-ai-runtime/scripts/dead-man.sh") | crontab -

set -uo pipefail

LOG_OUT="$HOME/.pm2/logs/nasun-ai-runtime-out.log"
STATE_FILE="$HOME/.nasun-ai-runtime-dead-man.state"

MAX_AGE="${DEAD_MAN_MAX_AGE:-43200}"
COOLDOWN="${DEAD_MAN_COOLDOWN:-21600}"

[ -f "$HOME/.nasun-ai-runtime.env" ] && . "$HOME/.nasun-ai-runtime.env"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  exit 0
fi

if [ ! -f "$LOG_OUT" ]; then
  # Log file missing entirely — page out separately.
  MSG="nasun-ai-runtime dead-man: stdout log missing at ${LOG_OUT}"
else
  MTIME=$(stat -c %Y "$LOG_OUT" 2>/dev/null || stat -f %m "$LOG_OUT")
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  if [ "$AGE" -lt "$MAX_AGE" ]; then
    exit 0
  fi
  MSG="nasun-ai-runtime dead-man: no log activity for ${AGE}s (>${MAX_AGE}s). pm2 list / restart."
fi

NOW=$(date +%s)
LAST=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
if [ $((NOW - LAST)) -lt "$COOLDOWN" ]; then
  exit 0
fi

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  >/dev/null 2>&1 || true

echo "$NOW" > "$STATE_FILE"
