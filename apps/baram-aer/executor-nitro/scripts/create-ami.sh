#!/bin/bash
# Baram TEE Development AMI 생성
# Usage: ./create-ami.sh [INSTANCE_ID]
set -e

INSTANCE_ID=${1:-$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null)}
AMI_NAME="baram-nitro-dev-$(date +%Y%m%d-%H%M)"
AMI_DESCRIPTION="Baram TEE Dev: Nitro CLI, Docker, Node.js 20, Llama 3.2 3B model"

if [ -z "$INSTANCE_ID" ]; then
  echo "Error: Could not determine instance ID"
  echo "Usage: ./create-ami.sh <INSTANCE_ID>"
  exit 1
fi

echo "=== Baram AMI Creation ==="
echo "Instance: $INSTANCE_ID"
echo "AMI Name: $AMI_NAME"

# Clean up before creating AMI
echo ""
echo "Cleaning up temporary files..."
rm -rf /home/ec2-user/nasun-monorepo/node_modules 2>/dev/null || true
rm -rf /home/ec2-user/nasun-monorepo/apps/baram-aer/executor-nitro/node_modules 2>/dev/null || true
rm -rf /home/ec2-user/nasun-monorepo/apps/baram-aer/executor-nitro/eif/*.eif 2>/dev/null || true
rm -rf /home/ec2-user/nasun-monorepo/apps/baram-aer/executor-nitro/dist 2>/dev/null || true
sudo rm -rf /tmp/* 2>/dev/null || true

# Terminate any running enclave
echo "Stopping any running enclaves..."
nitro-cli terminate-enclave --all 2>/dev/null || true

# Verify model file exists
MODEL_PATH="/home/ec2-user/models/llama-3.2-3b-instruct-q4_k_m.gguf"
if [ ! -f "$MODEL_PATH" ]; then
  echo "Warning: Model file not found at $MODEL_PATH"
  echo "AMI will be created without the model. Run download-model.sh before creating AMI."
fi

# Create AMI (default AWS profile)
echo ""
echo "Creating AMI (this may take 5-10 minutes)..."
AMI_ID=$(aws ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "$AMI_DESCRIPTION" \
  --no-reboot \
  --query 'ImageId' \
  --output text)

if [ -z "$AMI_ID" ]; then
  echo "Error: Failed to create AMI"
  exit 1
fi

echo ""
echo "=========================================="
echo "  AMI Creation Started"
echo "=========================================="
echo ""
echo "AMI ID: $AMI_ID"
echo ""
echo "Check status with:"
echo "  aws ec2 describe-images --image-ids $AMI_ID --query 'Images[0].State'"
echo ""
echo "Wait for 'available' status, then update .env.ami with:"
echo "  BARAM_AMI_ID=$AMI_ID"
echo ""
echo "Or run:"
echo "  aws ec2 wait image-available --image-ids $AMI_ID && echo 'AMI is ready!'"
