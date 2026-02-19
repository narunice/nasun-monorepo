# Baram-AER: AI Compliance Settlement Layer — Features Overview

> Last updated: 2026-02-18

---

## What Is Baram-AER?

Baram-AER is an **AI Compliance Settlement Layer** built on the Nasun blockchain. Its purpose is to make AI agent activity **auditable, accountable, and financially governed** — on-chain.

When a person delegates tasks and money to an AI agent, three questions naturally arise:

- **Did the agent actually run what it claimed?**
- **Did it stay within the budget I set?**
- **Can I prove, to anyone, what the agent did with my money?**

Today, no AI provider — OpenAI, Anthropic, Google, or otherwise — offers a per-inference, tamper-proof audit record. Baram-AER fills that gap. Every AI execution that passes through it produces an on-chain receipt called an **AIExecutionReport (AER)**. This receipt cannot be forged, cannot be omitted, and cannot be altered after the fact.

> **Core promise**: Your agent works for you. Baram proves it.

---

## The Four Guarantees

Every AER captures four categories of truth about an AI execution:

| Guarantee | What It Answers |
|-----------|----------------|
| **Authorization** | Who approved this execution, and under what budget and constraints? |
| **Execution Claim** | Which provider ran this, on what hardware, with what model? |
| **Economic Settlement** | Who got paid, how much, and what fees were taken? |
| **Lineage** | How does this execution relate to others — what triggered it, what did it trigger? |

---

## Core Concepts

Before describing individual features, these are the building blocks:

### AIExecutionReport (AER)
An on-chain object that records everything about a single AI execution. Think of it as a **receipt that the blockchain issues** — not one that the AI provider self-reports. It has 31 fields organized into 8 categories. Once created, it is immutable and owned by the person who initiated the request.

### Budget
A controlled spending allowance that a human creates and assigns to an AI agent. The Budget is enforced by smart contracts — not by trusting the agent to behave. If the agent tries to exceed any limit, the blockchain rejects the transaction outright.

### AgentProfile
An on-chain identity for an AI agent. It links a human owner to an agent address, and includes a **kill switch** — a single flag that, when flipped, immediately prevents the agent from spending anything, regardless of remaining budget.

### Executor
An AI inference provider registered on-chain. An Executor picks up compute requests, runs AI models, and submits the results back to the blockchain. Executors are held accountable through reputation scores, financial stakes, and hardware attestation.

### Trusted Execution Environment (TEE)
A hardware-level isolated computing zone (AWS Nitro Enclave) where the AI model runs. The key property: **even the Executor operator cannot read the prompt**. The user's input is encrypted before it enters the Enclave, and the encryption key is destroyed when execution ends.

### Attestation
Cryptographic proof that a specific, unmodified version of the Executor software ran inside the TEE. The expected "fingerprint" (called a PCR value) is registered on-chain in advance. At execution time, the fingerprint is checked against the registered value. If they don't match, execution fails.

---

## Feature 1: AIExecutionReport — The On-Chain Receipt

### What It Is
An AER is an NFT-like object that records the complete metadata of one AI execution. It is transferred directly to the person who initiated the request, making it a portable, verifiable proof that they own.

The AER does **not** store the actual prompt or response — only cryptographic hashes of them (SHA-256). This means the content stays private, but the execution can be verified.

### What It Records
The 31 fields are organized into 8 logical categories:

| Category | What It Captures |
|----------|----------------|
| **WHO (Requester)** | Who initiated the execution, who authorized it, and the full delegation chain (up to 5 levels deep) |
| **WHO (Executor)** | Which Executor ran it, and the on-chain principal address of that Executor |
| **HOW MUCH** | Total payment, what the Executor received after fees, fee breakdown, which Budget was used, and how much Budget remains |
| **WHAT** | Model name, model metadata, SHA-256 hash of the input, SHA-256 hash of the output, execution duration in milliseconds |
| **WHY** | Stated purpose, policy version, and constraints that governed the execution |
| **HOW TRUSTWORTHY** | Executor's tier level, reputation score, staked amount, whether TEE was used, and the TEE attestation hash |
| **WHEN** | Timestamps for when the request was made and when it was settled; settlement status |
| **CHAIN** | The object ID that triggered this execution, and the action this execution triggered — enabling full decision chain reconstruction |

