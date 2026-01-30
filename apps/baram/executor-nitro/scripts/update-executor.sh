#!/bin/bash
# On-chain Executor endpoint update (BOTH registries)
# Usage: ./update-executor.sh <NEW_IP>
set -e

NEW_IP=${1:-}
if [ -z "$NEW_IP" ]; then
  echo "Usage: ./update-executor.sh <NEW_IP>"
  echo "Example: ./update-executor.sh 3.35.69.95"
  exit 1
fi

NEW_ENDPOINT="http://$NEW_IP:3000"
OPERATOR="0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90"
SUPPORTED_MODELS='["llama-3.2-3b","llama-3.2-3b-local"]'

# Nasun CLI path
NASUN_CLI="${NASUN_CLI:-/home/naru/my_apps/nasun-devnet/sui/target/release/sui}"

if [ ! -f "$NASUN_CLI" ]; then
  echo "Error: Nasun CLI not found at $NASUN_CLI"
  echo "Set NASUN_CLI environment variable or ensure the binary exists"
  exit 1
fi

echo "=== Updating Executor Endpoint ==="
echo "New endpoint: $NEW_ENDPOINT"
echo "Models: $SUPPORTED_MODELS"
echo ""

# --- Registry 1: Frontend registry (used by UI) ---
echo "--- [1/2] Frontend Registry ---"
$NASUN_CLI client call \
  --package 0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5 \
  --module executor \
  --function update_executor \
  --args \
    0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7 \
    0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b \
    "$OPERATOR" \
    '"Nasun TEE Executor"' \
    "\"$NEW_ENDPOINT\"" \
    "$SUPPORTED_MODELS" \
    true \
  --gas-budget 100000000

echo ""

# --- Registry 2: devnet-ids registry (used by Host settlement) ---
echo "--- [2/2] devnet-ids Registry ---"
$NASUN_CLI client call \
  --package 0xac09c1d6540e29454ee98bc18a5fa8f29b1c343153c8edf7dd92edd296f2d1ff \
  --module executor \
  --function update_executor \
  --args \
    0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089 \
    0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
    "$OPERATOR" \
    '"Nasun TEE Executor"' \
    "\"$NEW_ENDPOINT\"" \
    "$SUPPORTED_MODELS" \
    true \
  --gas-budget 100000000

echo ""
echo "==========================================="
echo "  Both Registries Updated"
echo "==========================================="
echo ""
echo "Verify with:"
echo "  curl $NEW_ENDPOINT/health"
echo ""
echo "Check on-chain (frontend registry):"
echo "  curl -s -X POST https://rpc.devnet.nasun.io -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"suix_getDynamicFieldObject\",\"params\":[\"0xe74b2b336b96b8634ded977d3c861197d4b73d435bf784e71923af4996620056\",{\"type\":\"address\",\"value\":\"$OPERATOR\"}]}' | jq '.result.data.content.fields.value.fields.endpoint_url'"
