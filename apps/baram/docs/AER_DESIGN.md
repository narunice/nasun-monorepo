# AER (AI Execution Report) -- Extending Baram's On-Chain Audit Trail

**From Computing Environment Proof to Execution Context Proof**

| | |
|---|---|
| Date | 2026-02-08 |
| Status | Design Proposal |
| Authors | Nasun Core Team |
| Affected Contract | `baram_compliance::compliance` (Package `0x601d...55c3`) |
| Chain | Nasun Devnet V7 (Chain ID `272218f1`) |

---

## Table of Contents

1. [Motivation -- Why Extend ECR?](#1-motivation--why-extend-ecr)
2. [Design Principles](#2-design-principles)
3. [Proposed AER Structure](#3-proposed-aer-structure)
4. [Field Rationale Table](#4-field-rationale-table)
5. [Use Cases](#5-use-cases)
6. [Backward Compatibility](#6-backward-compatibility)
7. [Implementation Scope](#7-implementation-scope)
8. [Naming Convention](#8-naming-convention)
9. [Prior Art and References](#9-prior-art-and-references)

---

## 1. Motivation -- Why Extend ECR?

### The shift from human users to AI agents

Baram's `ExecutionComplianceRecord` (ECR) was designed when the primary consumer was a human user chatting with an AI model. In that world, the most important audit question was environmental: *where* was my prompt processed, and was the hardware trustworthy?

The world has moved. The fastest-growing segment of AI consumers is autonomous agents -- software that calls AI models hundreds of times per day, operates 24/7, and spends budgets delegated by humans. By 2030 the AI agent market is projected to reach $52.62B. In this world, the audit question shifts fundamentally:

| Era | Primary Consumer | Key Audit Question |
|-----|-----------------|-------------------|
| 2025 | Human users | "Was my prompt processed privately?" |
| 2026+ | AI agents | "Who authorized this agent to spend my money on AI?" |

### The parallelism problem -- why computing environment proof is becoming obsolete

The ECR's Environment Proof category (5 fields: `tee_type`, `pcr0`, `attestation_hash`, `pcr_baseline_version`, `pcr_verified`) assumes a model where one prompt is processed by one compute environment. This assumption is breaking down:

| Trend | Impact on Environment Proof |
|-------|---------------------------|
| **Tensor parallelism** | A single inference splits across 4-8 GPUs. Which GPU's attestation do you record? |
| **Pipeline parallelism** | Different layers of the same model run on different machines. No single PCR0 represents the execution. |
| **Batch execution** | Multiple prompts are batched and processed together for throughput. A single attestation covers N prompts, not one. |
| **Mixture of Experts (MoE)** | Different experts within a model may run on different hardware. The execution path is dynamic. |
| **Speculative decoding** | A draft model generates candidates on one device; a verification model runs on another. Two environments, one inference. |
| **Multi-provider routing** | Inference routers (e.g., OpenRouter) may split requests across providers for latency optimization. |

When Llama 3.3 70B runs on 8 GPUs with tensor parallelism, recording one PCR0 value is not just incomplete -- it is misleading. It implies a single-environment execution that did not happen.

This does not mean environment proof has zero value. For specific regulatory contexts (HIPAA, GDPR), proving that data was processed inside a TEE enclave remains meaningful. But the *general-purpose* value of per-inference environment attestation is declining as AI inference becomes inherently distributed.

**The implication for AER**: Computing environment proof (Category 3) remains available as a **premium tier** for specialized use cases, but AER's primary value comes from the new categories -- authorization, lineage, and economic context -- which are meaningful regardless of how the inference is physically distributed.

### What the current ECR answers -- and what it does not

The current ECR captures 22 fields organized into 7 categories (Execution Context, Execution Result, Environment Proof, Credibility Snapshot, Economic Finality, Temporal Proof, Policy Snapshot). It answers:

- **WHERE** was it computed? (tee_type, pcr0, attestation_hash, pcr_verified)
- **WHO** computed it? (executor, executor_reputation, executor_tier)
- **WHAT** was the cost? (payment_amount)
- **WHEN** did it happen? (request_created_at, settled_at)

It does **not** answer:

- **WHO authorized** this execution? (No `authorizer` field)
- **WHICH agent** acted on behalf of a human? (No `agent` field)
- **WHICH budget** funded it? (No `budget_id` field)
- **WHY** was this execution performed -- what preceded it? (No `parent_aer_id`, no `session_id`)

### The Trading Bot scenario

Consider a trading bot agent that executes 500 AI inferences per day, funded by a Budget its human owner created. One day, the agent's AI-driven analysis produces a bad recommendation that leads to a $10M loss. The auditor needs to answer:

1. Who authorized this agent to use AI? --> **Not in ECR**
2. What Budget funded the inference? --> **Not in ECR**
3. Was the agent operating within its delegated constraints? --> **Not in ECR**
4. What prior AI inferences led to this decision? --> **Not in ECR**
5. What hardware executed it? --> In ECR (pcr0, tee_type)

The auditor gets PCR0 values -- and nothing about the authorization chain. This is the wrong balance.

### The Budget system gap

Baram's `budget.move` contract (deployed on Devnet V7 as part of the baram package `0xaf77...19e6`) already implements a complete delegation system:

- `Budget.owner` -- the human who created and funds the budget
- `Budget.agent` -- the AI agent authorized to spend
- `Budget.balance` -- the escrowed NUSDC
- `Budget.max_per_request`, `allowed_models`, `allowed_executors` -- constraints

The SDK's `executeWithBudget()` creates an ECR after settlement. But that ECR records `requester` (the agent's address) and `executor` (the compute provider) -- with **zero Budget information**. The on-chain record cannot distinguish between:

- A human paying directly from their wallet
- An agent spending from a delegated Budget with constraints

This is the gap AER closes.

### Market context

| Signal | Date | Relevance |
|--------|------|-----------|
| EU AI Act full enforcement | August 2026 | Mandates auditable records for AI systems; fines up to 7% of global revenue |
| AI agent market projection | 2030 | $52.62B (from $7.84B in 2025) |
| Audit trail automation market | 2024-2028 | $650M to $3.2B, CAGR 38% |
| x402 Protocol (Coinbase) | 2025-2026 | 100M+ TX; payment protocol, no audit trail |
| ERC-8004 ("Trustless Agents") | 2025 | NFT-based agent identity; complementary to execution reports |

No crypto-native protocol currently produces per-inference on-chain audit trails that include authorization context. This is an empty market.

---

## 2. Design Principles

### Baram's declaration

> "We don't guarantee that AI is correct. We guarantee who is economically responsible when AI is not correct."

This is the ontological boundary. Baram is a financial accountability system, not an AI quality system. AER extends this from *economic accountability* to *authorization accountability* -- recording not just who paid and who computed, but who delegated authority and under what constraints.

### Four guarantees

AER guarantees exactly four things:

| Guarantee | What it proves | Current ECR | AER |
|-----------|---------------|-------------|-----|
| **Authorization** | Which entity authorized execution under what constraints | Partial (`requester` only) | Full (`agent`, `authorizer`, `budget_id`, `authorization_type`) |
| **Execution Claim** | Which provider claims to have executed on what hardware | Yes | Yes (unchanged) |
| **Economic Settlement** | Who was paid, how much, from what source | Partial (`payment_amount` only) | Full (`funding_source`, `budget_remaining`) |
| **Lineage** | Relationship to prior executions | No | Yes (`parent_aer_id`, `session_id`) |

### What AER does NOT guarantee

- Output accuracy, bias, fairness, or safety
- That the AI model produced the correct answer
- Regulatory compliance (AER provides *evidence* for compliance workflows, not compliance itself)
- That the agent acted wisely within its constraints

### Design constraints

1. **Backward compatible**: All new fields use `Option<T>` or have safe default values. Existing Direct payment flows produce AERs with identical data to current ECRs.

2. **TEE as premium tier, not requirement**: 80% of AER value (authorization, economic settlement, lineage) is delivered without TEE. TEE adds environment proof for the remaining 20%. Furthermore, modern AI inference is inherently distributed (tensor parallelism, batch execution, MoE routing), making single-environment attestation increasingly incomplete. Environment proof retains value for specific regulatory contexts (HIPAA, GDPR) but is not the foundation of AER's value proposition.

3. **Immutable**: An AER is a receipt. Once created, it is never modified. It is transferred to the requester as an owned object.

4. **Standalone**: No cross-package dependencies. All data is passed as parameters to `create_record()`, consistent with the existing compliance.move design.

---

## 3. Proposed AER Structure

The `AIExecutionReport` struct retains all 22 existing ECR fields and adds 8 new fields across 3 new categories, for a total of 30 fields in 10 categories.

```move
/// AI Execution Report (AER)
///
/// An immutable on-chain proof that an AI execution was performed under
/// specific, verifiable conditions -- including authorization chain,
/// economic context, and decision lineage.
///
/// Extends the ExecutionComplianceRecord (ECR) with three new categories:
///   - Authorization Proof: who delegated authority and under what constraints
///   - Decision Lineage: relationship to prior executions
///   - Economic Context: funding source and budget state
///
/// This is NOT "the answer was correct."
/// This IS "the process followed the rules, authorized by these entities,
/// funded from this source, and linked to this decision chain."
public struct AIExecutionReport has key, store {
    id: UID,

    // ============================================================
    // Category 1: Execution Context (5 fields) [RETAINED]
    // ============================================================

    /// On-chain request ID from BaramRegistry
    request_id: u64,
    /// User who requested the computation (or agent address in Budget flows)
    requester: address,
    /// Executor who performed the computation
    executor: address,
    /// AI model identifier (e.g., "llama-3.3-70b-versatile")
    model: String,
    /// SHA-256 of encrypted prompt (identifier, not content)
    prompt_hash: vector<u8>,

    // ============================================================
    // Category 2: Execution Result (2 fields) [RETAINED]
    // ============================================================

    /// SHA-256 of AI output (identifier, not content)
    result_hash: vector<u8>,
    /// Wall-clock execution time in milliseconds
    execution_time_ms: u64,

    // ============================================================
    // Category 3: Environment Proof (5 fields) [RETAINED]
    // Premium tier only. Modern AI inference is distributed
    // (parallelism, batching, MoE) -- single-environment attestation
    // is increasingly incomplete. Retained for regulatory contexts
    // (HIPAA, GDPR) where TEE enclave proof has specific legal value.
    // ============================================================

    /// TEE type: 0=None, 1=Nitro, 2=SGX, 3=SEV
    tee_type: u8,
    /// Actual PCR0 from attestation (48 bytes, empty if no TEE)
    pcr0: vector<u8>,
    /// SHA-256 of COSE_Sign1 rawDocument (empty if no TEE)
    attestation_hash: vector<u8>,
    /// AttestationRegistry baseline version used for verification
    pcr_baseline_version: u64,
    /// Whether PCR values matched the registered baseline
    pcr_verified: bool,

    // ============================================================
    // Category 4: Credibility Snapshot (4 fields) [RETAINED]
    // ============================================================

    /// Executor's reputation score at execution time (0-1000)
    executor_reputation: u64,
    /// Executor's staked NASUN amount at execution time (in SOE)
    executor_stake_amount: u64,
    /// Executor's cumulative slash count at execution time
    executor_slash_count: u64,
    /// Executor's tier at execution time (0=Open, 1=Bronze, 2=Silver, 3=Gold)
    executor_tier: u8,

    // ============================================================
    // Category 5: Economic Finality (1 field) [RETAINED]
    // ============================================================

    /// NUSDC payment amount (6 decimals)
    payment_amount: u64,

    // ============================================================
    // Category 6: Temporal Proof (2 fields) [RETAINED]
    // ============================================================

    /// When the original request was created (ms since epoch)
    request_created_at: u64,
    /// When the settlement was finalized (ms since epoch)
    settled_at: u64,

    // ============================================================
    // Category 7: Policy Snapshot (3 fields) [RETAINED]
    // ============================================================

    /// Policy version at time of settlement
    policy_version: u64,
    /// Timeout that applied to this request (ms)
    timeout_ms: u64,
    /// Minimum price that applied to this request
    min_price: u64,

    // ============================================================
    // Category 8: Authorization Proof (4 fields) [NEW]
    // ============================================================

    /// The AI agent that executed (differs from requester in Budget flows).
    /// None for Direct payment flows where the human is both requester and actor.
    agent: Option<address>,
    /// The Budget owner who delegated authority to the agent.
    /// None for Direct payment flows.
    authorizer: Option<address>,
    /// Reference to the Budget object that funded this execution.
    /// None for Direct and Sponsored payment flows.
    budget_id: Option<ID>,
    /// How the execution was authorized:
    ///   0 = Direct (human pays from wallet, no delegation)
    ///   1 = Budget (agent spends from delegated Budget)
    ///   2 = Sponsored (third-party pays on behalf of requester)
    authorization_type: u8,

    // ============================================================
    // Category 9: Decision Lineage (2 fields) [NEW]
    // ============================================================

    /// Previous AER in the decision chain.
    /// Enables tracing multi-step agent workflows:
    ///   Agent A (research) -> Agent B (trading) -> parent links them.
    parent_aer_id: Option<ID>,
    /// Groups related executions within a single task or session.
    /// 32 bytes (SHA-256 of session identifier). Enables querying
    /// "all executions in this agent's research session."
    session_id: Option<vector<u8>>,

    // ============================================================
    // Category 10: Economic Context (2 fields) [NEW]
    // ============================================================

    /// How the execution was funded:
    ///   0 = Wallet (requester paid directly from NUSDC balance)
    ///   1 = Budget (agent spent from delegated Budget)
    ///   2 = Sponsored (third-party funded the execution)
    funding_source: u8,
    /// Budget balance remaining after this execution.
    /// None for non-Budget flows. Enables monitoring budget burn rate.
    budget_remaining: Option<u64>,
}
```

### Summary of changes

| Category | Fields | Status |
|----------|--------|--------|
| 1. Execution Context | `request_id`, `requester`, `executor`, `model`, `prompt_hash` | Retained |
| 2. Execution Result | `result_hash`, `execution_time_ms` | Retained |
| 3. Environment Proof | `tee_type`, `pcr0`, `attestation_hash`, `pcr_baseline_version`, `pcr_verified` | Retained (premium tier -- see parallelism note) |
| 4. Credibility Snapshot | `executor_reputation`, `executor_stake_amount`, `executor_slash_count`, `executor_tier` | Retained |
| 5. Economic Finality | `payment_amount` | Retained |
| 6. Temporal Proof | `request_created_at`, `settled_at` | Retained |
| 7. Policy Snapshot | `policy_version`, `timeout_ms`, `min_price` | Retained |
| 8. Authorization Proof | `agent`, `authorizer`, `budget_id`, `authorization_type` | **New** |
| 9. Decision Lineage | `parent_aer_id`, `session_id` | **New** |
| 10. Economic Context | `funding_source`, `budget_remaining` | **New** |

**Total: 22 retained + 8 new = 30 fields.**

---

## 4. Field Rationale Table

| Field | Type | Why It's Needed | Concrete Scenario |
|-------|------|----------------|-------------------|
| `agent` | `Option<address>` | Distinguishes the acting AI agent from the funding human. Without this, on-chain records cannot identify which agent made the decision. | Trading bot 0xAGENT executes via Budget. ECR currently records 0xAGENT as `requester` -- indistinguishable from a human. AER records `agent=0xAGENT`, `authorizer=0xHUMAN`. |
| `authorizer` | `Option<address>` | Identifies the human (or entity) who delegated authority. Critical for liability: when things go wrong, auditors trace back to the authorizer. | EU AI Act audit: "Who approved this AI agent to process customer data?" Answer is in `authorizer`, not in `requester`. |
| `budget_id` | `Option<ID>` | Links the execution to the specific Budget object, enabling constraint verification. Auditors can cross-reference the Budget's `allowed_models`, `max_per_request`, and `expires_at`. | Agent spent $50 from Budget 0xBUDGET. Auditor queries the Budget object and confirms the agent was within its $100 max_per_request limit. |
| `authorization_type` | `u8` | Classifies the authorization model for filtering and analytics. Enables queries like "show me all Budget-delegated executions" without parsing optional fields. | Dashboard shows: "82% of executions are Budget-delegated, 15% Direct, 3% Sponsored" -- useful for understanding agent vs. human usage patterns. |
| `parent_aer_id` | `Option<ID>` | Creates a verifiable chain of AI decisions. When Agent B acts on Agent A's output, the link is on-chain and immutable. | Research agent produces market analysis (AER-1). Trading agent reads it and executes a trade (AER-2, parent=AER-1). Post-mortem traces the full decision chain. |
| `session_id` | `Option<vector<u8>>` | Groups related executions within a logical task. Unlike `parent_aer_id` (linear chain), `session_id` captures parallel or branching workflows. | Enterprise AI gateway: employee asks a complex question requiring 5 sequential inferences. All 5 AERs share the same `session_id` for grouped audit. |
| `funding_source` | `u8` | Records how the execution was economically funded. Complements `authorization_type` -- authorization and funding can differ (e.g., Sponsored authorization but Wallet funding). | Analytics: "Budget-funded executions cost 3x more on average than Wallet-funded" -- insight into agent spending patterns vs. human spending. |
| `budget_remaining` | `Option<u64>` | Snapshots the Budget balance after execution. Enables monitoring budget burn rate without querying the Budget object at each historical point. | Agent has been spending aggressively. Auditor reviews AERs and sees `budget_remaining` declining from 1000 NUSDC to 50 NUSDC over 200 executions in 3 hours -- triggers investigation. |

---

## 5. Use Cases

### Scenario A: Trading Bot with Budget Delegation

**Setup**: Alice (0xALICE) creates a Budget delegating 1,000 NUSDC to her trading bot (0xBOT). The bot is allowed to use `llama-3.3-70b-versatile` with a max of 5 NUSDC per request.

**Flow**:
1. Alice calls `budget::create_budget()` with constraints
2. The bot calls `executeWithBudget()` via SDK, requesting market analysis
3. Executor 0xEXEC processes the request and settles on-chain
4. AER is created and transferred to 0xBOT

**Resulting AER (key fields)**:

```
AIExecutionReport {
    // Execution Context
    request_id: 42,
    requester: 0xBOT,             // The agent that initiated
    executor: 0xEXEC,             // The compute provider
    model: "llama-3.3-70b-versatile",

    // Authorization Proof [NEW]
    agent: Some(0xBOT),           // The acting agent
    authorizer: Some(0xALICE),    // The human who delegated
    budget_id: Some(0xBUDGET),    // The Budget object
    authorization_type: 1,         // 1 = Budget delegation

    // Decision Lineage [NEW]
    parent_aer_id: None,           // First in chain
    session_id: Some(0xSESSION),   // Trading session group

    // Economic Context [NEW]
    funding_source: 1,             // 1 = Budget
    budget_remaining: Some(995_000_000),  // 995 NUSDC left

    // Credibility Snapshot
    executor_tier: 3,              // Gold
    executor_reputation: 950,

    // Economic Finality
    payment_amount: 100_000,       // 0.1 NUSDC
}
```

**Audit value**: When the bot's trading recommendation causes a loss, the auditor can immediately answer: "Alice authorized this bot, it operated within its Budget constraints (5 NUSDC max, approved model), and this was the 6th inference in trading session 0xSESSION."

### Scenario B: Multi-Agent Decision Chain

**Setup**: A research agent (0xRESEARCH) and a trading agent (0xTRADER) collaborate. The research agent analyzes market data and passes findings to the trading agent, which makes execution decisions.

**Flow**:
1. Research agent requests market analysis via Baram --> AER-1 created
2. Trading agent reads AER-1's result_hash, verifies executor quality (Gold tier, reputation 950)
3. Trading agent requests trade execution analysis via Baram, passing `parent_aer_id = AER-1.id`
4. AER-2 created with lineage link

**Decision chain**:

```
AER-1 (Research)                    AER-2 (Trading)
┌──────────────────────┐           ┌──────────────────────┐
│ request_id: 100      │           │ request_id: 101      │
│ requester: 0xRESEARCH│           │ requester: 0xTRADER  │
│ model: llama-3.3-70b │           │ model: llama-3.3-70b │
│ parent_aer_id: None  │ ───────>  │ parent_aer_id: AER-1 │
│ session_id: 0xSESSION│           │ session_id: 0xSESSION│
│ executor_tier: 3     │           │ executor_tier: 2     │
└──────────────────────┘           └──────────────────────┘
```

**Audit value**: An auditor investigating a bad trade traces the chain backward:

1. Query AER-2 --> sees `parent_aer_id = AER-1`
2. Query AER-1 --> sees the research inference that informed the trade
3. Both share `session_id = 0xSESSION` --> confirms they are part of the same workflow
4. The auditor can verify executor quality at each step, model used, and timestamps

This is impossible with the current ECR, which produces independent, unlinked records.

### Scenario C: Enterprise AI Gateway

**Setup**: Acme Corp routes all employee AI requests through Baram as an internal AI gateway. Each department has a Budget with model and spending constraints.

**Flow**:
1. Engineering Budget: allows `llama-3.3-70b`, max 10 NUSDC/request, no executor restriction
2. Legal Budget: allows `llama-3.3-70b` only with TEE executors, max 5 NUSDC/request
3. Employee requests AI analysis through the gateway
4. AER created for every inference, `session_id` groups related queries

**Compliance audit (EU AI Act)**:

```sql
-- "Show me all AI executions by the Legal department in Q1 2026"
SELECT * FROM AIExecutionReport
WHERE authorizer = '0xLEGAL_BUDGET_OWNER'
  AND settled_at BETWEEN '2026-01-01' AND '2026-03-31';

-- "Show me all non-TEE executions by any department"
SELECT * FROM AIExecutionReport
WHERE tee_type = 0
  AND authorization_type = 1;  -- Budget-delegated only

-- "Show me the complete decision chain for inference #5432"
WITH RECURSIVE chain AS (
    SELECT * FROM AIExecutionReport WHERE request_id = 5432
    UNION ALL
    SELECT aer.* FROM AIExecutionReport aer
    JOIN chain ON aer.id = chain.parent_aer_id
)
SELECT * FROM chain;
```

**Audit value**: Every AI inference is recorded with authorization context, funding source, and decision lineage. The enterprise produces compliance evidence for EU AI Act auditors by querying on-chain AERs -- no separate logging infrastructure needed.

---

## 6. Backward Compatibility

### Existing Direct payment flows are unchanged

When a human user pays directly from their wallet (the current default flow), the AER is populated as follows:

| New Field | Value for Direct Flow | Effect |
|-----------|----------------------|--------|
| `agent` | `None` | No agent involved |
| `authorizer` | `None` | No delegation |
| `budget_id` | `None` | No Budget used |
| `authorization_type` | `0` (Direct) | Default |
| `parent_aer_id` | `None` | No chain |
| `session_id` | `None` | No session |
| `funding_source` | `0` (Wallet) | Default |
| `budget_remaining` | `None` | Not applicable |

All new fields either default to `None` or to a safe zero value. **Existing ECR consumers see identical data** in Categories 1-7.

### SDK and Frontend compatibility

| Component | Current | After AER | Migration |
|-----------|---------|-----------|-----------|
| `ECRData` type (SDK) | 22 fields | 30 fields | Additive -- new optional fields, old code ignores them |
| `fetchECRByRequestId()` | Parses 22 fields | Parses 30 fields | Add new field parsing with fallback defaults |
| `ECRReceipt.tsx` (Frontend) | Displays 22 fields | Displays 30 fields | Add new sections for Authorization, Lineage, Economic Context |
| `OnChainReceiptContent.tsx` | Renders ECR data | Renders AER data | Add conditional rendering for new fields |
| Settlement PTB (sui-client.ts) | 22 params to `create_record` | 30 params to `create_record` | Add new params with defaults for Direct flows |

### On-chain struct rename

The struct name changes from `ExecutionComplianceRecord` to `AIExecutionReport`. Since Move structs are identified by `package_id::module::struct_name`, this is a **contract upgrade** -- the new struct exists alongside the old one. Existing ECR objects remain valid and queryable. New executions produce AER objects.

---

## 7. Implementation Scope

### Smart Contract

| File | Change |
|------|--------|
| `apps/baram/contracts-compliance/sources/compliance.move` | Rename struct to `AIExecutionReport`. Add 8 new fields. Update `create_record()` signature. Update event struct. Add new view functions for new fields. |

### TEE Executor (Nitro)

| File | Change |
|------|--------|
| `apps/baram/executor-nitro/src/host/sui-client.ts` | Update settlement PTB to pass new AER params. For Direct flows, pass defaults (`option::none()`, `0`). Budget flow support when `budget_id` is provided in the request. |

### Lambda Executor (Cloud Models)

| File | Change |
|------|--------|
| `apps/baram/cdk/lambda-src/executor/src/services/ai.ts` | Update settlement logic with new AER params (same pattern as sui-client.ts). |
| `apps/baram/cdk/lambda-src/executor/src/types.ts` | Add AER-related type fields. |

### SDK (@nasun/baram-sdk)

| File | Change |
|------|--------|
| `packages/baram-sdk/src/types.ts` | Rename `ECRData` to `AERData`. Add 8 new optional fields. Keep `ECRData` as deprecated type alias for backward compatibility. |
| `packages/baram-sdk/src/services/ecr.ts` | Rename to `aer.ts`. Update parsing to handle new fields. Maintain backward-compatible `fetchECRByRequestId()` alias. |

### Frontend (apps/baram/frontend)

| File | Change |
|------|--------|
| `src/features/request/services/ecrService.ts` | Update parsing for new AER fields. |
| `src/features/request/components/ECRReceipt.tsx` | Add Authorization Proof section (agent, authorizer, budget). Add Decision Lineage section (parent link, session). Add Economic Context section (funding source, budget remaining). |
| `src/components/receipt/OnChainReceiptContent.tsx` | Update receipt rendering for new field categories. |
| `src/features/request/hooks/useECR.ts` | Update hook to handle AER type. |

### Documentation

| File | Change |
|------|--------|
| `apps/baram/docs/EXECUTION_COMPLIANCE_RECORD.md` | Update to reference AER. |
| `apps/baram/CLAUDE.md` | Update contract documentation tables. |
| `CLAUDE.md` (root) | No change needed (refers to CLAUDE.md per-app). |

---

## 8. Naming Convention

| Context | Old Name | New Name | Rationale |
|---------|----------|----------|-----------|
| On-chain struct | `ExecutionComplianceRecord` | `AIExecutionReport` | "Execution Report" is an industry-standard term from the FIX Protocol (financial trading). "Compliance Record" implies the record itself provides compliance, which is inaccurate -- the record provides *evidence* for compliance workflows. "AI Execution Report" is precise: a report of an AI execution event. |
| On-chain event | `ComplianceRecordCreated` | `ExecutionReportCreated` | Consistent with struct rename. |
| SDK type | `ECRData` | `AERData` | Mirrors on-chain naming. `ECRData` retained as deprecated alias. |
| Frontend label | "Audit Trail" / "Compliance Record" | "Execution Report" | User-facing term should be intuitive. "Execution Report" is self-explanatory; "Compliance Record" requires domain knowledge. |
| Internal shorthand | ECR | AER | Three-letter acronym consistent with ECR convention. |

### Why "Execution Report" over alternatives

| Alternative | Why Not |
|-------------|---------|
| "Compliance Record" | Implies the record itself provides compliance. It does not -- it provides evidence. |
| "Audit Trail" | Generic. Every system has audit trails. Does not convey the specific structure. |
| "TruthObject" | Original name (pre-ECR). No industry precedent. Sounds like a claim of absolute truth. |
| "Execution Receipt" | "Receipt" implies a payment record. AER captures more than payment. |
| "Execution Report" | FIX Protocol precedent. Self-explanatory. Accurate: it reports what happened. |

---

## 9. Prior Art and References

### FIX Protocol Execution Reports

The Financial Information eXchange (FIX) Protocol, used by virtually every major financial exchange, defines an **Execution Report** (MsgType=8) as the primary record of trade execution. It captures:

- Order identity (who placed it)
- Execution venue (where it was executed)
- Price and quantity (economic terms)
- Timestamp (when it happened)
- Status (fill, partial fill, reject)

Baram's AER follows the same conceptual structure for AI execution: who requested, who executed, economic terms, timestamp, and execution context. The naming is a deliberate reference to this industry standard.

### EU AI Act (August 2026)

The EU AI Act mandates that deployers of high-risk AI systems maintain "logs automatically generated by the high-risk AI system" including:

- Period of use
- Reference database
- Input data
- Identification of natural persons involved in verification

AER's `settled_at`, `model`, `prompt_hash`, `authorizer`, and `agent` fields directly map to these requirements. While AER does not guarantee EU AI Act compliance by itself, it provides machine-verifiable evidence that supports compliance workflows.

### x402 Protocol (Coinbase)

The x402 Protocol (Coinbase/Cloudflare) defines HTTP 402-based micropayments for AI agents. It handles the *payment* layer but explicitly does not provide:

- Execution audit trails
- Authorization chain records
- Decision lineage

AER is complementary to x402: x402 handles payment; AER handles accountability. An agent could pay via x402 and record the execution via AER.

### ERC-8004 ("Trustless Agents")

ERC-8004 proposes NFT-based portable identity and reputation for AI agents. It addresses *who is the agent* but not *what did the agent do*. AER's `agent` field could reference an ERC-8004 agent identity, creating a complementary relationship:

- ERC-8004: "This is Agent #4521, owned by Alice, with reputation 850"
- AER: "Agent #4521 executed inference #42, authorized by Alice via Budget 0xBUDGET, as part of session 0xSESSION"

---

*This document is a design proposal, not an implementation plan. It does not include timelines, cost estimates, or resource allocation. Implementation details will be defined in separate technical specifications.*
