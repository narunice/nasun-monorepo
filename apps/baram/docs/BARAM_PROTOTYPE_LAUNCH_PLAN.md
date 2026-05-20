# Baram Prototype Launch Plan - Integrated Timeline

> ## ⚠️ STALE (as of 2026-05-19)
>
> Generated 2026-02-02. **Predates PR1.5 swap path, AER v4, PR2.A trader env injection, PR2.B funds UX, and the Nasun AI rebrand.**
> The timeline, milestones, and "TEE demo" framing in this doc no longer match the v1 launch plan.
>
> Current alpha launch state lives in [docs/nasun-ai-alpha-readiness.md](../../../docs/nasun-ai-alpha-readiness.md) (SSOT).
> v1 ships **without TEE** ([project_baram_no_tee_v1](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_baram_no_tee_v1.md)); `tee_verified=false` is the normal state.
> External branding is "Nasun AI", not "Baram" ([feedback_no_baram_branding](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_baram_branding.md)).
>
> Sections below remain readable as historical rationale; do not use them to plan the alpha cutover.

> Unified launch plan combining SDK implementation, TEE demo, and community preparation.
> Based on PROTOTYPE_LAUNCH_PRIORITIES.md, BARAM_VALUE_PROPOSITION_ANALYSIS.md, BARAM_AGENT_EXPANSION_ANALYSIS.md.
> Generated 2026-02-02.

---

## Launch Vision

**Baram = Verifiable AI Activity Settlement Layer**

- For Humans: Private AI chat with on-chain proof (TEE + ECR)
- For Agents: Trustless AI inference with compliance records (SDK + ECR)
- For Regulators: Tamper-proof audit trail for every AI inference

TEE is the premium tier. ECR (ExecutionComplianceRecord) is the universal base - providing audit value to all three audiences.

---

## Completed Work

### SDK: `@nasun/baram-sdk` v0.1.0

| Component | Status |
|-----------|--------|
| Package scaffold (package.json, tsconfig, vitest) | Done |
| Types + Config (devnet preset from @nasun/devnet-config) | Done |
| Services: encoding, coin, executor, transaction, ecr | Done |
| BaramClient class (execute, cancel, getECR, getExecutors) | Done |
| Public exports (index.ts) | Done |
| Unit tests (23 tests, all passing) | Done |
| CLI demo script (examples/agent-demo.ts) | Done |
| TypeScript type check (tsc --noEmit) | Done |

### Core App (Pre-existing)

| Component | Status |
|-----------|--------|
| Chat UI + Wallet + Model Selection | Done |
| Executor Auto-Assignment (weighted random, Bronze+ filter, 3x retry) | Done |
| TEE Attestation Display + E2E Encryption | Done |
| Audit Trail (ECR Receipt modal) | Done |
| On-chain Contracts V6 (Escrow, Executor, Staking, Tier, Compliance) | Done |
| Lambda Backend (Groq: llama-3.1-8b + llama-3.3-70b) | Done |
| Chat History Encryption + Idle Timeout | Done |

---

## Remaining Work - Pre-Launch

### Week 1: Infrastructure + Testing

| Task | Owner | Notes |
|------|-------|-------|
| TEE spot instance launch + health check | Manual | `launch-spot.sh` + `update-executor.sh` |
| E2E test: Groq model (llama-3.1-8b, llama-3.3-70b) | Manual | Browser: fresh wallet → faucet → chat → ECR |
| E2E test: TEE model (llama-3.2-3b-local) | Manual | TEE Verified badge + PCR0 hash + settlement TX |
| E2E test: SDK CLI demo on devnet | Manual | `PRIVATE_KEY=<key> npx tsx examples/agent-demo.ts` |
| Mobile browser test (iOS + Android) | Manual | Hamburger sidebar, touch-friendly |
| Faucet test: multiple NUSDC claims | Manual | Rate limiting, dedup |

### Week 2: Polish + Community

| Task | Owner | Notes |
|------|-------|-------|
| Landing/onboarding content update | Code | Vision communication in WelcomeScreen |
| Community links (Discord, Twitter, NFT) | Code | Sidebar or header |
| Audit Trail visibility improvement | Code | Auto-expand on first TEE response |
| Documentation finalization | Done | 3 docs updated + this plan |

---

## Manual E2E Test Scenarios

### Scenario 1: SDK Non-TEE Inference (Groq/Lambda)

**Prerequisites**: Lambda backend running, wallet with NUSDC

```bash
cd packages/baram-sdk
PRIVATE_KEY=<hex-key> npx tsx examples/agent-demo.ts
```

