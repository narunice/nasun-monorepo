# Baram Plan C C3-v2 Smoke Runbook (S1–S14)

> Status: written 2026-05-13 after C3-v2b code lands. Run against
> nasun-devnet only. Each step lists: setup, expected on-chain outcome,
> how to verify, and rollback if the step destroys state.

---

## Prerequisites

Before any S* step:

1. **AER package republished** (done in c3-v2a). Confirm:
   ```bash
   nasun client object 0xdb118fd931572cf42af8613dce1cc18471419d1ba937b63c832d4361aad5b8e5
   ```
   Returns `baram_aer` package at v1.3.0.

2. **api-server indexer cursor reset** (one-time):
   ```sql
   DELETE FROM aer_sync_state WHERE key = 'event_cursor';
   ```

3. **Host `.env`** populated with:
   - `HOST_HMAC_KEY` (32-byte hex; or leave unset for random-at-boot)
   - `AER_PACKAGE_ID`, `AER_REGISTRY_ID`, `CAPABILITY_REGISTRY_ID`
   - `PADO_DEEPBOOK_PACKAGE_ID`, `PADO_NBTC_NUSDC_POOL`, `PADO_DEEP_TYPE`
   - `NBTC_TYPE`, `NUSDC_TYPE`

4. **Agent-runner `.env`** populated with:
   - `CAPABILITY_ID`, `ESCROW_ID`, `WALLET_ADDRESS`
   - `COIN_NUSDC_TYPE`, `COIN_NBTC_TYPE`
   - `HOST_URL` (the executor-nitro host)

5. **Atomic setup tx** (PTB created via `escrow.buildAtomicSetupTx`)
   landed for the test wallet. Confirm both cap + escrow exist and
   reference each other:
   ```bash
   nasun client object <capability_id>   # escrow_id = Some(<escrow_id>)
   nasun client object <escrow_id>       # capability_id = <capability_id>
   ```

---

## S1 — Cognition AER HOLD path

**Goal**: trader cycle produces a cognition AER with `outcome=hold-noop`.
This is the C2-equivalent baseline; verifies the /infer + /execute-capability
split still produces equivalent on-chain shape.

1. Run `PRESET=trader SINGLE_CYCLE=true pnpm start` in agent-runner.
2. Observe agent-runner log: `[trader] AER landed: class=1 digest=<...>`.
3. Verify on-chain AER created with `eventClass=1`, `actionType=analysis.v1`,
   `actionOutcome=2`.

**Expected**: success. No escrow mutation. `cap.version` unchanged.

---

## S2 — Cognition AER under preflight denial

**Goal**: paused cap returns 403, no enclave call.

1. From wallet: call `capability::set_pause_mode(cap, 1 /* paused-cognition */)`.
2. Run trader cycle.
3. Observe `/infer 403 preflight reason=paused` in host log; no enclave
   forward; no AER emitted.

---

## S3 — Cognition AER recovery after un-pause

1. From wallet: `set_pause_mode(cap, 0 /* active */)`.
2. Run trader cycle.
3. Observe cognition AER lands; cap.version bumped by the previous pause
   mutation but not by the AER itself.

---

## S4 — Owner mismatch

1. Run agent-runner with `WALLET_ADDRESS` set to an address that is NOT
   `cap.owner`.
2. Observe `/infer 403 reason=owner_mismatch`.

---

## S5 — Action-not-allowed (cap.allowed_actions)

1. Mint a cap with `allowed_actions = []` via atomic setup.
2. Run trader cycle.
3. Observe `/execute-capability 403 reason=action_not_allowed`.

---

## S6 — Soft-rail asset rejection

1. With a cap whose `allowed_assets` excludes NUSDC, force a BUY
   decision (use strategy=buy_aggressive + sufficient balance).
2. Observe `/execute-capability 403 reason=input_asset_not_allowed`.

---

## S7 — Cognition cap exceeded

1. Set `DAILY_COGNITION_PAYOUT_CAP=1` in host env. Restart host.
2. Run trader cycle twice in rapid succession.
3. First lands; second returns
   `/execute-capability 403 reason=cognition_cap_exceeded`.

---

## S8 — Stale cap version

1. Manually fetch `cap.version`, then call `update_risk_limits` from the
   wallet, then submit a PTB referencing the stale version.
2. Move `withdraw_for_action` aborts on the `expected_capability_version`
   guard. PTB rolls back; AER NOT emitted; receipt NOT consumed.

---

## S9 — Cap-mixing attack rejection (NEW vs C2)

**Goal**: A PTB that uses cap A in `withdraw_for_action` and binds cap B
to the AER must fail.

**Approach**: write a one-off `apps/baram/scripts/smoke-cap-mixing.ts`
that builds a PTB manually (NOT via the host) using two caps owned by
the same wallet. Compose:

