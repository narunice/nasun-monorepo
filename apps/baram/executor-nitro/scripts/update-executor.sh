#!/bin/bash
# On-chain Executor endpoint 업데이트
# Usage: ./update-executor.sh <NEW_IP>
set -e

NEW_IP=${1:-}
if [ -z "$NEW_IP" ]; then
  echo "Usage: ./update-executor.sh <NEW_IP>"
  echo "Example: ./update-executor.sh 3.35.69.95"
  exit 1
fi

NEW_ENDPOINT="http://$NEW_IP:3000"

echo "=== Updating Executor Endpoint ==="
echo "New endpoint: $NEW_ENDPOINT"

# V6 Devnet addresses (from devnet-ids.json)
EXECUTOR_PACKAGE="0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5"
EXECUTOR_REGISTRY="0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b"

# Nasun CLI path
NASUN_CLI="${NASUN_CLI:-/home/naru/my_apps/nasun-devnet/sui/target/release/sui}"

if [ ! -f "$NASUN_CLI" ]; then
  echo "Error: Nasun CLI not found at $NASUN_CLI"
  echo "Set NASUN_CLI environment variable or ensure the binary exists"
  exit 1
fi

echo ""
echo "Calling update_endpoint..."

# Call update_endpoint function
$NASUN_CLI client call \
  --package "$EXECUTOR_PACKAGE" \
  --module executor \
  --function update_endpoint \
  --args "$EXECUTOR_REGISTRY" "$NEW_ENDPOINT" \
  --gas-budget 10000000

echo ""
echo "==========================================="
echo "  Executor Endpoint Updated"
echo "==========================================="
echo ""
echo "Verify with:"
echo "  curl $NEW_ENDPOINT/health"
echo ""
echo "Or check on-chain:"
echo "  $NASUN_CLI client object $EXECUTOR_REGISTRY"
