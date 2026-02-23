#!/bin/bash
# On-chain Executor endpoint update + reverse proxy backend update
# Uses update_own_endpoint (Phase F-2 self-service) — no AdminCap required.
#
# This script:
#   1. Updates the nginx upstream on nasun-node-1 to route to the Spot instance
#   2. Registers the HTTPS endpoint on-chain
#
# Usage: ./update-executor.sh <SPOT_IP>
set -e

SPOT_IP=${1:-}
if [ -z "$SPOT_IP" ]; then
  echo "Usage: ./update-executor.sh <SPOT_IP>"
  echo "Example: ./update-executor.sh 3.35.69.95"
  exit 1
fi

# Validate IPv4 format to prevent command injection
if ! [[ "$SPOT_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "Error: Invalid IP address format: $SPOT_IP"
  echo "Expected: IPv4 address (e.g., 3.35.69.95)"
  exit 1
fi

# HTTPS endpoint via nasun-node-1 reverse proxy
HTTPS_ENDPOINT="https://tee.baram.nasun.io"
# Empty array = accept all models (Groq + TEE)
SUPPORTED_MODELS='[]'

# Reverse proxy (nasun-node-1)
PROXY_HOST="ubuntu@3.38.127.23"
SSH_KEY="$HOME/.ssh/.awskey/nasun-devnet-key.pem"

# Contract IDs — read from devnet-config if available, fallback to hardcoded
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVNET_IDS="$SCRIPT_DIR/../../../../packages/devnet-config/devnet-ids.json"

if [ -f "$DEVNET_IDS" ] && command -v jq &> /dev/null; then
  EXECUTOR_PACKAGE_ID=$(jq -r '.baram.executorPackageId' "$DEVNET_IDS")
  EXECUTOR_REGISTRY_ID=$(jq -r '.baram.executorRegistry' "$DEVNET_IDS")
else
  EXECUTOR_PACKAGE_ID="0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd"
  EXECUTOR_REGISTRY_ID="0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656"
fi

# Nasun CLI path
NASUN_CLI="${NASUN_CLI:-/home/naru/my_apps/nasun-devnet/sui/target/release/sui}"

if [ ! -f "$NASUN_CLI" ]; then
  echo "Error: Nasun CLI not found at $NASUN_CLI"
  echo "Set NASUN_CLI environment variable or ensure the binary exists"
  exit 1
fi

echo "=== Updating Executor Endpoint ==="
echo "Spot IP: $SPOT_IP"
echo "HTTPS endpoint: $HTTPS_ENDPOINT"
echo "Registry: $EXECUTOR_REGISTRY_ID"
echo "Models: $SUPPORTED_MODELS (empty = accept all)"
echo ""

# Step 1: Update reverse proxy backend on nasun-node-1
echo "--- Step 1: Updating nginx upstream on nasun-node-1 ---"
if [ -f "$SSH_KEY" ]; then
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 \
    "$PROXY_HOST" "sudo update-tee-backend.sh '$SPOT_IP'" 2>&1 || {
    echo "Warning: Failed to update reverse proxy. Manual update needed:"
    echo "  ssh -i $SSH_KEY $PROXY_HOST sudo update-tee-backend.sh $SPOT_IP"
    echo ""
  }
else
  echo "Warning: SSH key not found at $SSH_KEY"
  echo "Manual update needed on nasun-node-1:"
  echo "  sudo update-tee-backend.sh $SPOT_IP"
  echo ""
fi

# Step 2: Register HTTPS endpoint on-chain
echo "--- Step 2: Registering on-chain endpoint ---"
echo "Endpoint: $HTTPS_ENDPOINT"
$NASUN_CLI client call \
  --package "$EXECUTOR_PACKAGE_ID" \
  --module executor \
  --function update_own_endpoint \
  --args \
    "$EXECUTOR_REGISTRY_ID" \
    "\"$HTTPS_ENDPOINT\"" \
    "$SUPPORTED_MODELS" \
    0x6 \
  --gas-budget 100000000

echo ""
echo "==========================================="
echo "  Executor Endpoint Updated"
echo "==========================================="
echo ""
echo "HTTPS endpoint: $HTTPS_ENDPOINT"
echo "Backend: http://$SPOT_IP:3000"
echo ""
echo "Verify:"
echo "  curl $HTTPS_ENDPOINT/health"
echo "  curl http://$SPOT_IP:3000/health  (direct)"
echo ""
echo "Note: If the active Nasun CLI address does not match the executor operator,"
echo "use the Admin-based update_executor instead (requires AdminCap)."
