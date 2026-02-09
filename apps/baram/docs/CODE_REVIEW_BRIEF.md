# Baram + Baram-SDK Full Code Review Brief

> **Absolute Rule: DO NOT modify any code.**
> This is a code review task ONLY. Do not create, edit, or delete any files.
> Output discovered issues and remediation recommendations as TEXT ONLY.
> Any attempt to modify code invalidates the entire review.

## Mission

Baram app (`apps/baram/`) and its SDK (`packages/baram-sdk/`)  totaling ~120 files, ~26,000 lines  undergo a full code review. This codebase was built via **vibe coding (LLM-generated) + manual refinement** by a 2-person bootstrapped team. The purpose is to identify security vulnerabilities and code quality issues before production deployment.

**Deliverable**: A prioritized list of findings and remediation recommendations (text only). **Never modify code files.**

---

## 1. Project Overview

### What is Baram?

Baram is an **AI inference execution settlement protocol** on Nasun Devnet (Sui fork).

Core flow:
1. **User**: Creates AI inference request with NUSDC escrow payment
2. **Executor**: Runs AI model, submits result hash on-chain (settlement proof)
3. **Smart Contract**: Verifies proof, releases escrow to Executor
4. **AER (AI Execution Report)**: Immutable on-chain execution metadata record

Two execution modes:
- **Standard**: Lambda -> Groq API -> On-chain settlement (plaintext prompt, HTTPS only)
- **Private (TEE)**: AWS Nitro Enclave with local LLM (E2E encryption: RSA-OAEP + AES-256-GCM)

### Tech Stack

| Area | Technology |
|------|-----------|
| Blockchain | Nasun Devnet (Sui fork, Chain ID: `272218f1`) |
| Smart Contracts | Move (Sui Move) |
| Frontend | React 19, Vite 7, TypeScript 5.9, TailwindCSS 3.4 |
| Backend (Standard) | AWS Lambda (Node.js), Groq API |
| Backend (TEE) | AWS Nitro Enclave (enclave + host dual architecture) |
| SDK | TypeScript, @mysten/sui SDK |
| Infra | AWS CDK (Lambda + API Gateway) |

### Security Context

- **Financial**: NUSDC escrow + Budget delegation = vulnerabilities cause direct fund loss
- **Encrypted Communication**: TEE mode uses RSA-OAEP + AES-256-GCM E2E encryption
- **On-chain Immutability**: AER data is permanent; incorrect records cannot be corrected
- **2-person team, bootstrapped startup**: No dedicated security team or automated security tooling

---

## 2. Codebase Structure

### 2A. Smart Contracts (~3,900 lines)

```
apps/baram/
├── contracts/                          # Core: escrow + budget + beta access
│   └── sources/
│       ├── baram.move                  (533 lines) -- Escrow, request creation/settlement/cancel
│       ├── budget.move                 (453 lines) -- Agent budget delegation system
│       └── beta_access.move            (237 lines) -- Beta access NFT whitelist
├── contracts-executor/                 # Executor registration system
│   └── sources/
│       ├── executor.move               (1,028 lines) -- Registry, reputation, self-service
│       ├── executor_staking.move       (510 lines) -- Staking mechanism
│       └── executor_tier.move          (351 lines) -- Tier calculation (Bronze/Silver/Gold)
├── contracts-aer/                      # AI Execution Report (immutable audit log)
│   └── sources/
│       └── aer.move                    (441 lines) -- 8-category 31-field execution report
├── contracts-compliance/               # Execution Compliance Record
│   └── sources/
│       └── compliance.move             (371 lines) -- Per-execution compliance record
└── contracts-attestation/              # TEE attestation registry
    └── sources/
        └── attestation_registry.move   (380 lines) -- PCR baseline verification
```

### 2B. Lambda Executor (~580 lines)

