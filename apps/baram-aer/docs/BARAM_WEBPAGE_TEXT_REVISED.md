> ## Revision Summary (from A- rated original)
>
> **Critical Fixes (Must-Have):**
>
> | Issue | Original | Revised |
> |-------|----------|---------|
> | Hero subject confusion | "Nasun is an object-centric L1..." (page is about Baram, not Nasun) | "Baram is the settlement protocol... built on Nasun" |
> | Bootstrap partners | Named unconfirmed partners (CoreWeave, Lambda Labs, RunPod, SiliconFlow) | Removed specific company names; used generic descriptions |
> | Bootstrap structure | 3 phases (Foundation / Network Effects / Standard Setting) | 4 phases (added Phase 0: Team-Operated — honest about current stage) |
> | TEE-only assumption | "Blind Inference", TEE presented as mandatory | Dual support: TEE (Confidential) + non-TEE (Stake-Secured) |
> | "Fiat" reference | "stablecoins and fiat" (impossible for on-chain protocol) | "stablecoins or other stable-value assets" |
>
> **Important Improvements:**
>
> | Issue | Original | Revised |
> |-------|----------|---------|
> | TruthObject naming | Coined term with no industry precedent | Execution Report (inspired by FIX Protocol's Execution Report) |
> | Token ticker | $NASUN / NASUN (inconsistent, incorrect) | $NSN (unified) |
> | Record metadata | Hardware-centric ("Which hardware executed") | Execution-context-centric ("Who requested / Who executed / Payment distribution / Verification tier") |
> | Compliance claims | "SOC2, HIPAA, GDPR-compliant reports = standard API call" (overstated) | "verifiable execution records that support compliance workflows" |
> | Section 6 duplication | 4-Step flow + 5-Step walkthrough (redundant) | 4-Step flow retained; 5-Step condensed into a single example |
> | Verification model | TEE attestation only | 4 tiers: TEE-Attested / Stake-Secured / Multi-Provider Consensus / ZK-Enhanced |
>
> **Preserved (strong as-is):** Overall structure (11 sections), positioning ("Settlement Layer for AI"), Object-Centric Stack, Economic Flywheel (3 mechanisms), Policy Domains, closing statement.

---

# Baram: The Global Settlement Layer for AI

**Where Intelligence Becomes a Financial Primitive**

Baram is the settlement protocol for AI execution, ownership, and revenue — built on Nasun, an object-centric Layer 1 designed with the Move language and optimized for parallel execution.

Baram provides the neutral settlement and verification layer for AI markets — enabling models, compute providers, developers, enterprises, and autonomous systems to transact under transparent, enforceable rules.

Baram does not run AI workloads on-chain.
Baram settles who ran what, where, under what conditions — and who gets paid.

AI execution becomes a financial transaction: verifiable, auditable, and self-custodial.


## The Baram Boundary

**Baram is not:**
- an AI marketplace
- a cloud platform
- a model host
- an agent framework

**Baram is:**
The financial and execution rail for AI — separating computation from economic truth, and platforms from ownership.

Baram is designed to become infrastructure, not a competitive product. Our success is measured by how many AI systems settle through Baram, not by platform lock-in or proprietary advantages.

As AI systems scale beyond centralized platforms, markets for intelligence require the same guarantees as financial markets:
- neutrality
- auditability
- fairness
- finality


## 1. Why a New Layer Is Needed

AI is transitioning from software to infrastructure.

By the second half of this decade, AI workloads will increasingly be:
- continuous rather than request-based
- executed across heterogeneous compute providers
- governed by licensing, compliance, and revenue-sharing constraints
- consumed by humans, enterprises, and autonomous systems alike

Legacy infrastructure breaks down:

**Settlement Bottlenecks**
Traditional rails (Stripe, Swift) are slow, custodial, and incompatible with machine-driven execution.

**Custody & Platform Risk**
Centralized platforms require full access to proprietary prompts, data, and model IP — creating lock-in and exposure.

**No Verifiable Provenance**
There is no neutral system of record for how AI outputs were produced in regulated or high-stakes environments.

AI markets require protocol-level settlement and verification, not platform-mediated trust.


## 2. Execution vs. Settlement

Baram scales by cleanly separating computation from financial truth.

**Execution (Off-Chain)**
- Inference runs on independent compute providers — from TEE-secured hardware enclaves to standard GPU clusters
- Prompts, data, and outputs remain private between user and provider
- Baram never sees or stores user data

**Settlement (On-Chain)**
- Execution proofs are verified
- Licensing and royalties are enforced
- Payments finalize with sub-400ms finality

Finality refers to financial settlement, not inference runtime.

This separation allows Baram to scale with AI workloads while preserving strong economic guarantees — regardless of the execution environment.


## 3. The Object-Centric AI Stack

Baram represents the AI lifecycle as Linear Objects — assets that cannot be duplicated, copied, or double-spent.

These guarantees are enforced at the Move compiler level, making misuse structurally impossible.

| Object | Purpose | Economic Role |
|--------|---------|---------------|
| ComputeCap | Tokenized Compute Rights | Verifiable claims to execution capacity from registered providers |
| ModelObject | Digital Property | AI models with embedded, cryptographically-enforced royalties |
| Execution Report | Execution Lineage | Immutable records of who requested, who executed, how much was paid, and what was produced |
| SovereignAgent | Self-Custodial Actor | Optional autonomous participant with budget and authority |

This object-centric design enables programmable ownership, enforcement, and composability that account-based systems cannot provide.


## 4. Privacy, Quality & Fraud Resistance

Baram replaces human discretion with cryptographic and economic guarantees.

**Confidential Inference (TEE-Secured)**
For maximum privacy, workloads can execute inside TEEs where operators never see plaintext data. This is the premium trust tier.

**Standard Inference (Stake-Secured)**
Compute providers stake $NSN as collateral against performance claims. Reputation and economic bonds guarantee execution quality without requiring hardware isolation.

**Hardware Attestation**
TEE-secured providers produce cryptographic Proof-of-Execution. Standard providers submit verifiable execution proofs backed by staked collateral.

**Bonded Quality Claims**
Model publishers and compute providers stake collateral against performance and correctness claims.

**Deterministic Slashing**
False claims, failed execution, or SLA violations trigger automated penalties — no moderators required.

Quality is not voted on. It is proven, bonded, and settled.


## 5. Technical Architecture & Trust Model

**Verification Approach**
Baram supports multiple verification tiers to accommodate different trust and cost requirements:
- **TEE-Attested (High Trust):** Compute providers generate hardware-attested proofs using TEEs (Intel SGX, AMD SEV, ARM TrustZone, NVIDIA H100 confidential computing). Validators verify these proofs on-chain before releasing payment.
- **Stake-Secured (Standard Trust):** Providers stake $NSN and build reputation through consistent execution. Economic penalties enforce correctness without hardware dependency.
- **Multi-Provider Consensus (High Value):** For critical workloads, multiple independent providers execute the same job and results are compared.
- **ZK-Enhanced Proofs (Future):** Zero-knowledge proofs for privacy-preserving verification without TEE dependency.

**Trust Assumptions**
Baram assumes TEEs provide probabilistic privacy and attestable execution, not perfect security. For non-TEE execution, economic staking and reputation systems provide the trust guarantee. The protocol supports multiple verification methods to avoid single-point dependency.

**Royalty Enforcement**
ModelObjects encode licensing rules that execute automatically during settlement. However, Baram enforces royalties economically rather than technically — models can be copied off-chain, but legitimate developers use Baram for compliance, provenance, and ecosystem access. We are a financial layer, not DRM.

**Data Privacy**
Execution Reports store execution metadata and proofs, never raw inference data. Participants can optionally encrypt audit logs on decentralized storage and reference them on-chain for compliance. For enterprises, this means producing verifiable execution records that support compliance workflows — reducing what would otherwise be months-long integration projects.

**Roadmap**
- 2026 Testnet: TEE attestation + stake-secured verification
- 2027 Mainnet: Multi-provider consensus for high-value workloads
- 2028+: ZK-enhanced proofs and advanced privacy techniques

Specific cryptographic implementations will be finalized through audits and testnet validation.


## 6. How It Works: The Baram Execution Pipeline

A typical AI job on Baram follows a deterministic, four-step flow designed for human-driven workflows, enterprise systems, and autonomous participants alike.

**Step 1: Discover & License**
- A participant selects a model from the Baram registry
- Models are represented as ModelObjects
- Licensing terms and royalties are enforced at the protocol level
- Payment is escrowed before execution begins

*Result: Creators are guaranteed payment and license compliance before inference starts.*

**Step 2: Match Verified Compute**
- Baram's selection algorithm matches the request to an available compute provider
- Provider qualifications verified on-chain: verification tier (TEE or stake-secured), reputation score, and capacity
- Transparent, market-driven pricing

*Result: No hidden execution risk. Provider selection is deterministic and auditable.*

**Step 3: Execute (Off-Chain)**
- Inference runs on the matched provider's infrastructure
- For TEE-secured providers: data remains encrypted within hardware-isolated enclaves
- For stake-secured providers: execution is backed by economic bonds
- Execution proof is generated

*Result: Execution integrity guaranteed through cryptographic or economic mechanisms.*

**Step 4: Verify & Settle (On-Chain)**
- Validators verify execution proofs
- An Execution Report is created on-chain recording:
  - Who requested and who executed
  - Payment amount and distribution (model royalty, compute fee, protocol fee)
  - Model used and verification tier
  - Execution context (TEE attestation hash OR staking proof)
  - Cryptographic hash of input/output
  - Timestamp
- Royalties and compute fees release atomically
- Settlement completes in a single transaction

*Result: Execution, verification, and payment converge into a single auditable record.*

**Example: How a User Accesses AI Through Baram**

1. **User Initiates Request** — Opens a Baram-enabled application, selects a model (e.g., an open-weight reasoning model or a specialized domain model), reviews pricing (compute cost + model royalty), and approves. Payment is escrowed on-chain.

2. **System Assigns Compute** — Baram's weighted selection algorithm identifies an available provider based on price, latency, reputation, and verification tier. The user receives a ComputeCap (verifiable right to execution).

3. **Execution** — The prompt is sent to the provider. In TEE mode, the prompt is encrypted with the provider's TEE public key and processed inside a hardware enclave. In standard mode, execution is backed by the provider's staked collateral.

4. **Verification & Settlement** — The provider submits proof of execution. Validators verify it. An Execution Report is created on-chain. Payment releases: model creator receives royalty, compute provider receives execution fee, a portion of the protocol fee is burned.

5. **User Receives Response** — Output is delivered to the user's application. The Execution Report reference is available for audit.

For extended sessions, the provider maintains context for efficiency. If a provider fails, the user can seamlessly migrate to a new provider with a fresh Execution Report tracking the transition.


## 7. Who Baram Is For

Baram serves participants who require neutral settlement, verifiable execution, and self-custodial economics as AI workloads move beyond centralized platforms.

**Model Creators**
Earn protocol-enforced royalties with no platform custody of models, prompts, or IP, through transparent, cryptographically-enforced licensing.

**Compute Providers**
Monetize verified hardware globally through cryptographically enforced execution proofs, transparent pricing, and zero counterparty risk.

**Application Developers**
Build AI-powered products on auditable infrastructure, with execution guarantees that can be verified by users, enterprises, and autonomous systems.

**Regulated Enterprises**
Obtain verifiable execution records for sensitive workloads, with privacy guarantees that prevent exposure of proprietary data or prompts.

**Autonomous Systems**
Participate as self-custodial actors under explicit, machine-readable rules, with defined budgets and authority for machine-to-machine AI transactions.

**Early Beachhead**

Baram's initial focus is on crypto-native developers and early AI companies building sovereign, privacy-preserving AI infrastructure rather than consumer-facing AI applications.

These early users are building systems that require:
- Confidential or verifiable inference
- Enforced licensing, attribution, and revenue sharing across multiple parties
- Verifiable execution records for regulated or high-stakes environments
- Neutral settlement rails for autonomous and agent-driven workflows

While these use cases span multiple industries, they share a common requirement: verifiable AI execution without platform lock-in.

As AI workloads transition from centralized platforms to heterogeneous infrastructure, Baram provides the neutral settlement and verification layer these markets converge on.


## 8. Bootstrap Strategy: Building the Network

Baram's value emerges from coordinating multiple participant types simultaneously. Our bootstrap strategy addresses each side with targeted incentives and a phased rollout that reflects our current stage.

**Phase 0: Foundation (Current — Team-Operated)**

The Baram team operates the initial compute infrastructure to prove the protocol works end-to-end. This is standard practice for every decentralized network — Bitcoin had one miner, Ethereum had one node.

- Team-operated executors running on TEE-enabled hardware
- End-to-end prototype demonstrating the full settlement flow
- Developer SDK and documentation

*Goal: Prove the protocol works. Build a credible, working demo.*

**Phase 1: Invited Network (Testnet — 2026)**

Early community members and partners are invited to operate as compute providers through a whitelist registration process.

*Supply Side — Compute Providers*
- Target: TEE-enabled compute providers and GPU operators seeking verifiable execution markets
- Value Proposition: Access to a growing demand-side for verifiable AI execution, cryptographic elimination of counterparty risk, premium pricing for compliance-ready infrastructure
- Incentive: Enhanced staking rewards for early providers offering attested compute

*Supply Side — Model Creators*
- Target: Open-weight model publishers seeking protocol-enforced royalty distribution
- Value Proposition: Per-inference royalties enforced at the protocol level, transparent attribution and usage tracking, no platform custody of model weights or IP
- Incentive: Subsidized ModelObject creation and verification costs for early participants

*Demand Side — Developers*
- Target Audience: Crypto-native developers building AI agents and autonomous systems
- Use Cases: Autonomous agents requiring verifiable execution, DeFi analysis with audit trails, agent-to-agent AI transactions
- Incentives: SDK development grants, free execution credits during testnet, technical support and integration assistance

*Demand Side — Enterprises*
- Target: Design partners in industries with compliance requirements (healthcare, financial services, legal, government)
- Value Proposition: Execution Reports as verifiable compliance evidence, cryptographic proof of data sovereignty
- Incentive: Integration support and pilot program subsidies

**Phase 2: Permissionless Entry (Mainnet — 2027)**

Registration opens to anyone who meets staking requirements. Admin controls are removed.

*Success Metrics:*
- Active AI inferences settling on the network
- Multiple ModelObjects with sustained usage
- Developer community building on Baram
- Enterprise design partners in production pilots

*Growth Mechanisms:*
- Model creators attract developers (more distribution)
- Developers attract compute providers (more demand)
- Compute providers attract enterprises (compliance infrastructure)
- Enterprises attract model creators (premium pricing for verified models)

Multi-sided flywheel activates: each participant type creates value for the others, bootstrapping organic growth beyond initial subsidies.

**Phase 3: Standard Setting (2027+)**

Objective: Establish Execution Reports as the recognized format for AI execution records.

Tactics:
- Publish compliance templates for common regulatory frameworks
- Partner with auditing firms to validate the Execution Report format
- Present to regulatory bodies and industry standards organizations
- Enable cross-ecosystem integrations (other AI networks can settle through Baram)

Target: Formal recognition or pilot acceptance by at least one regulatory or auditing authority.


## 9. The Baram Economic Flywheel

Baram secures coordination, quality, and long-term network integrity through three interconnected mechanisms. Baram does not attempt to manufacture demand for AI execution; it captures and enforces value from AI activity that already exists off-chain.

**Settlement Fee Burn**
Each AI execution settled on Baram incurs a small protocol fee, a portion of which is permanently burned. As transaction volume scales — from early experimentation to large-scale production workloads — this introduces protocol-level deflationary pressure that scales with real execution volume rather than speculative activity.

**Proof-of-Quality Staking**
Model publishers and compute providers stake $NSN as collateral against their performance claims. Poor execution, failed attestations, or SLA violations trigger deterministic slashing — redistributing staked value to affected parties and the burn mechanism. This bonds economic skin-in-the-game to technical reliability.

**Efficiency Rebates**
Participants who minimize on-chain state usage (lean proofs, compact Execution Reports, optimized verification) earn fee rebates in $NSN. This incentivizes technically sound behavior and reduces network bloat as adoption grows.

**Economic Architecture:**
Most AI transactions settle in stablecoins or other stable-value assets — ensuring predictable costs for developers and enterprises. $NSN serves as the verification, staking, and enforcement layer rather than a payment medium.

**Fee Payments & Discounts**
Settlement fees may be paid in stablecoins at standard rates or in $NSN at a protocol-defined discount. Stablecoin-denominated fees are partially converted into $NSN and burned, while $NSN-denominated fees are burned directly. This ensures predictable costs for developers and enterprises while creating consistent security demand and supply reduction for the network.

**Value Accrual Thesis:**
As adoption increases, $NSN accrues value through security demand rather than transaction throughput:
- Burn increases with settlement volume (more AI executions = more fees burned)
- Staking demand increases as network participation grows (more models + compute providers = higher collateral requirements)
- Circulating supply compresses as both mechanisms remove tokens from active circulation

This creates a reinforcing loop: $NSN captures value proportionally to total economic activity settled through Baram, regardless of whether individual transactions are denominated in $NSN or stablecoins.

**Early Network Growth:**
Initial developer adoption will be bootstrapped through:
- Staking rewards for early compute providers and model publishers
- Fee subsidies during the initial phases of mainnet to reduce friction
- Retroactive incentives for contributors who build critical infrastructure (SDKs, oracles, verification tooling)

Specific incentive parameters will be finalized through governance as the network approaches mainnet launch.


## Network Effects & Composability

While our initial focus is on crypto-native developers and privacy-preserving infrastructure builders, Baram's network effects strengthen as the ecosystem matures beyond this beachhead.

**Multi-Sided Market Dynamics:**
By establishing Execution Reports as the open standard for verifiable AI execution records, we prioritize interoperability over proprietary lock-in. Our moat is not technical exclusivity — it's the coordination cost of migrating an established ecosystem to a fragmented alternative. Model creators seek maximum distribution, compute providers compete for premium pricing, developers choose platforms with the most options, and enterprises adopt where audit trails are recognized.

**External Composability:**
Baram's object model enables composability beyond AI settlement: ModelObjects as DeFi collateral, revenue tokenization, and cross-chain verification. This transforms Baram from settlement rails into coordination infrastructure — creating switching costs and ecosystem depth that pure settlement features cannot provide.


## The Long-Term Vision

**Why Baram Wins**

Baram's competitive advantage is not technical exclusivity — Move is open-source, and larger players could build settlement layers. Our moat is standard-setting and coordination.

**Becoming Infrastructure:**
We succeed by making Execution Reports the open standard for AI execution records — prioritizing interoperability over lock-in. Once enterprises, regulators, and autonomous systems adopt Baram's record format, migrating to a fragmented alternative becomes prohibitively expensive.

**Ease-of-Use as Differentiation:**
For non-crypto enterprises, producing verifiable execution records that support regulatory compliance becomes a standard API call rather than a months-long integration. The fastest path to compliance-ready infrastructure wins adoption, even if competitors have superior technology.

**Speed Matters:**
The first neutral settlement layer that achieves regulatory recognition and developer adoption creates switching costs that technical features alone cannot overcome. Baram is designed to be boring, trusted infrastructure — not a competitive product.

---

As AI adoption accelerates, intelligence becomes an economic input — not a black-box service.

Markets for intelligence will demand:
- neutrality
- auditability
- fairness
- finality

Baram is built to be the settlement and verification layer these markets converge on.

AI agents may emerge.
Enterprises will scale.
Models will evolve.

Markets endure.

**Baram is the market layer for verifiable intelligence.**


## Policy & Execution Domains

Baram is policy-neutral infrastructure. Content policies are enforced by model owners, compute providers, and applications — not by the settlement protocol.

**What Baram Verifies:**
- Execution occurred as declared
- Licensing terms were followed
- Economic rules were satisfied
- Execution proof is valid (hardware attestation OR economic bond)

**What Baram Never Sees:**
- Prompt content
- Model outputs
- User data
- Semantic meaning

**Execution Policy Domains:**
Applications built on Baram can choose from multiple execution environments, each with different policy frameworks:

*Regulated Execution*
- Curated models with compliance guarantees
- Enterprise-grade execution records
- Jurisdiction-aware declarations
- Ideal for: Healthcare, finance, government, legal

*Neutral Execution*
- Open-weight models with permissive licenses
- Maximum privacy for legal use cases
- No semantic filtering or inspection
- Ideal for: Research, creative work, journalism, strategic analysis

*Consumer Applications*
- App-defined moderation
- UX-optimized safety features
- Age-appropriate experiences
- Ideal for: Productivity tools, education, general use

Policy choices are transparent and declarative. Execution Reports record which execution domain was used without revealing content.

Baram's role remains constant across all domains: verify execution, enforce licensing, settle payments.
