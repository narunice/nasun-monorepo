#!/usr/bin/env bash
# nasun_points delta-sync (AWS-exit Stage 2 §6.1 / §9.1 / §12 watermark gate).
#
# Keeps the box copy of nasun_points current with the LIVE node-3 source for the append-only,
# bigint-id-sequence ledgers (the irrecoverable crown-jewel data: activity_points cannot be
# recomputed from chain -- memory project_2026_06_09_points_offaws_backup). The bulk was restored
# 2026-06-06/07; this script carries the delta since then and on every run.
#
# Mechanism (per append-only table): box_max = max(id) on box; pull rows from node-3 WHERE id >
# box_max via COPY TO STDOUT, stream into box via COPY FROM STDIN. The watermark guarantees pulled
# rows are new (no PK conflict); COPY is transactional (a failed run rolls back wholly -> box_max
# unchanged -> re-run is identical). Additive + idempotent + READ-ONLY on node-3 (live serving
# untouched; explorer-api keeps owning node-3 until Stage 4 cutover).
#
# NOT covered here (follow-on): mutable current-state tables (user_nsi, nft_health_state,
# staking_emission_state, player_stats ...) = recomputed by the scanners post-lift, and
# date-snapshot tables (ecosystem_*_scores/snapshots, weekly_*, *_daily_snapshots) = settled, need
# a date-watermark pass. Those are lower urgency (derived/settled). This pass covers the
# source-of-truth event ledgers.
#
# Usage:
#   NODE3_SSH='ssh -i <key> ubuntu@<node3-host>' \
#   BOX_SSH='ssh -i <key> nasun@<box-host>' \
#   ./nasun-points-delta-sync.sh [--dry-run]
# Infra identifiers (hosts, key paths) are NOT hardcoded -- this repo is public, so the source
# (node-3) and target (box) SSH commands are supplied via env (e.g. an operator-local, gitignored
# .env or the nasun-ops private wrapper). Both must reach `sudo -u postgres psql nasun_points`.
set -euo pipefail

: "${NODE3_SSH:?set NODE3_SSH (the source/live ssh prefix, e.g. 'ssh -i ~/.ssh/key ubuntu@<node3-host>')}"
: "${BOX_SSH:?set BOX_SSH (the target/box ssh prefix, e.g. 'ssh -i ~/.ssh/key nasun@<box-host>')}"
N3_SSH="$NODE3_SSH"
BOX_SSH="$BOX_SSH"
N3_PSQL="sudo -u postgres psql nasun_points"
BOX_PSQL="sudo -u postgres psql nasun_points"

# append-only ledgers keyed by a bigint id sequence (verified 2026-06-12: id_is_seq=t).
# Schema-qualified: activity_points/snapshot_change_log = public (ecosystem points, explorer-api);
# game_round/bankroll_event = gostop schema (gostop-backend). Box and node-3 schemas verified equal.
TABLES="public.activity_points gostop.game_round gostop.bankroll_event public.snapshot_change_log"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

echo "=== nasun_points delta-sync $([ $DRY -eq 1 ] && echo '(DRY RUN)') $(date -u +%FT%TZ) ==="
for T in $TABLES; do
  BOXMAX=$($BOX_SSH "$BOX_PSQL -tAc 'SELECT COALESCE(max(id),0) FROM $T'")
  N3MAX=$($N3_SSH "$N3_PSQL -tAc 'SELECT COALESCE(max(id),0) FROM $T'")
  DELTA=$($N3_SSH "$N3_PSQL -tAc 'SELECT count(*) FROM $T WHERE id > $BOXMAX'")
  printf '[%s] box_max=%s node3_max=%s delta_rows=%s\n' "$T" "$BOXMAX" "$N3MAX" "$DELTA"
  [ "$DELTA" -eq 0 ] && continue
  [ $DRY -eq 1 ] && { echo "  (dry-run: would COPY $DELTA rows id>$BOXMAX)"; continue; }
  # stream delta node-3 -> (local relay) -> box. COPY is one transaction on each side.
  $N3_SSH "$N3_PSQL -c \"COPY (SELECT * FROM $T WHERE id > $BOXMAX ORDER BY id) TO STDOUT\"" \
    | $BOX_SSH "$BOX_PSQL -c \"COPY $T FROM STDIN\""
  NEWMAX=$($BOX_SSH "$BOX_PSQL -tAc 'SELECT COALESCE(max(id),0) FROM $T'")
  printf '  -> synced; box_max now=%s\n' "$NEWMAX"
done
echo "=== done ==="