```
apps/baram/cdk/
├── bin/cdk.ts                          (45 lines) -- CDK app entry
├── lib/baram-stack.ts                  (156 lines) -- Lambda + API Gateway stack
└── lambda-src/executor/src/
    ├── index.ts                        (369 lines) -- Lambda handler (receive -> execute -> settle)
    ├── services/ai.ts                  (132 lines) -- Groq API invocation
    ├── services/sui.ts                 (513 lines) -- On-chain transactions (settle, AER create)
    └── types.ts                        (47 lines) -- Request/response interfaces
```

### 2C. Nitro TEE Executor (~4,300 lines)

```
apps/baram/executor-nitro/src/
├── enclave/                            # Runs inside TEE (isolated)
│   ├── main.ts                         (443 lines) -- vsock server, request loop
│   ├── crypto.ts                       (238 lines) -- RSA/AES encryption, key management
│   ├── inference.ts                    (385 lines) -- llama.cpp bindings, proxy/local modes
│   ├── attestation.ts                  (600 lines) -- COSE_Sign1 NSM attestation
│   ├── local-llm.ts                    (191 lines) -- Local LLM wrapper
│   └── debug-main.ts                   (78 lines) -- Dev debug entry
├── host/                               # Runs outside TEE (network access)
│   ├── main.ts                         (104 lines) -- Host entry point
│   ├── server.ts                       (447 lines) -- HTTP server (receive -> forward to enclave)
│   ├── sui-client.ts                   (626 lines) -- On-chain settlement (host -> chain)
│   └── vsock-client.ts                 (436 lines) -- vsock communication with enclave
├── shared/
│   ├── protocol.ts                     (283 lines) -- Message protocol definitions
│   └── vsock.ts                        (435 lines) -- vsock utility layer
├── test-client.ts                      (180 lines) -- Manual test client
└── scripts/decay-reputation.ts         (147 lines) -- Reputation decay script
```

### 2D. Frontend (~7,100 lines)

```
apps/baram/frontend/src/
├── App.tsx                             (186 lines) -- App shell
├── main.tsx                            (86 lines) -- Entry point
├── config/
│   ├── network.ts                      (173 lines) -- All config (RPC, contract IDs, model pricing)
│   ├── client.ts                       (8 lines) -- SuiClient init
│   └── attestation.ts                  (15 lines) -- Attestation config
├── stores/
│   ├── chatStore.ts                    (477 lines) -- Zustand chat state
│   └── budgetStore.ts                  (134 lines) -- Budget state
├── features/request/
│   ├── hooks/
│   │   ├── useCreateRequest.ts         (271 lines) -- Core: request creation orchestration
│   │   ├── useExecutors.ts             (361 lines) -- Executor listing + weighted random selection
│   │   ├── useRequestWithRetry.ts      (148 lines) -- Retry logic
│   │   ├── useAttestation.ts           (126 lines) -- TEE attestation display
│   │   └── useAER.ts                   (30 lines) -- AER fetch hook
│   ├── services/
│   │   ├── transactionBuilder.ts       (177 lines) -- PTB construction
│   │   ├── aerService.ts              (190 lines) -- AER on-chain queries
│   │   ├── ecrService.ts             (149 lines) -- Compliance record queries
│   │   └── coinService.ts             (58 lines) -- NUSDC coin management
│   └── components/
│       ├── ExecutionReport.tsx          (112 lines) -- AER modal
│       └── AttestationDisplay.tsx       (152 lines) -- Attestation display
├── hooks/
│   ├── useBudgets.ts                   (243 lines) -- Budget CRUD
│   ├── useNFTGate.ts                   (121 lines) -- Beta NFT gate
│   ├── useWalletSession.ts             (74 lines) -- Wallet session
│   └── useIdleTimeout.ts              (70 lines) -- 15-min idle timeout
├── components/
│   ├── chat/ (AssistantMessage, UserMessage, MessageList, ...)
│   ├── sidebar/ (Sidebar, BudgetCard, BudgetDetail, BudgetSection, ...)
│   ├── input/ (ChatInput, InputFooter)
│   ├── empty/ (LandingScreen, WelcomeScreen, NFTGateScreen, SuggestionCard)
│   ├── receipt/ (OnChainReceiptContent, LocalReceiptContent, CopyableHash, ...)
│   ├── modals/ (CreateBudgetModal)
│   ├── badges/ (TierBadge)
│   └── theme/ (ThemeProvider, ThemeToggle)
├── services/
│   ├── chatStorage.ts                  (324 lines) -- IndexedDB chat persistence
│   ├── chatCrypto.ts                   (187 lines) -- Local chat encryption (AES-GCM)
│   └── contextBuilder.ts              (153 lines) -- Conversation context builder
├── utils/
│   ├── tee.ts                          (119 lines) -- TEE encryption (RSA+AES, E2E)
│   ├── crypto.ts                       (149 lines) -- Web Crypto API utilities
│   ├── format.ts                       (59 lines) -- Number/date formatting
│   ├── suiPagination.ts               (39 lines) -- Dynamic field pagination
│   ├── executor.ts                     (29 lines) -- Executor scoring
│   ├── encoding.ts                     (39 lines) -- Base64/hex
│   └── budget.ts                       (13 lines) -- Budget utilities
├── types/chat.ts                       (179 lines) -- Chat type definitions
├── layouts/ChatLayout.tsx              (77 lines) -- Layout wrapper
└── pages/AuthCallback.tsx              (28 lines) -- zkLogin callback
```

