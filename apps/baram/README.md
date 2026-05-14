# ARCHIVED — Baram

> **This directory is preserved for reference. Do not modify.**
>
> Baram was the working title for Nasun's AI compliance settlement layer.
> External brand has been unified to "Nasun AI" and the runtime has moved.

## Where the code lives now

| Concern | New location |
|---|---|
| Agent runtime (heartbeat + `/wake` server, presets, AER submission) | [apps/nasun-ai-runtime/](../nasun-ai-runtime/) |
| User-facing UI | [apps/nasun-website/frontend/src/sections/uju/ai/](../nasun-website/frontend/src/sections/uju/ai/) (entry: `/my-account?tab=ai`) |
| SDK (kept name, internal-only identifier) | [packages/baram-sdk/](../../packages/baram-sdk/) |
| Onchain Move contracts | Unchanged — still in `contracts-aer/`, `contracts-agent/`, etc. (this directory). The chain doesn't move; only the off-chain code does. |

## Workspace status

`apps/baram/` and its subpackages (`frontend/`, `agent-runner/`, `api-server/`, `executor-nitro/`) are excluded from `pnpm-workspace.yaml`. `pnpm install` will not link them. To work with archived code, use them out-of-band only.

## Migration tracking

- Pivot decision and 7-session plan: [.claude/handoffs/2026-05-13-nasun-ai-integration-pivot.md](../../.claude/handoffs/2026-05-13-nasun-ai-integration-pivot.md)
- File-by-file mapping: [.claude/plans/nasun-ai-integration-mapping.md](../../.claude/plans/nasun-ai-integration-mapping.md)
- Foundation context: [/home/naru/.claude/plans/pick-an-executor-majestic-thacker.md](/home/naru/.claude/plans/pick-an-executor-majestic-thacker.md)
- Plan D: [/home/naru/.claude/plans/plan-d-conversational-wake.md](/home/naru/.claude/plans/plan-d-conversational-wake.md)
