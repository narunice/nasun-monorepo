# Nasun AI Integration — File Migration Mapping (S1)

> Source: [handoff 2026-05-13-nasun-ai-integration-pivot.md](../handoffs/2026-05-13-nasun-ai-integration-pivot.md)
> Status: S1 inventory only. No code moved yet. Actual moves begin in S2.

## Decisions recap

| 항목 | 결정 |
|---|---|
| Backend new home | `apps/nasun-ai-runtime/` (sibling app, replaces `apps/baram/agent-runner/`) |
| Frontend new home | `apps/nasun-website/frontend/src/sections/uju/ai/` (1급 영역) |
| SDK package name | `@nasun/baram-sdk` (internal identifier, kept as-is) |
| `apps/baram/` | Preserved in place, ARCHIVED header, excluded from pnpm workspace |
| External brand | "Nasun AI" only |
| pm2 process | `baram-trader` → `nasun-ai-runtime` (S2) |

---

## 1. Backend: `apps/baram/agent-runner/` → `apps/nasun-ai-runtime/`

1:1 copy (then prune). All paths under `src/`.

| Source (apps/baram/agent-runner/src/) | Target (apps/nasun-ai-runtime/src/) | Notes |
|---|---|---|
| `index.ts` | `index.ts` | Entry. PRESET dispatcher + heartbeat + `/wake` server boot. |
| `config.ts` | `config.ts` | Env var loader. Audit `BARAM_*` names for optional rename in S5. |
| `baram-client.ts` | `nasun-ai-client.ts` (rename) | Sui client wrapper for AER/Capability/Escrow PTBs. |
| `host-client.ts` | `host-client.ts` | |
| `executor-client.ts` | `executor-client.ts` | |
| `llm-client.ts` | `llm-client.ts` | |
| `jwt-verify.ts` | `jwt-verify.ts` | chat-server JWT verification. |
| `idempotency.ts` | `idempotency.ts` | sqlite `processed_jobs.db`. Path `~/.baram-agent-runner/` → `~/.nasun-ai-runtime/` (S2). |
| `telegram.ts` | `telegram.ts` | AER-landing outbound notify. |
| `wake-server.ts` | `wake-server.ts` | Hono server on 127.0.0.1:WAKE_PORT. |
| `wake-router.ts` | `wake-router.ts` | trigger_type dispatch. |
| `presets/trader.ts` | `presets/trader.ts` | |
| `presets/trader-cycle.ts` | `presets/trader-cycle.ts` | |
| `presets/trader-decision.test.ts` | `presets/trader-decision.test.ts` | |
| `presets/trader-envelope.ts` + tests | `presets/trader-envelope.ts` + tests | |
| `presets/analyst.ts` + tests | `presets/analyst.ts` + tests | Cognition AER preset. |
| `presets/analysis.ts` | `presets/analysis.ts` | |
| `presets/content.ts` | `presets/content.ts` | |
| `presets/research.ts` | `presets/research.ts` | |
| `presets/manual-execution.ts` | `presets/manual-execution.ts` | |
| `presets/strategies.ts` + tests | `presets/strategies.ts` + tests | |
| `presets/types.ts` | `presets/types.ts` | |
| `*.test.ts` (config, baram-client, host-client, executor-client, llm-client, wake) | mirror | |
| `scripts/e2e-foundation-scenario.ts` | `scripts/e2e-foundation-scenario.ts` | Used by S6 D-9. |
| `scripts/README.md` | `scripts/README.md` | |
| `ecosystem.agent-runner.cjs` | `ecosystem.nasun-ai-runtime.cjs` (rename + `name: 'nasun-ai-runtime'`) | pm2. |
| `package.json` | `package.json` | name → `@nasun/nasun-ai-runtime`. Deps unchanged. |
| `tsconfig.json` | `tsconfig.json` | extends `@nasun/tsconfig`. |
| `vitest.config.ts` | `vitest.config.ts` | |
| `README.md` | `README.md` | Rewrite header for new name. |