### 2E. SDK (`packages/baram-sdk/`) (~1,800 lines source + ~2,100 lines tests)

```
packages/baram-sdk/src/
├── index.ts                            (103 lines) -- Public exports
├── client.ts                           (700 lines) -- BaramClient class
├── types.ts                            (280 lines) -- All interfaces + constants
├── errors.ts                           (78 lines) -- Error class hierarchy
├── config.ts                           (58 lines) -- Configuration + devnet preset
└── services/
    ├── executor.ts                     (254 lines) -- Executor registry + weighted selection
    ├── budget.ts                       (354 lines) -- Budget CRUD + transaction builders
    ├── tee.ts                          (192 lines) -- RSA-OAEP + AES-256-GCM encryption
    ├── aer.ts                          (129 lines) -- AER on-chain fetching
    ├── transaction.ts                  (71 lines) -- PTB builders
    ├── coin.ts                         (53 lines) -- NUSDC coin selection
    └── encoding.ts                     (27 lines) -- SHA-256, hex utilities

packages/baram-sdk/src/__tests__/       (~810 lines, 7 files)
├── client.test.ts, config.test.ts, encoding.test.ts, errors.test.ts,
│   executor.test.ts, tee.test.ts, transaction.test.ts

packages/baram-sdk/src/__e2e__/         (~1,260 lines, 6 files)
├── setup.ts, execute.e2e.ts, budget.e2e.ts,
│   budget-edge.e2e.ts, error-paths.e2e.ts, executor-registration.e2e.ts
```

---

## 3. Review Scope & Checklist

### 3A. Smart Contracts (Move) -- HIGHEST PRIORITY

**Files**: `contracts/sources/*.move`, `contracts-executor/sources/*.move`, `contracts-aer/sources/aer.move`, `contracts-compliance/sources/compliance.move`, `contracts-attestation/sources/attestation_registry.move`

