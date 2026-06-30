#!/usr/bin/env bash
# repost-grant.sh - box-native repost-bonus SQL generator (post-AWS-exit).
#
# Resolves X handles -> Nasun wallets via the self-hosted nasun_dal Postgres
# (user_profiles + wallet_owner, the migrated DynamoDB UserProfiles SoT) and
# emits idempotent activity_points grant SQL.
#
# Why this replaced repost-grant-emit.py (deleted): after the AWS exit the
# DynamoDB UserProfiles table was deleted, so the old local-DDB resolution path
# could no longer map handles to wallets. The same mapping now lives in
# nasun_dal. X API credit exhaustion is also sidestepped: reposter handles are
# supplied as a file (scrape the tweet's Reposts tab) instead of being fetched
# from the X API.
#
# Run on box (Hetzner), where DAL_DATABASE_URL reaches nasun_dal:
#   cd ~/nasun-monorepo/apps/nasun-website/chat-server && set -a && . .env && set +a
#   bash repost-grant.sh <tweetId> <handlesFile>
#
# handlesFile: one handle per line (@ optional, case-insensitive). Admin handles
# (nasun_io, naru010110, overclocksalmon) and the admin wallet are excluded.
#
# Writes /tmp/repost-grants-<tweetId>.sql and prints a summary. Review, then
# apply against the points DB (a separate database):
#   cd ~/nasun-monorepo/apps/network-explorer/api-server && set -a && . .env && set +a
#   psql "$POINTS_DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/repost-grants-<tweetId>.sql

set -euo pipefail

TID="${1:-}"
HFILE="${2:-}"
if [[ -z "$TID" || -z "$HFILE" ]]; then
  echo "usage: repost-grant.sh <tweetId> <handlesFile>" >&2
  exit 2
fi
[[ "$TID" =~ ^[0-9]{15,25}$ ]] || { echo "tweetId must be a numeric snowflake ID" >&2; exit 2; }
[[ -f "$HFILE" ]] || { echo "handles file not found: $HFILE" >&2; exit 2; }
: "${DAL_DATABASE_URL:?set DAL_DATABASE_URL (run: set -a && . .env && set +a in chat-server/)}"

BONUS=3
OUT="/tmp/repost-grants-${TID}.sql"

# Normalize: strip leading @, take first whitespace-delimited token, lowercase,
# keep only valid X handles, drop admins, dedupe. Validated to [a-z0-9_]{1,15}
# so they are safe to interpolate into the SQL VALUES list below.
mapfile -t HANDLES < <(
  tr -d '\r' < "$HFILE" \
  | sed -E 's/^[[:space:]]*@?//; s/[[:space:]].*$//' \
  | tr 'A-Z' 'a-z' \
  | grep -E '^[a-z0-9_]{1,15}$' \
  | grep -vxF -e nasun_io -e naru010110 -e overclocksalmon \
  | sort -u
)
[[ "${#HANDLES[@]}" -gt 0 ]] || { echo "no valid handles after normalization" >&2; exit 1; }

VALUES=$(printf "('%s')," "${HANDLES[@]}"); VALUES="${VALUES%,}"

# Shared resolver CTE: handle -> wallet (top-level wallet_address, else the
# linked 'nasun wallet'), then JOIN wallet_owner for the authoritative
# identity_id. Filters to canonical 0x+64hex wallets and excludes the admin
# wallet (0xb649203f...). DISTINCT ON dedupes multiple profiles per handle,
# preferring a row that actually resolves a wallet.
CTE="WITH handles(h) AS (VALUES ${VALUES}),
resolved AS (
  SELECT DISTINCT ON (h.h) h.h AS handle,
    lower(coalesce(p.wallet_address, p.linked_accounts->'nasun wallet'->>'walletAddress')) AS wallet,
    p.identity_id AS profile_identity
  FROM handles h
  LEFT JOIN user_profiles p ON lower(p.twitter_handle) = h.h
  ORDER BY h.h,
    (coalesce(p.wallet_address, p.linked_accounts->'nasun wallet'->>'walletAddress') IS NOT NULL) DESC,
    p.updated_at DESC NULLS LAST
),
eligible AS (
  SELECT r.handle, r.wallet,
         coalesce(wo.owner_identity_id, r.profile_identity) AS identity_id
  FROM resolved r
  LEFT JOIN wallet_owner wo ON wo.wallet_address = r.wallet
  WHERE r.wallet ~ '^0x[0-9a-f]{64}\$'
    AND r.wallet NOT LIKE '0xb649203f%'
    AND coalesce(wo.owner_identity_id, r.profile_identity) IS NOT NULL
)"

