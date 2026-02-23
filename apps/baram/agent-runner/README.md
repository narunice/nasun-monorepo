# Baram Agent Runner

Autonomous AI agent that runs locally, periodically invoking LLM tasks and recording every execution on-chain via Baram's Budget + AER system.

## Setup

```bash
cd apps/baram/agent-runner
pnpm install
cp .env.example .env
# Edit .env with your agent key, budget ID, and executor settings
```

## Presets

| Preset | Category | Interval | LLM Calls/Cycle |
|--------|----------|----------|-----------------|
| `research` | research | 30 min | 1 |
| `content` | content | 24 hours | 1 |
| `analysis` | analysis | 24 hours | 3 (sequential) |

## Usage

```bash
# Research (default)
PRESET=research pnpm start

# Content generation
PRESET=content pnpm start

# 3-step analysis (with checkpointing)
PRESET=analysis pnpm start
```

## How it works

1. Check Budget balance and limits (RPC)
2. Generate prompt (preset-specific)
3. `create_request_with_budget_v2` on-chain (deducts NUSDC from Budget)
4. Call Lambda `/execute` (AI inference + on-chain settlement + AER creation)
5. Log result and wait for next cycle

## Getting the Agent Key

1. Go to Baram Dashboard > Agents > Register Agent
2. Select "Generate Keypair" mode
3. Set an Agent Passphrase
4. After registration, go to Agent Detail > "Export Key for Agent Runner"
5. Enter your passphrase to get the base64 private key
6. Paste into `.env` as `AGENT_PRIVATE_KEY`

## Error Handling

| Error | Behavior |
|-------|----------|
| Budget inactive | Stop agent |
| Category not allowed | Stop agent |
| Daily/weekly/monthly limit | Wait for next period |
| Rate limited | Wait required interval |
| Insufficient balance | Wait (exponential backoff in next cycle) |
| Lambda failure | Retry 3x, then skip to next cycle |
| Analysis step failure | Checkpoint, resume on next cycle |