| # | Check Item | Details |
|---|-----------|---------|
| M1 | Escrow Fund Safety | In `baram.move`: create_request, submit_proof, cancel_request, claim_timeout_refund -- can NUSDC Balance be double-withdrawn or permanently stuck? |
| M2 | Settlement Condition Verification | submit_proof: executor qualification, timeout check, state transition (Pending->Executing->Settled) completeness |
| M3 | Budget Delegation Security | `budget.move` create_request_with_budget: agent authorization, balance deduction, model/executor constraints -- can they be bypassed? |
| M4 | Integer Overflow | All u64 arithmetic (balance, price, fee) -- overflow/underflow possibility |
| M5 | Access Control | AdminCap usage consistency, owner-only function authentication, shared object access patterns |
| M6 | Event Accuracy | Emitted event fields matching actual state changes |
| M7 | Executor Reputation Manipulation | `executor.move` record_job_completion: can reputation be inflated via self-dealing? (KNOWN: Phase G tracking) |
| M8 | AER Immutability | `aer.move` create_report: overwrite prevention, requestId collision handling |
| M9 | Timeout Logic | Escrow timeout (cancel vs settle) race condition, Clock object usage correctness |
| M10 | Staking Safety | `executor_staking.move`: stake/unstake/slash flows -- can staked funds be lost or double-withdrawn? |
| M11 | Tier Calculation | `executor_tier.move`: tier upgrade/downgrade correctness, threshold edge cases |
| M12 | Compliance Record | `compliance.move`: can records be forged? Does it properly capture execution context? |
| M13 | Attestation Registry | `attestation_registry.move`: PCR baseline management, admin-only access enforcement |
| M14 | Dead/Unused Code | Are compliance.move, attestation_registry.move referenced from other modules? Are there unused functions? |

### 3B. Lambda Executor (Node.js) -- HIGH PRIORITY

**Files**: `cdk/lambda-src/executor/src/`

| # | Check Item | Details |
|---|-----------|---------|
| L1 | Input Validation | Lambda handler event body parsing -- are all fields validated? (requestId, model, prompt, size limits) |
| L2 | Authentication | API Gateway -> Lambda invocation auth method, unauthorized call prevention |
| L3 | Groq API Security | API key management, timeout (AbortController), error handling, response validation |
| L4 | On-chain TX Security | `sui.ts` PTB construction, BCS serialization, gas budget, retry logic correctness |
| L5 | Error Recovery | On failure: escrow fund state (stuck possibility), partial failure recovery |
| L6 | AER Data Accuracy | 31 fields passed to create_report -- do they match actual execution results? |
| L7 | Secret Management | Env vars (Groq key, executor private key) -- exposure paths, cleanup after use |
| L8 | Concurrency | Same requestId duplicate Lambda execution prevention |
| L9 | Rate Limiting | In-memory rate limiter -- effectiveness, bypass possibility, memory leak in map cleanup |

### 3C. Nitro Enclave Executor -- HIGH PRIORITY

**Files**: `executor-nitro/src/`

| # | Check Item | Details |
|---|-----------|---------|
| N1 | vsock Security | enclave <-> host message integrity, buffer overflow, message injection |
| N2 | Encryption Implementation | RSA-OAEP key generation, AES-256-GCM encrypt/decrypt, key exchange flow correctness |
| N3 | Key Management | RSA private key lifecycle (generation, storage, destruction), exposure paths |
| N4 | Attestation | NSM attestation document generation/verification completeness (COSE_Sign1, X.509 chain) |
| N5 | Local LLM Isolation | `inference.ts` llama.cpp calls -- command injection vulnerability? |
| N6 | Host-Enclave Protocol | `protocol.ts` message types, serialization/deserialization safety |
| N7 | Proxy Mode Privacy | When proxy mode is used, decrypted prompt is sent to Host -- is this adequately documented/guarded? |
| N8 | Retry Logic | Settlement failure retry count, backoff, max wait time |
| N9 | Simulation Mode | `requireEncryption=false` path -- can it be activated in production? |
| N10 | Memory Management | Key material (AES/RSA) cleared from memory after use? |
| N11 | Settlement Atomicity | PTB with 4 calls (submit_proof + record_completion + create_record + refresh_tier): partial failure handling? |

### 3D. Frontend (React) -- MEDIUM PRIORITY

**Files**: `frontend/src/`

