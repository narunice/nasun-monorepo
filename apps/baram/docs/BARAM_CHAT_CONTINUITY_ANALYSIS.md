# Baram — Chat Continuity & TEE Architecture Analysis

> Internal discussion document covering Walrus/Seal applicability, E2E encryption architecture,
> stateful vs stateless TEE design, and Nitro vs SGX trade-offs.
>
> Date: 2026-02-02

---

## Table of Contents

1. [Walrus & Seal Overview](#1-walrus--seal-overview)
2. [Can Walrus/Seal Solve Chat Continuity?](#2-can-walrusseal-solve-chat-continuity)
3. [How Baram Actually Works: E2E Encryption](#3-how-baram-actually-works-e2e-encryption)
4. [Per-Prompt Executor Assignment](#4-per-prompt-executor-assignment)
5. [Context Window & Token Cost Trade-offs](#5-context-window--token-cost-trade-offs)
6. [KV Cache: Why Baram Doesn't Have One](#6-kv-cache-why-baram-doesnt-have-one)
7. [Nitro vs SGX](#7-nitro-vs-sgx)
8. [The Fundamental Trade-off: Stateful vs Stateless](#8-the-fundamental-trade-off-stateful-vs-stateless)
9. [Conclusions](#9-conclusions)

---

## 1. Walrus & Seal Overview

### Walrus — Decentralized Blob Storage

[Walrus](https://www.walrus.xyz) is a Sui-based decentralized storage platform developed by Mysten Labs.

- **Erasure coding**: Uses the proprietary "Red Stuff" algorithm to split data into "slivers" distributed across storage nodes
- **Coordination layer**: Metadata and availability proofs are recorded on the Sui blockchain
- **Blob storage**: Stores arbitrary binary data (images, documents, datasets, etc.)
- **Tokenized storage**: Blobs and storage capacity are tokenized as Sui objects, composable with smart contracts
- **Pricing**: WAL token-based economy with delegated proof of stake
- **Status**: Mainnet and Testnet operational (as of early 2026)
- **Funding**: $140M raised from Standard Crypto and a16z (March 2025)

### Seal — Decentralized Secrets Management

[Seal](https://seal.mystenlabs.com) is a decentralized secrets management (DSM) platform, also by Mysten Labs.

- **Identity-Based Encryption (IBE)**: Uses Boneh-Franklin IBE with BLS12-381 for key encapsulation
- **On-chain access control**: Move smart contracts define "who can decrypt, under what conditions" via `seal_approve` functions
- **Threshold cryptography**: t-out-of-n key servers — at least t servers must agree before decryption keys are issued
- **Symmetric encryption**: AES-256-GCM for data encryption (IBE encrypts only the symmetric key)
- **Access patterns**: Supports private data (owner-only), allowlists, subscriptions (time-limited), time-locks, secure voting, and token-gating
- **Walrus integration**: Designed to work as "Seal encrypts, Walrus stores, Seal controls access"
- **Status**: Mainnet and Testnet operational

### Seal Encryption/Decryption Flow

**Encryption:**
```
Developer deploys Move package with seal_approve policy
  → SDK calls client.encrypt(threshold, packageId, identityId, data)
  → IBE master public key + identity encrypts a symmetric key
  → Symmetric key encrypts the actual data
  → Encrypted blob stored on Walrus (or any storage)
```

**Decryption:**
```
User creates SessionKey (wallet signature, per-package, with TTL)
  → client.decrypt(encryptedData, sessionKey, txBytes)
  → Key servers verify: run seal_approve via dry_run
  → If approved: each key server issues partial decryption key
  → Client collects t partial keys → reconstructs symmetric key
  → Client decrypts data locally
```

---

## 2. Can Walrus/Seal Solve Chat Continuity?

### The Problem

Baram's TEE (Nitro Enclave) is **completely stateless**. Every prompt triggers:
1. Frontend reconstructs the conversation history as text
2. Encrypts the entire text (history + new prompt) with RSA+AES
3. Creates an on-chain escrow (`create_request`)
4. Selects an executor (weighted random)
5. Sends to the selected executor's TEE
6. TEE decrypts, runs inference on the **full text**, encrypts the response
7. On-chain settlement, then response is returned

As conversations grow longer, early context is lost (currently capped at ~10 messages / ~2,500 tokens), and every prompt re-processes the entire history.

### What Walrus Can Solve

| Problem | Walrus Solution | Verdict |
|---------|----------------|---------|
| Chat history persistence | Store encrypted chats on Walrus instead of browser IndexedDB | **Useful** |
| Cross-device sync | Wallet-authenticated access from any device | **Useful** |
| Browser data loss recovery | Retrieve from decentralized storage | **Useful** |
| TEE statelessness | Walrus is storage — doesn't change the computation model | **Not solved** |
| Context window limits | Unrelated to storage | **Not solved** |

### What Seal Can Solve

| Problem | Seal Solution | Verdict |
|---------|--------------|---------|
| Chat access control | Move contracts define "only this wallet owner can decrypt" — more flexible than current PBKDF2(address+password) | **Useful** |
| TEE decryption rights | `seal_approve` policy: "any registered TEE executor with valid attestation can decrypt" | **Interesting possibility** |
| TEE statelessness | Seal is encryption/access control — doesn't change computation | **Not solved** |

### Seal + Walrus Combined

```
User sends prompt
  → Frontend encrypts chat history with Seal
  → Stores on Walrus (decentralized, cross-device accessible)
  → On TEE request: Seal policy grants TEE decryption rights
  → TEE fetches encrypted history from Walrus
  → TEE decrypts via Seal, processes full context, responds
```

This combination decentralizes **"who can read the conversation"** — but the core problem of **"TEE must re-process the entire history every time"** remains unchanged.

### What This Actually Enables

The real value of Seal + Walrus is **chat portability and privacy governance**, not chat continuity:

| Capability | Current (IndexedDB) | With Seal + Walrus |
|-----------|---------------------|-------------------|
| Storage location | Browser local | Decentralized nodes |
| Cross-device access | **Impossible** | Wallet auth → **possible** |
| Browser data wipe | **Chat lost** | Recoverable from Walrus |
| Selective sharing | Not supported | Seal policy (allowlist, token-gating, etc.) |
| Access control | PBKDF2(address+password) | Move smart contract policies |

### Nasun Devnet Compatibility Warning

Both Walrus and Seal operate on **Sui Mainnet/Testnet**. Nasun Devnet (Chain ID: `12bf3808`) is a Sui fork, meaning:
- Seal's key servers do not recognize Nasun Devnet
- Walrus storage nodes do not communicate with Nasun Devnet
- **Self-hosted key servers + deploying Seal/Walrus packages to Nasun Devnet would be required** — significant infrastructure work

---

## 3. How Baram Actually Works: E2E Encryption

### The Full Flow (Code-Verified)

```
Frontend                      Host (EC2)                  Enclave (Nitro TEE)
   |                             |                             |
   |-- Generate AES-256 key ---->|                             |
   |-- RSA-OAEP(AES key + IV) ->|--- vsock relay (cipher) --->|
   |-- AES-GCM(prompt) -------->|                             |-- RSA decrypt → extract AES key
   |                             |                             |-- AES decrypt → plaintext prompt
   |                             |                             |-- LLM inference
   |                             |                             |-- AES-GCM(response) encrypt
   |                             |<-- encrypted response ------|
   |<-- relay encrypted --------|                             |
   |-- AES decrypt response ----|                             |
```

### Key Security Properties

- **Frontend** generates a random AES-256 key per request
- **RSA-OAEP** protects the AES key using the Enclave's public key (private key exists only inside the Enclave)
- **Host cannot see the prompt**: it lacks the RSA private key to extract the AES key
- **Host cannot see the response**: it lacks the AES key to decrypt
- **AES keys are cleared** from memory after use (both Enclave and Frontend)
- **sessionStorage backup**: AES key backed up per-request for HMR/tab-switch resilience

### Host Visibility by Inference Mode

| Mode | Prompt Privacy | Response Privacy |
|------|---------------|-----------------|
| **Local LLM** (TEE) | Host **cannot** see (RSA protected) | Host **cannot** see (AES protected) |
| **Proxy** (Groq/OpenAI via Host) | Host **can** see (plaintext proxy request) | Host **cannot** see (AES protected) |
| **Direct** (API key in Enclave) | Host **cannot** see | Host **cannot** see |

> **Note**: For complete privacy, Local LLM mode is required. Proxy mode exposes the prompt to the Host because the Host must forward it to external APIs.

---

## 4. Per-Prompt Executor Assignment

Every single prompt in a conversation triggers an **independent** cycle:

```
Prompt input
  → selectExecutorWeightedRandom() — Frontend picks from eligible set
  → create_request — on-chain NUSDC escrow
  → /execute — send to selected executor
  → TEE inference + settlement
  → Response returned
```

If a user sends 5 prompts in the same chat, there are 5 independent escrow creations, 5 executor assignments, and 5 settlement transactions. **There is no session binding between a chat and an executor.**

In practice, with only one TEE executor (Nasun-operated) and one Lambda executor (cloud models) currently deployed, the executor is effectively determined by model selection. In Phase H (distributed executors), different executors could handle different prompts within the same conversation.

---

## 5. Context Window & Token Cost Trade-offs

### Context Windows Vary by Model

| Model | Context Window |
|-------|---------------|
| Llama 3.2 3B (Baram TEE) | 128K tokens (spec) |
| Llama 3.1 8B | 128K tokens |
| Gemini 1.5 Pro | 2M tokens |
| Claude (Opus/Sonnet) | 200K tokens |
| GPT-4o | 128K tokens |

### Baram's Intentional Limit

Baram caps context at **~10 messages / ~2,500 tokens** — this is a **code-level design choice**, not a model limitation. The Llama 3.2 3B model supports 128K tokens.

The cap exists because every prompt requires:
1. Encrypting the entire history
2. Transmitting it over the network
3. Full re-processing in the TEE (no KV Cache)

Without this cap, costs and latency would grow linearly with conversation length.

### Would a Larger Model Fix Context Loss?

**Yes, for the context loss problem specifically.** A model with a larger context window (or simply raising Baram's artificial cap) would preserve more history.

However, the following costs remain:
- **Token consumption**: 100-turn conversation = retransmitting all 100 turns every prompt
- **Inference latency**: More input tokens → higher first-token latency
- **TEE memory**: Larger model + longer context = more Enclave RAM needed
- **Escrow cost**: Token consumption directly maps to NUSDC cost per request

This is where KV Cache would help significantly — reusing prior computations instead of reprocessing from scratch.

---

## 6. KV Cache: Why Baram Doesn't Have One

### Not a Hardware Problem — An Architecture Problem

The absence of KV Cache is not due to instance specifications. It's a design decision tied to Baram's stateless architecture.

Currently, each request to the Enclave follows:
1. Receive HTTP request
2. Run inference
3. Return response
4. **Discard all state** (no relation to next request)

### What KV Cache Would Require

| Requirement | Current Baram | Needed Change |
|------------|--------------|---------------|
| Session concept | None (stateless) | Session ID binding user ↔ executor |
| KV Cache memory | Released after inference | Persist in memory until session ends |
| Concurrent sessions | N/A | Sessions × KV Cache size = memory needed |
| Inference engine | Basic llama.cpp | vLLM or llama.cpp with `--keep` option |

A higher-spec instance (e.g., r6i.2xlarge, 64GB RAM) would provide more Enclave memory for KV Cache retention — but **code changes are equally necessary** (session management, persistent inference engine, user-executor binding).

### The Binding Problem

If KV Cache is introduced, a user's session becomes **bound to a specific executor** (because the cache lives in that executor's memory). This creates new problems:

- **Executor busy**: If the bound executor is handling another request, the user must wait
- **Executor dies**: Nitro has no sealing — instance termination = KV Cache permanently lost
- **Spot reclaim**: AWS can reclaim spot instances with 2-minute notice — cache is gone

This directly conflicts with Baram's distributed executor vision (Phase H).

---

## 7. Nitro vs SGX

### Comparison

| | AWS Nitro Enclave | Intel SGX |
|---|---|---|
| **Isolation unit** | Entire VM | Process-level enclave region |
| **Memory** | GB-scale (14GB+ allocated) | EPC: 128MB–512MB (latest server CPUs: up to a few GB) |
| **Network** | **None** — vsock only | Full network access |
| **Sealing** | **Not available** — all state lost on termination | **Available** — hardware-bound key encrypts data to disk, survives restarts |
| **Attestation** | NSM + COSE_Sign1 | DCAP/EPID Remote Attestation |
| **Hardware lock-in** | AWS EC2 only | Any Intel CPU (Azure, GCP, on-premise) |
| **LLM suitability** | Large memory → can load models directly | Small memory → cannot run LLMs inside enclave |
| **Side-channel history** | VM isolation, relatively robust | Spectre, Foreshadow, and other documented attacks |

### Why Baram Chose Nitro

**Memory is the decisive factor.** Loading Llama 3.2 3B requires ~6-8GB, plus KV Cache overhead pushes to 10GB+. Nitro allocates 14GB to the Enclave. SGX's EPC (even on latest hardware) cannot accommodate this.

Additionally:
- Nitro's VM-level isolation allows running standard Linux processes (Node.js, llama.cpp) without special SDK constraints
- Zero network access minimizes the attack surface

### What SGX Would Enable

| Gained | Lost |
|--------|------|
| **Sealing**: Encrypt KV Cache / chat state to disk, restore after restart | **Memory**: Cannot run LLM inside enclave — must restructure so only crypto operations happen inside |
| **Cloud-agnostic**: Run on Azure, GCP, on-premise | **Privacy model change**: If inference runs outside enclave, the Host can see prompts/responses |
| **Mature ecosystem**: Gramine, Occlum LibOS | **Side-channel risk**: More documented attack vectors |

### The Core Dilemma

```
Nitro:  Run LLM inside enclave     → Complete privacy
        No sealing                   → Forced stateless

SGX:    Sealing available           → Stateful possible
        Insufficient memory          → Cannot run LLM inside enclave
                                     → Privacy guarantee weakened
```

Baram's core value proposition is **"even the Executor cannot see your prompt."** With SGX, memory constraints would likely force inference outside the enclave, undermining this guarantee.

---

## 8. The Fundamental Trade-off: Stateful vs Stateless

### The Tension

KV Cache (stateful) and distributed executors (decentralization) are **fundamentally in conflict**:

```
Stateful (KV Cache)      → Bound to specific executor → Reduced availability, weaker decentralization
Stateless (current Baram) → Any executor can handle    → High availability, full re-processing cost
```

### Realistic Strategies

| Strategy | Pros | Cons |
|----------|------|------|
| **Stateless + larger model** | Free executor assignment, fault-tolerant | Token cost grows linearly, latency increases |
| **Stateful + sticky sessions** | Fast incremental inference | Executor-bound, cache lost on failure |
| **Hybrid**: use cache if available, full-context fallback otherwise | Partial benefits of both | Implementation complexity |

### Why Stateless Is the Right Choice for Baram Today

- **2-person team**: Stateful session management adds significant complexity
- **Single executor**: No benefit from sticky sessions when there's only one TEE executor
- **Prototype stage**: Demonstrating the vision matters more than optimizing inference costs
- **Phase H compatibility**: Distributed executor networks naturally favor stateless design
- **Spot instances**: AWS can reclaim instances at any time — stateful designs are fragile here

---

## 9. Conclusions

### Walrus + Seal: Useful, But Not for Chat Continuity

These technologies solve **chat portability and privacy governance** (cross-device sync, decentralized access control), not the fundamental computation problem of stateless TEE inference. They could be valuable additions to Baram's architecture for:
- Replacing IndexedDB with decentralized, cross-device chat storage
- Moving access control from client-side PBKDF2 to on-chain Move policies
- Enabling selective chat sharing with third parties
- Persisting compliance/audit data

However, integration requires deploying Seal/Walrus infrastructure on Nasun Devnet (significant effort).

### Chat Continuity Bottleneck

The real bottleneck is not storage or encryption — it is:
1. **Stateless TEE**: Every prompt re-processes the full history
2. **No KV Cache**: Cannot reuse prior computations
3. **Intentional context cap**: ~10 messages / ~2,500 tokens to control cost and latency

### Nitro vs SGX: Privacy vs Statefulness

Nitro was chosen to guarantee complete privacy (LLM runs entirely inside the enclave). SGX would enable sealing (persistent state) but cannot run LLMs inside the enclave due to memory constraints, which would fundamentally change Baram's privacy model.

### Recommended Path Forward

For the prototype phase, the current stateless architecture is appropriate. When scaling:
1. **Near-term**: Raise the context cap as infrastructure allows; consider larger TEE instances for bigger models
2. **Mid-term**: Evaluate Walrus + Seal for chat portability (cross-device sync, decentralized storage)
3. **Long-term**: Explore hybrid stateful/stateless designs if the executor network stabilizes; monitor SGX memory improvements (Confidential Computing is evolving rapidly)

---

*Document generated from internal architecture discussion, 2026-02-02.*
