#!/bin/bash
# EC2 Instance Setup for Nitro Enclave Testing
#
# This script sets up a fresh EC2 instance for running Baram Enclave.
# Run this on a Nitro-enabled EC2 instance (c5a.xlarge or similar).
#
# Instance requirements:
# - Instance type: c5a.xlarge (or other Nitro Enclave-enabled type)
# - AMI: Amazon Linux 2 or Amazon Linux 2023
# - Nitro Enclave enabled in instance settings
#
# Usage: curl -sSL https://raw.githubusercontent.com/.../setup-ec2.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  Baram EC2 Setup for Nitro Enclave"
echo "=========================================="
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}Warning: Running as root. Creating non-root user...${NC}"
fi

# Step 1: System updates
echo ""
echo -e "${GREEN}Step 1: System updates...${NC}"
sudo yum update -y

# Step 2: Install Nitro Enclaves CLI
echo ""
echo -e "${GREEN}Step 2: Installing Nitro Enclaves CLI...${NC}"

if command -v amazon-linux-extras &> /dev/null; then
    # Amazon Linux 2
    sudo amazon-linux-extras install aws-nitro-enclaves-cli -y
    sudo yum install aws-nitro-enclaves-cli-devel -y
else
    # Amazon Linux 2023
    sudo yum install aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel -y
fi

# Step 3: Install Docker
echo ""
echo -e "${GREEN}Step 3: Installing Docker...${NC}"

if command -v amazon-linux-extras &> /dev/null; then
    sudo amazon-linux-extras install docker -y
else
    sudo yum install docker -y
fi

sudo systemctl enable docker
sudo systemctl start docker

# Step 4: Configure user permissions
echo ""
echo -e "${GREEN}Step 4: Configuring user permissions...${NC}"

# Add user to docker and ne groups
sudo usermod -aG docker $USER
sudo usermod -aG ne $USER

# Step 5: Configure Nitro Enclave allocator
echo ""
echo -e "${GREEN}Step 5: Configuring Nitro Enclave allocator...${NC}"

# Create allocator config
sudo mkdir -p /etc/nitro_enclaves
sudo tee /etc/nitro_enclaves/allocator.yaml > /dev/null <<EOF
# Enclave resource allocation
# CPU: 2 vCPUs reserved for Enclave
# Memory: 4GB reserved for Enclave
memory_mib: 4096
cpu_count: 2
EOF

# Enable and start allocator
sudo systemctl enable nitro-enclaves-allocator
sudo systemctl start nitro-enclaves-allocator

# Step 6: Install Node.js
echo ""
echo -e "${GREEN}Step 6: Installing Node.js 20.x...${NC}"

# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Step 7: Install additional tools
echo ""
echo -e "${GREEN}Step 7: Installing additional tools...${NC}"

sudo yum install -y git jq

# Step 8: Verify installation
echo ""
echo -e "${GREEN}Step 8: Verifying installation...${NC}"
echo ""

echo "Docker version:"
docker --version

echo ""
echo "Nitro CLI version:"
nitro-cli --version

echo ""
echo "Node.js version:"
node --version

echo ""
echo "Enclave allocator status:"
sudo systemctl status nitro-enclaves-allocator --no-pager || true

# Step 9: Test Nitro Enclave
echo ""
echo -e "${GREEN}Step 9: Testing Nitro Enclave...${NC}"
echo ""

# Check if Nitro is available
if nitro-cli describe-enclaves &> /dev/null; then
    echo -e "${GREEN}Nitro Enclave is available!${NC}"
    nitro-cli describe-enclaves
else
    echo -e "${RED}Warning: Nitro Enclave might not be enabled on this instance${NC}"
    echo "Make sure you launched the instance with Nitro Enclave enabled"
fi

echo ""
echo "=========================================="
echo "  Setup Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Log out and log back in (for group changes to take effect)"
echo ""
echo "2. Clone the repository:"
echo "   git clone <repo-url>"
echo "   cd nasun-monorepo/apps/baram/executor-nitro"
echo ""
echo "3. Install dependencies:"
echo "   npm install"
echo ""
echo "4. Build the EIF:"
echo "   ./scripts/build-eif.sh"
echo ""
echo "5. Run the Enclave:"
echo "   ./scripts/run-enclave.sh"
echo ""
echo "6. Run the Host (in another terminal):"
echo "   OPENAI_API_KEY=sk-... ENCLAVE_CID=<cid> USE_VSOCK=true node dist/host/main.js"
echo ""

# Reminder to log out
echo -e "${YELLOW}IMPORTANT: Please log out and log back in for group changes to take effect!${NC}"
echo ""
