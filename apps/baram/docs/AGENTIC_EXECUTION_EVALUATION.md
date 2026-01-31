# Baram: Agentic Execution Capabilities Evaluation

An assessment of Baram's alignment with Sui's four fundamental capabilities for AI agentic systems, as defined in [Agentic Execution: Why AI Agents Need Blockchain](https://blog.sui.io/agentic-execution-ai-agents-need-blockchain/).

Last updated: 2026-01-31

---

## Background

Sui identifies four fundamental capabilities that autonomous AI systems require to operate reliably on-chain:

1. **Shared, verifiable state** — State must be directly verifiable so systems can determine what is current, what has changed, and what the final outcome is.
2. **Rules and permissions that move with data** — Authority travels with data and actions rather than being redefined at system boundaries.
3. **Atomic execution across workflows** — Multi-step actions must execute as a complete unit, either succeeding entirely or failing cleanly.
4. **Proof of what happened** — Agents, users, and auditors need certainty about how an action was executed, under what permissions, and whether it followed the intended rules.

---

## Evaluation

### 1. Shared, Verifiable State

**Alignment: 85%**

#### Strengths

- `BaramRegistry` records escrow request state on-chain (created → completed/cancelled)
- `ExecutorRegistry` stores executor information (endpoint, reputation, supported models) as on-chain shared objects, queryable by anyone
- `TierRegistry` computes and stores executor tiers on-chain with a transparent formula: `min(stake_tier, rep_tier)`
- `AttestationRegistry` registers PCR baselines on-chain for TEE integrity verification
- ~~Dual ExecutorRegistry~~ — **Resolved (2026-01-31)**: Frontend and Settlement both read from a single devnet-ids registry (`0xcb6944...`). `network.ts` reads directly from `@nasun/devnet-config` with no env variable fallback.

#### Gaps

- **StakingRegistry/TierRegistry not fully live-queried** — Frontend partially relies on registry snapshots rather than real-time on-chain reads for tier/staking data.

---

### 2. Rules and Permissions That Move with Data

**Alignment: 65%**

#### Strengths

- Leverages Sui's object-centric capability pattern — `AdminCap`, `UpgradeCap`, and `StakingAdminCap` are properly implemented as owned objects
- `StakeObject` grants staking authority through ownership, not role tables
- TEE Attestation cryptographically proves an executor's right to execute within a verified enclave
- **(F-2)** Executors can autonomously update their own state:
  - `record_job_completion` / `record_job_failure` — self-service reputation tracking with request_id dedup
  - `update_own_endpoint` — self-service endpoint/model configuration
  - `decay_reputation_permissionless` — anyone can trigger 30-day inactivity decay (Clock-based guard)
  - `refresh_tier_from_state` — anyone can trigger tier recalculation from on-chain state

#### Gaps

- **Registration remains Admin-only** — `register_executor` requires `AdminCap` (whitelist control)
- **Users limited to `create_request` / `cancel_request`** — No ability to compose autonomous multi-step workflows as agents

---

### 3. Atomic Execution Across Workflows

**Alignment: 80%**

#### Strengths

- **`submitProofWithCompliance` PTB** (Phase F-3) — Settlement + ECR creation executes as a single Programmable Transaction Block. If either step fails, the entire transaction rolls back.
- **(F-2)** PTB extended to 4 calls: `submit_proof` + `create_record` + `record_job_completion` + `refresh_tier_from_state` — settlement, compliance, reputation, and tier update all atomic.
- **`create_request`** — NUSDC escrow lock + request creation is atomic in a single transaction.
- **Auto-cancel on failure** (Phase F-6) — Execution failure triggers immediate escrow release via `cancel_request`.
- **Settlement-gated response** (Phase F-9) — Host returns inference result **only after** settlement PTB succeeds. If settlement fails after 3 retries, HTTP 502 is returned and the result is withheld. This prevents the critical atomicity break where users received free inference (result + timeout refund).
- **Settlement retry with on-chain status check** (Phase F-9) — Up to 3 attempts with exponential backoff. Between retries, queries on-chain request status to detect transactions that succeeded but timed out on RPC response.
- **Auto-cancel retry with explicit error** (Phase F-9) — Frontend auto-cancel retries up to 2 times on execution failure. If cancel also fails, error message includes request ID and timeout guidance.
- **AES key sessionStorage backup** (Phase F-9) — E2E encryption AES key backed up to sessionStorage to survive HMR/tab switches, preventing decryption failure after successful settlement.

#### Gaps

- **The assignment → execution → settlement pipeline is not atomic** — Frontend selects an executor via Weighted Random (off-chain), calls `/execute` over HTTP, and the Host submits a separate settlement transaction. These are independent steps with failure points between them. However, F-9's settlement-gated response ensures the critical invariant: **users never receive results without paying, and executors never lose results without compensation**.
- **Executor selection is off-chain** — `selectExecutorWeightedRandom` runs in the frontend. It is not enforced on-chain, leaving it susceptible to front-running or manipulation.
- ~~**Settlement failure leaks inference results**~~ — **Resolved (F-9)**: Settlement-gated response ensures results are withheld on settlement failure.
- ~~**Auto-cancel silent failure**~~ — **Resolved (F-9)**: 2x retry with explicit error message including request ID.

---

### 4. Proof of What Happened

**Alignment: 75%**

#### Strengths

- **ExecutionComplianceRecord (ECR)** — Every execution permanently records request_id, executor address, model, executor_tier snapshot, tee_type, and attestation result on-chain. This is the most mature of the four capabilities.
- **TEE Attestation** — COSE_Sign1 signature + X.509 certificate chain verification provides cryptographic proof of enclave integrity.
- **PCR Baseline on-chain verification** — EIF hash values are verified against on-chain baselines.
- **Frontend Audit Trail** — ECRReceipt modal displays PCR Verified status, Tier, TX Digest for user-facing transparency.
- **`ComplianceRecordCreated` event** — On-chain events enable third-party audit trail consumption.

#### Gaps

- **No proof of prompt/response content** — Only a `result_hash` is submitted. Third parties cannot verify that a specific input produced a specific output. The system relies on TEE trust.
- **Cloud model executions lack ECR** — Groq/OpenAI calls via Lambda bypass TEE entirely, producing no attestation and no compliance record. This means a significant portion of executions have zero on-chain proof.
- **Executor selection rationale not recorded** — Why a particular executor was chosen (eligible set composition, weight calculation) is not recorded on-chain.

---

## Summary

| Capability | Alignment | Key Gap |
|---|---|---|
| 1. Shared, Verifiable State | **85%** | ~~Dual Registry~~ resolved; snapshot vs live-query gap remains |
| 2. Rules & Permissions with Data | **65%** | F-2 improved executor autonomy; registration still Admin |
| 3. Atomic Execution | **80%** | F-9 settlement-gated response; executor selection still off-chain |
| 4. Proof of What Happened | **75%** | Most mature; input/output proof and cloud model gaps |

---

## Improvement Roadmap (Priority Order)

### ~~Priority 1: Remove Admin Dependency (Phase F-2)~~ ✅ Completed 2026-01-31

**Addressed**: Capability 2 (Rules & Permissions) + Capability 3 (Atomic Execution)

Self-service functions added: `record_job_completion/failure`, `update_own_endpoint`, `decay_reputation_permissionless`, `refresh_tier_from_state`. PTB extended to 4 calls for atomic settlement + stats + tier update.

### ~~Priority 2: Consolidate Dual ExecutorRegistry~~ ✅ Completed 2026-01-31

**Addressed**: Capability 1 (Shared, Verifiable State)

`network.ts` EXECUTOR_CONFIG reads directly from `@nasun/devnet-config` (env fallback removed). `update-executor.sh` uses single registry with self-service `update_own_endpoint`. Legacy frontend registry (`0xeaac739...`) deprecated.

### ~~Priority 2.5: Pipeline Atomicity (Phase F-9)~~ ✅ Completed 2026-01-31

**Addressed**: Capability 3 (Atomic Execution)

Three atomicity breaks in the execution pipeline were identified and fixed:

1. **Settlement-gated response** (Break A — CRITICAL): Host now returns inference result only after settlement PTB succeeds. `submitProofWithComplianceRetry` retries up to 3 times with exponential backoff and on-chain status check between retries. Settlement failure returns HTTP 502.

2. **Auto-cancel retry with explicit error** (Break C — MEDIUM): Frontend auto-cancel retries 2 times. On failure, error message includes request ID and timeout refund guidance.

3. **AES key sessionStorage backup** (Break B — HIGH): E2E encryption AES key backed up to `sessionStorage` keyed by `baram_aes_{requestId}`. Survives HMR and tab switches. Cleared after successful decryption.

**Files modified:**
- `executor-nitro/src/host/sui-client.ts` — `getRequestStatus()`, `submitProofWithComplianceRetry()`
- `executor-nitro/src/host/server.ts` — Settlement gate + 502 on failure
- `frontend/src/features/request/hooks/useCreateRequest.ts` — Cancel retry + requestId passing
- `frontend/src/utils/tee.ts` — sessionStorage backup/recovery

**No contract changes required.**

### Priority 3: On-chain Executor Assignment

**Addresses**: Capability 3 (Atomic Execution) + Capability 4 (Proof)

Currently `selectExecutorWeightedRandom` is frontend-only logic — unverifiable and manipulable.

**Actions:**
- Move eligible set filtering and executor assignment into `create_request` on-chain (using Sui Random or VRF)
- Bind the assigned executor to the Request object so only they can settle
- Record selection rationale (eligible count, selection seed) on-chain

Note: High implementation complexity. Consider phasing this as a mid-term goal.

### Priority 4: Enclave Output Signing → On-chain Verification

**Addresses**: Capability 4 (Proof of What Happened)

Currently the Host verifies attestation off-chain and submits the result. Adopting the Oyster pattern: Enclave signs output with secp256k1, Move contract verifies signature directly for trustless proof.

### Priority 5: Cloud Model Execution Proof

**Addresses**: Capability 4 (Proof of What Happened)

Lambda-routed Groq/OpenAI executions currently produce zero on-chain evidence.

**Actions:**
- Generate lightweight ECRs for cloud model executions (tee_type=0, recording model, timestamp, cost)
- Long-term: route cloud models through a TEE gateway, or add provider-signed response attestation

### Priority 6: Verifiable Inference (Input/Output Proof)

**Addresses**: Capability 4 (Proof of What Happened)

Currently only `result_hash` is submitted; third-party verification of "this input produced this output" is impossible. This is an industry-wide open problem.

**Long-term directions:**
- Commitment scheme: commit prompt hash at `create_request`, reveal at settlement
- Include input/output pair hash in TEE attestation document
- zkML (long-term) — zero-knowledge proofs of the inference process itself

---

## References

- Sui Blog: [Agentic Execution: Why AI Agents Need Blockchain](https://blog.sui.io/agentic-execution-ai-agents-need-blockchain/)
- [BARAM_IMPLEMENTATION_PLAN.md](BARAM_IMPLEMENTATION_PLAN.md) — Full implementation status
- [SPOT_INSTANCE_GUIDE.md](SPOT_INSTANCE_GUIDE.md) — TEE infrastructure operations
