# AER (AI Execution Report) -- Implementation Reference

**From Computing Environment Proof to Economic Activity Proof**

| | |
|---|---|
| Date | 2026-02-08 |
| Status | **Implemented** (Devnet V7) |
| Authors | Nasun Core Team |
| Contract | `baram_aer::aer` (fresh deploy, separate from ECR) |
| Package | `0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0` |
| Chain | Nasun Devnet V7 (Chain ID `272218f1`) |

---

## Table of Contents

1. [Motivation -- Why Replace ECR?](#1-motivation--why-replace-ecr)
2. [Design Principles](#2-design-principles)
3. [Architecture Decision -- Fresh Deploy](#3-architecture-decision--fresh-deploy)
4. [AER Structure (8 Categories, 31 Fields)](#4-aer-structure-8-categories-31-fields)
5. [Field Consolidation (max_fields_in_struct=32)](#5-field-consolidation-max_fields_in_struct32)
6. [ECR Fields Removed / Changed](#6-ecr-fields-removed--changed)
7. [Naming Convention](#7-naming-convention)
8. [Deployed Contracts](#8-deployed-contracts)
9. [Implementation Summary](#9-implementation-summary)
10. [Prior Art and References](#10-prior-art-and-references)

---

## 1. Motivation -- Why Replace ECR?

### The shift from human users to AI agents

Baram's `ExecutionComplianceRecord` (ECR) was designed when the primary consumer was a human user chatting with an AI model. In that world, the most important audit question was environmental: *where* was my prompt processed, and was the hardware trustworthy?

The fastest-growing segment of AI consumers is autonomous agents -- software that calls AI models hundreds of times per day, operates 24/7, and spends budgets delegated by humans. The audit question shifts fundamentally:

| Era | Primary Consumer | Key Audit Question |
|-----|-----------------|-------------------|
| 2025 | Human users | "Was my prompt processed privately?" |
| 2026+ | AI agents | "Who authorized this agent to spend my money on AI?" |

### What the ECR could not answer

- **WHO authorized** this execution? (No `authorizer` field)
- **WHICH agent** acted on behalf of a human? (No delegation path)
- **WHICH budget** funded it? (No `budget_id` field)
- **HOW MUCH** did the executor actually receive? (No fee breakdown)
- **WHY** was this execution performed? (No purpose or constraints)

### The positioning

> "Baram is the black box of AI economic activity."

AER extends Baram from *economic accountability* to *full execution accountability* -- recording not just who paid and who computed, but who delegated authority, under what constraints, and as part of what chain of actions.

---

## 2. Design Principles

### Four guarantees

AER guarantees exactly four things:

| Guarantee | What it proves |
|-----------|---------------|
| **Authorization** | Which entity authorized execution, who delegated, under what constraints |
| **Execution Claim** | Which provider claims to have executed on what model |
| **Economic Settlement** | Who was paid, how much, from what source, with what fee split |
| **Lineage** | Relationship to prior and subsequent executions |

### What AER does NOT guarantee

- Output accuracy, bias, fairness, or safety
- That the AI model produced the correct answer
- Regulatory compliance (AER provides *evidence* for compliance workflows, not compliance itself)

### Design constraints

1. **Immutable**: An AER is a receipt. Once created, it is never modified. Transferred to the initiator as an owned object.
2. **Standalone**: No cross-package dependencies. All data is passed as parameters to `create_report()`.
3. **Option<T> honesty**: Fields not always available use `Option<T>` and are `None` when not applicable.
4. **Struct limit compliance**: Nasun devnet `max_fields_in_struct=32`. AER uses UID + 30 data fields = 31 total.

---

## 3. Architecture Decision -- Fresh Deploy

### Why fresh deploy instead of contract upgrade

The original design proposed extending `contracts-compliance/compliance.move` (adding 8 fields to the existing ECR struct). During implementation planning, this approach was rejected:

| Approach | Lines | Risk | Decision |
|----------|-------|------|----------|
| **A: Fresh deploy** (`contracts-aer/`) | ~450 | Low | **Adopted** |
| B: Full ecosystem rebuild | ~17,700 | High | Rejected |

**Reasons for fresh deploy:**

1. `ComplianceRegistry` layout change is impossible without breaking existing ECR objects
2. ECR has 22 fields; AER needs 31. The struct category organization differs fundamentally (8 vs 7 categories)
3. Fresh deploy preserves all existing ECR objects and events for historical queries
4. Clean module design without backward-compatibility hacks
5. Both ECR and AER can coexist -- ECR is "frozen" (no new records), AER handles all new executions

### Coexistence

```
contracts-compliance/  --> FROZEN (existing ECR objects remain queryable)
contracts-aer/         --> ACTIVE (all new executions produce AER)
```

The SDK and frontend query `ExecutionReportCreated` events from the AER package. No fallback to ECR events is needed since AER replaces ECR going forward.

---

## 4. AER Structure (8 Categories, 31 Fields)

```move
public struct AIExecutionReport has key, store {
    id: UID,
    request_id: u64,

    // === 1. WHO -- Requester Side (3) ===
    initiator: address,              // End user or agent address
    authorizer: address,             // Payment authorizer (= initiator for direct, = budget owner for delegated)
    delegation_path: vector<address>,// [user] -> [agent1] -> ... (empty for direct)

    // === 2. WHO -- Executor Side (2) ===
    executor: address,               // Compute provider address
    executor_principal: Option<address>, // Organization the executor represents

    // === 3. HOW MUCH -- Economic Facts (6) ===
    payment_amount: u64,             // Total payment (smallest unit of payment_token)
    payment_token: u8,               // 0=NUSDC, 1=NASUN
    executor_received: u64,          // Amount after fees
    fee_detail: Option<String>,      // JSON: {model_creator, royalty_amount, protocol_fee}
    budget_id: Option<ID>,           // Budget object ID (delegated execution)
    budget_remaining: Option<u64>,   // Budget balance after execution

    // === 4. WHAT -- Execution Content (5) ===
    model_name: String,              // e.g., "llama-3.3-70b-versatile"
    model_metadata: Option<String>,  // JSON: {version, hash, quantization}
    input_hash: vector<u8>,          // SHA-256 of encrypted prompt (32 bytes)
    output_hash: vector<u8>,         // SHA-256 of AI output (32 bytes)
    execution_time_ms: u64,          // Wall-clock time

    // === 5. WHY -- Execution Purpose (3) ===
    purpose: Option<String>,         // e.g., "customer_support", "code_review"
    policy_version: Option<u64>,     // Governance policy version
    constraints: Option<String>,     // JSON: {timeout, max_tokens, temperature}

    // === 6. HOW TRUSTWORTHY -- Trust Snapshot (5) ===
    executor_tier: u8,               // 0=Open, 1=Bronze, 2=Silver, 3=Gold
    executor_reputation: u64,        // 0-1000
    executor_stake_amount: u64,      // Staked NASUN (in SOE)
    tee_verified: bool,              // Whether TEE-verified
    tee_attestation_hash: Option<vector<u8>>, // SHA-256 of attestation doc

    // === 7. WHEN -- Temporal (3) ===
    requested_at: u64,               // Request creation time (ms epoch)
    settled_at: u64,                 // Settlement time (ms epoch, from Clock)
    status: u8,                      // 0=settled, 1=disputed, 2=slashed

    // === 8. CHAIN -- Action Linkage (2) ===
    triggered_by: Option<ID>,        // Parent AER that triggered this
    triggered_action: Option<ID>,    // Child AER created as result
}
```

### Category summary

| # | Category | Fields | Purpose |
|---|----------|--------|---------|
| 1 | WHO -- Requester | `initiator`, `authorizer`, `delegation_path` | Authorization chain |
| 2 | WHO -- Executor | `executor`, `executor_principal` | Compute provider identity |
| 3 | HOW MUCH | `payment_amount`, `payment_token`, `executor_received`, `fee_detail`, `budget_id`, `budget_remaining` | Full economic picture |
| 4 | WHAT | `model_name`, `model_metadata`, `input_hash`, `output_hash`, `execution_time_ms` | Execution content |
| 5 | WHY | `purpose`, `policy_version`, `constraints` | Execution context |
| 6 | HOW TRUSTWORTHY | `executor_tier`, `executor_reputation`, `executor_stake_amount`, `tee_verified`, `tee_attestation_hash` | Trust snapshot |
| 7 | WHEN | `requested_at`, `settled_at`, `status` | Temporal proof |
| 8 | CHAIN | `triggered_by`, `triggered_action` | Decision lineage |

**Total: 31 fields (UID + 30 data fields)**

---

## 5. Field Consolidation (max_fields_in_struct=32)

Nasun devnet enforces `max_fields_in_struct=32`. The original design had ~34 fields. Rarely-used detail fields were consolidated into JSON strings:

| Consolidated Field | Type | Contains |
|-------------------|------|----------|
| `model_metadata` | `Option<String>` | `{"version":"1.0","hash":"abc...","quantization":"Q4_K_M"}` |
| `fee_detail` | `Option<String>` | `{"model_creator":"0x...","royalty_amount":1000,"protocol_fee":500}` |
| `constraints` | `Option<String>` | `{"timeout_ms":30000,"max_tokens":4096,"temperature":0.7}` |

These fields are `None` when the executor does not report the details. This approach:
- Keeps the struct within the 32-field limit
- Preserves flexibility for future field additions without contract upgrade
- Makes rarely-queried detail fields extensible

---

## 6. ECR Fields Removed / Changed

| ECR Field | AER Treatment | Rationale |
|-----------|--------------|-----------|
| `tee_type` (u8) | Replaced by `tee_verified` (bool) | Parallelism era: single TEE type is misleading for distributed inference |
| `pcr0` (48 bytes) | Removed | Single PCR0 is misleading when inference spans multiple GPUs |
| `pcr_baseline_version` | Removed | Can be queried from AttestationRegistry if needed |
| `executor_slash_count` | Removed | `reputation` + `tier` are sufficient signals |
| `timeout_ms` | Moved to `constraints` JSON | Low-frequency query field |
| `min_price` | Removed | Policy-level concept, not per-execution |
| `requester` | Split into `initiator` + `authorizer` | Distinguishes actor from funder |
| `model` | Renamed to `model_name` + `model_metadata` | Richer model information |
| `prompt_hash` | Renamed to `input_hash` | More generic term |

### New fields not in ECR

| Field | Category | Purpose |
|-------|----------|---------|
| `delegation_path` | WHO-Requester | Multi-hop delegation chain |
| `executor_principal` | WHO-Executor | Organization behind executor |
| `payment_token` | HOW MUCH | Multi-token support |
| `executor_received` | HOW MUCH | Post-fee amount |
| `fee_detail` | HOW MUCH | Fee breakdown |
| `budget_id` | HOW MUCH | Budget delegation link |
| `budget_remaining` | HOW MUCH | Budget state snapshot |
| `model_metadata` | WHAT | Model version/hash/quantization |
| `purpose` | WHY | Execution purpose declaration |
| `policy_version` | WHY | Governance policy snapshot |
| `constraints` | WHY | Execution constraints |
| `tee_attestation_hash` | TRUST | Attestation document hash |
| `triggered_by` | CHAIN | Parent AER link |
| `triggered_action` | CHAIN | Child AER link |

---

## 7. Naming Convention

| Context | Old Name | New Name |
|---------|----------|----------|
| On-chain struct | `ExecutionComplianceRecord` | `AIExecutionReport` |
| On-chain event | `ComplianceRecordCreated` | `ExecutionReportCreated` |
| On-chain module | `baram_compliance::compliance` | `baram_aer::aer` |
| SDK type | `ECRData` | `AERData` |
| SDK function | `fetchECRByRequestId()` | `fetchAERByRequestId()` |
| SDK hook | `useECR()` | `useAER()` |
| Frontend label | "Audit Trail" | "Execution Report" |
| Internal shorthand | ECR | AER |

**Why "Execution Report"**: Inspired by FIX Protocol Execution Report (MsgType=8). Self-explanatory and industry-standard.

---

## 8. Deployed Contracts

### AER Package (baram_aer)

| Item | Address |
|------|---------|
| Package ID | `0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0` |
| AERRegistry | `0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583` |
| AdminCap | `0x5d74e5e8bf827b95c6c19ee6697e3edac706aeb2cf3870a39100a06a12c73c7d` |
| UpgradeCap | `0x9179431462d03a1ae337ba5bff9bfe0de7cfec5854436f119b4c56b2bcd95af4` |

### Compliance Package (FROZEN -- existing ECR objects preserved)

| Item | Address |
|------|---------|
| Package ID | `0x601d879d176f5f22f1c3f267bb8895c6b18f1020878ac38a5f88f27ffeed55c3` |
| ComplianceRegistry | `0x884af83cb0b9d5dc1f584a29018e812e777fb36ea99b8b0d96a8645188a4bec0` |

---

## 9. Implementation Summary

### Components modified

| Phase | Component | Changes |
|-------|-----------|---------|
| 1 | `contracts-aer/sources/aer.move` | **NEW** ~441 lines. Fresh deploy. |
| 2 | `executor-nitro/src/host/sui-client.ts` | PTB Call 2: `compliance::create_record` -> `aer::create_report` |
| 2 | `executor-nitro/src/host/server.ts` | Budget metadata pass-through |
| 2 | `cdk/lambda-src/executor/src/services/sui.ts` | Lambda executor: same PTB change |
| 3 | `packages/baram-sdk/src/types.ts` | `ECRData` -> `AERData` (8 categories) |
| 3 | `packages/baram-sdk/src/services/ecr.ts` | `fetchECRByRequestId` -> `fetchAERByRequestId` |
| 3 | `packages/baram-sdk/src/client.ts` | `getECR()` -> `getAER()` |
| 4 | Frontend services/hooks/components | ECR -> AER throughout, 8-category Execution Report modal |

### Event query flow

```
Executor PTB settlement
  -> aer::create_report()
  -> Emits ExecutionReportCreated event
  -> Transfers AIExecutionReport to initiator

SDK/Frontend query:
  -> queryEvents({ MoveEventType: "baram_aer::aer::ExecutionReportCreated" })
  -> Find record_id from event
  -> getObject(record_id) for full AIExecutionReport fields
```

### Validation rules (on-chain)

| Rule | Error Code |
|------|-----------|
| `input_hash` must be 32 bytes (SHA-256) | 401 |
| `output_hash` must be 32 bytes (SHA-256) | 402 |
| `delegation_path` max length 5 (D-6) | 403 |

---

## 10. Prior Art and References

### FIX Protocol Execution Reports

The Financial Information eXchange (FIX) Protocol defines an Execution Report (MsgType=8) as the primary record of trade execution. AER follows the same conceptual structure for AI execution: who requested, who executed, economic terms, timestamp, and execution context.

### EU AI Act (August 2026)

The EU AI Act mandates auditable records for AI systems. AER's `initiator`, `authorizer`, `model_name`, `input_hash`, `settled_at`, and `purpose` fields directly support compliance evidence.

### x402 Protocol (Coinbase)

x402 handles AI micropayments but provides no execution audit trail. AER is complementary: x402 handles payment; AER handles accountability.

### ERC-8004 ("Trustless Agents")

ERC-8004 proposes NFT-based portable identity for AI agents. AER's `initiator`, `authorizer`, and `delegation_path` could reference ERC-8004 agent identities for cross-chain agent accountability.