| # | Check Item | Details |
|---|-----------|---------|
| F1 | XSS | Server/executor responses rendered in DOM (AssistantMessage, receipts, error messages) |
| F2 | Encryption Key Management | `tee.ts` AES key Map, `chatCrypto.ts` local encryption key -- properly managed? |
| F3 | Private Key Exposure | Wallet private key exposure via console, network, localStorage |
| F4 | CSRF/Request Forgery | Executor endpoint invocation authentication |
| F5 | State Consistency | `chatStore.ts` (477 lines) state transitions -- inconsistency possible? |
| F6 | Concurrency Issues | Simultaneous requests: coin version conflicts, AES key overwrites, state races |
| F7 | Error UI | Error messages exposing technical internals (addresses, hashes) to users |
| F8 | Input Validation | ChatInput, CreateBudgetModal -- input validation sufficiency |
| F9 | Code Complexity | Functions >200 lines (useCreateRequest's createRequest), splitting needed? |
| F10 | Frontend <-> SDK Duplication | Transaction builders, executor selection, TEE encryption exist in both frontend and SDK -- inconsistency? |
| F11 | Idle Timeout | `useIdleTimeout.ts`: 15-min timeout -- can it be bypassed? Does it properly clean up crypto keys? |

### 3E. SDK (baram-sdk) -- MEDIUM PRIORITY

**Files**: `packages/baram-sdk/src/`

| # | Check Item | Details |
|---|-----------|---------|
| S1 | TX Construction | PTB (Programmable Transaction Block) construction correctness, gas budget |
| S2 | Coin Management | Coin merge/split logic, insufficient balance error handling |
| S3 | Type Safety | On-chain data parsing `as` casts -- safe? |
| S4 | Error Handling | BaramError class usage consistency, catch blocks swallowing errors |
| S5 | Pagination | getDynamicFields in executor.ts -- MAX_PAGINATION_PAGES guard effectiveness |
| S6 | TEE Client | SDK TEE encryption vs frontend implementation consistency |
| S7 | Retry Logic | execute() retry with cancel -- orphaned escrow if cancel fails |
| S8 | Budget Constraint Enforcement | Client-side validation vs on-chain enforcement -- gap? |
| S9 | URL Validation | SSRF prevention in callExecutor and fetchAndCachePublicKey |
| S10 | Memory Cleanup | AES key bytes zeroed after use? |

---

## 4. Security Deep Dive Areas

### 4A. Fund Flow Tracing

Trace the complete NUSDC flow through every path and verify no funds can be stuck or double-withdrawn:

```
[User Wallet] --create_request--> [Escrow Balance]
[Escrow Balance] --submit_proof--> [Executor Wallet] (normal settlement)
[Escrow Balance] --cancel_request--> [User Wallet] (cancel before timeout)
[Escrow Balance] --claim_timeout_refund--> [User Wallet] (timeout refund)

[User Wallet] --create_budget--> [Budget Balance]
[Budget Balance] --create_request_with_budget--> [Escrow Balance]
[Budget Balance] --withdraw_from_budget--> [Owner Wallet]
[Budget Balance] --deactivate_budget--> [Owner Wallet] (full balance return)
```

Critical questions:
- Can submit_proof and cancel_request race on the same request?
- Can Budget balance go negative?
- Can an expired/deactivated Budget still be used to create requests?
- What happens if settlement TX succeeds but AER creation fails?

### 4B. Encryption Flow Tracing

TEE mode E2E encryption full path:

```
[Frontend/SDK]                 [Host]              [Enclave]
    |                            |                    |
    |-- GET /public-key -------->|--vsock get_key-->  |
    |<- RSA public key ----------|<- RSA public key --|
    |                            |                    |
    | (Generate AES key, encrypt AES key with RSA)    |
    | (Encrypt prompt with AES-256-GCM)               |
    |                            |                    |
    |-- POST /execute (encrypted)->|--vsock execute-->|
    |                            |  (RSA decrypt AES key)
    |                            |  (AES decrypt prompt)
    |                            |  (LLM inference)
    |                            |  (AES encrypt response)
    |<- encrypted response ------|<- encrypted resp --|
    |                            |                    |
    | (Decrypt response with stored AES key)          |
```

Verify:
- AES key never exposed outside frontend memory / sessionStorage
- RSA keypair never leaves enclave
- MitM attack possibility (if host is malicious)
- AES-GCM nonce reuse
- Proxy mode: decrypted prompt sent to Host (documented trade-off?)

### 4C. Settlement Atomicity (Nitro PTB)

The Nitro host submits a 4-call PTB:
1. `baram::submit_proof` -- Release escrow to executor
2. `executor::record_job_completion` -- Update executor reputation
3. `compliance::create_record` -- Create compliance record
4. `executor_tier::refresh_tier_from_state` -- Recalculate tier

Verify:
- If call 1 succeeds but 2-4 fail, what state are we in?
- Is the PTB atomic (all-or-nothing)?
- Can partial failure leave inconsistent state?

### 4D. On-chain Data Trust

All paths where on-chain data is fetched and displayed in UI:
- `as Record<string, unknown>` type casts after field access -- safe?
- Malicious on-chain data (contract manipulation) impact on UI
- `JSON.parse()` exception handling for stored JSON fields (feeDetail, modelMetadata, constraints)

---

## 5. Code Quality Checks

### 5A. Architecture Patterns

| Check | Expected |
|-------|----------|
| Separation of Concerns | hooks = state, services = business logic, utils = pure utilities |
| Single Responsibility | One function/file = one role |
| Error Propagation | Errors properly bubble up, not swallowed in catch blocks |
| Constants | Named constants, no magic numbers |
| Type Safety | Minimal `any`, `as`, `!` usage |

### 5B. Code Smells

Report if found:
- Functions >200 lines
- >3 levels of nested conditionals/callbacks
- Same code duplicated in 2+ places (especially TX construction, error handling)
- Unused imports, variables, functions
- `// TODO`, `// FIXME`, `// HACK` comments
- `console.log`/`console.warn` left in production code (debug purpose)
- Empty catch blocks (`catch { }` or `catch { /* ignore */ }`)

### 5C. Frontend <-> SDK Duplication

Both frontend and SDK implement:
- Transaction builders (frontend `transactionBuilder.ts` vs SDK `transaction.ts` + `budget.ts`)
- Executor weighted random selection (frontend `useExecutors.ts` vs SDK `executor.ts`)
- TEE encryption (frontend `tee.ts` + `crypto.ts` vs SDK `tee.ts`)
- Coin management (frontend `coinService.ts` vs SDK `coin.ts`)
- AER fetching (frontend `aerService.ts` vs SDK `aer.ts`)

Check: Are these implementations consistent? Are there divergences that could cause different behavior?

### 5D. Test Coverage Gaps

Current test status:
- SDK unit tests: `packages/baram-sdk/src/__tests__/` (7 files, ~810 lines)
- SDK E2E tests: `packages/baram-sdk/src/__e2e__/` (6 files, ~1,260 lines, 35+ scenarios)
- **Frontend**: No tests
- **Lambda executor**: No tests
- **Nitro executor**: No tests (only manual test-client.ts)

Identify critical untested paths:
- Lambda handler error paths
- TEE encryption/decryption unit tests (in SDK only, not in frontend)
- Frontend useCreateRequest state transitions
- chatStore state consistency under concurrent operations

---

## 6. Known Issues (Already Identified)

Already identified and either fixed or acknowledged. **Focus on NEW findings -- do not re-report these**:

| # | Issue | Status |
|---|-------|--------|
| K1 | Groq API timeout missing | FIXED (AbortController 60s) |
| K2 | Nitro simulation mode plaintext fallback | FIXED (production guard) |
| K3 | Nitro buffer overflow | FIXED (pre-check + rate limit) |
| K4 | Retry exponential backoff missing | FIXED (Lambda + Nitro) |
| K5 | BCS parameter input validation | FIXED (hash/address validation) |
| K6 | Error message XSS | FIXED (fixed message mapping) |
| K7 | getBalance() first page only | FIXED (getBalance API) |
| K8 | fetchBudgetsByOwner pagination missing | FIXED (cursor-based) |
| K9 | TEE AES key concurrency (single variable) | FIXED (Map<requestId, key>) |
| K10 | getDynamicFields pagination missing (executor.ts) | FIXED (cursor loop + MAX_PAGES) |
| K11 | SDK retry cancel warning (silent failure) | FIXED (console.warn added) |
| K12 | Non-TEE executor prompt warning | FIXED (one-time console.warn) |
| K13 | Executor reputation self-inflation | ACKNOWLEDGED (Phase G cross-package witness) |
| K14 | TEE proxy mode privacy leak | ACKNOWLEDGED (documented trade-off) |
| K15 | pendingAesKeys Map unbounded growth | ACKNOWLEDGED, NOT FIXED |
| K16 | aerService 50 event limit | ACKNOWLEDGED, NOT FIXED |
| K17 | Nitro backoff max 17-min wait | ACKNOWLEDGED, NOT FIXED |
| K18 | budget.ts SuiObjectResponse type fix | FIXED (DTS build error) |

---

## 7. Output Format

> **Again: DO NOT modify code files.** Read/search only.
> Output findings in the format below as TEXT ONLY.

### 7A. Findings Format

Each finding:

```
### [SEVERITY-NUMBER] Title
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **File**: filepath:line_number
- **Category**: Security / Code Quality / Architecture / Performance / Correctness
- **Description**: What the issue is, specifically
- **Impact**: What happens if exploited/triggered
- **Recommendation**: How to fix it
- **Code snippet**: Problem code (5 lines max)
```

### 7B. Severity Criteria

| Severity | Criteria |
|----------|---------|
| CRITICAL | Fund loss, encryption key exposure, on-chain data manipulation possible |
| HIGH | Service disruption, data integrity violation, authentication bypass |
| MEDIUM | Feature malfunction, edge case error, information exposure |
| LOW | Code quality, maintainability, performance inefficiency |
| INFO | Improvement suggestion, best practice mismatch |

### 7C. Final Summary

- Total findings count (by severity)
- Immediate fix required (CRITICAL/HIGH)
- Must-fix before production deployment
- Items deferrable to future work

---

## 8. File Review Order

Review in this order for maximum security coverage:

### Phase 1: Move Smart Contracts (10 files, ~3,900 lines) -- HIGHEST RISK
1. `apps/baram/contracts/sources/baram.move` (533 lines)
2. `apps/baram/contracts/sources/budget.move` (453 lines)
3. `apps/baram/contracts-executor/sources/executor.move` (1,028 lines)
4. `apps/baram/contracts-executor/sources/executor_staking.move` (510 lines)
5. `apps/baram/contracts-executor/sources/executor_tier.move` (351 lines)
6. `apps/baram/contracts-aer/sources/aer.move` (441 lines)
7. `apps/baram/contracts-compliance/sources/compliance.move` (371 lines)
8. `apps/baram/contracts-attestation/sources/attestation_registry.move` (380 lines)
9. `apps/baram/contracts/sources/beta_access.move` (237 lines)

### Phase 2: Backend Executors (10 files, ~4,900 lines) -- Settlement + Encryption
10. `apps/baram/cdk/lambda-src/executor/src/index.ts` (369 lines)
11. `apps/baram/cdk/lambda-src/executor/src/services/sui.ts` (513 lines)
12. `apps/baram/cdk/lambda-src/executor/src/services/ai.ts` (132 lines)
13. `apps/baram/executor-nitro/src/enclave/main.ts` (443 lines)
14. `apps/baram/executor-nitro/src/enclave/crypto.ts` (238 lines)
15. `apps/baram/executor-nitro/src/enclave/inference.ts` (385 lines)
16. `apps/baram/executor-nitro/src/enclave/attestation.ts` (600 lines)
17. `apps/baram/executor-nitro/src/host/server.ts` (447 lines)
18. `apps/baram/executor-nitro/src/host/sui-client.ts` (626 lines)
19. `apps/baram/executor-nitro/src/host/vsock-client.ts` (436 lines)

### Phase 3: Frontend Critical Path (10 files, ~2,400 lines) -- User Fund Touchpoints
20. `apps/baram/frontend/src/features/request/hooks/useCreateRequest.ts` (271 lines)
21. `apps/baram/frontend/src/features/request/hooks/useExecutors.ts` (361 lines)
22. `apps/baram/frontend/src/hooks/useBudgets.ts` (243 lines)
23. `apps/baram/frontend/src/utils/tee.ts` (119 lines)
24. `apps/baram/frontend/src/utils/crypto.ts` (149 lines)
25. `apps/baram/frontend/src/services/chatCrypto.ts` (187 lines)
26. `apps/baram/frontend/src/stores/chatStore.ts` (477 lines)
27. `apps/baram/frontend/src/features/request/services/transactionBuilder.ts` (177 lines)
28. `apps/baram/frontend/src/services/chatStorage.ts` (324 lines)
29. `apps/baram/frontend/src/config/network.ts` (173 lines)

### Phase 4: SDK (7 files, ~1,800 lines)
30. `packages/baram-sdk/src/client.ts` (700 lines)
31. `packages/baram-sdk/src/services/budget.ts` (354 lines)
32. `packages/baram-sdk/src/services/executor.ts` (254 lines)
33. `packages/baram-sdk/src/services/tee.ts` (192 lines)
34. `packages/baram-sdk/src/services/aer.ts` (129 lines)
35. `packages/baram-sdk/src/types.ts` (280 lines)
36. `packages/baram-sdk/src/errors.ts` (78 lines)

### Phase 5: Remaining Frontend + Shared (~60 files)
37-100. Remaining components, utils, config, types

---

## 9. Reference Information

- **Nasun Devnet** is a Sui fork. All standard Sui Move features (shared objects, dynamic fields, Table, Balance) are supported.
- **NUSDC**: 6 decimals (1,000,000 = 1 NUSDC). Native token: NASUN (9 decimals, smallest unit: SOE).
- **SUI_CLOCK_ID = `0x6`**: Sui system Clock object.
- Move `#[allow(unused_const)]` is used for intentionally reserved constants.
- Frontend uses `@nasun/wallet` package with zkLogin (Google OAuth).
- CDK infrastructure: AWS Lambda + API Gateway (outside VPC).
- Budget module is part of the baram package (same package ID).
- Executor staking/tier modules are in a separate package from baram core.

### Deployed Contract IDs (Devnet V7)

| Package | ID |
|---------|------|
| baram (v3) | `0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6` |
| baram_executor (v2) | (see devnet-config) |
| baram_aer | `0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0` |
| NUSDC type | `0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC` |

### Key Architecture Decisions

1. **Settlement-Gated Response**: Executor only returns AI result after on-chain proof submission succeeds
2. **Weighted Random Selection**: BASE_WEIGHT=0.3, REPUTATION_BONUS=1.0, DORMANT_PENALTY=0.3
3. **Dual Encryption**: Password wallets use PBKDF2(address+password); zkLogin uses PBKDF2(address) fallback
4. **Self-Service Functions (Phase F-2)**: Executors can self-report job completion/failure without admin
5. **Budget Constraints**: Model/executor allowlists, max_per_request, expiration -- enforced both client-side and on-chain
