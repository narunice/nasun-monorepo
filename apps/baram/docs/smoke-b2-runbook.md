# Baram Plan B B2 — Devnet Smoke Runbook

> 8-scenario manual smoke (Plan B §7.3 expanded). Run after:
>   - `pnpm install`
>   - `pnpm --filter @nasun/baram-sdk build`
>   - `apps/baram/executor-nitro/.env` synced with the §G keys from the
>     B1 republish
>   - api-server `initSchema` applied (PostgreSQL `aer_records` now has
>     `capability_version BIGINT`)
>   - host process restarted with the new `.env`
>
> Requires:
>   - User wallet with NASUN for gas + 1 NBTC + 100 NUSDC for the swap.
>   - An AgentProfile owned by the wallet (use `apps/baram/scripts/demo-agent.ts`
>     to mint if needed).
>   - A funded Budget owned by the wallet.

## Pre-flight (one-time)

```bash
# 1. Boot the host with capability path enabled.
cd apps/baram/executor-nitro
pnpm dev:host   # logs should print "Sui settlement enabled"

# 2. Boot the api-server in another terminal.
cd apps/baram/api-server
pnpm dev        # logs should print "[db] Schema initialized"
```

Verify the host shows no `action-classes.json` boot warning. If you see
one, the env var substitution failed — fix the missing `$VAR` before
proceeding.

## Scenarios

Each scenario uses the user wallet's keypair to mutate the cap and then
either:
  - calls `/execute-capability` on the host with a forged `proposal` block
    (until Plan C ships the trader preset), OR
  - just exercises the contract path via `apps/baram/scripts/cap/*.ts`.

### S1. Capability create + link + BUY happy path

```bash
export WALLET_PRIVATE_KEY=...
npx tsx apps/baram/scripts/cap/cap-create.ts \
  --allowed-targets $PADO_DEEPBOOK_PACKAGE_ID \
  --allowed-assets "$NBTC_TYPE,$NUSDC_TYPE,$NASUN_TYPE"
# → CAPABILITY_ID=0x...
npx tsx apps/baram/scripts/cap/cap-link.ts \
  --profile $AGENT_PROFILE_ID --cap $CAPABILITY_ID
```

Now POST to `/execute-capability` with:
- `proposal.eventClass = 2`
- `proposal.actionType = "trade.swap.v1"`
- `proposal.paymentAmount <= max_notional`
- `proposal.exec` filled (pool, asset types, etc.)
- `envelope.eventClass = 2`, `actionType = "trade.swap.v1"`, action_outcome = 1
- `actionCall` pointing at `pool::swap_exact_quote_for_base` with quote args

**Expect**: HTTP 200, `capabilityVersion` returned. Indexer's `aer_records`
gets a new row with `capability_version = 1`.

### S2. analysis.v1 cognition AER

POST with `proposal.eventClass = 1`, `proposal.actionType = "analysis.v1"`,
`actionCall = null`, `envelope.actionOutcome = 2 (hold-noop)`.

**Expect**: HTTP 200. Indexer row has `capability_version = 1`,
`triggered_by_type` from the wake meta, no on-chain swap.

### S3. HOLD noop.v1

Same as S2 but `actionType = "noop.v1"`. The payload bytes use the
`defaultCognitionEnvelope` helper shape (`{reason_code, rationale_hash}`).

**Expect**: same as S2.

### S4. payment > max_notional → E_PAYMENT_EXCEEDS_NOTIONAL_CAP

POST with `proposal.paymentAmount` strictly greater than the cap's
`maxNotionalPerAction`.

**Expect**: HTTP 403, `reason = "payment_exceeds_notional_cap"`. Inference
NOT performed; no AER created on-chain.

### S5. action_type not in allowed_actions → E_ACTION_NOT_ALLOWED

POST with `proposal.actionType = "unknown.v1"` (or anything outside the
cap's allowed list).

**Expect**: HTTP 403, `reason = "action_not_allowed"`.

### S6. stale expected_capability_version

Submit a `/execute-capability` request and, before the PTB lands, run
`cap-set-pause.ts --mode 2` then back to `--mode 0` to bump version. The
in-flight PTB will abort at Cmd 2 with `E_INVALID_CAPABILITY_VERSION`.

**Expect**: PTB rollback, host logs the abort, receipt NOT consumed.

(Easier alternative: in tests, hardcode `pre.capRef.cap.version + 1` into
the PTB. Plan E will surface this race nicely; for B2 smoke, the
hardcode path is enough to prove the hard rail fires.)

### S7. set_pause_mode(2) → host short-circuit

```bash
npx tsx apps/baram/scripts/cap/cap-set-pause.ts --cap $CAPABILITY_ID --mode 2
```

Next `/execute-capability` call returns HTTP 403 with `reason = "paused"`
WITHOUT forwarding to the enclave. Verify host logs show the preflight
denial.

### S8. revoke

```bash
npx tsx apps/baram/scripts/cap/cap-revoke.ts --cap $CAPABILITY_ID
```

Subsequent `/execute-capability` returns HTTP 403 with `reason = "revoked"`.

Recovery requires `cap-create` + `agent_profile::unlink_capability` then
`cap-link`.

## Gas measurement (Plan B §7.4)

For S1, S3, S4 record `effects.gasUsed` from the tx digest and paste into
[gas-budget-2026-05.md](./gas-budget-2026-05.md):

```bash
nasun client tx-block <DIGEST> --json | jq '.effects.gasUsed'
```

S4 is a useful failure-path baseline because it shows what the user pays
even when the cap denies.

## Pass criteria

All 8 scenarios behave as described AND the indexer's `aer_records`
table reflects the 3 successful AERs (S1, S2, S3) with the expected
`capability_version` values.
