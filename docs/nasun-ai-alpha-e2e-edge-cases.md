# Nasun AI Public Alpha: E2E Edge-Case Audit (2026-05-18)

> Static analysis of HEAD `6eeb16b4`. No live transactions, no staging deploy.
> Method: 4 parallel sub-agent audits across Auth+Funding, Activation+ToS, AER+Kill-Switch, UX+Branding+Flag.
> Findings filtered to confidence >= 75%. PASS items omitted for brevity.

## Severity legend

- **CRITICAL**: real prod incident risk; can leak funds, leak feature pre-launch, silently disable safety control, or mislead operators during incident.
- **HIGH**: dogfood-degrading bug, copy/UX regression visible to first 30 minutes, or ops-runbook inaccuracy.
- **MEDIUM**: polish or future-proofing.

## CRITICAL

### CR-1. Runbook claims runtime reads on-chain `pause_mode`, but it does not

[docs/nasun-ai-killswitch-runbook.md](nasun-ai-killswitch-runbook.md) L3 section states "The runtime reads `pause_mode` via `sui-capability-utils.ts` before issuing an action. Pause is honored on the next cycle." Grep shows the runtime has no such read path; `sui-capability-utils.ts` lives in chat-server, not nasun-ai-runtime. Real L3 enforcement is the Lambda preflight + on-chain Move abort at `/execute-capability`. Operators relying on this sentence will believe pause takes effect off-chain in seconds when it actually depends on Lambda + chain. Fix: rewrite L3 verification section to describe actual enforcement layers.

### CR-2. Heartbeat watchdog re-fires every 60s on Telegram send failure

