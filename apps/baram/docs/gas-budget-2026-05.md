# Baram Plan C C3-v2 — Gas Budget (2026-05)

> Plan C §7.6. Measured during the 2026-05-13 devnet smoke run. Numbers
> here set the floor for the host's `MIN_PRICE`, the wallet's recommended
> initial escrow deposit, and the trader's `payment_amount` defaults.

## PTB shapes measured

Plan C C3-v2 swaps the legacy budget+receipt model for capability-gated
delegated-spend escrows. Five PTB shapes matter:

1. **Atomic setup (DV5)** — wallet 1x: `new_capability_and_link` →
   `new_escrow_linked` → `finalize_link_and_share`. Mints the
   reciprocally-bound `Capability` + `AgentEscrow` pair.
2. **Escrow deposit (DV1)** — anyone-can-call: `escrow::deposit<T>`. Wallet
   tops up `Balance<T>` under the dynamic-field key. First deposit per coin
   type costs more storage (creates the DOF).
3. **BUY trade.swap.v1** — execution AER, 10 cmds: withdraw_for_action +
   coin::zero<DEEP> + pool::swap_exact_quote_for_base + settle_action +
   destroy_zero<DEEP> + submit_proof_with_aer_capability +
   record_job_completion + refresh_tier_from_state. *(blocked on trader
   wiring fix — see appendix.)*
4. **HOLD analysis.v1** — cognition AER (no escrow touch): submit_proof +
   AER + record_job_completion + refresh_tier. *(blocked.)*
5. **FAILURE** — same outer shape as BUY but capability-gate aborts (e.g.
   E_OBLIGATION_CAP_MISMATCH 576, E_ASSET_NOT_ALLOWED 572,
   E_PAYMENT_EXCEEDS_NOTIONAL_CAP 552). PTB rolls back; receipt NOT
   consumed; executor NOT paid; gas still charged up to abort point.

## Measurements (2026-05-13 smoke run)

Gas formula: `net = computationCost + storageCost − storageRebate` (MIST,
1 MIST = 10⁻⁹ NASUN).

### Wallet-side PTBs (measured live)

| Scenario | computation | storage | rebate | net (MIST) | tx digest |
|---|---|---|---|---|---|
| Atomic setup (DV5) | 1,000,000 | 7,030,000 | 978,120 | **7,051,880** | DiXehB7mw4ot1KhDTT4KVX13t1aGHthbvPnapjfVdR9e |
| Atomic setup (DV5) | 1,000,000 | 7,030,000 | 978,120 | **7,051,880** | DLj1L6bjUFJoEdd9iaP9QuAZqGLbGVL9yT44V2FpZ7Tf |
| Escrow deposit, first NUSDC (DOF create) | 1,000,000 | 7,866,000 | 4,100,580 | **4,765,420** | 5jcieRq9F3tRVjt3vcfHabaKMbYtvrKdTFgUFw9BeX2y |
| Escrow deposit, first NBTC (DOF create) | 1,000,000 | 7,083,200 | 4,679,928 | **3,403,272** | 4yzMYnJ178tuEMVqppVfZgyBZWyBhHgGAv2se6pDp4LJ |

### Failure-path PTBs (dry-run; gas IS still charged on real tx up to abort)

The cap-mixing and dust-deposit attacks roll back at `settle_action`. We
measured via `dryRunTransactionBlock`; on a live submit the operator
would burn computation + storage up to the abort instruction.

| Scenario | abort code | abort module/fn | observed via |
|---|---|---|---|
| Cap mixing (S9) | 576 (E_OBLIGATION_CAP_MISMATCH) | escrow::settle_action | smoke-cap-mixing.ts dry-run |
| Dust deposit (S12) | 572 (E_ASSET_NOT_ALLOWED) | escrow::settle_action | smoke-dust-deposit.ts dry-run |
| min_out floor (B.6) | n/a (host pre-flight) | host /execute-capability HTTP 400 | smoke-min-out-floor.ts |

### Execution-path PTBs (BUY / SELL / HOLD)

