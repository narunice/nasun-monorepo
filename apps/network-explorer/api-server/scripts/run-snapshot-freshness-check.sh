#!/usr/bin/env bash
# Dead-man switch runner for the daily ecosystem snapshot (box systemd timer).
#
# src/scripts/snapshot-freshness-check.ts was written after the 2026-05-08 lockout sat
# unnoticed for ~24h, but it was wired to a node-3 cron and node-3 was decommissioned on
# 2026-06-23 -- so the check has not run since, exactly like the weekly settle jobs and
# the points backup. This runner restores it on box.
#
# systemd timer rather than a crontab line (which is how run-weekly-settle.sh is invoked):
# Persistent=true re-fires a run missed while the host was down, and the output lands in
# journald next to the other box maintenance units.
#
# Runs at 03:00 UTC, ~3h after the 00:05 UTC snapshot window, so the scanner's 60s retry
# loop has had time to self-heal a transient failure before we page a human.
#
# Exit codes come straight from the TS script: 0 healthy, 1 missing/partial snapshot
# (it already sent its own Telegram alert), 2 crash or missing env.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${FRESHNESS_LOG_DIR:-$HOME/settle-logs}"
mkdir -p "$LOG_DIR"

# systemd gives a minimal PATH; node lives in /usr/bin on box.
export PATH="/usr/bin:/usr/local/bin:$PATH"

cd "$APP_DIR"
# POINTS_DATABASE_URL / TELEGRAM_* live here, same as the settle runner.
set -a; . ./.env; set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/snapshot-freshness-${STAMP}.log"

# Run the compiled output rather than tsx: this is a health check, so it must not depend
# on a dev toolchain being present or on type-checking succeeding at run time.
rc=0
{
  echo "=== snapshot-freshness-check :: start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  timeout 120 node dist/scripts/snapshot-freshness-check.js
} >>"$LOG" 2>&1 || rc=$?
echo "=== snapshot-freshness-check :: exit rc=${rc} $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$LOG"

tail -3 "$LOG"

# rc=1 means the TS script already alerted with detail. rc=2 (crash) alerts from the
# script's own catch, but a timeout (124) or a missing dist file kills it before that
# code runs, so cover those here -- an alerting mechanism that can fail silently is the
# thing this whole exercise is about.
if [ "$rc" -ge 2 ]; then
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
    curl -sS --max-time 5 -o /dev/null \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
      --data-urlencode "text=[explorer-api] snapshot freshness runner failed rc=${rc} (see ${LOG} on box). The daily snapshot itself may be fine -- this is the checker failing." || true
  fi
fi

# Keep two weeks of runner logs; the useful history is in journald anyway.
find "$LOG_DIR" -maxdepth 1 -name 'snapshot-freshness-*.log' -mtime +14 -delete 2>/dev/null || true

exit "$rc"
