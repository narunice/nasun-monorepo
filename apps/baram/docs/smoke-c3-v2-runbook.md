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

## Reference scripts (committed 2026-05-13)

- [x] `apps/baram/scripts/probe-deep-fee.ts` — S14 gating probe.
      `pool::whitelisted` + `pool::get_quantity_out` devInspect.
      MUST be run BEFORE any S* step; exits non-zero if the pool
      isn't DEEP-whitelisted (operational stop).
- [x] `apps/baram/scripts/smoke-token-replay.ts` — drives S10
      (resultHash tamper) and S11 (nonce replay). Pure HTTP, no
      Sui RPC. Confirms host returns HTTP 403 with the right
      reason codes.
- [x] `apps/baram/scripts/smoke-cap-mixing.ts` — S9. Builds a PTB
      that feeds Obligation_A into settle_action(cap_B). Dry-run
      only; asserts abort code 576 (E_OBLIGATION_CAP_MISMATCH).
      Requires two linked cap+escrow pairs owned by the operator.
- [x] `apps/baram/scripts/smoke-dust-deposit.ts` — S12. Feeds an
      unauthorized Coin<T> to settle_action; asserts abort code
      572 (E_ASSET_NOT_ALLOWED). Dry-run only.

Run via tsx with the executor-nitro `.env` loaded:

```bash
cd apps/baram/scripts
npx tsx --env-file=../executor-nitro/.env probe-deep-fee.ts
npx tsx --env-file=../executor-nitro/.env smoke-token-replay.ts
npx tsx --env-file=../executor-nitro/.env smoke-cap-mixing.ts
npx tsx --env-file=../executor-nitro/.env smoke-dust-deposit.ts
```

S10/S11/S9/S12 scripts each have additional env requirements over
the executor-nitro defaults (e.g. `CAP_A_ID` / `UNAUTHORIZED_COIN_*`);
each script's header documents the exact set.

---

## Run log 2026-05-13

