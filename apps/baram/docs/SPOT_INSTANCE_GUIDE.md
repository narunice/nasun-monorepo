# Baram TEE Spot Instance - Operations Guide

Spot instance launch, configuration, and on-chain update procedures for the Baram TEE Executor.

Last updated: 2026-01-31

> **Note (2026-02-07)**: 이 가이드의 컨트랙트 주소 예시는 V6 기준입니다. V7 주소는 `packages/devnet-config/devnet-ids.json`을 참조하세요.

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
                              [Sui RPC] <-- settlement TX (retry up to 3x)
```

**Settlement behavior (2026-01-31):**
- Settlement-gated response: Host returns inference result **only after** settlement PTB succeeds
- Settlement retry: Up to 3 attempts with exponential backoff (1s → 2s → 4s)
- On-chain status check between retries: Detects TX that succeeded but timed out on RPC response
- If settlement fails after all retries: Host returns HTTP 502, Frontend auto-cancels escrow

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
  - `server.js` only exports `startServer()` - it does not call it
  - `main.js` connects to the Enclave, then calls `startServer()`
- `USE_VSOCK=true` is REQUIRED on Nitro instances (without it, Host tries TCP which fails)
- `ENCLAVE_CID` must match the running Enclave's CID (check with `nitro-cli describe-enclaves`)

### Step 6: Verify Host Logs

```bash
sudo journalctl -u baram-host -n 15 --no-pager
```

- [ ] `Vsock connection established` - Enclave 연결 성공
- [ ] `Sui settlement enabled` - .env 로드 + 정산 활성화
- [ ] `Executor registration verified` - 온체인 등록 확인 (키 불일치 시 FATAL exit)
- [ ] `HTTP server listening on port 3000` - 서버 시작

> **WARNING**: `Sui config not provided, settlement disabled`가 보이면 .env가 없거나 불완전한 것.
> `Connection refused`가 보이면 CID mismatch 또는 Enclave 미실행.
> `[FATAL] Executor registration check failed`가 보이면 EXECUTOR_PRIVATE_KEY가 온체인 ExecutorRegistry에 등록된 주소와 불일치.

**Settlement 로그 확인 (요청 처리 후):**

정상 정산 시:
```
[Host/Server] Settlement completed: <TX_DIGEST>
```

정산 재시도 발생 시:
```
[Sui] Settlement attempt 1/3 failed, retrying in 1000ms...
[Sui] Request <ID> already settled on-chain (detected on retry 2)
```

정산 실패 시 (HTTP 502 반환):
```
[Host/Server] Settlement failed after retries: <error>
```
> 정산 실패 시 Host는 결과를 반환하지 않습니다. Frontend가 auto-cancel로 에스크로를 해제합니다.

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

New IP이므로 on-chain endpoint를 업데이트 (Section A 참조):

```bash
# From local machine (executor 키로 self-service 업데이트)
cd apps/baram/executor-nitro
bash scripts/update-executor.sh <NEW_IP>
```

- [ ] devnet-ids registry (`0xcb6944...`) endpoint 업데이트됨

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
- [ ] Settlement-gated response 검증:
  - Host 로그에서 `Settlement completed: <TX_DIGEST>` 확인
  - 정산 재시도 경고(`Settlement attempt N failed`)가 **없는지** 확인 (정상이면 1회 성공)
  - Frontend 콘솔에서 auto-cancel 로그가 **없는지** 확인

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
- [ ] Host 로그: `Settlement completed: <TX_DIGEST>` (재시도 경고 없이 1회 성공)

### Quick Summary: 놓치기 쉬운 항목

| 항목 | 놓치면 발생하는 문제 | 확인 방법 |
|------|---------------------|-----------|
| `.env` 누락 | Settlement disabled (Pending) | `ls .env` |
| CID mismatch | Host가 Enclave에 연결 불가 | `nitro-cli describe-enclaves` vs systemd |
| PCR0 변경 미등록 | Attestation Unverified + Settlement MoveAbort | Host 로그에서 `mismatch` 검색 |
| Executor endpoint 미업데이트 | Frontend 연결 타임아웃 (old IP) | `update-executor.sh <IP>` |
| Executor 키 불일치 | Host 시작 즉시 종료 (FATAL) | `EXECUTOR_PRIVATE_KEY`가 온체인 등록 주소와 일치하는지 확인 |
| Settlement 502 | 정산 실패 → 결과 미반환 → Frontend auto-cancel | Host 로그에서 `Settlement failed after retries` 확인 |

> **NOTE: Frontend `.env` 위치**
>
> Vite의 `envDir: '../'` 설정 때문에, Frontend가 읽는 `.env`는 `apps/baram/frontend/.env`가 **아니라** `apps/baram/.env`입니다.
> `apps/baram/frontend/.env`를 수정해도 Vite에 반영되지 않습니다.
> Executor Registry는 `@nasun/devnet-config`에서 직접 읽으므로 `.env`에 `VITE_EXECUTOR_REGISTRY_ID`를 설정하지 마세요.

### Comprehensive: 매번 스팟 인스턴스 런칭 시 변경되는 항목 전체 목록

> **WARNING**: 스팟 인스턴스는 종료 후 재생성할 때마다 아래 항목들이 변경됩니다.
> 하나라도 빠지면 TEE가 정상 동작하지 않습니다.

#### A. 인스턴스 레벨 (매번 변경)

| # | 항목 | 변경 이유 | 업데이트 위치 |
|---|------|----------|--------------|
| 1 | **Public IP** | 스팟 인스턴스마다 새 IP 할당 | On-chain endpoint (`update-executor.sh <IP>`) |
| 2 | **Instance ID** | 새 인스턴스 생성 | AWS 콘솔, terminate-spot.sh 참조 |
| 3 | **Enclave CID** | 인스턴스마다 재할당 (보통 16, 재생성 시 증가) | `/etc/systemd/system/baram-host.service` ENCLAVE_CID |
| 4 | **`.env` 파일** | gitignored, AMI에 없음, 매번 재생성 필요 | `~/nasun-monorepo/apps/baram/executor-nitro/.env` |

#### B. On-chain (IP 변경 시 업데이트 필수)

> Frontend와 Settlement 모두 단일 devnet-ids registry (`0xcb6944...`)를 사용합니다.

| # | 항목 | 업데이트 명령 | 비고 |
|---|------|-------------|------|
| 5 | **ExecutorRegistry endpoint** | `update_own_endpoint` on `0xcb6944...` (F-2) | Executor 키로 self-service. `update-executor.sh <IP>` |
| 6 | **TierRegistry tier 설정** | `update_tier` on `0x21c234...` | Admin 키 필요. Bronze(1) 이상 필요. 신규 executor만 해당 |

#### C. EIF 재빌드 시 (코드/의존성 변경 시)

| # | 항목 | 변경 이유 | 업데이트 명령 |
|---|------|----------|--------------|
| 8 | **PCR0 / PCR1 / PCR2** | 코드, 의존성, Docker 이미지 변경 | `register_baseline` + `activate_baseline` on AttestationRegistry |
| 9 | **Baseline version** | 새 PCR baseline 등록 시 버전 증가 | 문서 업데이트 (SPOT_INSTANCE_GUIDE, CLAUDE.md, BARAM_IMPLEMENTATION_PLAN) |

#### D. Executor 키 변경 시 (Secrets Manager 키 교체 시)

| # | 항목 | 변경 이유 | 업데이트 위치 |
|---|------|----------|--------------|
| 10 | **EXECUTOR_PRIVATE_KEY** | Secrets Manager에서 키 교체 | `.env` on instance |
| 11 | **Executor operator address** | 키에서 파생되는 주소 변경 | ExecutorRegistry에 `register_executor` + TierRegistry `update_tier` 필요 |
| 12 | **Secrets Manager** | 키 교체 시 | `baram/executor-private-key` |
| 13 | **문서 operator address** | 새 주소 반영 | SPOT_INSTANCE_GUIDE Reference 테이블 |

#### E. 체크리스트 실행 순서

```
1. launch-spot.sh (또는 수동)
   └─ Instance ID, Public IP 기록