### Why It Cannot Be Forged or Skipped
The AER creation is enforced by a smart contract mechanism called the **hot-potato pattern**. Here is how it works:

When an Executor submits a result, the blockchain issues a temporary object called a `SettlementReceipt`. This object has a critical property: it has no `drop` ability, meaning it **cannot simply be discarded**. The only way to consume it is to pass it into the AER creation function.

This means:
- If a settlement happens, an AER **must** be created in the same transaction.
- The older `create_report` function (which could create AERs without a settlement) is permanently disabled with a deprecation error (error code 405).
- The AER's Executor field is verified to match the actual transaction sender — no one else can fabricate an AER on an Executor's behalf.

The result is a system where **settlement and audit record are inseparable by design**, not just by policy.

---

## Feature 2: Budget Delegation — Controlled AI Spending

### What It Is
A Budget is an on-chain spending allowance. A human creates it, deposits NUSDC into it, and assigns it to a specific AI agent address. From that point, the agent can spend from the Budget — but only within the rules the human defined.

The key property: **enforcement is on-chain**. The agent cannot override limits by lying to an API. If a spend would violate any constraint, the Nasun blockchain aborts the transaction. There is no "I'll just handle it with a workaround" path.

### The Seven Layers of Constraint
When an agent initiates a request using a Budget, all seven of these checks happen on-chain before any funds move:

1. **Agent Identity**: Only the authorized agent address can spend from this Budget. No one else.
2. **Budget Active Status**: If the owner has paused the Budget, all spending stops immediately.
3. **Expiry**: If the Budget has a defined expiration timestamp and it has passed, spending is rejected.
4. **Balance**: The Budget must have enough NUSDC to cover the requested amount.
5. **Per-Request Maximum**: A cap on how much any single request can cost. The default is 10 NUSDC.
6. **Category Allowlist**: The request's stated category (e.g., "analysis", "trading", "summarization") must appear on an approved list. Empty list means all categories are allowed.
7. **Rate Limiting**: A minimum number of milliseconds must have elapsed since the last request. This prevents an agent from rapidly draining a budget in a burst.

In addition, **time-window spending limits** can be added:
- **Daily limit**: Maximum NUSDC the agent can spend in any 24-hour window
- **Weekly limit**: Maximum in any 7-day window
- **Monthly limit**: Maximum in any 30-day window

Each window resets automatically based on on-chain timestamps — no manual action required.

The owner can also restrict the Budget to:
- A **whitelist of allowed AI models** (empty = no restriction)
- A **whitelist of allowed Executors** (empty = no restriction)

### The Budget as On-Chain Evidence
When an AER is created for a Budget-funded execution, it records:
- `budget_id`: Which Budget was used
- `budget_remaining`: How much NUSDC remained in the Budget at settlement time

This allows anyone to verify the spending history and remaining capacity of any Budget by reading its associated AERs.

---

## Feature 3: AgentProfile & Kill Switch — Agent Identity Management

### What It Is
An AgentProfile is an on-chain object that a human creates to register their AI agent. It establishes a verifiable link between the human owner and the agent's blockchain address.

### The Kill Switch
The most important field in an AgentProfile is `is_active`. This is a boolean that only the **owner** can change.

Setting `is_active = false` immediately disables the agent:
- The Budget's spending check verifies `is_active` before processing any request
- An inactive agent cannot spend from any Budget, regardless of how much remains
- There is no delay — the effect is immediate on the next transaction attempt

This is the owner's emergency brake. If an AI agent behaves unexpectedly or the owner simply wants to stop activity, flipping this flag requires a single on-chain transaction and takes effect instantly.

