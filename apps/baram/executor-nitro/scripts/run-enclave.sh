#!/bin/bash
# Run Baram Enclave on AWS Nitro
#
# Prerequisites:
# - Nitro Enclave enabled EC2 instance (r6i.xlarge or similar)
# - EIF file built: ./scripts/build-eif.sh
# - nitro-enclaves-allocator configured (14GB memory)
#
# Usage: ./scripts/run-enclave.sh [--debug] [--background] [--force]
#   --debug      Enable debug mode (attach to console)
#   --background Run in background (for automation)
#   --force      Terminate existing enclaves without prompt

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EIF_FILE="$PROJECT_DIR/eif/baram-enclave.eif"

# Enclave resource configuration (14GB for Local LLM)
ENCLAVE_CPU=2
ENCLAVE_MEMORY=14336  # 14GB for Llama 3.2 3B model

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  Baram Enclave Runner"
echo "=========================================="
echo ""

# Check for nitro-cli
if ! command -v nitro-cli &> /dev/null; then
    echo -e "${RED}Error: nitro-cli not found${NC}"
    echo "This script must be run on a Nitro-enabled EC2 instance"
    exit 1
fi

# Check for EIF file
if [[ ! -f "$EIF_FILE" ]]; then
    echo -e "${RED}Error: EIF file not found: $EIF_FILE${NC}"
    echo "Run ./scripts/build-eif.sh first"
    exit 1
fi

# Parse arguments
DEBUG_MODE=""
BACKGROUND_MODE=""
FORCE_MODE=""

for arg in "$@"; do
    case $arg in
        --debug)
            DEBUG_MODE="--debug-mode"
            echo -e "${YELLOW}Debug mode enabled${NC}"
            ;;
        --background)
            BACKGROUND_MODE="true"
            echo -e "${YELLOW}Background mode enabled${NC}"
            ;;
        --force)
            FORCE_MODE="true"
            echo -e "${YELLOW}Force mode enabled${NC}"
            ;;
    esac
done

# Check if enclave is already running
RUNNING_ENCLAVES=$(nitro-cli describe-enclaves | jq -r '.[].EnclaveID' 2>/dev/null || echo "")

if [[ -n "$RUNNING_ENCLAVES" ]]; then
    echo -e "${YELLOW}Warning: Enclave(s) already running:${NC}"
    echo "$RUNNING_ENCLAVES"
    echo ""

    if [[ "$FORCE_MODE" == "true" ]]; then
        # Force mode: terminate without prompt
        for eid in $RUNNING_ENCLAVES; do
            echo "Terminating enclave: $eid"
            nitro-cli terminate-enclave --enclave-id "$eid"
        done
    else
        # Interactive prompt
        read -p "Terminate existing enclave(s)? [y/N] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            for eid in $RUNNING_ENCLAVES; do
                echo "Terminating enclave: $eid"
                nitro-cli terminate-enclave --enclave-id "$eid"
            done
        else
            echo "Exiting..."
            exit 0
        fi
    fi
fi

# Start the enclave
echo ""
echo -e "${GREEN}Starting Enclave...${NC}"
echo ""
echo "EIF:    $EIF_FILE"
echo "CPU:    $ENCLAVE_CPU vCPUs"
echo "Memory: $ENCLAVE_MEMORY MB ($(( ENCLAVE_MEMORY / 1024 )) GB)"
echo ""

ENCLAVE_ID=$(nitro-cli run-enclave \
    --eif-path "$EIF_FILE" \
    --cpu-count $ENCLAVE_CPU \
    --memory $ENCLAVE_MEMORY \
    $DEBUG_MODE \
    | jq -r '.EnclaveID')

if [[ -z "$ENCLAVE_ID" || "$ENCLAVE_ID" == "null" ]]; then
    echo -e "${RED}Error: Failed to start enclave${NC}"
    exit 1
fi

echo -e "${GREEN}Enclave started!${NC}"
echo ""
echo "Enclave ID: $ENCLAVE_ID"

# Get enclave info
echo ""
echo "Enclave Info:"
nitro-cli describe-enclaves | jq ".[] | select(.EnclaveID == \"$ENCLAVE_ID\")"

# Get CID for vsock communication
ENCLAVE_CID=$(nitro-cli describe-enclaves | jq -r ".[] | select(.EnclaveID == \"$ENCLAVE_ID\") | .EnclaveCID")

echo ""
echo "=========================================="
echo "  Enclave Running"
echo "=========================================="
echo ""
echo "Enclave ID:  $ENCLAVE_ID"
echo "Enclave CID: $ENCLAVE_CID"
echo ""

# In background mode, just print info and exit
if [[ "$BACKGROUND_MODE" == "true" ]]; then
    echo "Running in background mode."
    echo ""
    echo "To check status:"
    echo "  nitro-cli describe-enclaves"
    echo ""
    echo "To view console (debug mode only):"
    echo "  nitro-cli console --enclave-id $ENCLAVE_ID"
    echo ""
    exit 0
fi

echo "To connect from Host:"
echo "  export ENCLAVE_CID=$ENCLAVE_CID"
echo "  export USE_VSOCK=true"
echo "  node dist/host/main.js"
echo ""
echo "To view console output (debug mode only):"
echo "  nitro-cli console --enclave-id $ENCLAVE_ID"
echo ""
echo "To terminate:"
echo "  nitro-cli terminate-enclave --enclave-id $ENCLAVE_ID"
echo ""

# If debug mode (and not background), attach to console
if [[ -n "$DEBUG_MODE" && "$BACKGROUND_MODE" != "true" ]]; then
    echo "Attaching to enclave console (Ctrl+C to detach)..."
    nitro-cli console --enclave-id "$ENCLAVE_ID"
fi
