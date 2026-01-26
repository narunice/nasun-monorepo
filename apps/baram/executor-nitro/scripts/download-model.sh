#!/bin/bash
#
# Download LLM model for Baram Enclave
#
# This script downloads a quantized Llama model for running inside the TEE.
# The model must be included in the Docker image for Nitro Enclave deployment.
#
# Usage: ./scripts/download-model.sh [model-size]
#   model-size: 3b (default), 1b
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODEL_DIR="$PROJECT_DIR/models"

MODEL_SIZE="${1:-3b}"

# Model configurations
case "$MODEL_SIZE" in
  3b)
    MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
    MODEL_FILE="llama-3.2-3b-instruct-q4_k_m.gguf"
    EXPECTED_SIZE=2000000000  # ~2GB
    ;;
  1b)
    MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
    MODEL_FILE="llama-3.2-1b-instruct-q4_k_m.gguf"
    EXPECTED_SIZE=800000000   # ~800MB
    ;;
  *)
    echo "Error: Unknown model size '$MODEL_SIZE'"
    echo "Supported sizes: 3b, 1b"
    exit 1
    ;;
esac

echo "========================================"
echo "  Baram Model Downloader"
echo "========================================"
echo "Model: Llama 3.2 ${MODEL_SIZE^^} Instruct (Q4_K_M)"
echo "Target: $MODEL_DIR/$MODEL_FILE"
echo ""

# Create model directory
mkdir -p "$MODEL_DIR"

# Check if model already exists
if [ -f "$MODEL_DIR/$MODEL_FILE" ]; then
  SIZE=$(stat -c%s "$MODEL_DIR/$MODEL_FILE" 2>/dev/null || stat -f%z "$MODEL_DIR/$MODEL_FILE" 2>/dev/null || echo "0")
  if [ "$SIZE" -gt "$EXPECTED_SIZE" ]; then
    echo "Model already exists: $MODEL_DIR/$MODEL_FILE ($SIZE bytes)"
    echo "To re-download, delete the file first."
    exit 0
  else
    echo "Existing file appears incomplete ($SIZE bytes), re-downloading..."
    rm -f "$MODEL_DIR/$MODEL_FILE"
  fi
fi

# Download model
echo "Downloading model (this may take several minutes)..."
echo "URL: $MODEL_URL"
echo ""

if command -v curl &> /dev/null; then
  curl -L --progress-bar -o "$MODEL_DIR/$MODEL_FILE" "$MODEL_URL"
elif command -v wget &> /dev/null; then
  wget -q --show-progress -O "$MODEL_DIR/$MODEL_FILE" "$MODEL_URL"
else
  echo "Error: Neither curl nor wget found. Please install one of them."
  exit 1
fi

# Verify download
SIZE=$(stat -c%s "$MODEL_DIR/$MODEL_FILE" 2>/dev/null || stat -f%z "$MODEL_DIR/$MODEL_FILE" 2>/dev/null || echo "0")
if [ "$SIZE" -lt "$EXPECTED_SIZE" ]; then
  echo ""
  echo "Warning: Downloaded file seems too small ($SIZE bytes)"
  echo "Expected at least $EXPECTED_SIZE bytes"
  echo "The download may have failed. Please check your connection and try again."
  exit 1
fi

echo ""
echo "========================================"
echo "  Download Complete!"
echo "========================================"
echo "Model: $MODEL_DIR/$MODEL_FILE"
echo "Size: $(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "$SIZE bytes")"
echo ""
echo "Next steps:"
echo "  1. Build Docker image: docker build -f docker/Dockerfile.nitro -t baram-enclave:local-llm .."
echo "  2. Run locally: docker run -it --rm -e USE_LOCAL_LLM=true -p 5050:5050 baram-enclave:local-llm"
echo ""
