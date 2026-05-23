# Nasun AI Kill-Switch Runbook

> Last Updated: 2026-05-18
> Owner: Nasun AI (alpha). Pages: 1, keep tight.
>
> Read [project_baram_no_tee_v1.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_baram_no_tee_v1.md) for alpha posture context.

## When to use this

A kill-switch action stops one or more Nasun AI agents from executing trades. Reach for it when:

- A trader config or model is producing clearly wrong actions.
- An on-chain or runtime bug is suspected and you need to freeze before diagnosing.
- An external incident (DEX outage, RPC failure cluster, AER landing storm) demands a halt.
- A user-reported anomaly needs to be contained before you have a fix.

There are three independent layers. Pick the smallest one that contains the blast radius. Layers compose: an upper layer also blocks anything below it.

| Layer | Scope | Reversible | Latency | Use when |
|---|---|---|---|---|
| L1 Runtime | Global, all agents | Yes (flip + restart) | ~10s | Runtime-side bug, model misbehavior, fastest panic stop |
| L2 Lambda | Global, all agents | Yes (env update) | ~30s | Lambda-side issue, runtime flag bypassed, swap must not land even if runtime tries |
| L3 On-chain | Per-capability (per-agent) | Yes (admin signature) | Block time | Targeted halt of one agent; survives any off-chain bypass |

## Quick reference

```
fastest -> hardest
L1: chat-server env  -> AGENT_GLOBAL_PR1A_SWAP_DISABLED=true  -> pm2 delete+start
L2: Lambda env       -> LAMBDA_SWAP_DISABLED=true             -> full-env push
L3: on-chain         -> capability::set_pause_mode(cap, 2)    -> admin PTB
```

Current alpha defaults (verify before relying):

- L1 `AGENT_GLOBAL_PR1A_SWAP_DISABLED` = `true` (alpha 1차 kill-switch, BUY/SELL → HOLD)
- L2 `LAMBDA_SWAP_DISABLED` = `false` (Phase E cutover intent)
- L3 `pause_mode` = `0` (active) per capability

---

## L1 Runtime: chat-server `AGENT_GLOBAL_PR1A_SWAP_DISABLED`

Demotes every agent's BUY/SELL intent to HOLD. AER still lands, runtime stays up, only the swap branch is short-circuited.

### Critical: spawned agents capture env at spawn time

The orchestrator daemon reads the env when it parses `ecosystem.config.cjs`, and each per-user agent (`agent-*` pm2 entries) captures `PR1A_SWAP_DISABLED` at spawn. **Restarting the orchestrator alone does NOT update running agents**; they keep submitting BUY/SELL until they respawn. For an immediate global flip you must sweep the agents too.

### Flip (orchestrator + agents)

```bash
ALLOW_PROD_DIRECT=1 ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52
cd ~/nasun-chat-server
# Edit .env: AGENT_GLOBAL_PR1A_SWAP_DISABLED=true

# 1) Refresh the orchestrator daemon
pm2 delete nasun-chat-server
export $(grep -v '^#' .env | xargs)
pm2 startOrRestart ecosystem.config.cjs

# 2) Sweep running per-user agents so they pick up the new env on respawn.
#    Replace with a targeted list if you only want to flip a subset.
pm2 ls | awk '/^.*agent-/ {print $4}' | xargs -r -n1 pm2 delete
# The orchestrator re-spawns vault-active agents on its next reconciliation
# tick, picking up the fresh PR1A_SWAP_DISABLED value.

pm2 logs nasun-chat-server --lines 30
```

Why `delete + start` (not `restart`): pm2 daemon caches env at parse time. `pm2 restart --update-env` does not re-evaluate ecosystem.config.cjs and is explicitly blocked by the project PreToolUse hook. See [feedback_pm2_hard_restart_for_new_env.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md) and [feedback_pm2_daemon_env_resolution.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_daemon_env_resolution.md).

### Verify

```bash
# Confirm new env in the running process
pm2 env 0 | grep AGENT_GLOBAL_PR1A_SWAP_DISABLED
# Health
curl -fsS http://localhost:3101/health
# Watch next cycle decision (should log HOLD demote)
pm2 logs nasun-chat-server --lines 100 | grep -iE 'swap_disabled|demote|HOLD'
```

