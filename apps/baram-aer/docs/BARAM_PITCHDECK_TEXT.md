# Baram Pitchdeck — Slide Text (v1)

> Last Updated: 2026-02-20
> Target Audience: Crypto VCs (Pre-Seed)
> Language: English
> Format: Slide text (concise) + Speaker Notes (expandable)

---

## SLIDE 1 — Title

**BARAM**

Your agent works for you. Baram proves it.

The AI Compliance Settlement Layer on Nasun Network.

---

## SLIDE 2 — The Problem

**AI Agents Act Without Accountability**

When you give an AI agent your money and authority, three questions arise:
- **Did it actually run what it claimed?**
- **Did it stay within the budget I set?**
- **Can I prove, to anyone, what the agent did?**

Today, no AI provider — OpenAI, Anthropic, Google — offers a per-inference, tamper-proof audit record.

> Speaker Notes: Enterprises deploying AI agents face a growing accountability gap. Internal policies and application-layer logging are controlled by the platform operator — insufficient for regulators, auditors, or stakeholders who need independent verification. The answer to an auditor cannot be "we have a policy." It must be "here is a cryptographic, tamper-proof record."

---

## SLIDE 3 — The Market

**Two Regulatory Deadlines. One Empty Market.**

- **EU AI Act** — Enforcement August 2026. Mandatory audit trails for high-risk AI. Fines up to 7% of global revenue.
- **Korea AI Basic Act** — Effective January 2026. Accountability frameworks for AI systems.
- **AI Agent Economy** — $7.84B (2025) → $52.62B (2030). 40%+ CAGR.
- **Korea Government AI Budget** — $7.27B allocated for AI infrastructure
- **Audit Trail Automation** — $650M (2024) → $3.2B (2028). 38% CAGR.

**No crypto-native AI compliance protocol exists.** The market is empty.

> Speaker Notes: Every organization deploying autonomous AI agents in a regulated environment will eventually face the same question from auditors: "Prove this agent did what it was authorized to do." That infrastructure does not exist today. AI infra projects (Bittensor, Akash, io.net) compete on compute cost. AI observability tools (LangSmith, W&B) track performance metrics. Neither provides tamper-proof on-chain audit trails or enforces spending constraints atomically. Baram competes on accountability — a different axis entirely.

---

## SLIDE 4 — The Solution

**AI Compliance Settlement Layer**

Baram makes AI agent activity **auditable, accountable, and financially governed** — on-chain.

- **Every AI execution produces an immutable on-chain receipt (AER)**
- **Every agent budget is enforced by smart contracts, not trust**
- **Every agent can be shut down instantly by its owner**

Settlement and audit record are inseparable by design.

> Speaker Notes: Baram operates in two phases. Phase 1 (Governance Setup): a human defines the relationship on-chain — models, providers, spending limits, expiry, allowed categories. Phase 2 (Verification): after every inference, the system produces an AIExecutionReport capturing everything material about the execution. The hot-potato pattern in Move's linear type system makes it structurally impossible to settle without generating the corresponding audit record.

---

## SLIDE 5 — The Baram Boundary

**What Baram IS:**
- The financial and compliance rail for AI execution
- On-chain escrow, settlement, and audit trail
- Privacy-preserving inference via TEE (optional)
- SDK for programmatic access

**What Baram is NOT:**
- An AI marketplace
- A cloud platform or model host
- An agent framework
- An output quality judge

> Speaker Notes: Baram does not guarantee AI is correct. It guarantees who is economically responsible when AI is not correct. It records "who requested, who executed, how much was paid, under what conditions" — not the content of prompts or responses. This is a financial system, not an AI system.

---

## SLIDE 6 — AIExecutionReport (AER)

**The On-Chain Receipt That Cannot Be Skipped**

8 categories. 31 fields. Immutable. Owned by the initiator.

| Category | What It Captures |
|----------|-----------------|
| **WHO (Requester)** | Initiator, authorizer, delegation chain (up to 5 levels) |
| **WHO (Executor)** | Provider identity, verified against transaction sender |
| **HOW MUCH** | Payment, fees, budget used, remaining balance |
| **WHAT** | Model, input hash (SHA-256), output hash, duration |
| **WHY** | Purpose, policy version, constraints |
| **HOW TRUSTWORTHY** | Tier, reputation, stake, TEE status, attestation hash |
| **WHEN** | Request and settlement timestamps |
| **CHAIN** | Triggered by / triggered action — full decision chain |

> Speaker Notes: The AER is enforced by Move's hot-potato pattern. When an Executor submits a result, the blockchain issues a SettlementReceipt with no `drop` ability — it can only be consumed by the AER creation function. If NUSDC moves from escrow to Executor, an AER is created in the same transaction. There is no way to settle without leaving an audit record. The AER does not store prompts or responses — only cryptographic hashes. Content stays private; execution is verifiable.

---

## SLIDE 7 — Budget Delegation

**Seven On-Chain Constraint Layers**

