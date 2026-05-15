#!/usr/bin/env bash
#
# nasun-ai-runtime log watcher (PR1.A).
#
# Runs every 5 minutes via prod EC2 crontab. Tails the most recent 500 lines
# of the pm2 stdout/stderr log, counts lines matching known failure patterns,
# and pages out to Telegram when the count crosses the threshold. 30-minute
# cooldown prevents alert storms during a sustained failure.
#
# Environment (sourced from ~/.env or pm2 ecosystem):
#   TELEGRAM_BOT_TOKEN      bot token for the alert chat
#   TELEGRAM_ALERT_CHAT_ID  chat id to page
#   LOG_WATCHER_THRESHOLD   error-line threshold (default 2)
#   LOG_WATCHER_COOLDOWN    seconds between alerts (default 1800)
#
# Install (prod EC2):
#   chmod +x ~/nasun-ai-runtime/scripts/log-watcher.sh
#   (crontab -l 2>/dev/null; echo "*/5 * * * * /home/ec2-user/nasun-ai-runtime/scripts/log-watcher.sh") | crontab -

set -uo pipefail

LOG_OUT="$HOME/.pm2/logs/nasun-ai-runtime-out.log"
LOG_ERR="$HOME/.pm2/logs/nasun-ai-runtime-error.log"
STATE_FILE="$HOME/.nasun-ai-runtime-log-watcher.state"

THRESHOLD="${LOG_WATCHER_THRESHOLD:-2}"
COOLDOWN="${LOG_WATCHER_COOLDOWN:-1800}"

# Load env from ~/.nasun-ai-runtime.env if present (mirrors pm2 ecosystem).
[ -f "$HOME/.nasun-ai-runtime.env" ] && . "$HOME/.nasun-ai-runtime.env"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  exit 0
fi

# Combine out + error logs if both exist; otherwise whichever is present.
TAIL_INPUT=""
[ -f "$LOG_OUT" ] && TAIL_INPUT="$LOG_OUT"
[ -f "$LOG_ERR" ] && TAIL_INPUT="${TAIL_INPUT:+$TAIL_INPUT }$LOG_ERR"
[ -z "$TAIL_INPUT" ] && exit 0

COUNT=$(tail -n 500 $TAIL_INPUT 2>/dev/null | grep -cE 'preflight denied|cycle fail|/infer failed|/execute-capability failed|FATAL|capability_owner_mismatch|capability_version_mismatch' || true)

if [ "$COUNT" -lt "$THRESHOLD" ]; then
  exit 0
fi

NOW=$(date +%s)
LAST=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
if [ $((NOW - LAST)) -lt "$COOLDOWN" ]; then
  exit 0
fi

MSG="nasun-ai-runtime: ${COUNT} error lines in last 500 (threshold ${THRESHOLD}). Check pm2 logs."
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  >/dev/null 2>&1 || true

echo "$NOW" > "$STATE_FILE"
