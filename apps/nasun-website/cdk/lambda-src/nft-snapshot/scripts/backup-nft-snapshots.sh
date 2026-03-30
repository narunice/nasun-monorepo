#!/usr/bin/env bash
# Daily local backup of ALL NFT snapshots (ETH + Devnet) from DynamoDB.
# Saves to ~/nasun-backups/nft-snapshots/ with date-based filenames.
#
# Usage:
#   bash backup-nft-snapshots.sh [dev|prod] [YYYY-MM-DD]
#
# Examples:
#   bash backup-nft-snapshots.sh dev            # today's snapshots from dev
#   bash backup-nft-snapshots.sh prod 2026-03-29   # specific date from prod
#
# Cron (daily at 12:00 UTC = 21:00 KST, after both Lambdas complete):
#   0 12 * * * bash <MONOREPO>/apps/nasun-website/cdk/lambda-src/nft-snapshot/scripts/backup-nft-snapshots.sh dev >> ~/nasun-backups/nft-snapshots/backup.log 2>&1

set -euo pipefail

ENV="${1:-dev}"
DATE="${2:-$(date -u +%Y-%m-%d)}"

if [ "$ENV" = "prod" ]; then
  PROFILE="--profile nasun-prod"
else
  PROFILE=""
fi

BACKUP_DIR="$HOME/nasun-backups/nft-snapshots"
mkdir -p "$BACKUP_DIR"

TABLE="nasun-nft-ownership"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

query_and_save() {
  local PK="$1"
  local OUTFILE="$2"
  local LABEL="$3"

  if [ -f "$OUTFILE" ]; then
    echo "[$TIMESTAMP] $LABEL already exists: $OUTFILE"
    return
  fi

  aws dynamodb query \
    $PROFILE \
    --region ap-northeast-2 \
    --table-name "$TABLE" \
    --key-condition-expression "pk = :pk" \
    --expression-attribute-values "{\":pk\": {\"S\": \"${PK}\"}}" \
    --output json \
    > "$OUTFILE"

  local COUNT
  COUNT=$(jq '.Count' "$OUTFILE")
  local SIZE
  SIZE=$(du -h "$OUTFILE" | cut -f1)
  echo "[$TIMESTAMP] $LABEL: $COUNT records ($SIZE)"
}

echo "[$TIMESTAMP] Backing up NFT snapshots for $DATE from $ENV..."

# 1. Devnet snapshots (Alliance, VoteProof, BetaAccess, etc.)
query_and_save "DEVNET#${DATE}" "$BACKUP_DIR/devnet-${DATE}.json" "Devnet"

# 2. ETH snapshots (Genesis Pass, future Battalion/Frontiers)
query_and_save "ETH#${DATE}" "$BACKUP_DIR/eth-${DATE}.json" "ETH"

# 3. LATEST snapshots (always overwritten for quick recovery)
aws dynamodb query \
  $PROFILE \
  --region ap-northeast-2 \
  --table-name "$TABLE" \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values "{\":pk\": {\"S\": \"DEVNET#LATEST\"}}" \
  --output json \
  > "$BACKUP_DIR/devnet-LATEST.json"

aws dynamodb query \
  $PROFILE \
  --region ap-northeast-2 \
  --table-name "$TABLE" \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values "{\":pk\": {\"S\": \"ETH#LATEST\"}}" \
  --output json \
  > "$BACKUP_DIR/eth-LATEST.json"

echo "[$TIMESTAMP] LATEST snapshots updated"

# No retention limit: keep all snapshots permanently (~50KB/day, ~18MB/year)
echo "[$TIMESTAMP] Backup complete (permanent retention)"