A human creates a Budget, deposits NUSDC, and assigns it to an AI agent. The agent can spend — but only within rules enforced by smart contracts.

1. **Agent Identity** — Only the authorized agent address
2. **Active Status** — Owner can pause spending instantly
3. **Expiry** — Time-limited budgets
4. **Balance** — Sufficient funds required
5. **Per-Request Cap** — Maximum cost per inference
6. **Category Allowlist** — Restricted action types
7. **Rate Limiting** — Minimum interval between requests

**Plus:** Daily / Weekly / Monthly spending caps. Auto-reset.

> Speaker Notes: This is not a policy document. It is code. If the agent tries to exceed any limit, the blockchain rejects the transaction outright. There is no workaround path. The Budget + AgentProfile kill switch together give owners instant, absolute control — one transaction to freeze all agent spending.

---

## SLIDE 8 — Executor Trust Infrastructure

**Reputation. Staking. Slashing. Tiers.**

| Tier | Name | Min Stake | Min Reputation |
|------|------|-----------|----------------|
| 0 | Open | None | None |
| 1 | Bronze | 1,000 NASUN | 300 |
| 2 | Silver | 5,000 NASUN | 500 |
| 3 | Gold | 10,000 NASUN | 700 |

- **Reputation** (0-1000): +10 per success, -20 per failure, -50 for 30-day inactivity
- **Slashing**: 5% (timeout) · 10% (attestation mismatch) · 100% (fraud)
- **Tier = min(stake_tier, reputation_tier)** — both dimensions must qualify
- Tier recorded in every AER — permanent trust signal

> Speaker Notes: Slashing applies only to objective, on-chain-verifiable faults — never for subjective quality. Reputation decay is permissionless — anyone can trigger it. Tier recalculation is also permissionless. The system is designed so that no admin intervention is required for trust signals to remain accurate.

---

## SLIDE 9 — TEE Privacy

**The Executor Cannot Read Your Prompt**

- **AWS Nitro Enclave** — Hardware-isolated computing zone
- **RSA-OAEP Encryption** — Prompt encrypted before entering enclave
- **Key Destruction** — Private key generated at start, destroyed at shutdown
- **No Network Access** — Enclave communicates only via controlled vsock channel
- **On-chain Attestation** — PCR baselines registered and verified

TEE is optional. Organizations choose privacy level by data sensitivity.

> Speaker Notes: PCR values (Platform Configuration Registers) are hardware-generated SHA-384 hashes of the enclave's software components. Expected PCR values are registered on-chain in the AttestationRegistry before the Executor goes live. At runtime, the attestation document is verified against the baseline — any code modification produces different PCR values and halts settlement. Even the Executor operator cannot read prompts, and AWS infrastructure providers cannot access content.

---

## SLIDE 10 — The Full Flow

**From Request to Receipt — One Atomic Transaction**

1. **Register** — Create AgentProfile, link owner to agent address (one-time)
2. **Fund** — Create Budget with constraints, deposit NUSDC
3. **Request** — Agent calls `create_request_with_budget` → all 7 constraints checked → NUSDC locked in escrow
4. **Execute** — Executor runs AI inference (TEE or standard)
5. **Settle** — Single PTB (Programmable Transaction Block):
   - Submit result hash → NUSDC released → SettlementReceipt created
   - AER minted → sent to initiator
   - Reputation +10 → Tier recalculated
6. **Audit** — AER in wallet. Permanent, portable, verifiable.

All steps succeed or all fail. No partial settlement.

---

## SLIDE 11 — Built, Not Promised

**Live on Nasun Devnet today.**

| | |
|--|--|
| Smart Contracts | 5 packages deployed (Baram[Escrow+Budget], Executor[Staking+Tier], Attestation, AER, Compliance) |
| AER Fields | 31 fields across 8 categories |
| Budget Constraints | 7 atomic enforcement layers + time-window caps |
| Executor Tiers | 4-level system (Open → Gold) |
| TEE Pipeline | AWS Nitro Enclave, end-to-end verified |
| Decision Chain | Full forward/backward tracing across linked AERs |
| SDK | `@nasun/baram-aer-sdk` — TypeScript, read-only analytics |
| Tests | Comprehensive E2E (SDK 9/9, contract suites) |
| External Funding | **$0** |

Not a whitepaper. A working prototype.

> Speaker Notes: The full pipeline works end-to-end on devnet: escrow creation, executor selection (reputation-weighted), AI inference (Groq cloud + local TEE LLaMA 3.2), settlement with automatic AER generation, reputation/tier updates. SDK provides query, analytics, decision chain tracing, and budget utilization analysis. All built by a 2-person team with zero external funding.

---

## SLIDE 12 — Competitive Position

**The Empty Market**

| | AI Infra (Bittensor, Akash) | AI Observability (LangSmith, W&B) | Cloud (AWS, Azure) | **Baram** |
|--|---|---|---|---|
| On-chain Audit Trail | No | No | No | **31-field AER** |
| Trustless Settlement | No | No | No | **NUSDC Escrow** |
| Budget Enforcement | No | No | No | **7-layer on-chain** |
| TEE Privacy | Partial | No | Limited | **Nitro + Attestation** |
| Cross-Platform | Yes | No | No | **Neutral** |