Env vars to audit in S5 (rename or keep): `BARAM_PACKAGE_ID`, `BARAM_REGISTRY_ID`, `BARAM_AER_PACKAGE_ID`, `BARAM_API_KEY`, `BARAM_SESSION_JWT_SECRET`, `BARAM_CHAT_SERVER_HMAC_SECRET`. Recommendation: keep onchain-identifier vars (they reference Move package names) and rename infra-only secrets.

---

## 2. Frontend: `apps/baram/frontend/` → `apps/nasun-website/frontend/src/sections/uju/ai/`

Baram had its own Vite app + DashboardLayout. nasun-website AiTab becomes the 1급 area. Routing collapses to query-string sub-tabs under `/my-account?tab=ai`.

### 2.1 Page-level pivot

| Baram route | New location in uju/ai/ | Notes |
|---|---|---|
| `/` (DashboardOverview) | `pages/Overview.tsx` | Summary card + recent AER. Can fold into AiTab root. |
| `/agents` (AgentList) | `pages/AgentsList.tsx` | Top-level after wallet connect. Replaces current placeholder agent cards in AiTab.tsx. |
| `/agents/:id` (AgentDetail with 4 sub-tabs) | `pages/AgentDetail.tsx` + tab components below | Sub-tabs: Dashboard/Activity/Escrow/Sessions. URL: `?tab=ai&agent={id}&sub=activity`. |
| `/budgets` (BudgetsPage) | `pages/Budgets.tsx` | Optional — re-evaluate in S4 (may fold into AgentDetail/Escrow). |
| `/aer` (AERTimeline) | `pages/AerTimeline.tsx` | Cross-agent AER feed. |
| `/chat` (ChatPage) | **DEFERRED** | Handoff S4: "Chat 탭은 보류 (필요성 재검토)". |
| `/callback` (AuthCallback) | n/a | zkLogin OAuth already lives in nasun-website auth layer. |

### 2.2 Component & hook mapping

Components — `apps/baram/frontend/src/` → `apps/nasun-website/frontend/src/sections/uju/ai/`:

