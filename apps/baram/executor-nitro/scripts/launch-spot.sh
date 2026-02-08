#!/bin/bash
# Baram TEE Spot Instance 실행 (Custom AMI 사용)
# Usage: ./launch-spot.sh [--no-wait]
#   --no-wait  Don't wait for health check (just launch)
set -e

# Load configuration from .env.ami
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.ami"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "Error: .env.ami not found at $ENV_FILE"
  echo "Copy .env.ami.example to .env.ami and fill in the values"
  exit 1
fi

# Configuration with defaults
AMI_ID="${BARAM_AMI_ID:-}"
INSTANCE_TYPE="${BARAM_INSTANCE_TYPE:-r6i.xlarge}"
KEY_NAME="${BARAM_KEY_NAME:-baram-nitro}"
SECURITY_GROUP="${BARAM_SECURITY_GROUP:-}"
SUBNET_ID="${BARAM_SUBNET_ID:-}"
SPOT_PRICE="${BARAM_SPOT_PRICE:-0.10}"
BRANCH="${BARAM_BRANCH:-feat/wallet-ui-reorganization}"

# Parse arguments
NO_WAIT=""
for arg in "$@"; do
  case $arg in
    --no-wait)
      NO_WAIT="true"
      ;;
  esac
done

# Validation
if [ -z "$AMI_ID" ]; then
  echo "Error: BARAM_AMI_ID not set in .env.ami"
  echo ""
  echo "First, create an AMI:"
  echo "  1. Launch a base instance and set up the environment"
  echo "  2. Run ./scripts/create-ami.sh"
  echo "  3. Update .env.ami with the AMI ID"
  exit 1
fi

if [ -z "$SECURITY_GROUP" ]; then
  echo "Error: BARAM_SECURITY_GROUP not set in .env.ami"
  echo ""
  echo "Create a security group with ports 22 (SSH) and 3000 (HTTP) open:"
  echo "  aws ec2 create-security-group --group-name baram-tee-dev --description 'Baram TEE Dev'"
  exit 1
fi

echo "=== Launching Baram TEE Spot Instance ==="
echo "AMI: $AMI_ID"
echo "Type: $INSTANCE_TYPE"
echo "Key: $KEY_NAME"
echo "Security Group: $SECURITY_GROUP"
echo "Branch: $BRANCH"
echo "Max Spot Price: \$$SPOT_PRICE/hr"
echo ""

# User Data script (runs on first boot)
# Note: BRANCH is injected here, not inside the heredoc
USER_DATA=$(cat <<USERDATA
#!/bin/bash
exec > >(tee /var/log/baram-startup.log) 2>&1
set -e

echo "=== Baram Startup Script ==="
echo "Time: \$(date)"
echo "Branch: $BRANCH"

# Run as ec2-user
sudo -u ec2-user bash <<'EOF'
cd /home/ec2-user

# Load nvm
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

# Update repository
if [ -d "nasun-monorepo" ]; then
  echo "Updating repository..."
  cd nasun-monorepo
  git fetch origin
  git checkout $BRANCH 2>/dev/null || git checkout -b $BRANCH origin/$BRANCH
  git reset --hard origin/$BRANCH
else
  echo "Cloning repository..."
  git clone git@github.com:naru/nasun-monorepo.git
  cd nasun-monorepo
  git checkout $BRANCH 2>/dev/null || git checkout -b $BRANCH origin/$BRANCH
fi

cd apps/baram/executor-nitro

# Link models from AMI (if not already linked)
if [ ! -d "models" ] && [ -d "/home/ec2-user/models" ]; then
  ln -s /home/ec2-user/models models
fi

# Install dependencies
echo "Installing dependencies..."
npm ci --prefer-offline

# Build TypeScript
echo "Building TypeScript..."
npm run build

EOF

# Copy and configure systemd service
echo "Setting up systemd services..."
cd /home/ec2-user/nasun-monorepo/apps/baram/executor-nitro

# Copy service file
cp scripts/baram-host.service /etc/systemd/system/
systemctl daemon-reload

# Build EIF (requires Docker)
echo "Building EIF..."
sudo -u ec2-user bash -c 'source ~/.nvm/nvm.sh && ./scripts/build-eif.sh'

# Run Enclave with force and background flags
echo "Starting Enclave..."
./scripts/run-enclave.sh --force --background

# Wait for Enclave to initialize
sleep 5

# Get Enclave CID for Host service
ENCLAVE_CID=\$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID // empty')
if [ -n "\$ENCLAVE_CID" ]; then
  echo "Enclave CID: \$ENCLAVE_CID"

  # Update systemd service with correct CID
  sed -i "s/ENCLAVE_CID=.*/ENCLAVE_CID=\$ENCLAVE_CID/" /etc/systemd/system/baram-host.service
  systemctl daemon-reload
else
  echo "Warning: Could not get Enclave CID"
fi

# Start Host service
echo "Starting Host service..."
systemctl start baram-host

# Wait for LLM to load (can take 30-60 seconds)
echo "Waiting for LLM to load..."
sleep 30

# Health check loop
PUBLIC_IP=\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
MAX_ATTEMPTS=12
ATTEMPT=0

while [ \$ATTEMPT -lt \$MAX_ATTEMPTS ]; do
  ATTEMPT=\$((ATTEMPT + 1))
  echo "Health check attempt \$ATTEMPT/\$MAX_ATTEMPTS..."

  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo ""
    echo "=========================================="
    echo "  Baram TEE Ready!"
    echo "=========================================="
    echo "Public IP: \$PUBLIC_IP"
    echo "Health: curl http://\$PUBLIC_IP:3000/health"
    echo "Enclave CID: \$ENCLAVE_CID"
    exit 0
  fi

  sleep 10
done

echo ""
echo "Warning: Health check did not pass after \$MAX_ATTEMPTS attempts"
echo "Check logs: journalctl -u baram-host -f"
USERDATA
)

