#!/bin/bash
# On-chain Executor endpoint update (devnet-ids registry only)
# Uses update_own_endpoint (Phase F-2 self-service) — no AdminCap required.
# Usage: ./update-executor.sh <NEW_IP>
set -e

NEW_IP=${1:-}
if [ -z "$NEW_IP" ]; then
  echo "Usage: ./update-executor.sh <NEW_IP>"
  echo "Example: ./update-executor.sh 3.35.69.95"
  exit 1
fi

NEW_ENDPOINT="http://$NEW_IP:3000"
# Empty array = accept all models (Groq + TEE)
SUPPORTED_MODELS='[]'

# Contract IDs (devnet-ids registry)
EXECUTOR_PACKAGE_ID="0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc"
EXECUTOR_REGISTRY_ID="0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c"

# Nasun CLI path
NASUN_CLI="${NASUN_CLI:-/home/naru/my_apps/nasun-devnet/sui/target/release/sui}"

if [ ! -f "$NASUN_CLI" ]; then
  echo "Error: Nasun CLI not found at $NASUN_CLI"
  echo "Set NASUN_CLI environment variable or ensure the binary exists"
  exit 1
fi

echo "=== Updating Executor Endpoint ==="
echo "New endpoint: $NEW_ENDPOINT"
echo "Registry: devnet-ids ($EXECUTOR_REGISTRY_ID)"
echo "Models: $SUPPORTED_MODELS (empty = accept all)"
echo ""

# Self-service endpoint update (Phase F-2)
# Requires active Nasun CLI address to match the registered executor operator.
echo "--- update_own_endpoint (self-service, no AdminCap) ---"
$NASUN_CLI client call \
  --package "$EXECUTOR_PACKAGE_ID" \
  --module executor \
  --function update_own_endpoint \
  --args \
    "$EXECUTOR_REGISTRY_ID" \
    "\"$NEW_ENDPOINT\"" \
    "$SUPPORTED_MODELS" \
    0x6 \
  --gas-budget 100000000

echo ""
echo "==========================================="
echo "  Executor Endpoint Updated"
echo "==========================================="
echo ""
echo "Verify with:"
echo "  curl $NEW_ENDPOINT/health"
echo ""
echo "Note: If the active Nasun CLI address does not match the executor operator,"
echo "use the Admin-based update_executor instead (requires AdminCap)."