2. SSH → .env 확인/생성 (Step 2)
   ├─ Secrets Manager에서 EXECUTOR_PRIVATE_KEY 조회
   ├─ devnet-ids.json에서 컨트랙트 ID 추출
   └─ .env 생성 (13개 변수)

3. Enclave CID 확인 + systemd 동기화 (Step 3-4)
   └─ CID 불일치 시 sed + daemon-reload

4. Host 시작 (Step 5)
   └─ "Sui settlement enabled" + "Executor registration verified" 로그 확인
      └─ FATAL exit 시: Executor 키 불일치 → register_executor 필요 (Step D)

5. On-chain endpoint 업데이트 (Step 6)
   └─ devnet-ids registry: update_own_endpoint (Executor 키) 또는 update_executor (Admin 키)
      └─ Frontend도 이 registry를 읽으므로, 이것만 업데이트하면 됨

5b. Executor Tier 설정 (신규 executor인 경우)
   └─ update_tier on TierRegistry: stake_amount=1000000000000, reputation=300 → Bronze(1)
      └─ 누락 시 Frontend에서 "No eligible executors available" 발생

6. PCR baseline 확인 (Step 7)
   └─ PCR0 변경 시: register_baseline(v_next) → activate_baseline(v_next)

7. Frontend E2E 검증 (Step 8)
   ├─ TEE 모델 선택 → 프롬프트 전송
   ├─ Attestation: Verified
   └─ Settlement: TX Digest 확인