Measured live on 2026-05-13 after the C3-v2d wiring fix
(`trade.swap.v1` actionType for BUY/SELL), the baram-republish ID
re-sync, the budget re-mint (owner=trader so the on-chain receipt
requester aligns with `cap.owner`), the TypeName normalization in
`capability.ts` soft-rail (BCS strips `0x`, proposal keeps it), and
the `quoteMinOut` helper closing the trader-supplied `min_out` floor
gap (HIGH #2 mitigation).

| Scenario | computation | storage | rebate | net (MIST) | tx digest |
|---|---|---|---|---|---|
| BUY trade.swap.v1 | 3,000,000 | 103,542,400 | 85,735,980 | **20,806,420** | 4JGZseb1BsNWRb2w8HDuCo3tfoBoKzinwaWHw9XXbUpN |
| SELL trade.swap.v1 | — | — | — | **deferred** | — |
| HOLD analysis.v1 | 1,000,000 | 32,345,600 | 18,727,236 | **14,618,364** | BDibNaRRRoKQa2hCHpbJzrCv1A5DFiVsR8B2Va9jpMzS |
| FAILURE (executor::record_job_completion replay, code 106) | 1,000,000 | 4,476,400 | 4,431,636 | **1,044,764** | 6AwwV8xr3fyGioYYhKPzCm3DbAyW9a8392ATfg1LhsNR |

Notes:
- **SELL deferred this session**: the trader LLM consistently chose
  HOLD across `mean_reversion`/`trend_follower`/`aggressive_scalper`
  cycles because the per-cycle prompt has no market data feed and the
  in-memory `recentTrades` ring resets between agent-runner
  invocations. Reproducing SELL needs either a market-data injection
  in the prompt or a dedicated `sell_only` smoke preset (out of scope
  for this DoD closer). The SELL PTB shape is identical to BUY except
  for fn name (`swap_exact_base_for_quote`), input/output type swap,
  and primary-output index (1 vs 0); gas is expected within 5% of the
  BUY row.
- **FAILURE row** was captured by a deliberately re-submitted
  `executor::record_job_completion(request_id=1)` after that id had
  already been recorded. The CLI dry-run-first guard was bypassed via
  `execute-signed-tx`, so the on-chain abort actually settled and
  burnt gas. This is a 1-cmd PTB rather than the full 10-cmd swap
  shape; treat the number as a floor for "early-abort" gas, not a
  representative measurement of a mid-PTB cap-mixing abort. Capturing
  a 10-cmd abort needs the host to submit past dry-run (e.g. race
  conditions where state changes between dry-run and submit) and is
  tracked as Plan E follow-up.

## Floor recommendations

Now that BUY (20.8 MIST K) and HOLD (14.6 MIST K) are measured:

- **`MIN_PRICE`** (host): 1,000,000 MIST remains the right floor for
  per-request inference fees; the BUY net gas (20.8 MIST K) is paid
  from the executor's gas budget separately, not from `payment_amount`.
- **`max_notional_per_action`** (cap.risk_limits): 2_000_000 default
  (2 NUSDC) keeps the LLM honest and the dry-run preflight cheap.
- **Recommended initial escrow deposit**: 5 NUSDC covers ~2 BUY swaps
  + safety margin. For NBTC-side SELL coverage, deposit ≥ 100,000 raw
  NBTC (0.001 NBTC) to keep `withdraw_for_action` headroom over the
  per-trade notional cap.
- **Executor gas reserve**: target ≥ 50 MIST K NASUN per executor wallet
  (≥ 2x the worst-case BUY net) so a few back-to-back failures don't
  starve out the host. Top-up is handled by the keeper-gas-watchdog cron
  (project memory `project_keeper_gas_watchdog.md`).

Plan E exposes the escrow deposit floor on the "Create Agent" form so
users understand the gas reserve required before committing funds.

## Operator notes

- **DEEP whitelist gating (S14)**: probe-deep-fee.ts (run 2026-05-13)
  confirmed pool `0xa2b755a...` is DEEP-whitelisted with `deep_required=0`.
  As long as this holds, `Cmd 5: destroy_zero<DEEP>` succeeds and the
  10-cmd PTB completes. If a future devnet redeploy de-whitelists the
  pool, switch Cmd 5 to `escrow::deposit_swap_leftover<DEEP>` and add
  DEEP to `cap.allowed_assets` (already in our smoke caps).
- **Atomic setup gas is flat** (~7 MIST K) regardless of `allowed_assets`
  count up to the 16-element validate cap.
- **First-deposit-per-type cost is higher** than subsequent deposits of
  the same type because the dynamic-field `Balance<T>` slot is created
  on first touch. Subsequent `deposit<T>` calls reuse the slot and
  benefit from a larger storage rebate.
- **Failure-path gas is bounded by the abort instruction**. Cap-mixing
  and dust-deposit aborts both happen at the first failing line of
  `settle_action`, which is early in the function — most computation
  and storage cost is avoided.

## Appendix: known wiring gap (filed as phase-2 follow-up)

The trader-cycle BUY/SELL path emits `actionType='analysis.v1'` because
[trader-envelope.ts:60-65](../agent-runner/src/presets/trader-envelope.ts#L60-L65)
explicitly notes "trade.swap.v1 is reserved for the eventual atomic
settlement path; until that lands the trader uses analysis.v1". Plan C
C3-v2 IS that atomic settlement path. The fix:

1. Introduce `ACTION_TYPE_TRADE_SWAP = 'trade.swap.v1'` in
   trader-envelope.ts.
2. Add `buildTradeSwapEnvelope({ decision, outcome })` mirroring
   `buildAnalysisEnvelope` shape but with the new actionType.
3. In trader-cycle.ts §371-401, branch on `decision.action`: BUY/SELL →
   `buildTradeSwapEnvelope`, HOLD → `buildAnalysisEnvelope`.

Without this change, every BUY/SELL cycle hits HTTP 400
"action function not registered" at the host's pre-PTB lookup, before any
gas is spent. After the change, BUY/SELL execution AERs land and §7.6
measurements can be populated. HOLD continues to use analysis.v1 and
also produces a measurable cognition AER.
