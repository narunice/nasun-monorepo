# Baram Plan B B2 — Gas Budget (2026-05)

> Plan B §7.4. Measured during the §7.3 devnet smoke. The numbers here set
> the floor for the host's `MIN_PRICE` and the agent's recommended minimum
> Budget deposit (Plan E exposes this in the agent creation flow).

## PTB shapes measured

Three scenarios, each one PTB end-to-end. Gas is `effects.gasUsed.computationCost
+ effects.gasUsed.storageCost − effects.gasUsed.storageRebate` (MIST).

1. **BUY trade.swap.v1** — full envelope. Cmds: pool swap + submit_proof +
   AER capability + record_job_completion + refresh_tier.
2. **HOLD noop.v1** — cognition. Cmds: submit_proof + AER capability +
   record_job_completion + refresh_tier (no pool swap).
3. **FAILURE** — same shape as BUY but the capability denies (e.g.,
   `payment > max_notional`). The PTB rolls back; receipt is NOT consumed
   and the executor is NOT paid. Gas IS still charged up to the abort
   point.

## Measurements

> **STATUS**: placeholders. Populate after the §7.3 smoke run from
> `effects.gasUsed` on each digest.

| Scenario | computation (MIST) | storage (MIST) | rebate (MIST) | net (MIST) | tx digest |
|---|---|---|---|---|---|
| BUY trade.swap.v1 | TBD | TBD | TBD | TBD | TBD |
| HOLD noop.v1 | TBD | TBD | TBD | TBD | TBD |
| FAILURE (E_PAYMENT_EXCEEDS_NOTIONAL_CAP) | TBD | TBD | TBD | TBD | TBD |

Worst case from the table sets the floor for `MIN_PRICE` plus a safety
margin (≥ 2x recommended). Current code default: 1_000_000 MIST.

## Recommended Budget deposit (Plan E hint)

Once measurements are in:

```
min_deposit = worst_case_gas * margin_x + per_request_inference_fee
```

Plan E surfaces the result on the "Create Agent" form so the user
understands the gas reserve required.

## Notes for future plans

- Pool swap gas dominates execution AER cost; if Plan C trader preset
  starts batching multiple swaps in one wake, re-measure.
- `refresh_tier_from_state` is opt-in and can be skipped per-PTB by
  removing the Cmd from `submitProofWithAERCapability` if gas budget gets
  tight in 1차. Removing it shifts the tier-refresh duty back to a
  separate cron PTB.
- Capability shared-object read (`tx.sharedObjectRef(mutable: false)`)
  costs essentially the same as a normal object read since the cap is
  immutable on the hot path (Plan B C2). No serialization-point overhead.