| Step | Outcome | Notes |
|---|---|---|
| B.0 probe-deep-fee | **PASS** | pool whitelisted, deep_required=0, base_out=12000 / quote_out=26798 for 1 NUSDC probe |
| A.1 atomic setup Pair A | **PASS** | tx `DiXehB7m...`; cap=`0x69b3e88...`, escrow=`0x62b7a9aa...` |
| A.1 atomic setup Pair B | **PASS** | tx `DLj1L6bj...`; cap=`0x9b10a6ec...`, escrow=`0xb8d0fc91...` |
| A.2 fund escrow A NUSDC | **PASS** | 5 NUSDC (5,000,000 raw), tx `5jcieRq9...` |
| A.2 fund escrow A NBTC | **PASS** | 24,000 raw NBTC (full coin), tx `4yzMYnJ1...` |
| S10 token tampering | **PASS** | HTTP 403 reason="invalid" |
| S11 token replay | **PASS** | HTTP 403 reason="replay" |
| S9 cap-mixing | **PASS** | abort code 576 E_OBLIGATION_CAP_MISMATCH (after script fix: settle_action(escrow_A, cap_B) to bypass 575 first; previous (escrow_B, cap_B) hit 575 E_OBLIGATION_ESCROW_MISMATCH first) |
| S12 dust-deposit | **PASS** | abort code 572 E_ASSET_NOT_ALLOWED at settle_action |
| S13 reciprocal binding | **PASS** | both pairs verified via `nasun client object`; `cap.escrow_id ↔ escrow.capability_id` symmetric |
| B.6 min_out floor | **PASS** | HTTP 400 "actionCall min_out below slippage floor"; floor=23760, expected=24000 (slippageBps=100), trader=0 |
| S1–S8 trader cycle | **BLOCKED** | trader-envelope emits `analysis.v1` for BUY/SELL; host registers `trade.swap.v1`. /execute-capability rejects with HTTP 400 "action function not registered" before any PTB build. Fix: introduce `ACTION_TYPE_TRADE_SWAP` and route BUY/SELL envelopes through it. (Phase-2 follow-up #13.) |
| S14 leftover-DEEP zero | **NOT RUN** | gated on S15 BUY actually landing |
| S15 full BUY happy path | **BLOCKED** | same trader-envelope wiring gap as S1–S8 |

## Run log appendix 2026-05-13 (follow-up session)

After fixing the wiring gap (`ACTION_TYPE_TRADE_SWAP` + `buildTradeSwapEnvelope`,
trader-cycle BUY/SELL routing through it; agent-runner vitest 110 green +
new actionType assertions on BUY/SELL/HOLD), the trader cycle now reaches
the host's PTB build step. Re-running surfaced two further blockers.

| Step | Outcome | Notes |
|---|---|---|
| Wiring fix vitest | **PASS** | trader-cycle.test.ts + trader-envelope.test.ts green |
| Update cap_A allowed_actions | **PASS** | tx `3L7HF75gmhMhAerT3dc1M67iWcYVc1Yr7kujfaCPJaXA`; cap_A.allowed_actions = `[analysis.v1, trade.swap.v1]`; cap.version bumped |
| S1 HOLD cognition cycle | **BLOCKED** | host PTB cmd 1 (`aer::create_report_with_receipt_capability`) fails dry-run with `CommandArgumentError { arg_idx: 1, kind: TypeMismatch }`. Root cause: deployment ID drift — see below |
| S15 BUY happy path | **NOT RUN** | trader's `min_out` defaults to 0; host floor mitigation (HIGH #2 fix at server.ts §763) rejects with HTTP 400 `actionCall min_out below slippage floor`. Even with min_out fixed, S15 would hit the same cognition-path TypeMismatch above (cmd 7 in exec path = same AER creation call) |

### New blocker — baram package republish mismatch

`apps/baram/contracts/Move.toml` declares `published-at = 0x734c42b8...`
and the canonical `packages/devnet-config/devnet-ids.json` reflects:

```
baram.packageId     = 0x734c42b8e8fbca26f1961766176a509a49c8dd44368d80cdc035439809ff1aee
baram.registry      = 0x1645502e401e5f9bafe31dfc399bb818eb85f05415b1649b3c2a5d011a24fc02
```

But `apps/baram/executor-nitro/.env` and `apps/baram/agent-runner/.env`
still point at an **older baram republish**:

```
BARAM_PACKAGE_ID    = 0xd3c73f768e2a089f9ebab92367cee472ddc02489f7feeb9496d824ceb4744070  # stale
BARAM_REGISTRY_ID   = 0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833  # stale
BUDGET_ID           = 0x9406e74e268d26da5e2e7ddff1c0f5713879c9f8d76aee79f6255b16bfd940ef  # belongs to stale baram
```

`baram_aer` (the C3-v2a republish at `0xdb118fd9...`) was compiled
depending on baram at `0x734c42b8`, so its
`create_report_with_receipt_capability` expects a `&BaramRegistry`
whose type tag is `0x734c42b8::baram::BaramRegistry`. The on-chain
object at `0x509825...` has type tag `0x970832::baram::BaramRegistry`
(the original baram before two republishes). 0x970832 and 0x734c42b8
are **separate packages** (the latter is `version=1`, original_id =
self — confirmed via `sui client object 0x734c42b8...`), so Sui's
upgrade-chain normalisation cannot bridge them.

**Resolution path (next session, before re-attempting S1/S15):**

1. Update both `.env` files to the canonical IDs from `devnet-ids.json`:
   - `BARAM_PACKAGE_ID = 0x734c42b8...`
   - `BARAM_REGISTRY_ID = 0x1645502e...`
2. The trader's existing `BUDGET_ID` is owned by the stale baram and
   cannot be reused. Spin up a fresh Budget on the new baram and
   update `BUDGET_ID` in `agent-runner/.env`.
3. Fund the new Budget with NUSDC and re-run S1 (HOLD cycle should
   land as eventClass=1, action=analysis.v1, outcome=2).

### S15 secondary blocker — trader-derived min_out

`apps/baram/agent-runner/src/presets/trader.ts §389` defaults the swap
`min_out` u64 pure arg to `0`. After the deployment IDs are fixed, S15
will still bounce off the host floor check until the trader computes a
viable `min_out`. Suggested approach: mirror `host/pado-swap.ts`'s
`quoteExpectedOutput` + `applySlippageFloor` in agent-runner as a small
`quoteMinOut` helper, call it in `trader-cycle.ts` before
`buildSwapActionCall`, and pass the result. Pool is stable enough on
devnet that a quote-then-submit gap won't drift.

### Wiring fix details

- `apps/baram/agent-runner/src/presets/trader-envelope.ts` — added
  `ACTION_TYPE_TRADE_SWAP = 'trade.swap.v1'` + `buildTradeSwapEnvelope`
  (eventClass=2). Payload schema is BCS-identical to `analysis.v1` for
  this prototype; the action-type label is what differentiates registry
  routing, not the payload shape.
- `apps/baram/agent-runner/src/presets/trader-cycle.ts` — BUY/SELL
  branches route through `buildTradeSwapEnvelope`. HOLD stays on
  `buildAnalysisEnvelope`. The legacy
  `if (finalEventClass === 2) finalEnvelope.eventClass = 2` post-build
  mutation is removed (no longer needed; the new builder returns 2
  directly).
- `apps/baram/agent-runner/src/presets/trader-cycle.test.ts` — augmented
  the BUY/SELL/HOLD cases with `body.envelope.actionType` assertions to
  catch any future regression that re-routes the labels.

### Side findings during the run

- **Stale env IDs** in `executor-nitro/.env`: `AER_PACKAGE_ID`,
  `AER_REGISTRY_ID`, `CAPABILITY_REGISTRY_ID` were the M1 republish IDs;
  C3-v2a republish (`0xdb118fd9...`) had updated `devnet-config` but not
  the executor `.env`. Also missing `PADO_NBTC_NUSDC_POOL`, `PADO_DEEP_TYPE`,
  `HOST_HMAC_KEY`. NBTC/NUSDC types pointed at `0x1c93579b...` while the
  live Pado pool is built on `0x96adf476d...`. **Fixed in this session.**
- **SDK `typeNameVector` helper produces a runtime-rejected pure arg.**
  `vector<TypeName>` is a struct vector, not pure-encodable.
  `setup-atomic-cap-escrow.ts` builds the vector via inline
  `type_name::get<T>` moveCalls + `makeMoveVec`, which both serializes
  correctly and matches the encoding the contract uses internally for
  `is_asset_allowed` comparisons. **SDK fix recommended** (helpers.ts §204).
- **`smoke-cap-mixing.ts` uses (escrow_B, cap_B)** for the attack PTB; on
  the live contract this trips `E_OBLIGATION_ESCROW_MISMATCH` (575)
  *before* `E_OBLIGATION_CAP_MISMATCH` (576). To isolate cap-mixing
  specifically, the call must be `(escrow_A, cap_B)`. **Patched in this
  session.**
- **`smoke-token-replay.ts` hard-codes model `gpt-4`**; local Groq enclave
  only supports `llama-3.3-70b-versatile`. **Patched in this session** to
  read `MODEL` env with that as default.
- **Sender + gas budget missing** on the dry-run PTBs in S9 and S12
  scripts. Without `tx.setSender()` and `tx.setGasBudget()` the build
  fails before reaching the assertion. **Patched in this session.**

### Run-log cap+escrow ids

These are devnet objects from the 2026-05-13 run; safe to reuse for
future smokes by the same wallet:

```
WALLET_ADDRESS=0x6c45e049c3ba9bbe7a9a0494c38877c593557ce4faf2e1e020bb4afaf5b6d0d7
CAPABILITY_ID_A=0x69b3e88546168f8bf4d7c1eb4be2a549bfdcca7a3e332467ee7ca9f3e9f3695d
ESCROW_ID_A=0x62b7a9aa4912c6a32ab82be810b12d70cadc47188ccb9477694c2c48cea5ec1b  # holds 5 NUSDC + 24k raw NBTC
CAPABILITY_ID_B=0x9b10a6ec3fbce3e57a6001ac41c3d8fb588747d9095be6afff840a1b598c4b41
ESCROW_ID_B=0xb8d0fc919cba9a585f0970c80cc80055c998ab491355068f06b3ee2365cc40d0  # empty
```