### Rollback

Set `AGENT_GLOBAL_PR1A_SWAP_DISABLED=false` and repeat the delete+start sequence above.

---

## L2 Lambda: `baram-executor` `LAMBDA_SWAP_DISABLED`

Lambda-side gate. Even if the runtime issues a swap intent, the executor refuses to land an on-chain swap. Independent from L1.

### Critical: REPLACE not MERGE

`aws lambda update-function-configuration --environment Variables={...}` **replaces the entire env map**. Sending a partial map wipes every other key. The 2026-05-17 Phase E drift incident lost 21 of 22 envs this way. See [feedback_lambda_env_replace_not_merge.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_lambda_env_replace_not_merge.md) and [project_2026_05_17_baram_executor_phase_e_drift.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_17_baram_executor_phase_e_drift.md).

### Flip (full-env push)

```bash
# 1. Snapshot current env
aws --profile nasun-prod --region ap-northeast-2 lambda get-function-configuration \
  --function-name baram-executor \
  --query 'Environment.Variables' > /tmp/baram-executor-env.json

# 2. Edit /tmp/baram-executor-env.json: set "LAMBDA_SWAP_DISABLED": "true"
#    Keep every other key intact.

# 3. Push the full map back
aws --profile nasun-prod --region ap-northeast-2 lambda update-function-configuration \
  --function-name baram-executor \
  --environment "Variables=$(cat /tmp/baram-executor-env.json)"
```

Prefer `cd apps/baram/cdk && pnpm run deploy:prod` when the CDK definition is in sync (that path is safe by construction).

### Verify

```bash
aws --profile nasun-prod --region ap-northeast-2 lambda get-function-configuration \
  --function-name baram-executor \
  --query 'Environment.Variables.LAMBDA_SWAP_DISABLED'
# Expect: "true"

# Spot-check that the rest of the env survived
aws --profile nasun-prod --region ap-northeast-2 lambda get-function-configuration \
  --function-name baram-executor \
  --query 'Environment.Variables | keys | length'
# Expect: same key count as the snapshot in /tmp/baram-executor-env.json
```

`cdk diff` is template-vs-template and will NOT detect env drift. Always verify with `get-function-configuration`.

### Rollback

Edit the snapshot JSON back to `"LAMBDA_SWAP_DISABLED": "false"` and re-push the full map.

---

## L3 On-chain: `capability::set_pause_mode`

Per-agent halt enforced on chain. Survives any off-chain bypass. Use this when the issue is scoped to one agent or when L1/L2 are not enough.

`set_pause_mode(cap: &mut Capability, new_mode: u8, ctx: &TxContext)`: Phase 1 accepts only `0` (PAUSE_ACTIVE) and `2` (PAUSE_WAKE_BLOCKED). Modes 1 and 3 are reserved and rejected with `E_PAUSE_MODE_NOT_SUPPORTED`. See [capability.move](../apps/baram/contracts-aer/sources/capability.move).

The signer must be the capability's `owner` (the user's wallet, or the admin if owner is delegated). For an emergency halt that the operator can perform, use the admin key associated with that capability.

### Flip (pause)

PTB via Sui CLI (substitute `<CAP_ID>` with the capability object ID for the target agent):

```bash
AER_PACKAGE_ID=0x50f5c30416e0f160c40839eff100a67cecff047f57814065b5387af701ce1815
CAP_ID=<CAP_ID>

nasun client call \
  --package "$AER_PACKAGE_ID" \
  --module capability \
  --function set_pause_mode \
  --args "$CAP_ID" 2 \
  --gas-budget 10000000
```

(`nasun` is the local alias for `sui client`; see root [CLAUDE.md](../CLAUDE.md).)

### Verify

```bash
nasun client object "$CAP_ID" --json | jq '.content.fields.pause_mode'
# Expect: 2
```

Where the pause is enforced (be precise; do not over-rely on this layer):

