# Baram TEE Spot Instance - Operations Guide

Spot instance launch, configuration, and on-chain update procedures for the Baram TEE Executor.

Last updated: 2026-01-30

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Launch](#launch)
4. [Post-launch Checklist](#post-launch-checklist)
5. [On-chain Updates](#on-chain-updates)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)
8. [Teardown](#teardown)
9. [Known Issues](#known-issues)
10. [Reference](#reference)

---

## Overview

The Baram TEE Executor runs on an AWS EC2 spot instance with Nitro Enclave support.
Each spot instance gets a **new public IP** on every launch (or re-launch after termination).
This means several on-chain records and environment variables must be updated each time.

**Architecture:**

```
[Frontend] --> HTTP :3000 --> [Host (EC2)] -- vsock CID 16:5050 --> [Enclave (Nitro)]
                                  |
                              [Sui RPC] <-- settlement TX
```

**Key facts:**

- Instance type: `r6i.xlarge` (4 vCPU, 32GB RAM)
- Enclave allocation: 2 vCPU, 14GB RAM (for Llama 3.2 3B model)
- Max spot price: $0.10/hr
- AMI: Pre-built with Docker, nitro-cli, nvm, model weights
- SSH key: `baram-nitro` (`~/.ssh/baram-nitro.pem`)

---

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **SSH key** `~/.ssh/baram-nitro.pem` available locally
3. **Nasun CLI** at `/home/naru/my_apps/nasun-devnet/sui/target/release/sui`
4. **AMI** created and ID recorded in `.env.ami`
5. **Security group** `sg-0c0b595fb9b4f83ec` allowing inbound TCP 22 (SSH) and 3000 (HTTP)

---

## Launch

### Option A: Automated (launch-spot.sh)

```bash
cd apps/baram/executor-nitro
bash scripts/launch-spot.sh
```

The script:
1. Reads config from `.env.ami`
2. Launches a spot instance with the pre-built AMI
3. Runs user-data script on boot (clone repo, build, start enclave + host)
4. Waits for health check to pass (~3-5 min)

Use `--no-wait` to skip health check polling:

```bash
bash scripts/launch-spot.sh --no-wait
```

### Option B: Manual

```bash
# 1. Launch instance via AWS Console or CLI
aws ec2 run-instances \
  --image-id ami-0488cb25dd63317af \
  --instance-type r6i.xlarge \
  --key-name baram-nitro \
  --security-group-ids sg-0c0b595fb9b4f83ec \
  --instance-market-options '{"MarketType":"spot","SpotOptions":{"MaxPrice":"0.10","SpotInstanceType":"one-time"}}' \
  --enclave-options 'Enabled=true' \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":50,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=baram-tee-dev}]'

# 2. SSH into instance
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<NEW_IP>

# 3. On the instance: build and start
cd ~/nasun-monorepo/apps/baram/executor-nitro
git pull origin main
npm ci && npm run build
./scripts/build-eif.sh
./scripts/run-enclave.sh --force --background
```

---

## Post-launch Checklist

### Step 1: Note the Instance Details

- [ ] Instance ID: `i-xxxxxxxxxxxxxxxxx`
- [ ] Public IP: `x.x.x.x`

```bash
# Find instance IP by tag
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=baram-tee-dev" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].[InstanceId,PublicIpAddress]' \
  --output text
```

### Step 2: Verify .env on Instance

SSH into the instance and ensure `.env` has all required settlement variables:

```bash
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<NEW_IP>
cat ~/nasun-monorepo/apps/baram/executor-nitro/.env
```

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `SUI_RPC_URL` | Nasun devnet RPC | `https://rpc.devnet.nasun.io` |
| `BARAM_PACKAGE_ID` | Baram escrow contract | `0x...` |
| `BARAM_REGISTRY_ID` | BaramRegistry shared object | `0x...` |
| `EXECUTOR_PRIVATE_KEY` | Executor wallet private key (suiprivkey) | `suiprivkey1q...` |
| `COMPLIANCE_PACKAGE_ID` | ECR compliance contract | `0x...` |
| `COMPLIANCE_REGISTRY_ID` | ComplianceRegistry shared object | `0x...` |
| `EXECUTOR_REGISTRY_ID` | ExecutorRegistry shared object | `0x...` |
| `ATTESTATION_REGISTRY_ID` | AttestationRegistry shared object | `0x...` |
| `ATTESTATION_PACKAGE_ID` | Attestation contract | `0x...` |
| `STAKING_REGISTRY_ID` | StakingRegistry shared object | `0x...` |
| `TIER_REGISTRY_ID` | TierRegistry shared object | `0x...` |

> **IMPORTANT**: The .env file is NOT auto-loaded by `dotenv`. The systemd service loads it
> via `EnvironmentFile=`. For manual startup, you must source it yourself (see Step 4).
> The .env is gitignored, so it must already exist on the instance (baked into the AMI
> or manually copied). If the repo is freshly cloned, copy .env from a backup or
> fill in `.env.example`.

### Step 3: Verify Enclave is Running

```bash
# Check enclave status
sudo nitro-cli describe-enclaves

# Should show State: RUNNING, EnclaveCID: 16 (typically)
```

If enclave is not running:

```bash
./scripts/run-enclave.sh --force --background
```

### Step 4: Start Host Process

**Option A: systemd (recommended for production)**

```bash
# systemd loads .env via EnvironmentFile + sets USE_VSOCK/ENCLAVE_CID
# Settlement is enabled as long as .env exists with all required vars
sudo cp scripts/baram-host.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start baram-host
journalctl -u baram-host -f
```

**Option B: Manual (for dev/debug)**

```bash
cd ~/nasun-monorepo/apps/baram/executor-nitro

# Source .env into current shell (includes USE_VSOCK, ENCLAVE_CID)
set -a && source .env && set +a

# Start Host
node dist/host/main.js
```

**Critical notes:**
- Entry point is `dist/host/main.js` (NOT `dist/host/server.js`)
  - `server.js` only exports `startServer()` — it does not call it
  - `main.js` connects to the Enclave, then calls `startServer()`
- `USE_VSOCK=true` is REQUIRED on Nitro instances (without it, Host tries TCP which fails)
- `ENCLAVE_CID=16` is the default CID assigned by Nitro

### Step 5: Health Check

```bash
curl http://localhost:3000/health
# Expected: {"host":"healthy","enclave":"healthy","version":"1.3.0",...}

# From outside the instance:
curl http://<NEW_IP>:3000/health
```

- [ ] Host healthy
- [ ] Enclave healthy

---

## On-chain Updates

### A. Update Executor Endpoint URL (CRITICAL)

The frontend reads `endpoint_url` from on-chain ExecutorRegistry to connect to the TEE.
A new spot instance means a new IP, so this MUST be updated.

**Use the helper script:**

```bash
# From local machine (not the instance)
cd apps/baram/executor-nitro
bash scripts/update-executor.sh <NEW_IP>
```

This updates the **frontend registry** (`0xeaac739...`).

**Manual update (both registries):**

There are **two** ExecutorRegistry objects (see Known Issues). Both should be updated.

```bash
# 1. Frontend registry (the one the UI reads from)
nasun client call \
  --package 0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5 \
  --module executor \
  --function update_executor \
  --args \
    0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7 \
    0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b \
    0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90 \
    '"Nasun TEE Executor"' \
    '"http://<NEW_IP>:3000"' \
    '["llama-3.2-3b","llama-3.2-3b-local"]' \
    true \
  --gas-budget 100000000

# 2. devnet-ids registry (used by Host for settlement)
nasun client call \
  --package 0xac09c1d6540e29454ee98bc18a5fa8f29b1c343153c8edf7dd92edd296f2d1ff \
  --module executor \
  --function update_executor \
  --args \
    0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089 \
    0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
    0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90 \
    '"Nasun TEE Executor"' \
    '"http://<NEW_IP>:3000"' \
    '["llama-3.2-3b","llama-3.2-3b-local"]' \
    true \
  --gas-budget 100000000
```

**Operator address:** `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90`

### B. Check PCR Baseline

Every EIF rebuild produces **new PCR0/PCR1/PCR2 values**. If code or dependencies changed
since the last AMI, the PCR values will differ.

```bash
# On the instance:
sudo nitro-cli describe-enclaves | jq '.[].Measurements'
```

Compare PCR0 with the active on-chain baseline. If they differ, register a new baseline:

```bash
# Register new baseline (bump version number)
nasun client call \
  --package <ATTESTATION_PACKAGE_ID> \
  --module attestation_registry \
  --function register_baseline \
  --args \
    <ADMIN_CAP> \
    <REGISTRY_ID> \
    <VERSION_NUMBER> \
    1 \
    <PCR0_HEX_AS_VECTOR_BYTES> \
    <PCR1_HEX_AS_VECTOR_BYTES> \
    <PCR2_HEX_AS_VECTOR_BYTES> \
    <DESCRIPTION_HEX_AS_VECTOR_BYTES> \
    0x6 \
  --gas-budget 100000000

# Activate the new baseline
nasun client call \
  --package <ATTESTATION_PACKAGE_ID> \
  --module attestation_registry \
  --function activate_baseline \
  --args <ADMIN_CAP> <REGISTRY_ID> <VERSION_NUMBER> \
  --gas-budget 100000000
```

**Current values (as of 2026-01-30):**

| Field | Value |
|-------|-------|
| Attestation Package | `0xc7ede9327e5179ed17f16eb2aa4efeee2e8b8c3dba7d34f3c1dcf3a5daad7ed0` |
| Attestation Registry | `0xf05cffcd59ac97f3f4220dc956f1f0edc2b78e5c82e0ca19b62daacaa1e4f403` |
| Attestation AdminCap | `0x3bedf33f6c35bd2f4e32822e94f8b2f14ab5b5b4c117e6beed02a74f2e1a1e27` |
| Active PCR0 (baseline v3) | `3ee63e5c4001f182db6f5a1f0ebdd07154880a9e58c25697e65d085c7ce9e522891595d3de69abada655ebe09fd18285` |

---

## Verification

### 1. Health Check

```bash
curl http://<NEW_IP>:3000/health
```

### 2. Verify Executor Endpoint On-chain

```bash
# Check the frontend registry's dynamic field for the executor
curl -s -X POST https://rpc.devnet.nasun.io \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"suix_getDynamicFieldObject",
    "params":[
      "0xe74b2b336b96b8634ded977d3c861197d4b73d435bf784e71923af4996620056",
      {"type":"address","value":"0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90"}
    ]
  }' | jq '.result.data.content.fields.value.fields.endpoint_url'
# Expected: "http://<NEW_IP>:3000"
```

### 3. Test TEE Inference

```bash
curl -X POST http://<NEW_IP>:3000/execute \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hello","model":"llama-3.2-3b-local"}'
```

### 4. Frontend Verification

- [ ] Select "Llama 3.2 3B (TEE)" model in model selector
- [ ] Attestation status shows "TEE Verified" (not "No TEE Protection")
- [ ] Submit a prompt and verify Audit Trail shows:
  - PCR Verified: Yes
  - Tier: Bronze (or higher)
  - Reputation: 1000/1000
  - TX Digest present

---

## Troubleshooting

### Host fails to start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'dist/host/main.js'` | TypeScript not built | `npm run build` or `npx tsc` |
| `Connecting to Enclave via TCP` | Missing `USE_VSOCK=true` | `export USE_VSOCK=true` |
| `Connection refused` on vsock | Enclave not running | `./scripts/run-enclave.sh --force --background` |
| `Settlement disabled` | .env not sourced | `set -a && source .env && set +a` |
| Wrong entry point | Using `server.js` | Use `main.js` instead |

### Attestation fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| PCR Verified: No | PCR0 doesn't match on-chain baseline | Register new baseline (Section B) |
| Certificate chain failed | Outdated `attestation.ts` | `git pull && npm run build` on instance |
| `require is not defined` | Old ESM bug in attestation.ts | Pull latest code (fixed in commit `5a03dfb`) |

### Frontend shows "No TEE Protection"

1. Check model selection: must be `llama-3.2-3b-local` (provider: `tee`)
2. Check executor's `teeType` is > 0 on-chain
3. Check executor's `supportedModels` includes `llama-3.2-3b-local`
4. If the Lambda executor (teeType=0) is being selected instead, the TEE executor's
   `supportedModels` may not include the selected model ID

### Frontend shows old IP / connection timeout

1. The on-chain `endpoint_url` was not updated (see Section A)
2. **IMPORTANT**: There are TWO registries. The frontend reads from `0xeaac739...`
3. Hard refresh the frontend (Ctrl+Shift+R) after updating on-chain
4. Verify with the RPC query in Verification section

---

## Teardown

### Terminate Instance

```bash
# Automated (finds instance by tag)
bash scripts/terminate-spot.sh

# Manual
aws ec2 terminate-instances --instance-ids <INSTANCE_ID>
```

EBS volume is auto-deleted (`DeleteOnTermination=true`).

### Save Important Data Before Termination

- Host logs: `journalctl -u baram-host > /tmp/host-logs.txt`
- Startup logs: `/var/log/baram-startup.log`
- PCR measurements: `sudo nitro-cli describe-enclaves | jq '.[].Measurements'`

---

## Known Issues

### Dual ExecutorRegistry (2026-01-30)

Two ExecutorRegistry objects exist on-chain due to a V6 chain reset where the
frontend `.env` was not updated to match `devnet-ids.json`.

| Registry | Package ID | Registry ID | Used by |
|----------|-----------|-------------|---------|
| Frontend | `0xbc29ac03...` | `0xeaac739...` | Frontend UI (useExecutors hook) |
| devnet-ids | `0xac09c1d6...` | `0xcb694425...` | devnet-ids.json, Host settlement |

**Impact**: If you only update one registry, either the frontend or settlement will use the old IP.

**TODO**: Consolidate to a single registry.

### PCR0 Changes on Every EIF Rebuild

Any change to source code, npm dependencies, Docker base image, or model weights
produces a different EIF hash and PCR0. Always check PCR0 after building a new EIF
and register a new on-chain baseline if it changed.

### Spot Instance Termination

AWS can reclaim spot instances with 2 minutes notice. The instance ID and IP will change.
Save logs and note the PCR values before they are lost.

### .env is Gitignored

The `.env` file (containing private key and contract IDs) is not tracked in git.
It must be present on the instance for settlement to work. The current AMI
(`ami-0488cb25dd63317af`) has `.env` baked in. If the repo is freshly cloned
(not just `git pull`), you must copy `.env` from a backup or fill in `.env.example`.

---

## Reference

### Scripts

| Script | Description |
|--------|-------------|
| `scripts/launch-spot.sh` | Launch spot instance with AMI |
| `scripts/terminate-spot.sh` | Terminate running spot instance |
| `scripts/build-eif.sh` | Build EIF from Docker image |
| `scripts/run-enclave.sh` | Start Nitro Enclave |
| `scripts/update-executor.sh` | Update executor endpoint on-chain (both registries) |
| `scripts/create-ami.sh` | Create AMI from running instance |
| `scripts/setup-ec2.sh` | Initial EC2 environment setup |
| `scripts/download-model.sh` | Download LLM model weights |

### Configuration Files

| File | Description |
|------|-------------|
| `.env.ami` | AMI ID, instance type, security group |
| `.env` | Settlement variables (contract IDs, private key) |
| `scripts/baram-host.service` | systemd unit file |

### On-chain Contract IDs

See `packages/devnet-config/devnet-ids.json` for all contract addresses.

Key IDs for executor operations:

| Contract | ID Source |
|----------|-----------|
| Frontend ExecutorRegistry | `0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b` |
| Frontend Executor Package | `0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5` |
| Frontend AdminCap | `0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7` |
| AttestationRegistry | `0xf05cffcd59ac97f3f4220dc956f1f0edc2b78e5c82e0ca19b62daacaa1e4f403` |
| Attestation Package | `0xc7ede9327e5179ed17f16eb2aa4efeee2e8b8c3dba7d34f3c1dcf3a5daad7ed0` |
| Executor Operator | `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90` |
