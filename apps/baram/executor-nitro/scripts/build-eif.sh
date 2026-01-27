#!/bin/bash
# Build Enclave Image Format (EIF) for AWS Nitro Enclave
#
# Prerequisites:
# - AWS Nitro CLI installed (amazon-linux-extras install aws-nitro-enclaves-cli)
# - Docker installed and running
#
# Usage: ./scripts/build-eif.sh [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"
OUTPUT_DIR="$PROJECT_DIR/eif"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  Baram Enclave EIF Builder"
echo "=========================================="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check for nitro-cli
if ! command -v nitro-cli &> /dev/null; then
    echo -e "${YELLOW}Warning: nitro-cli not found${NC}"
    echo "This is only available on Nitro-enabled EC2 instances"
    echo "Building Docker image only..."
    NITRO_CLI_AVAILABLE=false
else
    NITRO_CLI_AVAILABLE=true
fi

# Parse arguments
NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
    NO_CACHE="--no-cache"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Step 1: Build Docker image
echo ""
echo -e "${GREEN}Step 1: Building Docker image...${NC}"
echo ""

cd "$PROJECT_DIR"
docker build $NO_CACHE -f "$DOCKER_DIR/Dockerfile.nitro" -t baram-enclave:nitro .

echo ""
echo -e "${GREEN}Docker image built: baram-enclave:nitro${NC}"

# Step 2: Build EIF (if nitro-cli available)
if [[ "$NITRO_CLI_AVAILABLE" == true ]]; then
    echo ""
    echo -e "${GREEN}Step 2: Building EIF...${NC}"
    echo ""

    EIF_FILE="$OUTPUT_DIR/baram-enclave.eif"

    nitro-cli build-enclave \
        --docker-uri baram-enclave:nitro \
        --output-file "$EIF_FILE"

    echo ""
    echo -e "${GREEN}EIF built: $EIF_FILE${NC}"

    # Step 3: Display EIF measurements
    echo ""
    echo -e "${GREEN}Step 3: EIF Measurements (PCR values)${NC}"
    echo ""
    echo "These values should be recorded for attestation verification:"
    echo ""

    nitro-cli describe-eif --eif-file "$EIF_FILE"

    # Save measurements to file
    nitro-cli describe-eif --eif-file "$EIF_FILE" > "$OUTPUT_DIR/measurements.json"
    echo ""
    echo "Measurements saved to: $OUTPUT_DIR/measurements.json"
else
    echo ""
    echo -e "${YELLOW}Step 2: Skipping EIF build (nitro-cli not available)${NC}"
    echo "To build EIF, run this script on a Nitro-enabled EC2 instance"
fi

echo ""
echo "=========================================="
echo "  Build Complete"
echo "=========================================="
echo ""
echo "Docker image: baram-enclave:nitro"
if [[ "$NITRO_CLI_AVAILABLE" == true ]]; then
    echo "EIF file:     $OUTPUT_DIR/baram-enclave.eif"
    echo "Measurements: $OUTPUT_DIR/measurements.json"
fi
echo ""