| Source | Target | Notes |
|---|---|---|
| `pages/AgentList.tsx` | `pages/AgentsList.tsx` | |
| `pages/AgentDetail.tsx` | `pages/AgentDetail.tsx` | |
| `pages/Agent/SessionsTab.tsx` | `pages/agent/SessionsTab.tsx` | |
| `pages/AERTimeline.tsx` | `pages/AerTimeline.tsx` | |
| `pages/BudgetsPage.tsx` | `pages/Budgets.tsx` | |
| `pages/DashboardOverview.tsx` | `pages/Overview.tsx` | |
| `pages/ChatPage.tsx` | **DEFERRED** | — |
| `pages/AuthCallback.tsx` | **DROP** | nasun-website handles auth. |
| `components/modals/CreateAgentModal.tsx` | `components/modals/CreateAgentModal.tsx` | |
| `components/modals/CreateBudgetModal.tsx` | `components/modals/CreateBudgetModal.tsx` | |
| `components/modals/BudgetSettingsModal.tsx` | `components/modals/BudgetSettingsModal.tsx` | |
| `components/modals/LinkTelegramModal.tsx` | `components/modals/LinkTelegramModal.tsx` | Already partially scaffolded as `LinkTelegramCTA.tsx`. Merge in S4. |
| `components/modals/ResultViewerModal.tsx` | `components/modals/ResultViewerModal.tsx` | |
| `components/forms/TraderConfigForm.tsx` | `components/forms/TraderConfigForm.tsx` | |
| `components/badges/TierBadge.tsx` | `components/badges/TierBadge.tsx` | |
| `components/receipt/*` (8 files) | `components/receipt/*` | AER receipt drawer pieces. |
| `components/sidebar/*` | **DROP** | Baram's own sidebar; replaced by nasun-website UjuNavigation. |
| `components/navigation/{DashboardHeader,DashboardSidebar}.tsx` | **DROP** | Same reason. |
| `components/theme/*` | **DROP** | nasun-website has its own theming. |
| `components/empty/{Landing,Welcome,NFTGate,Onboarding,Suggestion}*.tsx` | Re-evaluate S3 | Many are chat-flow specific (ChatPage deferred). Likely drop most. |
| `components/chat/*` | **DEFERRED** (with ChatPage) | |
| `components/input/{ChatInput,InputFooter,ModelSelector}.tsx` | **DEFERRED** | ModelSelector may be needed by CreateAgentModal — verify in S3. |
| `components/ErrorBoundary.tsx` | **DROP** | nasun-website has its own. |
| `features/aer/hooks/useAERRecords.ts` | `hooks/useAerRecords.ts` | |
| `features/aer/hooks/useAERResult.ts` | `hooks/useAerResult.ts` | |
| `features/agents/hooks/useAgentBudgets.ts` | `hooks/useAgentBudgets.ts` | |
| `features/agents/hooks/useAgentProfiles.ts` | `hooks/useAgentProfiles.ts` | Replaces inline fetchAgentProfiles in current AiTab.tsx. |
| `features/request/hooks/*` (useAER, useAttestation, useCreateRequest, useExecutors, useRequestWithRetry) | `hooks/request/*` | |
| `features/request/components/{AttestationDisplay,ExecutionReport}.tsx` | `components/request/*` | |
| `features/request/services/{aerService,coinService,transactionBuilder}.ts` | `services/*` | |
| `hooks/useAgentActions.ts` | `hooks/useAgentActions.ts` | |
| `hooks/useBaramSessions.ts` | `hooks/useNasunAiSessions.ts` (rename) | |
| `hooks/useBudgets.ts` | `hooks/useBudgets.ts` | |
| `hooks/useCreateAgent.ts` | `hooks/useCreateAgent.ts` | |
| `hooks/useIdleTimeout.ts` | **DROP** | nasun-website handles session lifecycle. |
| `hooks/useNFTGate.ts` | Re-evaluate S3 | NFT gating may not apply to new entry point. |
| `hooks/useTraderConfig.ts` | `hooks/useTraderConfig.ts` | |
| `hooks/useTraderScheduler.ts` | **DROP** | Scheduling moved to agent-runner heartbeat (server-side). |
| `hooks/useWalletSession.ts` | **DROP** | Use nasun-website auth context. |
| `services/agentKeyStorage.ts` | `services/agentKeyStorage.ts` | |
| `services/chatCrypto.ts` / `chatStorage.ts` | **DEFERRED** (chat) | |
| `services/contextBuilder.ts` | **DEFERRED** | Chat-related. |
| `services/traderConfigStorage.ts` | `services/traderConfigStorage.ts` | |
| `services/traderRunner.ts` | **DROP** | Frontend-side trader runner replaced by server `/wake`. |
| `stores/{budgetStore,chatStore}.ts` | budgetStore→`stores/budgetStore.ts`, chatStore DEFERRED | |
| `types/{chat,trader}.ts` | trader→`types/trader.ts`, chat DEFERRED | |
| `utils/{budget,crypto,encoding,executor,format,suiPagination,tee}.ts` | `utils/*` | |
| `config/{attestation,client,network}.ts` | Merge into nasun-website config layer | Use `@nasun/devnet-config` if possible. |
| `layouts/DashboardLayout.tsx` | **DROP** | UjuLayout takes over. |
| `App.tsx`, `main.tsx` | **DROP** | nasun-website has its own root. |

### 2.3 Existing scaffold to integrate

Files already in `apps/nasun-website/frontend/src/sections/uju/ai/`:
- `AiTab.tsx` — current placeholder with "Open Dashboard" external CTA. **Refactor in S3** to host `pages/AgentsList.tsx` + sub-route switching.
- `LinkTelegramCTA.tsx` — small embed CTA. **Merge into** `pages/agent/SessionsTab.tsx` + `components/modals/LinkTelegramModal.tsx` in S4.

