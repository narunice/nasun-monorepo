#!/bin/bash
# Mint a BetaAccessNFT to a recipient address
#
# Usage:
#   ./mint-beta-access.sh <RECIPIENT_ADDRESS> [EXPIRES_AT_MS] [REMAINING_USES]
#
# Arguments:
#   RECIPIENT_ADDRESS  - Sui address to receive the NFT
#   EXPIRES_AT_MS      - Expiration timestamp in milliseconds (0 = no expiry, default: 0)
#   REMAINING_USES     - Number of uses allowed (0 = unlimited, default: 0)
#
# Examples:
#   ./mint-beta-access.sh 0xabc...                  # No expiry, unlimited uses
#   ./mint-beta-access.sh 0xabc... 0 100            # No expiry, 100 uses
#   ./mint-beta-access.sh 0xabc... 1709251200000 0  # Expires, unlimited uses
#
# Prerequisites:
#   - Contract must be upgraded with beta_access module
#   - initialize() must have been called
#   - Active wallet must hold the BetaAccessAdmin object

set -euo pipefail

# ========== Configuration ==========
# Update these after contract deployment
SUI_CLI="/home/naru/my_apps/nasun-devnet/sui/target/release/sui"
PACKAGE_ID="0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6"
BETA_ACCESS_ADMIN="0x7daa09decafcfa78b712308a13e8c8204eb89de8434df806df51f4cec076d6c2"
BETA_ACCESS_REGISTRY="0xaf2fd2a1ccfd1f41afe51071981047860b81f9cfaa775fc12acadf099577e4f7"
CLOCK="0x6"             # Sui Clock shared object (always 0x6)

# ========== Arguments ==========
RECIPIENT="${1:?Error: RECIPIENT_ADDRESS is required}"
EXPIRES_AT="${2:-0}"
REMAINING_USES="${3:-0}"

# ========== Validation ==========
if [[ -z "$PACKAGE_ID" || -z "$BETA_ACCESS_ADMIN" || -z "$BETA_ACCESS_REGISTRY" ]]; then
  echo "Error: PACKAGE_ID, BETA_ACCESS_ADMIN, and BETA_ACCESS_REGISTRY must be set."
  echo "Run initialize() first and update this script with the object IDs."
  exit 1
fi

if [[ ! "$RECIPIENT" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "Error: RECIPIENT must be a valid Sui address (0x + 64 hex chars)"
  exit 1
fi

if [[ ! "$EXPIRES_AT" =~ ^[0-9]+$ ]]; then
  echo "Error: EXPIRES_AT must be a non-negative integer (milliseconds)"
  exit 1
fi

if [[ ! "$REMAINING_USES" =~ ^[0-9]+$ ]]; then
  echo "Error: REMAINING_USES must be a non-negative integer"
  exit 1
fi

# ========== Mint ==========
echo "Minting BetaAccessNFT..."
echo "  Recipient:       $RECIPIENT"
echo "  Expires at:      $EXPIRES_AT (0 = no expiry)"
echo "  Remaining uses:  $REMAINING_USES (0 = unlimited)"
echo ""

$SUI_CLI client call \
  --package "$PACKAGE_ID" \
  --module beta_access \
  --function mint \
  --args "$BETA_ACCESS_ADMIN" "$BETA_ACCESS_REGISTRY" "$RECIPIENT" "$EXPIRES_AT" "$REMAINING_USES" "$CLOCK" \
  --gas-budget 10000000

echo ""
echo "Done. Check the recipient's wallet for the BetaAccessNFT."