```

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

This updates the devnet-ids registry (`0xcb6944...`) using self-service `update_own_endpoint`.
Both Frontend and Settlement read from this single registry.

**Manual update:**

```bash
# Self-service endpoint update (Phase F-2, no AdminCap required)
# Requires active CLI address = registered executor operator
# supportedModels=[] means "accept all models" (Groq + TEE)
nasun client call \
  --package 0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc \
  --module executor \
  --function update_own_endpoint \
  --args \
    0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
    '"http://<NEW_IP>:3000"' \
    '[]' \
    0x6 \
  --gas-budget 100000000

# Alternative: Admin update (requires AdminCap)
nasun client call \
  --package 0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc \
  --module executor \
  --function update_executor \
  --args \
    0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089 \
    0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c \
    <EXECUTOR_OPERATOR_ADDRESS> \
    '"Baram TEE Executor"' \
    '"http://<NEW_IP>:3000"' \
    '[]' \
    true \
  --gas-budget 100000000
```

> **supportedModels 규칙**: `[]` (빈 배열) = 모든 모델 수용 (Groq + TEE).
> `["llama-3.2-3b-local"]`로 설정하면 TEE 모델만 수용하고 Groq 모델이 필터링됩니다.

**Operator address (current):** `0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854`
(Derived from EXECUTOR_PRIVATE_KEY in AWS Secrets Manager. Changes if key is rotated.)

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
| Active PCR0 (baseline v5) | `35f21cd4697bfa48d8cca30e1cc15c19fa8ba68217a3529d155c42104f80e4e0b869ef422567c600a99118b1d4d1b7bb` |

---

## Verification

### 1. Health Check

```bash
curl http://<NEW_IP>:3000/health
```

### 2. Verify Executor Endpoint On-chain

```bash
# Check executor info from the ExecutorRegistry
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

### Settlement fails (502 returned to Frontend)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Settlement failed after retries` in Host logs | Sui RPC timeout or contract error | Check RPC health: `curl https://rpc.devnet.nasun.io` |
| `Request already cancelled/refunded (status=3/4)` | User cancelled or timeout claim before settlement | Expected behavior - no action needed |
| Frontend shows "Settlement failed" then auto-cancels | Settlement 3x retry exhausted → 502 → Frontend cancel | Check Host `.env` for correct contract IDs, check Sui RPC |

### Frontend shows "No TEE Protection"

1. Check model selection: must be `llama-3.2-3b-local` (provider: `tee`)
2. Check executor's `teeType` is > 0 on-chain
3. Check executor's `supportedModels` includes `llama-3.2-3b-local`
4. If the Lambda executor (teeType=0) is being selected instead, the TEE executor's
   `supportedModels` may not include the selected model ID

### Frontend shows old IP / connection timeout

1. The on-chain `endpoint_url` was not updated (see Section A)
2. Hard refresh the frontend (Ctrl+Shift+R) after updating on-chain
3. Verify with the RPC query in Verification section

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

### Settlement-Gated Response (2026-01-31)

**동작**: Host가 정산 PTB 성공 후에만 추론 결과를 반환합니다 (`submitProofWithComplianceRetry`, 최대 3회).

**설계 의도**: 이전에는 정산 실패 시에도 결과가 반환되어, 사용자가 결과 + timeout refund을 모두 받고 executor는 무보수로 남는 문제가 있었습니다.

**트레이드오프**: 정산 실패 시 양측 모두 손실 (executor: 컴퓨팅 비용, 사용자: 시간). 그러나 어느 한 쪽만 부당 이득을 취하는 상황은 발생하지 않습니다.

**관련 파일:**
- `executor-nitro/src/host/sui-client.ts` - `submitProofWithComplianceRetry`, `getRequestStatus`
- `executor-nitro/src/host/server.ts` - 정산 실패 시 502 반환 + early return
- `frontend/src/features/request/hooks/useCreateRequest.ts` - auto-cancel 재시도 (2회) + 명시적 에러
- `frontend/src/utils/tee.ts` - AES 키 sessionStorage 백업/복구

### AES Key sessionStorage Backup (2026-01-31)