### 2.4 New uju/ai/ structure (target, post-S4)

```
apps/nasun-website/frontend/src/sections/uju/ai/
├── AiTab.tsx                 # root router; query-string sub-routes
├── pages/
│   ├── Overview.tsx
│   ├── AgentsList.tsx
│   ├── AgentDetail.tsx
│   ├── AerTimeline.tsx
│   ├── Budgets.tsx
│   └── agent/
│       ├── DashboardTab.tsx
│       ├── ActivityTab.tsx
│       ├── EscrowTab.tsx
│       └── SessionsTab.tsx
├── components/
│   ├── modals/
│   ├── forms/
│   ├── receipt/
│   ├── badges/
│   └── request/
├── hooks/
│   ├── request/
│   └── ...
├── services/
├── stores/
├── types/
└── utils/
```

S1 creates only the directory skeleton (no files beyond `.gitkeep` if needed). No stubs yet — keep the diff minimal.

---

## 3. SDK: `packages/baram-sdk/`

Package stays. Name kept as `@nasun/baram-sdk` (internal identifier, not user-visible).

| Surface | Status | Notes |
|---|---|---|
| `client.ts`, `config.ts` | Keep | AERClient + createDevnetConfig. |
| `aer/{actions,codec,helpers,types,index}.ts` | Keep | v2 envelope. |
| `capability/*` | Keep | Plan B capability primitive. |
| `escrow/*` | Keep | Plan C C3-v2 AgentEscrow. |
| `wake-trigger.ts`, `intent-ids.ts`, `proposal.ts` | Keep | Plan D shared. |
| `services/{analytics,budget-analytics,chain,fetch,filter,indexer,parse}.ts` | Keep | |
| `types/{aer,analytics,budget,filter,index}.ts` | Keep | |
| `utils/{bytes,format}.ts` | Keep | |
| `errors.ts` | Keep | |

After S2, `@nasun/baram-sdk` will be consumed by both `apps/nasun-ai-runtime/` (workspace dep) and `apps/nasun-website/frontend/` (already a workspace dep transitively if added).

---

## 4. Out-of-scope for S1 (handled later)

- chat-server (`apps/nasun-website/chat-server/`) — already in unified server, no migration.
- Move contracts (`apps/baram/contracts*/`) — onchain unchanged. Module names with `baram::` are S5 audit.
- nginx/CDN routing for `baram.nasun.io` vhost — S7.
- `/api/baram/*` → `/api/nasun-ai/*` alias — S5.
- pm2 process rename on prod — S2.

---

## 5. Workspace + archive marker (S1 deliverable)

- `pnpm-workspace.yaml`:
  - Add `'apps/nasun-ai-runtime'` (top-level entry).
  - Exclude baram with `'!apps/baram'` and `'!apps/baram/agent-runner'` and `'!apps/baram/frontend'` to fully detach.
- `apps/baram/README.md` — create with ARCHIVED banner.

---

## 6. Risks captured (for S2+)

1. Workspace exclusion of `apps/baram/*` will break any cross-package import that still references it. Pre-S2 grep: confirm no `@nasun/baram-frontend` or similar imports in active code.
2. `@nasun/baram-agent-runner` consumers (none expected outside its own scripts) — verify before workspace cut.
3. `apps/baram/contracts*/` are NOT under `apps/*/contracts/*` workspace glob (they live at `apps/baram/contracts-*`), so the workspace cut shouldn't affect Move builds. Confirm: contracts-* are not pnpm packages.
4. Existing `apps/nasun-website/frontend/src/sections/uju/ai/AiTab.tsx` already imports `@nasun/devnet-config` and uses `BARAM.agentPackageId` — that field name is from devnet-config package and represents an onchain identifier; keep as-is for S1, audit in S5.