**Verify**:
- [ ] "Response:" output contains AI response text
- [ ] "ECR ID:" output contains valid object ID (0x...)
- [ ] "TX Digest:" output contains valid TX digest
- [ ] Explorer confirms TX: `https://explorer.nasun.io/devnet/tx/<digest>`
- [ ] ECR object has all 29 fields populated
- [ ] ECR requester == wallet address used
- [ ] ECR tee_type == 0 (Non-TEE)

### Scenario 2: SDK TEE Inference

**Prerequisites**: TEE spot instance running, endpoint updated

```bash
PRIVATE_KEY=<key> MODEL=llama-3.2-3b-local npx tsx examples/agent-demo.ts
```

**Verify**:
- [ ] AI response received (~50sec wait for TEE model)
- [ ] ECR tee_type == 1 (AWS Nitro)
- [ ] ECR pcr_verified == true
- [ ] ECR pcr0 length == 48 bytes (hex)
- [ ] ECR attestation_hash is non-empty

### Scenario 3: Browser + SDK Concurrent

1. Browser: Send chat request via Baram UI
2. SDK: Send request via CLI demo simultaneously
3. Both complete successfully
4. Each generates independent ECR
5. Both ECRs visible in Explorer

### Scenario 4: Insufficient Balance

```bash
# Use wallet with 0 NUSDC
PRIVATE_KEY=<empty-wallet-key> npx tsx examples/agent-demo.ts
```

**Verify**: "Insufficient NUSDC balance" error, no on-chain TX created

### Scenario 5: Sequential Agent Requests

```bash
# Run 3 times sequentially
for i in 1 2 3; do
  PRIVATE_KEY=<key> npx tsx examples/agent-demo.ts
done
```

**Verify**:
- [ ] Each request gets sequential request_id
- [ ] Each ECR is independently created
- [ ] All escrows settle correctly

---

## Launch Day Checklist

### Pre-Launch (1 hour before)

- [ ] TEE spot instance running: `bash scripts/launch-spot.sh`
- [ ] Endpoint updated: `bash scripts/update-executor.sh <IP>`
- [ ] Lambda health: `curl https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod/health`
- [ ] TEE health: `curl http://<SPOT_IP>:3000/health`
- [ ] SDK tests passing: `cd packages/baram-sdk && npx vitest run`
- [ ] Frontend deployed and accessible

### Launch Verification

- [ ] Browser test from fresh wallet (Password wallet)
- [ ] Browser test from zkLogin (Google OAuth)
- [ ] TEE model: "TEE Verified" badge visible
- [ ] Audit Trail: PCR Verified: Yes, Settlement TX present
- [ ] SDK demo: successful E2E execution

### Post-Launch

- [ ] Monitor Lambda logs for errors
- [ ] Monitor on-chain TX success rate
- [ ] Keep TEE instance running during demo period
- [ ] Collect community feedback (Discord)
- [ ] Terminate TEE instance after demo: `bash scripts/terminate-spot.sh`

---

## Cost Summary

| Item | Cost |
|------|------|
| SDK development | $0 (code only) |
| TEE Spot (2 weeks, 8hr/day) | ~$5.60 |
| AMI storage | ~$1.25 |
| Lambda + API Gateway (free tier) | ~$0 |
| **Total launch period** | **~$7** |

---

## Post-Launch Roadmap (Phase 2: Beta)

| Task | Priority |
|------|----------|
| llama.cpp HTTP server upgrade (4 concurrent slots) | High |
| BetaAccessNFT contract deployment | High |
| SDK: TEE encryption support (RSA-OAEP + AES-256-GCM) | High |
| SDK: Error handling improvements | Medium |
| API key rate limiting on executor endpoints | Medium |
| ECR chain linking (`parent_ecr_id`, `session_id`) | Low |
| Agent Wallet (Account Abstraction, session keys) | Low |
| Langchain/AutoGPT/CrewAI integration examples | Low |

---

## Architecture Reference

```
packages/baram-sdk/
├── package.json              # @nasun/baram-sdk v0.1.0
├── tsconfig.json             # Extends @nasun/tsconfig/base.json
├── vitest.config.ts
├── examples/
│   └── agent-demo.ts         # CLI demo: full pipeline
└── src/
    ├── index.ts              # Public API exports
    ├── client.ts             # BaramClient class
    ├── types.ts              # All shared types + constants
    ├── config.ts             # createDevnetConfig()
    ├── services/
    │   ├── encoding.ts       # sha256, hexToBytes
    │   ├── coin.ts           # getNusdcCoins
    │   ├── executor.ts       # fetchExecutors, selectExecutorWeightedRandom
    │   ├── transaction.ts    # buildCreateRequestTransaction, buildCancelRequestTransaction
    │   └── ecr.ts            # fetchECRByRequestId
    └── __tests__/
        ├── config.test.ts
        ├── encoding.test.ts
        ├── executor.test.ts
        └── transaction.test.ts
```

---

*Generated 2026-02-02. Reference during launch preparation.*