### Agent Registry
All AgentProfiles are tracked in a shared `AgentProfileRegistry`. This makes it possible to enumerate all registered agents and verify whether a given agent address has an on-chain identity.

---

## Feature 4: Executor System — AI Provider Trust Infrastructure

### What It Is
An Executor is an entity that runs AI models and fulfills compute requests. Any party can register as an Executor by deploying an endpoint and registering it on-chain. What distinguishes Executors from each other is their **reputation**, **stake**, and **tier**.

### Reputation Score
Every Executor has a reputation score between 0 and 1000 (initial value: 500).

| Event | Change |
|-------|--------|
| Successful job completion | +10 |
| Failed job | -20 |
| 30 days without activity | -50 (floor: 100) |

Reputation changes are self-reported by the Executor, but protected by a deduplication table — the same job ID cannot be submitted twice, so an Executor cannot inflate its score by reporting the same job repeatedly.

The 30-day inactivity decay is **permissionless** — anyone can trigger it against an inactive Executor. This prevents reputation from becoming stale by accident.

### Staking
Executors can (and must, to reach higher tiers) stake NASUN tokens as economic collateral.

| Parameter | Value |
|-----------|-------|
| Minimum stake to register | 0 NASUN |
| Minimum stake for Bronze tier | 1,000 NASUN |
| Unbonding period | 7 days |

**Slashing** (forced loss of stake) occurs for objective, on-chain-verifiable faults:

| Fault | Penalty |
|-------|---------|
| Timeout (job not completed within window) | 5% of stake |
| Attestation mismatch (TEE fingerprint differs from registered baseline) | 10% of stake |
| Fraud (forged attestation document) | 100% of stake |

Slashed funds accumulate in an on-chain treasury. Slashing cannot be applied for subjective reasons — only for provable on-chain violations.

### Tier System
Tier is a **trust signal**, not a reward mechanism. It tells users at a glance whether an Executor has both the financial commitment and the operational track record to be considered trustworthy.

Tier is calculated as: `effective_tier = min(stake_tier, reputation_tier)`

Both dimensions must qualify — a high-stake Executor with poor reputation stays at a low tier, and vice versa.

| Tier | Name | Minimum Stake | Minimum Reputation |
|------|------|--------------|-------------------|
| 0 | Open | None | None |
| 1 | Bronze | 1,000 NASUN | 300 |
| 2 | Silver | 5,000 NASUN | 500 |
| 3 | Gold | 10,000 NASUN | 700 |

Tier recalculation is **permissionless** — anyone can trigger a refresh using the current on-chain state (stake balance and reputation score). Tiers cannot fall out of sync by remaining stale.

Tier is recorded in every AER, giving users a permanent record of how much they trusted the provider at the time of execution.

---

## Feature 5: TEE Privacy — Confidential AI Execution

### What It Is
The TEE (Trusted Execution Environment) Executor runs AI models inside an **AWS Nitro Enclave** — a hardware-isolated computing zone that is cryptographically separated from the rest of the machine, including the Executor operator's own operating system.

The result: **the Executor operator cannot read your prompt**. The actual text never exists in a readable form outside the Enclave.

### How It Works

**Encryption before entry**: Before a prompt is sent to the Executor, it is encrypted using the Enclave's public RSA key (RSA-OAEP). The encryption produces ciphertext that can only be decrypted by the corresponding private key — which lives exclusively inside the Enclave.

**Decryption inside the Enclave**: The Enclave receives the encrypted prompt, decrypts it with its private key, passes it to the local LLM, and processes the output entirely within its isolated memory.

**Key destruction on shutdown**: The RSA private key is generated fresh when the Enclave starts. When it stops, the key is destroyed. There is no persistent storage — no key file that could later be extracted.

**No network access from inside**: The Enclave has no direct internet connection. All external communication goes through a controlled vsock channel to the host. This prevents the Enclave from leaking data through side channels.

