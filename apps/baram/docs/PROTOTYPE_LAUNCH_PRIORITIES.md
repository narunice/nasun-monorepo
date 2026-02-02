# Baram Prototype Launch — Priority Analysis & Recommendations

> 2-week countdown to prototype reveal + membership NFT sales + community building.
> Generated from internal architecture review, 2026-02-02.

---

## Current State Summary

### Core Functionality: Ready

Baram's core features are **prototype-ready**:

| Area | Status | Notes |
|------|--------|-------|
| Chat UI | Done | Message display, input, processing states, markdown rendering |
| Wallet Connection | Done | Password wallet + zkLogin (Google OAuth) |
| Model Selection | Done | Dropdown in sidebar, 3 models available |
| Executor Auto-Assignment | Done | Weighted random, Bronze+ tier filter, auto-retry (3x) |
| TEE Attestation Display | Done | "TEE Verified" badge, PCR0 hash, expandable details |
| Audit Trail (ECR Receipt) | Done | Full modal: execution time, result hash, tier snapshot, settlement TX |
| E2E Encryption | Done | RSA-OAEP + AES-256-GCM, Host cannot see prompt or response |
| Error Handling | Done | Clear status messages, auto-retry, fallback states |
| Mobile Responsive | Done | Hamburger sidebar, touch-friendly, overlay navigation |
| Dark Mode | Done | CSS variables, localStorage persistence, system preference detection |
| Chat History Encryption | Done | AES-256-GCM (PBKDF2 key derivation), per-wallet IndexedDB |
| Idle Timeout | Done | 15-min inactivity auto-lock (DOM event based) |
| On-chain Contracts (V6) | Done | Escrow, Executor, Staking, Tier, Attestation, Compliance all deployed |
| Lambda Backend (Groq) | Done | HTTPS endpoint, llama-3.1-8b + llama-3.3-70b active |
| Faucet | Done | NUSDC faucet integrated in wallet UI |
| TypeScript Build | Done | Zero errors |

### What Needs Attention

| Area | Status | Action Required |
|------|--------|----------------|
| TEE Spot Instance | OFF | `launch-spot.sh` before launch |
| Landing / Onboarding | Minimal | Needs vision communication |
| Community Links | Missing | No Discord/Twitter/NFT links in app |
| Audit Trail Visibility | Hidden | Behind small button, easy to miss |

---

## Priority Recommendations (Community-Building Order)

### Priority 1: "Why Baram" — Vision Communication (MOST IMPORTANT)

**Problem**: The current first screen shows `"Private AI with TEE Protection"` with a wallet connect button. Technically accurate, but the community cannot understand **why this matters**.

**Why this is #1**: People buy NFTs because they believe in a vision. No matter how good the tech is, if a visitor can't understand "what this is" within 30 seconds, they won't buy.

**What's needed:**

- **Clear value proposition**: "Your AI conversations are truly private — encrypted, processed inside a secure enclave, and settled on-chain. No one — not even us — can see what you ask."
- **How-it-works visualization**: E2E encryption → TEE inference → on-chain settlement pipeline as a simple 3-step diagram or animation
- **Differentiation**: "Unlike ChatGPT, your prompts never leave the secure enclave. Unlike other crypto AI projects, every execution has an on-chain compliance record."
- **Community/NFT funnel**: Clear path to Discord, Twitter, membership NFT information

**Scope**: Landing section enhancement in `App.tsx` / `WelcomeScreen.tsx` — not a new page, just better first-impression content.

---

### Priority 2: TEE Demo Must Work Flawlessly

**Problem**: TEE spot instance is currently OFF. Groq models (Lambda) work for chat, but **Baram's core differentiator is TEE inference**.

**What the community needs to see:**

1. Select TEE model (`llama-3.2-3b-local`)
2. `"TEE Verified"` badge appears on the response
3. Audit Trail shows PCR0 hash, on-chain settlement TX
4. "This conversation was encrypted, processed in a secure enclave, and the proof is on the blockchain"

**Required actions:**

```bash
# Before launch (allow 30 min for full verification)
cd apps/baram/executor-nitro
bash scripts/launch-spot.sh              # 2-3 min, auto health check
bash scripts/update-executor.sh <IP>     # On-chain endpoint update

# E2E verification checklist
# [ ] TEE model selectable in UI
# [ ] Prompt → encrypted → TEE inference → response
# [ ] Attestation: "Verified" (not "Unverified")
# [ ] Audit Trail: PCR Verified: Yes, Settlement TX present
# [ ] Host logs: "Settlement completed: <TX_DIGEST>"
```

**Cost during launch period**: ~$0.05/hr. 8 hours/day for 2 weeks = ~$5.60 total.

**Critical**: Keep TEE instance running during the public demo period. Terminate after with `terminate-spot.sh`.

---

### Priority 3: Make Audit Trail a Showcase

**Problem**: The Audit Trail (ECR Receipt) is Baram's most unique feature — TEE verification, Executor Tier snapshot, on-chain TX — but it's hidden behind a small button on assistant messages. First-time users may never discover it.

