# @nasun/nasun-ai-runtime

Nasun AI agent runtime. Replaces `apps/baram/agent-runner/`.

**Status: empty scaffold (S1).** Source files arrive in S2 of the integration plan.

See:
- [.claude/plans/nasun-ai-integration-mapping.md](../../.claude/plans/nasun-ai-integration-mapping.md) — file-by-file migration map.
- [.claude/handoffs/2026-05-13-nasun-ai-integration-pivot.md](../../.claude/handoffs/2026-05-13-nasun-ai-integration-pivot.md) — pivot rationale + 7-session sequence.

## Layout (target)

```
src/
├── index.ts            # entry — PRESET dispatcher, heartbeat, /wake server
├── config.ts           # env loader
├── nasun-ai-client.ts  # Sui client wrapper (renamed from baram-client)
├── host-client.ts
├── executor-client.ts
├── llm-client.ts
├── jwt-verify.ts
├── idempotency.ts      # sqlite processed_jobs (~/.nasun-ai-runtime/)
├── telegram.ts
├── wake-server.ts
├── wake-router.ts
└── presets/
    ├── trader.ts
    ├── analyst.ts
    ├── analysis.ts
    ├── content.ts
    ├── research.ts
    ├── manual-execution.ts
    ├── strategies.ts
    ├── trader-cycle.ts
    ├── trader-envelope.ts
    └── types.ts
scripts/
└── e2e-foundation-scenario.ts
ecosystem.nasun-ai-runtime.cjs   # pm2 (name: nasun-ai-runtime)
```
