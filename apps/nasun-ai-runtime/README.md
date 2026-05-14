# @nasun/nasun-ai-runtime

Nasun AI agent runtime. Long-running pm2 process that drives an on-chain AI
agent: heartbeat trader cycles + inbound `/wake` HTTP endpoint for Telegram or
manual triggers. Replaces the legacy `apps/baram/agent-runner/`.

Onchain identifiers (`baram::*` Move modules, `BARAM_*_ID` env vars) are kept
as-is — they reference invariant onchain package names. User-facing branding is
"Nasun AI".

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  nasun-ai-runtime (pm2)                                 │
│                                                         │
│  ┌─────────────┐    ┌──────────────────────────────┐    │
│  │ heartbeat   │    │ /wake server (127.0.0.1:4400)│    │
│  │ INTERVAL_MIN│    │ trigger_type dispatcher      │    │
│  └──────┬──────┘    └──────────────┬───────────────┘    │
│         │                          │                    │
│         └──────────┬───────────────┘                    │
│                    ▼                                    │
│           PRESET dispatcher                             │
│           (trader / analyst / content / ...)            │
│                    │                                    │
│      ┌─────────────┼─────────────┐                      │
│      ▼             ▼             ▼                      │
│   nasun-ai     host-client   executor-client            │
│   -client       (LLM)         (Sui PTB)                 │
│      │                            │                     │
│      └──────────┬─────────────────┘                     │
│                 ▼                                       │
│         Nasun Devnet (RPC)                              │
│                 │                                       │
│                 ▼                                       │
│   AER / Capability / Escrow / Budget objects            │
│   (Move modules under `baram::*` — invariant)           │
└─────────────────────────────────────────────────────────┘
        ▲                                       │
        │ HMAC-signed heartbeat every 60s       │ AER notify
        │ POST /api/nasun-ai/agent/heartbeat    │
        ▼                                       ▼
   chat-server (port 3101)                  Telegram
```

## Layout

```
src/
├── index.ts                 # entry — PRESET dispatcher, heartbeat, /wake boot
├── config.ts                # env loader (BARAM_PACKAGE_ID, BARAM_AER_PACKAGE_ID, etc.)
├── nasun-ai-client.ts       # Sui client wrapper (AER/Capability/Escrow PTBs)
├── host-client.ts           # LLM/host invocation
├── executor-client.ts       # off-chain executor IPC
├── llm-client.ts            # OpenAI/Anthropic client
├── jwt-verify.ts            # chat-server JWT verify
├── idempotency.ts           # sqlite at ~/.nasun-ai-runtime/processed_jobs.db
├── telegram.ts              # outbound AER-landing notify
├── wake-server.ts           # Hono on 127.0.0.1:WAKE_PORT
├── wake-router.ts           # trigger_type → preset dispatch
└── presets/
    ├── trader.ts            # spot trader (Pair A)
    ├── trader-cycle.ts      # decision + propose + settle envelope
    ├── trader-envelope.ts
    ├── trader-decision.test.ts
    ├── analyst.ts           # Cognition AER preset
    ├── analysis.ts
    ├── content.ts
    ├── research.ts
    ├── manual-execution.ts
    ├── strategies.ts
    └── types.ts
scripts/
└── e2e-foundation-scenario.ts
ecosystem.nasun-ai-runtime.cjs   # pm2 (name: nasun-ai-runtime)
```

## Local dev

```bash
# Run tests
pnpm --filter @nasun/nasun-ai-runtime test

# Single cycle (uses .env)
pnpm --filter @nasun/nasun-ai-runtime exec tsx src/index.ts
```

## Prod (EC2)

pm2 entry `nasun-ai-runtime` (id 58). Working directory
`/home/ec2-user/nasun-ai-runtime/`. Wake endpoint bound to `127.0.0.1:4400`;
chat-server forwards Telegram triggers through it.

```bash
# Restart with fresh env (per feedback_pm2_env_management.md)
cd ~/nasun-ai-runtime && export $(cat .env | xargs) && \
  pm2 startOrRestart ecosystem.nasun-ai-runtime.cjs
pm2 logs nasun-ai-runtime --lines 50
```

## Chat-server contract

The runtime heartbeats every 60s to register its `/wake` endpoint:

```
POST {CHAT_SERVER_BASE_URL}/api/nasun-ai/agent/heartbeat
Headers: X-HMAC: hex(hmac_sha256(BARAM_CHAT_SERVER_HMAC_SECRET, body))
Body:    { agent, http_url, budget_id }
```

The chat-server dual-mounts `/api/nasun-ai/*` and the legacy `/api/baram/*` for
backwards compat — see [chat-server alias](../nasun-website/chat-server/src/baram-telegram-routes.ts).
The legacy prefix is scheduled for removal 2 weeks after S5 ships once telemetry
confirms zero traffic on it.

## Env vars

Onchain identifiers (keep — they map to invariant Move package names):

| Var | Purpose |
|---|---|
| `BARAM_PACKAGE_ID` | onchain `baram` package |
| `BARAM_REGISTRY_ID` | shared registry object |
| `BARAM_AER_PACKAGE_ID` | `baram_aer` package (Plan A + D-0b) |
| `BUDGET_ID` / `CAPABILITY_ID` / `ESCROW_ID` | this agent's onchain objects |
| `EXECUTOR_ADDRESS` / `AGENT_PRIVATE_KEY` | signing |
| `COIN_NUSDC_TYPE` | NUSDC coin type |

Infra secrets:

| Var | Purpose |
|---|---|
| `BARAM_API_KEY` | host LLM key |
| `BARAM_CHAT_SERVER_HMAC_SECRET` | heartbeat HMAC |
| `CHAT_SERVER_BASE_URL` | chat-server origin (e.g. `https://nasun.io`) |
| `WAKE_PORT` | inbound `/wake` port (default 4400, 127.0.0.1 only) |
| `INTERVAL_MINUTES` | heartbeat cycle period |
| `PRESET` | `trader` \| `analyst` \| `content` \| `research` \| `manual-execution` |

## References

- File-by-file migration map: [.claude/plans/nasun-ai-integration-mapping.md](../../.claude/plans/nasun-ai-integration-mapping.md)
- Big-picture: [/home/naru/.claude/plans/pick-an-executor-majestic-thacker.md](../../../.claude/plans/pick-an-executor-majestic-thacker.md)
- Plan D (conversational wake): [/home/naru/.claude/plans/plan-d-conversational-wake.md](../../../.claude/plans/plan-d-conversational-wake.md)