**Why this matters**: The moment a user sees "my AI conversation has an on-chain proof" is the moment they understand why Baram is different. This is the community-spread trigger.

**Suggestions:**

- Auto-expand or highlight the Audit Trail on the **first TEE response** in a session
- Add a tooltip or guide: "Check your first on-chain proof"
- Make the Explorer link more prominent
- Consider a "Share this proof" feature (link to explorer TX)

**Scope**: Small UI adjustments in `AssistantMessage.tsx` and `ECRReceipt.tsx`.

---

### Priority 4: Demo Stability

**Problem**: One failure during a public demo destroys trust. Community users are not developers — they won't tolerate errors.

**Checklist:**

| Item | Check | Risk |
|------|-------|------|
| Groq API rate limit | Verify concurrent request handling | Medium — if many users try simultaneously |
| TEE executor down → Groq fallback | Verify graceful degradation | Medium — TEE model should show clear message if unavailable |
| Faucet capacity | ClaimRecord dedup, rate limiting | Low — devnet faucet is generous |
| Error messages | User-friendly language, no raw error codes | Low — already implemented, verify edge cases |
| Settlement retry | 3x retry with on-chain status check | Low — already implemented (Phase F-9) |
| Auto-cancel on failure | Escrow released on exec failure | Low — already implemented (Phase F-6) |

**Action**: Run a full E2E stress test before launch — multiple rapid requests, model switching, TEE + Groq alternating.

---

### Priority 5: Community Funnel (Discord/Twitter/NFT Links)

**Problem**: Currently zero outbound links in the Baram app. A user who thinks "this is cool" has no path to join the community or learn about NFTs.

**Minimum viable addition:**

- Header or sidebar: Discord icon + Twitter icon
- Footer or sidebar: "Join our community" CTA
- Link to membership NFT info page (on nasun.io or dedicated page)
- Optional: "Powered by Nasun Network" with link to nasun.io

**Scope**: A few lines in `Sidebar.tsx` or header component.

---

## What NOT To Do (Within 2 Weeks)

| Temptation | Why Not |
|-----------|---------|
| KV Cache / Stateful TEE | Architecture change risks stability, not needed for prototype demo |
| Walrus / Seal integration | Infrastructure too large, Nasun Devnet compatibility issues |
| New models (GPT-4o, etc.) | OpenAI credit issues, existing Groq + TEE is sufficient |
| HTTPS / domain for TEE | Lambda is already HTTPS, TEE HTTP is internal (not user-facing) |
| Context window expansion | Cost/latency increase, long conversations are rare in demos |
| Major UI redesign | Current UI is clean and functional, polish > rebuild |
| Multi-executor deployment | Single executor is fine for prototype, distributed is Phase H |

---

## Launch Day Checklist

### 1 Week Before

- [ ] TEE spot instance test launch: `launch-spot.sh`
- [ ] Full E2E test: Groq model + TEE model
- [ ] Audit Trail verification: PCR Verified: Yes, TX Digest present
- [ ] Faucet test: multiple NUSDC claims
- [ ] Mobile test: iPhone + Android browser
- [ ] Landing/onboarding content finalized
- [ ] Community links added to app

### Launch Day

- [ ] TEE spot instance running: `launch-spot.sh`
- [ ] Endpoint updated: `update-executor.sh <IP>`
- [ ] Lambda health: `curl https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod/health`
- [ ] TEE health: `curl http://<SPOT_IP>:3000/health`
- [ ] Frontend deployed and accessible
- [ ] Test request from fresh wallet (Password + zkLogin)
- [ ] Audit Trail working end-to-end

### Post-Launch

- [ ] Monitor Lambda logs for errors
- [ ] Monitor on-chain TX success rate
- [ ] Keep TEE instance running during demo period
- [ ] Terminate TEE instance after demo: `terminate-spot.sh`
- [ ] Collect community feedback (Discord)

---

## Cost Summary (Launch Period)

| Item | Cost |
|------|------|
| TEE Spot (2 weeks, 8hr/day) | ~$5.60 |
| AMI storage | ~$1.25 (2 weeks) |
| Lambda (free tier) | ~$0 |
| API Gateway (free tier) | ~$0 |
| **Total launch period** | **~$7** |

---

## The Pitch

> A 2-person team, zero external funding, built:
> - A working L1 blockchain (Sui fork)
> - E2E encrypted AI inference inside AWS Nitro TEE
> - On-chain escrow settlement with compliance records
> - 4-tier executor reputation system with staking/slashing
> - Automated attestation verification (COSE_Sign1 + X.509)
> - Self-service executor management (no admin dependency)
> - Pipeline atomicity with settlement-gated responses
>
> **The code quality and working demo IS the pitch.**
> The 2 weeks should be spent making sure the community **sees and understands** what's already built, not building new features.

---

*Document generated 2026-02-02. Reference during launch preparation.*