# Base64 encode User Data
USER_DATA_B64=$(echo "$USER_DATA" | base64 -w 0)

# Build run-instances command
RUN_ARGS=(
  --image-id "$AMI_ID"
  --instance-type "$INSTANCE_TYPE"
  --key-name "$KEY_NAME"
  --security-group-ids "$SECURITY_GROUP"
  --instance-market-options '{"MarketType":"spot","SpotOptions":{"MaxPrice":"'"$SPOT_PRICE"'","SpotInstanceType":"one-time"}}'
  --enclave-options 'Enabled=true'
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":50,"VolumeType":"gp3","DeleteOnTermination":true}}]'
  --user-data "$USER_DATA_B64"
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=baram-tee-dev},{Key=Project,Value=Baram}]'
  --query 'Instances[0].InstanceId'
  --output text
)

# Add subnet if specified
if [ -n "$SUBNET_ID" ]; then
  RUN_ARGS+=(--subnet-id "$SUBNET_ID")
fi

# Launch instance
echo "Requesting Spot Instance..."
INSTANCE_ID=$(aws ec2 run-instances "${RUN_ARGS[@]}")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: Failed to launch instance"
  exit 1
fi

echo "Instance ID: $INSTANCE_ID"
echo ""
echo "Waiting for instance to start..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo ""
echo "=========================================="
echo "  Spot Instance Launched"
echo "=========================================="
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP:   $PUBLIC_IP"
echo ""

if [ "$NO_WAIT" = "true" ]; then
  echo "SSH:"
  echo "  ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP"
  echo ""
  echo "Startup logs:"
  echo "  ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP 'tail -f /var/log/baram-startup.log'"
  echo ""
  echo "Health check (after ~3 minutes):"
  echo "  curl http://$PUBLIC_IP:3000/health"
  exit 0
fi

# Wait for TEE to be ready
echo "Waiting for TEE to be ready (this takes ~3-5 minutes)..."
echo "You can monitor progress with:"
echo "  ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP 'tail -f /var/log/baram-startup.log'"
echo ""

MAX_ATTEMPTS=30  # 5 minutes (30 * 10 seconds)
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))

  # Try health check
  HEALTH=$(curl -sf "http://$PUBLIC_IP:3000/health" 2>/dev/null || echo "")

  if [ -n "$HEALTH" ]; then
    echo ""
    echo "=========================================="
    echo "  Baram TEE Ready!"
    echo "=========================================="
    echo ""
    echo "Instance ID: $INSTANCE_ID"
    echo "Public IP:   $PUBLIC_IP"
    echo ""
    echo "Health Status:"
    echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
    echo ""
    echo "Test prompt (direct):"
    echo "  curl -X POST http://$PUBLIC_IP:3000/execute -H 'Content-Type: application/json' -d '{\"prompt\":\"Hello\",\"model\":\"llama-3.2-3b-local\"}'"
    echo ""
    echo "Update executor endpoint (nginx proxy + on-chain):"
    echo "  ./scripts/update-executor.sh $PUBLIC_IP"
    echo ""
    echo "After update, HTTPS endpoint:"
    echo "  curl https://tee.baram.nasun.io/health"
    echo ""
    echo "IMPORTANT: When done, terminate the instance:"
    echo "  ./scripts/terminate-spot.sh"
    exit 0
  fi

  printf "."
  sleep 10
done

echo ""
echo "=========================================="
echo "  Instance launched but health check timed out"
echo "=========================================="
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP:   $PUBLIC_IP"
echo ""
echo "The instance is running but the TEE may still be initializing."
echo "Check startup logs:"
echo "  ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP 'tail -100 /var/log/baram-startup.log'"
echo ""
echo "Manual health check:"
echo "  curl http://$PUBLIC_IP:3000/health"