The local LLM model (LLaMA 3.2 3B) runs entirely within the Enclave, meaning inference happens in the same isolated zone as decryption. At no point does the plaintext prompt cross the Enclave boundary in a readable form.

### What This Means in Practice
- The Executor operator cannot log, read, or sell your prompts.
- Infrastructure providers (AWS) cannot access the prompt content.
- A compromised host machine cannot extract decrypted data from the Enclave.
- The TEE model (`llama-3.2-3b-local`) is smaller than cloud-based alternatives as a consequence of this design.

Each AER records `tee_verified: true/false` and `tee_attestation_hash` — so the audit record permanently reflects whether a given execution used TEE protection.

---

## Feature 6: Attestation — Proving the Code Was Not Tampered With

### What It Is
TEE privacy proves that the operator cannot read the prompt. Attestation proves that **the code running inside the TEE has not been modified** — that the Executor is actually running the published, trusted version of its software.

This is achieved through **PCR values** (Platform Configuration Registers), which are hardware-generated SHA-384 hashes of the Enclave's software components.

| PCR | What It Measures |
|-----|----------------|
| PCR0 | Hash of the entire Enclave image |
| PCR1 | Hash of the Linux kernel and boot loader |
| PCR2 | Hash of the application code |

### How It Works

**Baseline registration**: Before an Executor goes live, the expected PCR values for its software version are registered on-chain in the `AttestationRegistry`. These serve as the "known good" fingerprints.

**Runtime attestation**: Each time the Enclave starts, AWS hardware generates an **attestation document** (a COSE_Sign1 signed object containing the live PCR values). This document is signed by AWS Nitro's root certificate authority and includes:
- The live PCR values
- A hash of the Enclave's current public key
- A random nonce (to prevent replay attacks)
- A timestamp

**Off-chain verification (before on-chain settlement)**: The Executor host verifies the attestation document by:
1. Parsing the COSE_Sign1 structure
2. Verifying the signature using AWS's certificate chain, tracing back to the Nitro Root CA
3. Checking that the live PCR values match the registered baseline in `AttestationRegistry`
4. Confirming the timestamp is within 5 minutes (freshness check)

If any check fails, execution stops. The attestation hash is recorded in the AER, enabling independent post-hoc verification.

**What this prevents**: An Executor cannot silently modify its AI model or logging behavior and pass it off as the audited version. Any change to the Enclave image produces different PCR values, which fail baseline verification and halt settlement.

---

## The Full Execution Flow

From the user's perspective, a complete Baram-AER cycle looks like this:

**1. Register an agent**
Create an `AgentProfile` on-chain, linking your address to your AI agent's address. This is a one-time setup step.

**2. Create a Budget**
Define how much NUSDC the agent can spend, under what constraints (daily limits, per-request cap, allowed models, rate limits). Deposit NUSDC into the Budget. The Budget is now active and governed by smart contracts.

**3. The agent requests computation**
When the AI agent wants to perform an AI inference, it calls the `create_request_with_budget` function. The smart contract verifies all Budget constraints on-chain, locks the NUSDC in escrow, and creates a `ComputeRequest` object.

**4. An Executor picks up the job**
The system assigns the request to an eligible Executor (filtered by tier, weighted by reputation). The Executor receives the request parameters and begins execution.

**5. AI inference runs (TEE mode)**
If using TEE: the prompt arrives encrypted, is decrypted inside the Enclave, the LLM runs, and the output is hashed. The Enclave generates an attestation document. The host verifies it before proceeding.

**6. Settlement and AER creation (atomic)**
The Executor submits the result hash in a single blockchain transaction (PTB — Programmable Transaction Block) that executes four steps atomically:
- Step 1: Submit the result hash → NUSDC is released from escrow to the Executor → `SettlementReceipt` is created
- Step 2: Create the AER using the `SettlementReceipt` → AER is minted and sent to the initiator
- Step 3: The Executor's reputation increases by +10
- Step 4: The Executor's tier is recalculated using current on-chain state

All four steps succeed or all four fail. There is no partial settlement.

