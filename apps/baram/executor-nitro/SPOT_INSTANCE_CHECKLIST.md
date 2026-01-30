# Baram TEE Spot Instance - Operations Checklist

When launching a new spot instance (or re-launching after termination),
follow this checklist to avoid repeating past debugging issues.

---

## Pre-launch

- [ ] Verify AMI ID in `.env.ami` is current
- [ ] Verify security group `sg-0c0b595fb9b4f83ec` allows inbound TCP 3000

## Launch

```bash
cd apps/baram/executor-nitro
bash scripts/launch-spot.sh
```

- [ ] Note the new **Instance ID** and **Public IP**
- [ ] Wait for Docker build + EIF build to complete (check via SSH)

## Post-launch: Instance Setup

### 1. Configure .env on Instance

```bash
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<NEW_IP>
```

- [ ] Copy `.env` contents to instance (`~/baram-executor/.env`)
- [ ] Verify all settlement vars are set:
  - `SUI_RPC_URL`, `BARAM_PACKAGE_ID`, `BARAM_REGISTRY_ID`
  - `EXECUTOR_PRIVATE_KEY`
  - `COMPLIANCE_PACKAGE_ID`, `COMPLIANCE_REGISTRY_ID`
  - `EXECUTOR_REGISTRY_ID`, `ATTESTATION_REGISTRY_ID`
  - `STAKING_REGISTRY_ID`, `TIER_REGISTRY_ID`

### 2. Start Enclave + Host

```bash
# Start enclave
sudo nitro-cli run-enclave --eif-path /home/ec2-user/baram-executor/baram-enclave.eif --cpu-count 2 --memory 3072

# Start Host
cd ~/baram-executor && node dist/host/server.js
```

- [ ] Verify health: `curl http://localhost:3000/health`

### 3. Check PCR Values

Every new EIF build produces **new PCR0/PCR1/PCR2 values**.

```bash
sudo nitro-cli describe-enclaves | jq '.[] | .Measurements'
```

- [ ] Compare PCR0 with the **active on-chain baseline** (AttestationRegistry)
- [ ] If PCR0 changed (code or dependency update), register a new baseline:

```bash
# Register new baseline (bump version)
nasun client call \
  --package <ATTESTATION_PACKAGE_ID> \
  --module attestation_registry \
  --function register_baseline \
  --args <ADMIN_CAP> <REGISTRY_ID> <VERSION> 1 <PCR0_HEX_BYTES> <PCR1_HEX_BYTES> <PCR2_HEX_BYTES> <DESCRIPTION_HEX_BYTES> 0x6 \
  --gas-budget 100000000

# Activate baseline
nasun client call \
  --package <ATTESTATION_PACKAGE_ID> \
  --module attestation_registry \
  --function activate_baseline \
  --args <ADMIN_CAP> <REGISTRY_ID> <VERSION> \
  --gas-budget 100000000
```

### 4. Update Executor Endpoint URL On-chain (CRITICAL)

**This is the most commonly missed step.**

The spot instance gets a **new public IP** every time. The on-chain `endpoint_url`
must be updated to point to the new IP, otherwise the frontend cannot reach the executor.

**IMPORTANT: Two ExecutorRegistry objects exist (as of 2026-01-30)**

| Registry | Package ID | Registry ID | Used by |
|----------|-----------|-------------|---------|
| Frontend registry | `0xbc29ac0374a...` | `0xeaac73903c...` | Frontend (.env `VITE_EXECUTOR_REGISTRY_ID`) |
| devnet-ids registry | `0xac09c1d6540e...` | `0xcb694425ce9b...` | `devnet-ids.json`, Host settlement |

**You MUST update BOTH registries**, or at minimum the **frontend registry** (`0xeaac739...`).
If you only update `devnet-ids` registry, the frontend will still show the old IP.

```bash
# Update FRONTEND registry (the one the UI reads from)
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
    '["llama-3.2-3b"]' \
    true \
  --gas-budget 100000000

# Update devnet-ids registry (used by Host for settlement)
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
    '["llama-3.2-3b"]' \
    true \
  --gas-budget 100000000
```

### 5. Verify

```bash
# Verify frontend registry has new IP
curl -s -X POST https://rpc.devnet.nasun.io \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"suix_getDynamicFieldObject","params":["0xe74b2b336b96b8634ded977d3c861197d4b73d435bf784e71923af4996620056",{"type":"address","value":"0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90"}]}' \
  | jq '.result.data.content.fields.value.fields.endpoint_url'
# Expected: "http://<NEW_IP>:3000"
```

- [ ] Frontend shows correct executor endpoint (no connection timeout)
- [ ] Attestation verified (no `Attestation Failed` message)
- [ ] TEE request executes and Audit Trail appears

---

## Known Issues & Lessons Learned

### Dual ExecutorRegistry (2026-01-30)

The frontend `.env` (`VITE_EXECUTOR_REGISTRY_ID`) points to a DIFFERENT
ExecutorRegistry than `devnet-ids.json` (`executorRegistry`). This happened
because the executor contract was re-deployed (V6 reset) but the frontend
.env was not updated to match. Both registries have valid executor entries.

**TODO**: Consolidate to a single registry. Either:
1. Update frontend `.env` to use `devnet-ids.json` values, OR
2. Keep using the frontend registry and update `devnet-ids.json`

### PCR0 Changes on Every EIF Rebuild

If any source code, dependency, or Docker layer changes, the EIF hash and
PCR0 value will be different. Always check PCR0 after building a new EIF
and register a new baseline on-chain if it changed.

### Spot Instance Termination

AWS can reclaim spot instances at any time. The instance ID and IP will change.
Always save any important logs before they are lost.
