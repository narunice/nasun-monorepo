#!/bin/bash
# Baram TEE Spot Instance 종료
# Usage: ./terminate-spot.sh [INSTANCE_ID]
set -e

INSTANCE_ID=${1:-}

if [ -z "$INSTANCE_ID" ]; then
  # Find by tag if no instance ID provided
  echo "Looking for running baram-tee-dev instance..."
  INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=baram-tee-dev" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null)
fi

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "No running baram-tee-dev instance found"
  echo ""
  echo "To terminate a specific instance:"
  echo "  ./terminate-spot.sh <INSTANCE_ID>"
  exit 0
fi

# Get instance details
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text 2>/dev/null)

echo "==========================================="
echo "  Terminate Spot Instance"
echo "==========================================="
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP:   $PUBLIC_IP"
echo ""

read -p "Are you sure you want to terminate? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Terminating instance..."
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"

  echo ""
  echo "Instance termination initiated."
  echo "EBS volume will be deleted automatically (DeleteOnTermination=true)"
else
  echo "Cancelled"
fi
