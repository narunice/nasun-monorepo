# Plan D D-9 — E2E Foundation Scenario

End-to-end validation of the 13 assertions in
`.claude/plans/plan-d-conversational-wake.md` §Validation, run against PROD.

## Prerequisites

- `apps/baram/agent-runner/.env` populated with:
  - `BARAM_PACKAGE_ID`, `BARAM_REGISTRY_ID`, `BUDGET_ID`, `CAPABILITY_ID`
  - `AGENT_PRIVATE_KEY` (agent keypair; not necessarily capability owner)
  - `WAKE_PORT` (default 4400), `RPC_URL`, `BARAM_AER_PACKAGE_ID`
  - `BARAM_CHAT_SERVER_HMAC_SECRET` (hex), `BARAM_SESSION_JWT_SECRET`
- agent-runner online: `pm2 status` shows `agent-runner` online with
  `/wake` listening on `127.0.0.1:4400`.
- chat-server online at `https://nasun.io` (or override `CHAT_SERVER_BASE_URL`).
- Budget funded with ≥ 50 NUSDC.
- Capability `pause_mode = 1` (PAUSE_ACTIVE) at start.

### Optional env (script-specific)

- `E2E_SID` — UUID of a linked baram session. Required for any `/wake` call.
  Obtain by completing manual step A1, then read `baram_sessions.sid` from
  chat-server SQLite (or query `GET /api/baram/telegram/sessions` with wallet
  sig). Without it, programmatic assertions skip.
- `E2E_PARENT_IQ` — ULID of the cognition AER `Iq` produced in A2/A3. Set
  before re-running A7.
- `CHAT_SERVER_PG_URL` — reserved for A5 DB row cross-check. Not wired yet.

## Run

```bash
cd apps/baram/agent-runner
pnpm tsx scripts/e2e-foundation-scenario.ts                    # all assertions
pnpm tsx scripts/e2e-foundation-scenario.ts --assertion 6      # single
pnpm tsx scripts/e2e-foundation-scenario.ts --manual-ok        # mark manual ones passed
pnpm tsx scripts/e2e-foundation-scenario.ts --continue-on-fail # do not halt
```

Exit code = number of failed assertions. Skips are not failures.

## Manual (Telegram dogfood) steps

The Telegram-side flow is part of the dogfood and cannot be safely automated.
Perform the steps in order; the bot is `@nasun_ai_bot`.

### A1 — Link Telegram

1. Open Dashboard → AI tab → "Link Telegram".
2. Sign the wallet challenge.
3. Open the deep link / scan QR; Telegram opens `@nasun_ai_bot`.
4. Send `/start <sid>` (or just `/start` if deep link auto-supplies it).
5. Bot replies "Linked". Capture the `sid` (in URL or chat-server DB) and
   export `E2E_SID=<sid>`.

### A2 — Dawn scenario

Send to the bot:

> 최근 NBTC 급락했는데 더 살까?

### A3 — cognition AER

Verify in Dashboard → AER Timeline a fresh row with
`action_type ∈ { analysis.v1, intent.trade_proposal.v1 }` and your agent
address. Capture its `intent_id` ULID; export `E2E_PARENT_IQ=<ulid>`.

### A4 — Inline keyboard

Bot's reply must include inline buttons (Confirm / Cancel / Edit).

### A7 — User confirm (after A6 passes)

Tap **Confirm** in Telegram. Then re-run with `--assertion 7` once chat-server
emits the `intent.user_confirm.v1` cognition AER. (Current script SKIPs A7
because the confirm-callback is not directly invocable from agent-runner —
needs chat-server admin path.)

### A10 — Capability change intent

Send: `리스크 보수적으로`. Bot must reply with a Dashboard deep link only —
no AER, no budget spend.

### A12 — Session revoke

1. Dashboard → Sessions → Revoke.
2. Send any message to the bot from that Telegram account.
3. Bot must reply "Session expired".

## Programmatic subset (no Telegram)

A5, A6, A8, A9, A11, A13 are fully automated provided `E2E_SID` is set and the
manual steps A1–A4 have been performed at least once to produce a pending
proposal lock.

A9 attempts `set_pause_mode(2)` with the agent keypair; if the contract
aborts with `E_NOT_OWNER`, the assertion is marked SKIP with a "TODO: needs
human" note — you must trigger pause from Dashboard with the owner wallet.

## TODO: needs human

- **A7**: chat-server confirm callback is not exposed as a standalone HTTP
  endpoint usable from agent-runner. Perform tap-Confirm in Telegram, then
  verify Ic AER via Dashboard.
- **A12**: revoke requires wallet signature. Trigger from Dashboard.
- **A5 DB cross-check**: a `pg` client is not bundled in agent-runner. Either
  add `pg` dep + wire `CHAT_SERVER_PG_URL`, or extend chat-server with an
  admin read-only `GET /api/baram/admin/pending-proposal/:id` shim.