**Baram is not competing with AI compute providers. It is the accountability layer they all lack.**

> Speaker Notes: x402 (Coinbase) is the dominant AI agent payment protocol. Baram does not compete with x402 — it complements it. x402 handles payment. Baram provides the audit trail and compliance record. Agent pays via x402 → records AER on Nasun = complementary, not competitive. Ritual ($25M Series A) is the most similar project but focuses on verifiable execution, not compliance infrastructure.

---

## SLIDE 13 — Nasun Ecosystem

**Three Verticals. One Flywheel.**

**Pado** — DeFi engine. Spot, perps, prediction, lending, unified margin. Primary 2026 focus.
**Gen Sol** — Cinematic sci-fi IP. UE5 shooter playable. Animation in production. 10 Korean government grants.
**Baram** — AI compliance. On-chain audit trails + budget governance for autonomous agents.

Pado users → Gen Sol economy → Baram enterprise demand → NSN utility compounds across all three.

One wallet. One token. Reputation is non-portable.

> Speaker Notes: Baram's executor staking locks NSN supply, creating token demand that compounds with Pado's DeFi activity. Enterprise clients settle AI inference in NUSDC acquired through Pado. The flywheel is economic, not narrative — each vertical generates transaction demand on the same base asset and validator economy.

---

## SLIDE 14 — Revenue & Go-to-Market

**Transaction-Based. Bottom-Up.**

- **Settlement Fees** — Per-inference protocol fee (Live)
- **Staking Demand** — Executors lock NSN for tier qualification
- **At scale:** Each agent generates ~305 TX/day → 10,000 agents = 3M TX/day

**GTM Sequence:**
1. **Developer Beta** — BetaAccessNFT gating. Free AER generation. Build proof base.
2. **SDK Integration** — Plugins for LangChain, CrewAI, AutoGen. Adoption as config change.
3. **Enterprise Inbound** — Regulatory deadlines do the sales work. Korea first, EU second.
4. **Executor Growth** — Permissionless entry. More executors = better pricing + availability.

> Speaker Notes: Baram does not need enterprise partnerships to launch. It needs developers generating AERs, a growing proof base, and regulatory deadlines creating demand. 2026 Testnet Target: 10,000 AER records generated by independent developers. The partnerships follow from the proof, not the other way around.

---

## SLIDE 15 — Roadmap

**Phase 1 — Prove (2026)**
Public testnet · Developer beta · SDK framework integrations · 10K AER target
Executor staking, General + TEE inference, invited providers

**Phase 2 — Scale (2027)**
Mainnet · Permissionless executor entry · Compliance dashboard
Model licensing & royalty distribution · Multi-provider consensus

**Phase 3 — Standard (2028+)**
ZK proofs · Multi-chain verification · Enterprise batch processing
Regulatory standard adoption · ModelObject DeFi composability

---

## SLIDE 16 — Team

**Naru — Founder, Protocol Lead**
Built Nasun L1, Pado, Baram. 10yr Korean film industry (Cannes/Berlin/Venice). Clinical psychology researcher. Crypto since 2017.

**Overclocked — Founder, Ecosystem Lead**
Built SPECTRA (UE5/C++/AWS). Gen Sol IP author. 20yr media production (Microsoft, Nike, IBM). Crypto since 2017.

**Two founders. $0 funding. Shipped:** L1 blockchain + full DeFi suite + multiplayer shooter + AI compliance layer. Gen Sol IP validated by 10 Korean government grants (Grand Prize at KOCCA).

---

## SLIDE 17 — The Ask

**Pre-Seed: $1M (Nasun ecosystem-wide)**

| Category | Amount |
|----------|--------|
| Security Audits | $150K |
| Engineers (2 Network/DeFi) | $250K |
| Engineer (1 C++ Game) | $130K |
| Validators | $50K |
| Legal & Regulatory | $100K |
| Marketing & Community | $150K |
| Testnet Portal & Media | $100K |
| Buffer | $20K |

Pre-Seed → Seed (milestones proven) → Series A (live mainnet)
No team tokens at TGE. Milestone-based unlocks only.

> Speaker Notes: The $1M pre-seed funds the entire Nasun ecosystem (Pado + Gen Sol + Baram). Baram-specific allocation covers: escrow/settlement contract audits within the $150K audit budget, and Baram SDK/framework integration within the engineering hires. Legal budget includes Korea AI Basic Act compliance review. Each round funds specific milestones that justify the next round's valuation.

---

## SLIDE 18 — Closing

**Your agent works for you. Baram proves it.**

On-chain audit trails. Trustless settlement. Budget governance.
5 contract packages deployed. 31-field AER. $0 funding.

No one else is building per-inference on-chain accountability for AI.

We are not asking you to fund an idea.
We are asking you to scale something already running.