# Generate the INSERT statements.
BODY=$(psql "$DAL_DATABASE_URL" -tA <<SQL
${CTE}
SELECT format(
  'INSERT INTO activity_points (wallet_address, identity_id, tx_digest, category, activity_type, base_points, volume_tier, genesis_multiplier, final_points, tx_timestamp, event_seq, tx_sequence_number) VALUES (%L, %L, %L, ''ecosystem-bonus-repost'', ''x-repost'', ${BONUS}, 1.0, 1.0, ${BONUS}, NOW()::timestamptz, 0, 0) ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING;',
  wallet, identity_id, 'repost:${TID}:'||handle)
FROM eligible ORDER BY handle;
SQL
)

# Summary classification (mapped / no-wallet / missing).
read -r MAPPED NOWALLET MISSING < <(psql "$DAL_DATABASE_URL" -tA -F' ' <<SQL
${CTE}
SELECT
  (SELECT count(*) FROM eligible),
  count(*) FILTER (WHERE profile_identity IS NOT NULL
                   AND handle NOT IN (SELECT handle FROM eligible)),
  count(*) FILTER (WHERE profile_identity IS NULL)
FROM resolved;
SQL
)

{
  echo "-- repost bonus grants tweet ${TID} (generated on box from nasun_dal)"
  echo "BEGIN;"
  echo "$BODY"
  echo "COMMIT;"
  echo "SELECT count(*) AS granted_rows, sum(final_points) AS total_points FROM activity_points WHERE category='ecosystem-bonus-repost' AND split_part(tx_digest,':',2)='${TID}';"
} > "$OUT"

INS=$(grep -c '^INSERT' "$OUT" || true)

# Self-verification (fail loudly rather than emit a bad grant file).
err=0
if grep -qiE '0xb649203f' "$OUT"; then echo "FAIL: admin wallet present" >&2; err=1; fi
if [[ -n "$(grep -oE "VALUES \\('[^']*'" "$OUT" | grep -vE "VALUES \\('0x[0-9a-f]{64}'" || true)" ]]; then
  echo "FAIL: non-0x64hex wallet present" >&2; err=1; fi
if [[ -n "$(grep -oE "VALUES \\('0x[0-9a-f]{64}'" "$OUT" | sort | uniq -d)" ]]; then
  echo "FAIL: duplicate wallet" >&2; err=1; fi
if [[ -n "$(grep -oE "repost:${TID}:[a-z0-9_]+" "$OUT" | sort | uniq -d)" ]]; then
  echo "FAIL: duplicate digest" >&2; err=1; fi
if [[ "$INS" != "$MAPPED" ]]; then echo "FAIL: INSERT count ($INS) != mapped ($MAPPED)" >&2; err=1; fi

echo "input handles (after admin/dedupe): ${#HANDLES[@]}"
echo "mapped (eligible):  ${MAPPED}"
echo "no wallet:          ${NOWALLET}"
echo "missing (no profile): ${MISSING}"
echo "INSERTs:            ${INS}   points: $((INS * BONUS))"
echo "SQL written:        ${OUT}"
if [[ "$err" -ne 0 ]]; then echo "VERIFICATION FAILED - do not apply ${OUT}" >&2; exit 1; fi
echo "verification: OK. Review, then apply on box points DB (psql -f ${OUT})."