- `baram-executor` Lambda preflight reads the capability object and rejects on `pause_mode != 0` before submitting any swap. This is the primary off-chain gate.
- On chain, the Move `aer::create_with_capability` / settle entry paths abort on `pause_mode != 0`, so a Lambda bypass still fails at the chain.
- The nasun-ai-runtime itself does NOT poll `pause_mode` today; it observes the pause indirectly when `/execute-capability` returns an error and the cycle records a failed AER. Treat L3 as "best-effort with one cycle of latency" rather than instantaneous.

### Rollback

Same PTB with `new_mode = 0`.

### When pause is not enough: `revoke`

`capability::revoke(cap, ctx)` permanently revokes the capability. **Irreversible**; only use when the agent must be retired, not just paused. The agent's encrypted key in the server vault is unaffected; the user can re-create a new agent with a fresh capability.

---

## Choosing a layer

| Symptom | Start at | Escalate to |
|---|---|---|
| Model output looks wrong, swap not yet landed | L1 | L2 if runtime is bypassing flag |
| Lambda is mis-classifying intent or landing bad swaps | L2 | (no further escalation) |
| One agent misbehaving, others fine | L3 (target that cap) | (no further escalation) |
| Unknown surface, need full freeze in seconds | L1 + L2 (parallel) | L3 per-agent after triage |
| You cannot tell whether the runtime read your flag | L2 (verify on chain, runtime read independence) | L3 |

After mitigating, capture the timeline in a memory note (`project_YYYY_MM_DD_*`) so future you knows which lever was pulled and why.

## Heartbeat alert

Each spawned nasun-ai-runtime process runs an AER heartbeat watchdog. The default stale threshold is `max(2 * INTERVAL_MINUTES, 5 min)`, so a 30-minute trader alerts after roughly 60 minutes of silence and a 5-minute dogfood agent alerts after 10. The startup grace is `max(2 * stale, 2 * INTERVAL_MINUTES, 10 min)` so the first cycle has slack to land before any alarm. Set `AER_HEARTBEAT_STALE_MIN` explicitly to override; `AER_HEARTBEAT_COOLDOWN_MIN` (default 30) gates repeat alerts. When `TELEGRAM_ALERT_CHAT_ID` is unset the watchdog still detects stalls and logs them, but no Telegram message is sent. The signal means "something is wrong with this agent's cycle," not that a kill-switch has fired; confirm before pulling levers.

### Wiring

Add to chat-server `.env` (prod EC2 `~/nasun-chat-server/.env`):

```env
AGENT_TELEGRAM_ALERT_CHAT_ID=...           # required to enable Telegram sends
AGENT_TELEGRAM_ALERT_BOT_TOKEN=...         # optional; defaults to AGENT_TELEGRAM_BOT_TOKEN
AGENT_AER_HEARTBEAT_STALE_MIN=5            # optional, default 5
AGENT_AER_HEARTBEAT_COOLDOWN_MIN=30        # optional, default 30
```

The `AGENT_*` prefix is the chat-server convention: `agent-orchestrator` strips the prefix and passes the canonical key into each spawned runtime ([agent-orchestrator.ts](../apps/nasun-website/chat-server/src/agent-orchestrator.ts) `globalTraderEnv()`). Reuse the bot token + chat ID already used by the explorer/snapshot alerts (`~/explorer-api/.env`); one alert channel is enough for alpha.

After editing chat-server `.env`, follow the L1 delete+start sequence above so the orchestrator's daemon re-parses the env. Existing agent processes keep their previous env until they respawn (typically via the user toggling Activate / Deactivate). For an immediate rollout you can stop and re-activate each agent manually.

## Cross-references

- Memory: [project_2026_05_17_baram_executor_phase_e_drift.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_17_baram_executor_phase_e_drift.md), [feedback_lambda_env_replace_not_merge.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_lambda_env_replace_not_merge.md), [feedback_pm2_hard_restart_for_new_env.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md), [project_baram_no_tee_v1.md](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_baram_no_tee_v1.md)
- Move source: [capability.move](../apps/baram/contracts-aer/sources/capability.move)
- Chat-server runtime: [agent-orchestrator.ts](../apps/nasun-website/chat-server/src/agent-orchestrator.ts)
- CDK Lambda: `apps/baram/cdk/`