[aer-heartbeat.ts:134](../apps/nasun-ai-runtime/src/aer-heartbeat.ts#L134) sets `lastAlertAt = now` ONLY when `sendTelegramMessage` returns `ok=true`. If Telegram is unreachable, the bot is blocked, or chat is archived, `lastAlertAt` stays at 0 and the watchdog re-attempts every 60s with no cooldown: log spam + outbound HTTP storm for the duration of any Telegram outage on a stale agent. Fix: also update `lastAlertAt` on send failure (rate-limit by attempt, not by success), OR log a warn-once and back off.

### CR-3. User-facing "Sui" branding leak

[ExportAgentKeyModal.tsx:233](../apps/nasun-website/frontend/src/sections/uju/ai/components/modals/ExportAgentKeyModal.tsx#L233) label `"Sui private key (bech32)"`. Violates [feedback_no_sui_branding.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_sui_branding.md). Visible during every "Export key" flow. Fix: `"Private key (bech32)"` or `"Nasun wallet private key (bech32)"`.

### CR-4. User-facing "bot" branding leak

[LinkTelegramModal.tsx:175](../apps/nasun-website/frontend/src/sections/uju/ai/components/modals/LinkTelegramModal.tsx#L175) copy `"After opening the link, the bot will confirm the connection."` Violates [feedback_agent_not_bot.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_agent_not_bot.md). Every Telegram-linking user passes through this. Fix: `"Nasun AI will confirm the connection."`.

### CR-5. `env-verify` skips boolean-valued `VITE_*` keys

[scripts/env-verify.sh:128](../scripts/env-verify.sh#L128) `if [ "$vlen" -lt 10 ]; then SKIP`. `VITE_NASUN_AI_ENABLED=false` (5 chars) and `=true` (4 chars) are never compared against the dist bundle. If `.env` is flipped to `false` but a stale `true` build is rsynced, env-verify exits 0 and the public AI tab leaks into prod nav. Fix: special-case boolean-ish keys (no SKIP); presence-check the literal token in dist plus a manual rebuild confirmation when the value is boolean-ish.

## HIGH

### H-1. Wrong-passphrase error path never matches WebCrypto OperationError

[TransferAgentFundsDialog.tsx:292](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/TransferAgentFundsDialog.tsx#L292) only catches messages containing `Decryption | passphrase | does not match`. WebCrypto `crypto.subtle.decrypt` throws DOMException `OperationError: The operation failed for an operation-specific reason`. None of the three substrings match. Result: user sees a cryptic raw error instead of the intended actionable message. Fix: add `msg.includes('OperationError')` or check `err.name === 'OperationError'` first.

### H-2. Top-up-inference missing `MIN_DEPOSIT` (0.1 NUSDC) client validation

[TransferAgentFundsDialog.tsx:225-244](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/TransferAgentFundsDialog.tsx#L225) only checks `amountRaw <= 0n`, budget id, and balance. The Move contract enforces `MIN_DEPOSIT = 100_000` (0.1 NUSDC). A sub-min top-up signs successfully then aborts at execution with a generic chain error. Fix: validate `amountRaw >= BUDGET_CONFIG.MIN_DEPOSIT` before signing, with inline copy.

### H-3. NASUN withdraw dead-end when agent has dust < gas reserve

[TransferAgentFundsDialog.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/TransferAgentFundsDialog.tsx) When agent has 0 < NASUN < 0.05 (MIN_GAS_RESERVE_MIST): `computeNasunMaxWithdraw` returns `0n`, Max button disables, `agentHasGas=true` (>0n), submit not disabled, user types any amount, validation blocks with "Use Max..." but Max is disabled. User is stuck. Fix: either disable the Submit button when `maxForMode === 0n`, or surface a banner explaining the dust state and pointing to faucet/deposit.

### H-4. `authorizeAgentOnChain` failure surfaced only to console.warn

[ActivateAgentModal.tsx:96-103](../apps/nasun-website/frontend/src/sections/uju/ai/components/modals/ActivateAgentModal.tsx#L96) catches the auth failure and only logs. UI shows success. Vault upload succeeds, agent boots, but inline-keyboard proposal flows silently fail because on-chain delegation never landed. User has no signal, no retry CTA. Fix: surface a non-blocking toast/banner ("Agent activated. On-chain authorization failed - some chat features disabled. Retry?") with a "Re-authorize" button in Settings or DangerZone.

### H-5. Revoke is irreversible but confirmation is one inline 2-click toggle

[DangerZoneCard.tsx:151-179](../apps/nasun-website/frontend/src/sections/uju/ai/components/DangerZoneCard.tsx#L151) Revoke uses an inline `confirmRevoke` toggle. No modal, no typed confirmation, no agent-name echo. Compared to Deactivate (separate modal), the asymmetry undersells permanence. After Track E, DangerZoneCard sits higher in the page (right under Server status), increasing accidental-click surface area. Fix: replace inline toggle with a modal requiring "type the agent name" or "type REVOKE".

### H-6. `parseMinutesEnv` accepts exponential notation, allowing 60ms watchdog interval

[aer-heartbeat.ts:139-146](../apps/nasun-ai-runtime/src/aer-heartbeat.ts#L139) `Number("1e-3")=0.001`, `Number.isFinite=true`, `0.001 <= 0` is false. Returns `60` ms. Watchdog runs ~16x/sec; Telegram + log spam. Fix: floor to 1 minute (`Math.max(n, 1) * 60_000`) or reject `n < 1`.

### H-7. Runbook L1 flip section understates "existing agents keep stale env"

Runbook L1 describes `pm2 delete nasun-chat-server` + start to flip `AGENT_GLOBAL_PR1A_SWAP_DISABLED`. But each spawned per-agent runtime captured the env at parse-time; chat-server delete+start refreshes only the orchestrator daemon, not running agents. The caveat appears only in the Heartbeat-alert subsection. Operator pulling L1 expects ~10s effect; reality is "running agents continue submitting BUY/SELL until they respawn." Fix: hoist the caveat into the L1 flip section with an explicit `pm2 delete agent-*` sweep recipe.

### H-8. PM2 crash-restart resets `startedAt` and the startup grace

[aer-heartbeat.ts:52-54](../apps/nasun-ai-runtime/src/aer-heartbeat.ts#L52) `startedAt = Date.now()` on every process start. A fast crash-restart loop never gets past the grace, so a permanently broken agent never alerts. Fix: persist `startedAt` to disk (e.g., `~/.nasun-ai-runtime/heartbeat-startedAt`) or compute grace against process-uptime less the cumulative crash time; alternatively, count crash restarts separately and alert on N restarts in M minutes.

### H-9. Em-dash leakage in user-facing TSX

User memory mandates zero em-dashes in any user-facing text. Found in:
- [QuickstartView.tsx:301](../apps/nasun-website/frontend/src/sections/uju/ai/pages/QuickstartView.tsx#L301) hero copy
- [TraderConfigForm.tsx:302](../apps/nasun-website/frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx#L302) form helper
- [ChatTab.tsx:75](../apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/ChatTab.tsx#L75) legacy-agent label
- [TransferAgentFundsDialog.tsx:371,400](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/TransferAgentFundsDialog.tsx#L371) option labels
- [ResultViewerModal.tsx:32,42,51](../apps/nasun-website/frontend/src/sections/uju/ai/components/modals/ResultViewerModal.tsx#L32) empty-state placeholders

Fix: replace with comma, colon, or hyphen as semantics dictate.

### H-10. `FirstRunChecklist` dismissal is global, not per-agent

[FirstRunChecklist.tsx:14](../apps/nasun-website/frontend/src/sections/uju/ai/components/FirstRunChecklist.tsx#L14) key `nasun-ai-first-run-dismissed-v1` is single-scope. Creating a second agent skips the onboarding banner. Mild UX miss for multi-agent alpha users. Fix: scope per agent: `nasun-ai-first-run-dismissed-v1:${agentAddress}`.

### H-11. Heartbeat `staleMs` baked at startup, ignores mid-flight cycle-interval changes

[aer-heartbeat.ts:73-77](../apps/nasun-ai-runtime/src/aer-heartbeat.ts#L73) computes `staleMs` once from startup `intervalMinutes`. trader-cycle supports per-cycle `effectiveIntervalMs` override via browser config; if the user raises cadence from 5 to 60 min, the watchdog's stale window (~10min) becomes far too tight. Fix: expose `updateHeartbeatInterval(newMs)` and call it after each cycle when `effectiveIntervalMs` differs.

## MEDIUM

- ToS gate per-browser, per-wallet scoping is ambiguous in copy; consider adding "applies to all agents on this device" or scope key by wallet.
- AgentFundsCard 0.05 NASUN gas threshold is a magic number to the user; surface as "<0.05 NASUN".
- Deposit dialog `>Max` validation is submit-time only; consider inline onChange feedback.
- Token select label `"Token to send (balances shown are from your wallet)"` is dense; consider a separate helper line.
- ToS localStorage key already versioned (`-v1`); document the bump strategy.

## Scenarios verified clean (PASS)

- ToS modal Cancel: closes cleanly, no partial state ([SettingsTab.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/SettingsTab.tsx))
- `setActivateOpen` callers: only SettingsTab, no other entry path
- Cross-owner re-upload protected by server `not_capability_owner` check
- Grace expiry server guard via `grace_window_expired` (RestoreAgentModal)
- Concurrent submit guard via `inFlight.current` ref (TransferAgentFundsDialog)
- localStorage failure: `markTosAccepted` catches; re-prompt next visit is the safe fallback
- VITE_NASUN_AI_ENABLED gate at UjuPage VALID_TABS level: deep links via query param fall back when flag is off
- Coin selector populated from typed `TOKENS` registry; no arbitrary coin type path
- E_CAPABILITY_REVOKED runtime path: trader-cycle observes `execResp.success=false`, returns `execute_failed`, no recordAerLanded, watchdog goes stale, alerts (per test fixture)

## Live verification still required (NEEDS_LIVE)

1. Lambda preflight rejection of `pause_mode=2` (functional check that L3 actually halts a non-paused-runtime BUY).
2. L2 + L3 ordering during the same incident: does the runtime see `LAMBDA_SWAP_DISABLED` first or the on-chain pause?
3. `deactivate` server endpoint behavior against a revoked capability.
4. Top-up dialog default `selectedBudgetId` when an agent has 2+ active budgets.
5. Concurrent owner-wallet spend in another tab during a deposit (stale balance).
6. Lambda env JSON push with newline-containing values via `Variables=$(cat ...)`.

## Recommended fix sequencing

Tier 1 (before any external dogfood):
- CR-1 runbook accuracy
- CR-3 / CR-4 branding leaks
- CR-5 env-verify boolean handling
- H-7 runbook L1 caveat hoist
- H-9 em-dash cleanup

Tier 2 (before flipping `VITE_NASUN_AI_ENABLED=true`):
- CR-2 heartbeat alert cooldown
- H-1 wrong passphrase mapping
- H-2 MIN_DEPOSIT validation
- H-3 NASUN dust dead-end
- H-5 revoke confirmation modal
- H-6 parseMinutesEnv floor

Tier 3 (within first week of alpha):
- H-4 authorize-on-chain failure UI
- H-8 crash-loop grace reset
- H-10 per-agent FirstRunChecklist
- H-11 heartbeat dynamic interval
- MEDIUM polish

## Method notes

- 4 sub-agents spawned in parallel (Auth+Funding, Activation+ToS, AER+Kill-Switch, UX+Branding+Flag).
- Each agent confined to static code analysis via Read/Grep; no live calls.
- Findings filtered to confidence >= 75%, then re-classified by impact.
- See agent transcripts in commit log if deeper reasoning chains needed.