TEE E2E 암호화의 AES 키가 module-level 변수에만 저장되어, HMR/탭 전환 시 소실될 수 있었습니다.
이제 `sessionStorage`에 `baram_aes_{requestId}` 키로 백업됩니다.
복호화 성공 후 양쪽 모두에서 삭제됩니다.

### ~~Dual ExecutorRegistry~~ (Resolved 2026-01-31)

~~Two ExecutorRegistry objects exist on-chain.~~ **해결됨**: Frontend와 Settlement 모두 devnet-ids registry (`0xcb6944...`)를 사용합니다.

Legacy frontend registry (`0xeaac739...`)는 on-chain에 잔존하지만 더 이상 사용되지 않습니다.
- `network.ts`: `EXECUTOR_CONFIG`가 `@nasun/devnet-config`에서 직접 읽음 (env fallback 제거됨)
- `update-executor.sh`: devnet-ids registry만 업데이트 (self-service `update_own_endpoint`)
- `.env`: `VITE_EXECUTOR_REGISTRY_ID` 제거됨

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

### One-time Spot Instance Cannot Be Stopped

`SpotInstanceType: one-time`으로 시작된 인스턴스는 **stop 불가, terminate만 가능**합니다.
`aws ec2 stop-instances`를 실행하면 `UnsupportedOperation` 에러가 발생합니다.

인스턴스 재사용이 필요하면 `SpotInstanceType: persistent`를 사용하되,
persistent spot은 auto-terminate가 안 되므로 비용 관리에 주의가 필요합니다.

### Spot Instance Termination (AWS Reclaim)

AWS can reclaim spot instances with 2 minutes notice. The instance ID and IP will change.
Save logs and note the PCR values before they are lost.

### .env is Gitignored - Lost After `git pull`

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

### Frontend `.env` envDir Gotcha (2026-01-31 발견)

**근본 원인**: `apps/baram/frontend/vite.config.ts`에 `envDir: '../'` 설정이 있어서,
Vite 개발 서버는 `apps/baram/frontend/.env`가 **아닌** `apps/baram/.env`를 읽습니다.

**증상**: `apps/baram/frontend/.env`를 수정해도 변경사항이 Vite에 반영되지 않습니다.
예를 들어 `VITE_EXECUTOR_REGISTRY_ID`를 frontend `.env`에서 제거해도,
`apps/baram/.env`에 해당 변수가 남아 있으면 Vite는 여전히 이전 값을 사용합니다.

**결과**: Frontend가 잘못된 registry를 읽어서:
- `tee_type=0` → "No TEE Protection" 경고 표시
- 프롬프트가 plaintext로 전송 (`(TEE encrypted)` 대신 `(plaintext)`)
- Audit Trail 비활성화 (`metadata.teeVerified = false`)

**수정 (2026-01-31)**:
1. `apps/baram/.env`에서 `VITE_EXECUTOR_REGISTRY_ID`, `VITE_EXECUTOR_PACKAGE_ID`, `VITE_EXECUTOR_ADMIN_CAP` 제거
2. `apps/baram/frontend/.env`에 "이 파일은 Vite가 사용하지 않음" 안내 추가
3. `network.ts`의 `EXECUTOR_CONFIG`에서 env fallback 제거 - `@nasun/devnet-config`에서 직접 읽음 (재발 불가)

**향후 예방**: Frontend 환경변수를 수정할 때는 반드시 `apps/baram/.env`를 수정할 것.
`apps/baram/frontend/.env`는 Vite가 읽지 않는 파일입니다.

```
apps/baram/
├── .env                    <-- Vite가 실제로 읽는 파일 (envDir: '../')
├── frontend/
│   ├── .env                <-- Vite가 읽지 않음! 수정해도 무의미
│   └── vite.config.ts      <-- envDir: '../' 설정
└── ...
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
| `scripts/update-executor.sh` | Update executor endpoint on-chain (self-service, single registry) |
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
| ExecutorRegistry | `0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c` |
| ProcessedRequests | `0xc68e22ca8cc7851695c2a5466cc148221f31a94e02f4a65b1676c33ab8855404` |
| AdminCap | `0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089` |
| TierRegistry | `0x21c2344fc2d86c173fb8f8826493e96a93edd7155f3142b4be81be7775cee23c` |
| AttestationRegistry | `0xf05cffcd59ac6889eea1c8cd2b3ab76c05e313912bebc15c412759282c6f6b1b` |
| Attestation Package | `0xc7ede9327e51942f9dadf8783e74b8e654b7639b05bd7bec5b3fad6b3bc1b0f3` |
| Executor Operator | `0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854` |
