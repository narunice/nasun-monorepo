# Baram TEE Spot Instance - Operations Guide

Spot instance launch, configuration, and on-chain update procedures for the Baram TEE Executor.

Last updated: 2026-01-31

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

## Post-launch Checklist (New Instance)

> Use this when launching a **new** spot instance (new IP).
> For deploying code to an **existing** instance, see [Code Deployment Checklist](#code-deployment-checklist).

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
ls -la ~/nasun-monorepo/apps/baram/executor-nitro/.env || echo "WARNING: .env missing!"
```

If `.env` is missing, recreate it (see [Known Issues: .env is Gitignored](#env-is-gitignored--lost-after-git-pull)).

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `SUI_RPC_URL` | Nasun devnet RPC | `https://rpc.devnet.nasun.io` |
| `BARAM_PACKAGE_ID` | Baram escrow contract | `0x...` |
| `BARAM_REGISTRY_ID` | BaramRegistry shared object | `0x...` |
| `EXECUTOR_PRIVATE_KEY` | Executor wallet private key (hex) | `edbc170c...` |
| `COMPLIANCE_PACKAGE_ID` | ECR compliance contract | `0x...` |
| `COMPLIANCE_REGISTRY_ID` | ComplianceRegistry shared object | `0x...` |
| `EXECUTOR_REGISTRY_ID` | ExecutorRegistry shared object | `0x...` |
| `ATTESTATION_REGISTRY_ID` | AttestationRegistry shared object | `0x...` |
| `ATTESTATION_PACKAGE_ID` | Attestation contract | `0x...` |
| `STAKING_REGISTRY_ID` | StakingRegistry shared object | `0x...` |
| `TIER_REGISTRY_ID` | TierRegistry shared object | `0x...` |
| `EXECUTOR_PACKAGE_ID` | baram_executor package ID (v2) | `0x4b0e89...` |
| `PROCESSED_REQUESTS_ID` | ProcessedRequests shared object | `0xc68e22...` |
| `EXECUTOR_STAKE_ID` | ExecutorStake owned object (for tier refresh) | `0x...` |

> **IMPORTANT**: The .env file is NOT auto-loaded by `dotenv`. The systemd service loads it
> via `EnvironmentFile=`. For manual startup, you must source it yourself (see Step 4).
> The .env is gitignored, so it must already exist on the instance (baked into the AMI
> or manually copied). If missing, see Known Issues for recovery procedure.

### Step 3: Verify Enclave is Running

```bash
# Check enclave status
sudo nitro-cli describe-enclaves

# Should show State: RUNNING
# Note the EnclaveCID (default: 16, increments on re-create)
```

If enclave is not running:

```bash
./scripts/run-enclave.sh --force --background
```

### Step 4: Check Enclave CID Matches systemd Service

```bash
# Get current CID
CID=$(sudo nitro-cli describe-enclaves | jq -r '.[].EnclaveCID')
echo "Enclave CID: $CID"

# Check systemd service CID
grep ENCLAVE_CID /etc/systemd/system/baram-host.service

# If they don't match, update:
sudo sed -i "s/ENCLAVE_CID=[0-9]*/ENCLAVE_CID=$CID/" /etc/systemd/system/baram-host.service
sudo systemctl daemon-reload
```

### Step 5: Start Host Process

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
- `ENCLAVE_CID` must match the running Enclave's CID (check with `nitro-cli describe-enclaves`)

### Step 6: Verify Host Logs

```bash
sudo journalctl -u baram-host -n 15 --no-pager
```

- [ ] `Vsock connection established` — Enclave 연결 성공
- [ ] `Sui settlement enabled` — .env 로드 + 정산 활성화
- [ ] `Executor registration verified` — 온체인 등록 확인 (키 불일치 시 FATAL exit)
- [ ] `HTTP server listening on port 3000` — 서버 시작

> **WARNING**: `Sui config not provided, settlement disabled`가 보이면 .env가 없거나 불완전한 것.
> `Connection refused`가 보이면 CID mismatch 또는 Enclave 미실행.
> `[FATAL] Executor registration check failed`가 보이면 EXECUTOR_PRIVATE_KEY가 온체인 ExecutorRegistry에 등록된 주소와 불일치.

### Step 7: Health Check

```bash
curl http://localhost:3000/health
# Expected: {"host":"healthy","enclave":"healthy","version":"1.3.0",...}

# From outside the instance:
curl http://<NEW_IP>:3000/health
```

- [ ] Host healthy
- [ ] Enclave healthy

### Step 8: Update On-chain Executor Endpoint

New IP이므로 반드시 양쪽 registry를 업데이트 (Section A 참조):

```bash
# From local machine
cd apps/baram/executor-nitro
bash scripts/update-executor.sh <NEW_IP>
```

- [ ] Frontend registry (`0xeaac739...`) 업데이트됨
- [ ] devnet-ids registry (`0xcb694425...`) 업데이트됨

### Step 9: Check PCR0 Baseline

EIF가 다시 빌드되었다면 PCR0가 변경되었을 수 있음:

```bash
# On the instance:
PCR0=$(sudo nitro-cli describe-enclaves | jq -r '.[].Measurements.PCR0')
echo "Current PCR0: $PCR0"
```

Host 로그에서 baseline 매칭 확인:

```bash
sudo journalctl -u baram-host --no-pager | grep -E "PCR0|baseline|mismatch"
```

- [ ] PCR0가 온체인 baseline과 일치 (mismatch 없음)

**PCR0가 다르면** 새 baseline 등록 필요 (Section B 참조). 등록하지 않으면:
- Audit Trail에 Attestation: **Unverified** 표시
- Settlement TX가 MoveAbort(error 3)으로 실패 → **Pending** 상태 유지

### Step 10: Frontend E2E Verification

- [ ] Frontend에서 TEE 모델 선택
- [ ] 프롬프트 전송 → 응답 수신
- [ ] Audit Trail 확인:
  - Attestation: **Verified** (not Unverified)
  - PCR Verified: **Yes**
  - Settlement: **TX Digest 표시** (not Pending)
  - `[E2E] Response decrypted successfully` 콘솔 로그
- [ ] Phase F-2 검증 (PTB Call 3/4):
  - Host 로그에서 `record_job_completion` 호출 확인
  - On-chain ExecutorRegistry에서 reputation 변경 확인 (성공 시 +10)
  - `refresh_tier_from_state` 호출 확인 (ExecutorStake가 있는 경우)

---

## Code Deployment Checklist (Existing Instance)

> Use this when deploying new code to an **already running** spot instance.
> IP is unchanged, but code/EIF rebuild may affect CID, PCR0, and .env.

```bash
# SSH into instance
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP>
cd ~/nasun-monorepo/apps/baram/executor-nitro
```

### Step 1: Backup .env Before git pull

```bash
# .env is gitignored but verify it won't be lost
cp .env .env.backup 2>/dev/null
```

### Step 2: Pull Code and Rebuild

```bash
git pull origin main
npm ci && npm run build
```

### Step 3: Verify .env Still Exists

```bash
ls -la .env || echo "WARNING: .env missing! Restore from .env.backup"
# Restore if needed:
# cp .env.backup .env
```

- [ ] `.env` 파일 존재 확인

### Step 4: Rebuild EIF (if Enclave code changed)

```bash
# Stop old Enclave
sudo systemctl stop nitro-enclaves-allocator
sleep 2
sudo systemctl start nitro-enclaves-allocator

# Build new EIF
bash scripts/build-eif.sh

# Start new Enclave
bash scripts/run-enclave.sh --force --background
```

### Step 5: Check New Enclave CID

EIF를 다시 빌드하면 CID가 증가함 (16→17→18...):

```bash
CID=$(sudo nitro-cli describe-enclaves | jq -r '.[].EnclaveCID')
echo "New CID: $CID"

# Update systemd service if CID changed
sudo sed -i "s/ENCLAVE_CID=[0-9]*/ENCLAVE_CID=$CID/" /etc/systemd/system/baram-host.service
sudo systemctl daemon-reload
```

- [ ] systemd의 `ENCLAVE_CID`가 실제 CID와 일치

### Step 6: Restart Host and Verify Logs

```bash
sudo systemctl restart baram-host
sleep 3
sudo journalctl -u baram-host -n 15 --no-pager
```

- [ ] `Vsock connection established`
- [ ] `Sui settlement enabled`
- [ ] `Executor registration verified` (키 불일치 시 프로세스 자동 종료됨)
- [ ] `HTTP server listening on port 3000`

### Step 7: Check PCR0 Baseline (if EIF rebuilt)

```bash
PCR0=$(sudo nitro-cli describe-enclaves | jq -r '.[].Measurements.PCR0')
echo "Current PCR0: $PCR0"

# Check Host logs for PCR mismatch
sudo journalctl -u baram-host --no-pager | grep -i "mismatch"
```

PCR0가 변경되었으면 **로컬 머신에서** 새 baseline 등록 + 활성화:

```bash
# From local machine (not instance)
# 1. Convert PCR hex to vector<u8> format
python3 -c "
pcr0 = '<NEW_PCR0_HEX>'
print('[' + ','.join(str(int(pcr0[i:i+2], 16)) for i in range(0, len(pcr0), 2)) + ']')
"

# 2. Register baseline (bump version: current+1)
nasun client call \
  --package 0xc7ede9327e51942f9dadf8783e74b8e654b7639b05bd7bec5b3fad6b3bc1b0f3 \
  --module attestation_registry \
  --function register_baseline \
  --args \
    0x3bedf33f6c351573dd3f654f31b0efb449aac31bebe766106160d18b9ba3b238 \
    0xf05cffcd59ac6889eea1c8cd2b3ab76c05e313912bebc15c412759282c6f6b1b \
    <NEW_VERSION> 1 '<PCR0_VECTOR>' '<PCR1_VECTOR>' '<PCR2_VECTOR>' '<DESC_VECTOR>' 0x6 \
  --gas-budget 100000000

# 3. Activate baseline
nasun client call \
  --package 0xc7ede9327e51942f9dadf8783e74b8e654b7639b05bd7bec5b3fad6b3bc1b0f3 \
  --module attestation_registry \
  --function activate_baseline \
  --args \
    0x3bedf33f6c351573dd3f654f31b0efb449aac31bebe766106160d18b9ba3b238 \
    0xf05cffcd59ac6889eea1c8cd2b3ab76c05e313912bebc15c412759282c6f6b1b \
    <NEW_VERSION> \
  --gas-budget 100000000

# 4. Restart Host to load new baseline
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP> "sudo systemctl restart baram-host"
```

- [ ] PCR0가 온체인 baseline과 일치 (또는 새 baseline 등록 완료)

### Step 8: Frontend E2E Verification

- [ ] TEE 모델 선택 → 프롬프트 전송 → 응답 수신
- [ ] Audit Trail:
  - Attestation: **Verified**
  - Settlement: **TX Digest 표시** (not Pending)

### Quick Summary: 놓치기 쉬운 항목

| 항목 | 놓치면 발생하는 문제 | 확인 방법 |
|------|---------------------|-----------|
| `.env` 누락 | Settlement disabled (Pending) | `ls .env` |
| CID mismatch | Host가 Enclave에 연결 불가 | `nitro-cli describe-enclaves` vs systemd |
| PCR0 변경 미등록 | Attestation Unverified + Settlement MoveAbort | Host 로그에서 `mismatch` 검색 |
| Executor endpoint 미업데이트 | Frontend 연결 타임아웃 (old IP) | `update-executor.sh <IP>` |
| 두 Registry 중 하나만 업데이트 | Frontend 또는 Settlement 한쪽만 동작 | 양쪽 모두 확인 |
| Executor 키 불일치 | Host 시작 즉시 종료 (FATAL) | `EXECUTOR_PRIVATE_KEY`가 온체인 등록 주소와 일치하는지 확인 |

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
# NOTE: Package upgraded to v2 (2026-01-31)
nasun client call \
  --package 0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc \
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

# 2b. Alternative: Self-service endpoint update (Phase F-2)
# Executor can update own endpoint without AdminCap using EXECUTOR_PRIVATE_KEY:
nasun client call \
  --package 0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc \
  --module executor \
  --function update_own_endpoint \
  --args \
    0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
    '"http://<NEW_IP>:3000"' \
    '["llama-3.2-3b","llama-3.2-3b-local"]' \
    0x6 \
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

**Current values (as of 2026-01-31):**

| Field | Value |
|-------|-------|
| Attestation Package | `0xc7ede9327e51942f9dadf8783e74b8e654b7639b05bd7bec5b3fad6b3bc1b0f3` |
| Attestation Registry | `0xf05cffcd59ac6889eea1c8cd2b3ab76c05e313912bebc15c412759282c6f6b1b` |
| Attestation AdminCap | `0x3bedf33f6c351573dd3f654f31b0efb449aac31bebe766106160d18b9ba3b238` |
| Active PCR0 (baseline v3) | `3ee63e5c4001f182db6f5a1f0ebdd07154880a9e58c25697e65d085c7ce9e522891595d3de69abada655ebe09fd18285` |

---

## Verification

### 1. Health Check

```bash
curl http://<NEW_IP>:3000/health
```

### 2. Verify Executor Endpoint On-chain

```bash
# Check executor info from the frontend registry
# Uses suix_getDynamicFieldObject on the ExecutorRegistry's executors Table
# The Table object ID is a dynamic field within the ExecutorRegistry
nasun client object 0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b \
  --json | python3 -c "
import sys, json
obj = json.load(sys.stdin)
# Find executors table ID from the registry fields
fields = obj['data']['content']['fields']
print(f'Executors Table: {fields[\"executors\"][\"fields\"][\"id\"][\"id\"]}')
print(f'Total executors: {fields[\"total_executors\"]}')
print(f'Active executors: {fields[\"active_executors\"]}')
"

# Or check the devnet-ids registry (used by settlement):
nasun client object 0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
  --json | python3 -c "
import sys, json
obj = json.load(sys.stdin)
fields = obj['data']['content']['fields']
print(f'Executors Table: {fields[\"executors\"][\"fields\"][\"id\"][\"id\"]}')
print(f'Total executors: {fields[\"total_executors\"]}')
print(f'Active executors: {fields[\"active_executors\"]}')
"
# Expected: endpoint_url should contain the current instance IP
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
| `Connection refused` after EIF rebuild | CID changed (16→17...) | Update `ENCLAVE_CID` in systemd service (see Known Issues) |
| `Settlement disabled` | .env not sourced | `set -a && source .env && set +a` |
| `Sui config not provided, settlement disabled` | .env file missing after `git pull` | Recreate .env from AWS Secrets Manager + devnet-ids.json (see Known Issues) |
| `[FATAL] Executor registration check failed` | EXECUTOR_PRIVATE_KEY mismatch | Verify private key matches registered executor address on-chain |
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
| devnet-ids | `0x4b0e89fa...` (v2) | `0xcb694425...` | devnet-ids.json, Host settlement |

**Impact**: If you only update one registry, either the frontend or settlement will use the old IP.

**TODO**: Consolidate to a single registry.

### PCR0 Changes on Every EIF Rebuild

Any change to source code, npm dependencies, Docker base image, or model weights
produces a different EIF hash and PCR0. Always check PCR0 after building a new EIF
and register a new on-chain baseline if it changed.

### Enclave CID Changes After Restart

When you terminate and re-create an Enclave (e.g., after rebuilding EIF), the CID increments
(16 → 17 → 18...). The systemd service has `ENCLAVE_CID=16` hardcoded.

**Fix:** Update the service file after each Enclave restart:

```bash
# Check new CID
nitro-cli describe-enclaves | jq '.[].EnclaveCID'

# Update systemd
sudo sed -i "s/ENCLAVE_CID=[0-9]*/ENCLAVE_CID=<NEW_CID>/" /etc/systemd/system/baram-host.service
sudo systemctl daemon-reload
sudo systemctl restart baram-host
```

**TODO**: Auto-detect CID in `main.ts` or `run-enclave.sh` output to avoid manual updates.

### Spot Instance Termination

AWS can reclaim spot instances with 2 minutes notice. The instance ID and IP will change.
Save logs and note the PCR values before they are lost.

### .env is Gitignored — Lost After `git pull`

The `.env` file (containing private key and contract IDs) is not tracked in git.
It must be present on the instance for settlement to work.

**Problem:** When deploying new code with `git pull`, the `.env` file is preserved.
However, if the working directory is reset (`git checkout .`, `git clean`, or fresh clone),
`.env` is deleted and settlement silently stops working. The Host logs will show:
`[Host/Server] Sui config not provided, settlement disabled`.

**Recovery procedure:**

```bash
# 1. Get executor private key from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id baram/executor \
  --query 'SecretString' --output text | python3 -c "
import sys, json
print(json.load(sys.stdin)['privateKey'])
"

# 2. Get contract IDs from devnet-ids.json
cat packages/devnet-config/devnet-ids.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
b = d['baram']
print(f'BARAM_PACKAGE_ID={b[\"packageId\"]}')
print(f'BARAM_REGISTRY_ID={b[\"registry\"]}')
print(f'COMPLIANCE_PACKAGE_ID={b[\"compliancePackageId\"]}')
print(f'COMPLIANCE_REGISTRY_ID={b[\"complianceRegistry\"]}')
print(f'EXECUTOR_REGISTRY_ID={b[\"executorRegistry\"]}')
print(f'ATTESTATION_PACKAGE_ID={b[\"attestationPackageId\"]}')
print(f'ATTESTATION_REGISTRY_ID={b[\"attestationRegistry\"]}')
print(f'STAKING_REGISTRY_ID={b[\"stakingRegistry\"]}')
print(f'TIER_REGISTRY_ID={b[\"tierRegistry\"]}')
# Phase F-2
print(f'EXECUTOR_PACKAGE_ID={b[\"executorPackageId\"]}')
print(f'PROCESSED_REQUESTS_ID={b[\"processedRequests\"]}')
"

# 3. Create .env file (combine the above outputs)
cat > apps/baram/executor-nitro/.env << 'EOF'
SUI_RPC_URL=https://rpc.devnet.nasun.io
BARAM_PACKAGE_ID=<from step 2>
BARAM_REGISTRY_ID=<from step 2>
EXECUTOR_PRIVATE_KEY=<from step 1>
COMPLIANCE_PACKAGE_ID=<from step 2>
COMPLIANCE_REGISTRY_ID=<from step 2>
EXECUTOR_REGISTRY_ID=<from step 2>
ATTESTATION_PACKAGE_ID=<from step 2>
ATTESTATION_REGISTRY_ID=<from step 2>
STAKING_REGISTRY_ID=<from step 2>
TIER_REGISTRY_ID=<from step 2>
EXECUTOR_PACKAGE_ID=<from step 2>
PROCESSED_REQUESTS_ID=<from step 2>
EXECUTOR_STAKE_ID=<executor's stake object ID>
EOF

# 4. Restart Host service
sudo systemctl restart baram-host

# 5. Verify settlement is enabled
sudo journalctl -u baram-host -n 5 --no-pager | grep -E "settlement|Sui"
# Expected: "[Host/Server] Sui settlement enabled"
```

**Prevention:** Always verify `.env` exists after any git operation that resets files:

```bash
ls -la apps/baram/executor-nitro/.env || echo "WARNING: .env missing!"
```

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
| `scripts/decay-reputation.ts` | Permissionless reputation decay cron script (Phase F-2) |
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
| Executor Package (v2) | `0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc` |
| ExecutorRegistry (devnet-ids) | `0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c` |
| ProcessedRequests | `0xc68e22ca8cc7851695c2a5466cc148221f31a94e02f4a65b1676c33ab8855404` |
| Frontend ExecutorRegistry | `0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b` |
| Frontend Executor Package | `0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5` |
| Frontend AdminCap | `0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7` |
| AttestationRegistry | `0xf05cffcd59ac6889eea1c8cd2b3ab76c05e313912bebc15c412759282c6f6b1b` |
| Attestation Package | `0xc7ede9327e51942f9dadf8783e74b8e654b7639b05bd7bec5b3fad6b3bc1b0f3` |
| Executor Operator | `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90` |
