#!/usr/bin/env bash
# Weekly leaderboard settlement runner (box cron).
#
# Invoked by cron on box (Hetzner) after the Monday 00:00 UTC week reset:
#   settle-pado       Mon 00:15 UTC
#   settle-ecosystem  Mon 00:20 UTC
# Settles the previous (just-completed) ISO week via `--week auto`. Both settlement
# scripts are idempotent (ON CONFLICT DO NOTHING + per-row settled flag), so a missed
# or duplicated run is safe to re-fire. settle-ecosystem reads profiles box-first
# (IDENTITY_READ_MODE=flip via ../lib/profile-batch-read), so no AWS credentials are
# required on box -- the node-3 -> box migration dropped both the cron and AWS creds,
# which is why the 2026-W25 settlement was silently missed.
#
# Usage: run-weekly-settle.sh <ecosystem|pado>
set -euo pipefail

KIND="${1:-}"
case "$KIND" in
  ecosystem|pado) ;;
  *) echo "usage: $(basename "$0") <ecosystem|pado>" >&2; exit 2 ;;
esac

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${SETTLE_LOG_DIR:-$HOME/settle-logs}"
mkdir -p "$LOG_DIR"

# cron runs with a minimal PATH; node/npx live in /usr/bin on box.
export PATH="/usr/bin:/usr/local/bin:$PATH"

cd "$APP_DIR"
set -a; . ./.env; set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/settle-${KIND}-${STAMP}.log"

# Plain-text Telegram alert on failure. Mirrors src/utils/alert.ts (no parse_mode,
# 5s timeout, fire-and-forget). Reads TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID
# from .env (already sourced above). No-op when either is unset.
alert() {
  local text="$1"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ] || return 0
  curl -sS --max-time 5 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
    --data-urlencode "disable_web_page_preview=true" \
    --data-urlencode "text=$(printf '%.4000s' "$text")" || true
}

# Bound the run so a hung network/PG call surfaces as a failure (timeout -> 124)
# instead of a silently stuck cron job. Normal settlement completes in <2 min.
rc=0
{
  echo "=== settle-${KIND} --week auto :: start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  timeout 900 npx tsx "src/scripts/settle-${KIND}.ts" --week auto
} >>"$LOG" 2>&1 || rc=$?
echo "=== settle-${KIND} :: exit rc=${rc} $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$LOG"

# Two failure signals:
#  1. Non-zero exit — covers missing env, empty Alliance set, top-level throw,
#     creds failure, and timeout. Idempotent re-runs ("all entries already
#     settled") and empty weeks exit 0, so this alone never false-alarms.
#  2. Per-row ERROR marker on an otherwise-clean (rc=0) run — the settle scripts
#     catch per-row award failures (`#<rank> <id> ERROR:`) and continue to exit 0,
#     so a PG hiccup mid-loop can silently underpay or zero out awards. Grep for
#     that marker to catch the partial/total-underpayment class rc alone misses.
reason=""
if [ "$rc" -ne 0 ]; then
  reason="non-zero exit (rc=${rc})"
elif grep -qE '#[0-9]+ .* ERROR:' "$LOG"; then
  reason="per-row award errors (rc=0, $(grep -cE '#[0-9]+ .* ERROR:' "$LOG") rows)"
fi
if [ -n "$reason" ]; then
  alert "$(printf 'WEEKLY SETTLE FAILED: settle-%s [%s] @ %s\nLog: %s\n--- tail ---\n%s' \
    "$KIND" "$reason" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$LOG" "$(tail -n 15 "$LOG")")"
fi
exit "$rc"