```
Cmd 0: escrow::withdraw_for_action<NUSDC>(escrow_A, cap_A, ...)
Cmd 1: coin::zero<DEEP>
Cmd 2: pool::swap_exact_quote_for_base<NBTC, NUSDC>(...)
Cmd 3: escrow::settle_action<NBTC>(escrow_A, cap_B, obligation, ...)
   ↑ cap_B != cap_A.  Expected: abort E_OBLIGATION_CAP_MISMATCH (576).
```

**Expected**: PTB build succeeds (Move type system permits), execution
aborts on Cmd 3 with abort code 576. No funds moved. Inference cost
not settled because receipt was destroyed in the rollback.

---

## S10 — HMAC token tampering (NEW)

**Goal**: a modified `resultHash` between /infer and /execute-capability
is rejected.

1. Trader hits /infer → receives `(result, resultHash, spendToken, nonce, expiresAt)`.
2. Modify `resultHash` (flip one byte) and POST /execute-capability with
   the original token + nonce + expiresAt.
3. Host responds 403 `reason=invalid`. AER not emitted.

---

## S11 — HMAC token replay (NEW)

1. Successful /infer → /execute-capability cycle; AER lands.
2. POST /execute-capability again with the SAME `(spendToken, nonce, expiresAt)`.
3. Host responds 403 `reason=replay`. AER not emitted.

---

## S12 — Dust deposit attack rejection (NEW)

**Goal**: a PTB that produces `Coin<UNAUTHORIZED_T>` and tries to settle
it must abort.

**Approach**: `apps/baram/scripts/smoke-dust-deposit.ts` builds a PTB
that calls `withdraw_for_action<NUSDC>` then tries
`settle_action<RANDOM_T>(...)` where `RANDOM_T` is a coin not in
`cap.allowed_assets`. Expected: abort E_ASSET_NOT_ALLOWED (572) at Cmd 3.

---

## S13 — Atomic setup happy path (NEW)

**Goal**: the 3-cmd PTB (`new_capability_and_link` →
`new_escrow_linked` → `finalize_link_and_share`) produces a shared cap
+ escrow with reciprocal references.

1. From wallet: build via `escrow.buildAtomicSetupTx({...})`.
2. Sign and execute.
3. Verify:
   - `cap.escrow_id == Some(<escrow_id>)`
   - `escrow.capability_id == <cap_id>`
   - Both objects are Shared.

There is NO observable window where `cap.escrow_id == None` and the cap
is usable — the whole PTB is atomic.

---

## S14 — Leftover DEEP zero assumption (NEW, CRITICAL)

**Goal**: confirm Pado pools are still DEEP-whitelisted so
`destroy_zero<DEEP>` in Cmd 5 doesn't abort the entire execution PTB.

1. Run a successful BUY through the trader (S15 setup below).
2. Inspect the tx effects (`sui client tx <digest>`):
   - Cmd 2's third return position (DEEP leftover) must have
     `coin::value == 0`.
   - Cmd 5 `destroy_zero<DEEP>` must succeed.

If a smoke run ever shows non-zero leftover DEEP, immediately:
   - Pause all trader runners.
   - Switch Cmd 5 to `escrow::deposit_swap_leftover<DEEP>` in
     `sui-client.ts buildAERTransaction`.
   - Add DEEP to every cap's `allowed_assets` via wallet PTB.
   - This is a Phase-2 mitigation; the v1 default assumes whitelist.

---

## S15 (bonus) — Full execution AER happy path

Pre-set: cap with `allowed_actions=['trade.swap.v1']`,
`allowed_assets=[NUSDC_TYPE, NBTC_TYPE]`, escrow funded with 10 NUSDC.

1. Run trader cycle. Strategy: buy_aggressive (or any preset that yields BUY).
2. Trader hits /infer (token minted), parses BUY decision,
   /execute-capability with `actionCall`+`escrow`+`spend`.
3. Host composes the 10-cmd PTB and submits.
4. Verify:
   - Tx succeeds.
   - AER created with `eventClass=2`, `actionOutcome=1`,
     `triggered_action == digest` (auto-fill verified).
   - Escrow's `Balance<NUSDC>` decreased by the input amount.
   - Escrow's `Balance<NBTC>` increased (or new DOF created).
   - cap.version unchanged.
   - DEEP leftover destroyed (S14).

---

## Rollback / re-runnability

All S* steps assume devnet (disposable). Failed states are cleaned by
re-running atomic setup with a fresh cap or by `withdraw_owner`-draining
the test escrow.

If a step requires a specific cap state (paused, revoked), prefer
spinning up a fresh cap rather than mutating the production-test cap.

---

## Reference scripts (TODO before first smoke run)

- [ ] `apps/baram/scripts/smoke-cap-mixing.ts`
- [ ] `apps/baram/scripts/smoke-dust-deposit.ts`
- [ ] `apps/baram/scripts/smoke-token-replay.ts` (helper for S10/S11)
- [ ] `apps/baram/scripts/probe-deep-fee.ts` (verifies pool DEEP
      whitelist before any smoke step; should be the first thing run)
