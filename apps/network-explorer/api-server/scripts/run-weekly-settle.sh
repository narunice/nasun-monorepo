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

{
  echo "=== settle-${KIND} --week auto :: start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  npx tsx "src/scripts/settle-${KIND}.ts" --week auto
  echo "=== settle-${KIND} :: done $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} >>"$LOG" 2>&1