**7. The initiator receives the AER**
The AER NFT appears in the initiator's wallet. It serves as a permanent, portable proof of the execution. Anyone can read it on-chain.

**8. Review in the Dashboard**
The Baram-AER Dashboard shows:
- Active agents and their status
- Budget consumption (remaining balance, daily/weekly/monthly spend)
- Full AER timeline with filtering
- Individual AER detail views

---

## Feature 7: Baram-AER SDK — Programmatic Access to Audit Data

The `@nasun/baram-aer-sdk` is a read-only TypeScript library for querying and analyzing AER data. It requires no signing keys or credentials — only a connection to the Nasun RPC.

### Query Capabilities

**By record identifier**
- Fetch a single AER by its blockchain request ID or object ID

**By time**
- Fetch recent AERs with cursor-based pagination (most recent first)

**By address**
- Fetch all AERs where a given address is the initiator, executor, or authorizer

**By Budget**
- Fetch all AERs associated with a specific Budget ID

**By filter**
- Combine any number of criteria: address, model name, tier level, TEE verification status, payment range, time window, whether the execution is part of a decision chain, and more

### Analytics Capabilities

**Summarization**
Given a list of AER records, compute an `AERSummary`: total payments (broken out by NUSDC vs NASUN), average and median execution time, distribution by status / tier / model / executor, TEE verification rate, and the time window covered.

**Grouping**
Group any list of AERs by a single dimension — executor, model name, budget, initiator, tier, payment token, or status — returning a map of grouped results.

**Spending Timeline**
Produce a time-series of spending data at hourly, daily, or weekly granularity. Useful for charting budget burn rates over time.

**Trust Profile**
Analyze a set of AERs to produce a `TrustProfile`: TEE verification rate, average executor tier and reputation score, executor diversity score, tier distribution, and the top 10 executors by frequency.

**Budget Utilization**
For a given Budget, compute: total consumed NUSDC, remaining balance, burn rate (NUSDC per hour), estimated runway (hours remaining), per-model usage breakdown, per-executor usage breakdown, and balance history.

### Decision Chain Tracing

Because AERs record `triggeredBy` (which AER triggered this one) and `triggeredAction` (what action this AER subsequently triggered), it is possible to reconstruct the full decision chain of an AI agent across multiple executions.

**Backward tracing**: Given an AER, walk backward through `triggeredBy` links to reconstruct the root cause — the original human action that started the chain.

**Forward tracing**: Given an AER, walk forward through `triggeredAction` links to find everything downstream — all the follow-on actions the agent took.

This allows auditors to reconstruct, after the fact, why a specific on-chain action happened and what the agent's full decision sequence was.

---

## Security Invariants

These properties are guaranteed by the smart contracts — not by policy, trust, or configuration:

**1. AER is always created when settlement occurs**
The hot-potato `SettlementReceipt` cannot be dropped. If NUSDC moves out of escrow to an Executor, an AER is created in the same transaction. There is no way to settle without leaving an audit record.

**2. Budget is the only door to agent spending**
There is no path for an authorized agent to spend NUSDC that bypasses Budget constraints. Every Budget-funded request goes through all seven validation checks simultaneously.

**3. The kill switch is instant and absolute**
When an AgentProfile's `is_active` is set to `false`, the agent's Budget access is revoked immediately. No in-flight requests are affected (those are already in escrow), but no new requests can be created.

**4. Rate limiting prevents burst drains**
The minimum request interval and time-window caps together prevent an agent from spending its entire Budget in a single burst, even if it has sufficient per-request balance.

**5. Time-window caps are always enforced**
Daily, weekly, and monthly limits cannot be exceeded under any circumstances. Windows reset automatically; they cannot be reset manually.

**6. The AER Executor field is always the actual transaction sender**
The smart contract verifies that the `executor` field in every AER matches `tx_context::sender()`. An Executor cannot create an AER attributing execution to a different address, and no third party can create an AER on behalf of an Executor.
