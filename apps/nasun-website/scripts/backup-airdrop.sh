#!/bin/bash
# Backup nasun-airdrop-registrations table to local JSON file.
# Usage: ./backup-airdrop.sh [--profile nasun-prod]
#
# Exports all records including: identityId, status, walletAddress, twitterHandle,
# registeredAt, approvedAt.

set -euo pipefail

TABLE_NAME="nasun-airdrop-registrations"
BACKUP_DIR="$(dirname "$0")/../_backups/airdrop"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${BACKUP_DIR}/airdrop-registrations-${TIMESTAMP}.json"

# Pass through any AWS CLI flags (e.g., --profile nasun-prod)
AWS_ARGS=("$@")

mkdir -p "$BACKUP_DIR"

echo "[backup] Scanning ${TABLE_NAME}..."
aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --region ap-northeast-2 \
  "${AWS_ARGS[@]}" \
  --output json > "$OUTPUT_FILE"

COUNT=$(jq '.Count' "$OUTPUT_FILE")
echo "[backup] Exported ${COUNT} records to ${OUTPUT_FILE}"
echo "[backup] Done."
