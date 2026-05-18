# Tier 1.0 — LP Gap Analysis Spike

> Status: **Chunk 1 (Move v0.0.3) on chain 2026-05-18**; week-2 remaining work = Chunk 2 (indexer streams + `bankrollPnl` SoT, migration 004). Live BankrollPool seed locked; LP UI can ship once Chunk 2 lands.
> Spike start date: 2026-05-18
> Owner: TBD
> Master plan: `/home/naru/.claude/plans/expressive-coalescing-map.md` (Sub-Plan B, line 580)

## 0. What this spike is

Pre-implementation audit of `bankroll_pool.move` v0.0.2 vs. the 6 published game contracts (lottery, scratchcard, numbermatch, crash, mines, wheel). Goal: identify missing settlement paths, share-math edge cases, redeem-cooldown UX gaps, and concurrency hazards **before** committing to Tier 1.1 (LP core completion) and Tier 1.2 (LP UI).

Output is a follow-up section in this same file (Findings + Recommendations), one `bankrollPnl` SoT implementation in [api/lib/bankroll-pnl.ts](../backend/src/api/lib/bankroll-pnl.ts), and the Tier 1.1 PR scope locked.

---

## 1. Budget (HG4)

| Item | Value |
|---|---|
| Total budget | **2 weeks** (was 1 week — revised per HG4) |
| Week-1 deliverable | 5 audit items complete, draft Findings section in this file |
| Week-2 contingency | Move v0.0.3 design only if Findings demand it; fuzz/concurrency tests |
| Auto-deferral rule | At end of Week-1, if completion < 50% → Tier 1.3 (Public Risk Dashboard) defers to v1.1 release (Tier 1.1 + 1.2 ship without it) |

Track week-1 completion against the 5 audit items in §3. "Completion" = audit item has a written finding (pass / gap / blocker), not just exploration notes.

---

## 2. Exit criteria (HG4)

The spike is **done** when all four below are objectively true. Verbal "looks fine" is not sufficient.

1. **Settlement parity simulation** — for each of the 6 game contracts, ≥ 1000 simulated rounds via a deterministic test harness (seeded RNG or replay of indexed history) confirm that `bet_amount`, `payout`, and BankrollPool `treasury` delta on chain reconcile to within ±0 NUSDC base units. Off-by-one or sign-flip on any game = blocker.
2. **LP redeem fuzz** — ≥ 10 fuzz inputs over `request_withdraw` → `redeem_liquidity`, varying (pre-existing pool_balance, pending bets, shares requested, time-since-request). Contract output must match expected `pps × shares` within rounding rule documented in this file. Includes **W6 first-LP fast-path** assertion (W6 from review): with pre-existing pool_balance > 0, the first LP's `shares == amount` must still hold.
3. **Concurrency scenarios** — 3 scenarios run against devnet (or local fullnode) with multiple signers:
   - (a) deposit × deposit — two LPs deposit in same checkpoint
   - (b) deposit × redeem — one LP deposits while another redeems a vested request
   - (c) redeem × redeem — two LPs redeem in same checkpoint
   Each must converge with no LockConflict cascade, no shares-rounding pickpocket, and matching post-state. LockConflict on any owned object is acceptable iff frontend retry pattern is specified (see §3 item 5).
4. **`bankrollPnl` SoT lands** — [api/lib/bankroll-pnl.ts](../backend/src/api/lib/bankroll-pnl.ts) stub replaced with real impl, refunds + treasury_deposits sources resolved, unit test covering the same window asserts equality when invoked via `/api/lp/apy` path and `routes/transparency.ts` path.

**Out of scope for spike** (defer to Tier 1.1+):
- Move v0.0.3 publish (decision only; publish in 1.1)
- LP UI components
- Risk Dashboard frontend
- Grafana / Telegram alerting wiring

---

## 3. Audit items (5)

Findings are recorded in §5 of this same file as the spike progresses.

### 3.1 Per-game settlement reflection
For each `gameId ∈ {1..6}`:
- Trace `GameCap` use path from game contract → `bankroll_pool::settle_*`
- Verify BankrollPool `treasury` increment on house-win and decrement on player-win
- Check fee distribution: protocol fee, LP fee, treasury fee — sum = bet - payout?
- Identify off-by-one, sign error, fee path omission

### 3.2 LP distribution mechanism
- Does bankroll growth flow into `pps` automatically (passive accrual) or does a keeper need to call a `crystallize_pnl()` or similar?
- If keeper needed → write `apps/gostop/bots/lp-settlement-keeper.ts` design note (do NOT add to ecosystem.config.cjs yet — node-3 drift blocks that; see HG3)
- Document the settlement frequency that preserves LP equity (per-round vs. per-N-rounds vs. per-epoch)

### 3.3 Share math
- 100 NUSDC deposit + 1500 DAU × 1 day of bets → redeem path produces what?
- ERC4626-style virtual offset present? If not, can 1-wei inflation attack steal first-LP equity? Document the check & the test that proves it.
- First-LP fast-path: pre-existing pool_balance > 0 (e.g., admin seed) → first user LP gets `shares == amount` (W6 review item).

### 3.4 Redeem cooldown UX
- `request_withdraw` records timestamp on chain? UI must read it without RPC scan.
- 24h cooldown — is the constant on chain or in move-time? What happens if user calls `redeem_liquidity` at 23:59:59?
- Is there a max-redeem window after cooldown? (e.g., must redeem within 7 days of vesting or request expires)
- Frontend countdown source — chain `clock` or server time? (chain `clock` is correct; mismatch with browser clock is fine if UI states "chain time").

### 3.5 Concurrency
- BankrollPool is a shared object — confirmed in `bankroll_pool.move`?
- LP token: owned (transferable / 1 wallet 1 token) or soulbound? Soulbound LPToken is the operational invariant from N7 review item — confirm in code.
- LockConflict expected only on the user's OWN wallet objects (gas coin, etc). If LockConflict on shared BankrollPool happens, that's a Sui bug — escalate.
- Frontend retry policy: on `LockConflict` or `ObjectVersionMismatch`, retry once after 1.5s with fresh object refs, then surface a user-facing error.

---

## 4. HG2 decision — Utilization cap

**Question**: BankrollPool v0.0.2 has no utilization cap (open bets / TVL ratio). Should v1 ship without it?

**Decision (current, reversed 2026-05-18): option (a)** — **bundle utilization cap into the Move v0.0.3 publish that finding §5.3 forces. Below original option-(b) rationale is preserved for audit trail; reversal rationale is in §5.3 and §6.**

**Initial decision (superseded): option (b)** — ship v1 without on-chain utilization cap; layer compensating controls off-chain.

**Rationale**:
- Option (a) — add cap in Move v0.0.3 — adds ~1 week to timeline and requires upgrade compatibility analysis (LPToken type / store layout / admin cap migration). v1 strategic goal is "VC-demo-grade LP working end-to-end with real DAU traffic", not "production-hardened insurance protocol". Adding a Move upgrade in the same release window as first LP UI is two compounded risks.
- Option (b) — no on-chain cap — is acceptable for v1 because:
  1. Single admin signer can pause new bets via existing `GameCap` revocation if exposure spikes.
  2. TVL while we sit at 1500 DAU emulator scale is small enough that worst-case single-round drawdown is bounded by per-game `max_payout` ceilings (already on chain in each game contract). Quantified bound: across 6 games the max single-round payout sums to ≪ a reasonable seed bankroll.
  3. v0.0.3 with proper utilization cap + dynamic max-payout governor lands before mainnet, when TVL & traffic justify the additional Move surface area.

**Compensating controls (v1 must ship all three)**:
1. **Monitoring** — `utilization_ratio = open_bets / TVL` exposed in `routes/transparency.ts` Risk Dashboard (Tier 1.3) with Grafana alert on ratio > 0.6.
2. **Admin runbook** — `apps/gostop/docs/runbooks/bankroll-pause.md` (TBD in Tier 1.1) documents the GameCap revocation path. SLA: pause executable in ≤ 5 min by on-call.
3. **Public risk acknowledgement** — Risk Dashboard prominently displays utilization ratio with explainer copy: "v1 bankroll has no automated utilization cap. Operator pauses new bets manually if this ratio exceeds 60%." Transparency is the substitute for protocol-enforced safety here.

**v0.0.3 trigger criteria** (when option-a work moves to plan-of-record):
- Any single day where utilization_ratio > 0.5 sustained for > 1 hour, OR
- TVL crosses 50,000 NUSDC equivalent, OR
- Mainnet launch (whichever comes first).

**This decision unblocks HG2.** No further Move v0.0.3 design work is required to enter Tier 1.0 spike.

---

## 5. Findings

Week-1 code-analysis pass complete. On-chain empirical verification (simulated deposit / redeem with admin signer) is deferred to week-2; the share-math blocker is already actionable from code alone.

### 5.1 Per-game settlement — **PASS with one structural gap**

5 of 6 games (crash, mines, numbermatch, scratchcard, wheel) use the standard triple: `collect_bet` → `pay_winner` (winners only) → `emit_game_result` (every entry, payout=0 for losses). Evidence:

| Game | collect_bet | pay_winner | emit_game_result | refund_bet |
|---|---|---|---|---|
| crash | crash.move:493 | crash.move:412 | crash.move:425 | crash.move:572 / 615 / 666 |
| mines | mines.move:244 | mines.move:382 | mines.move:313 (loss) / 396 (win) | — |
| numbermatch | numbermatch.move:181 | numbermatch.move:195 | numbermatch.move:212 | — |
| scratchcard | scratchcard.move:217 | scratchcard.move:235 | scratchcard.move:264 | — |
| wheel | wheel.move:202 | wheel.move:218 | wheel.move:236 | — |

**Lottery is the structural divergence**: ticket payment goes into `LotteryRound.prize_pool: Balance<NUSDC>` (lottery.move:128, 507, 511, 584, 588) and prizes are paid out from the same pool (lottery.move:659-668). Bankroll_pool is touched ONLY for:
- `treasury_deposit` at lottery.move:421 — house treasury cut after winners + base_rollover allocated
- `treasury_deposit` at lottery.move:746 — unclaimed prize sweep after grace period

Lottery PnL is therefore **isolated from bankroll LP equity**. LP shares only accrue the lottery treasury cut + unclaimed sweep, not gross lottery turnover.

**Gap (pre-existing, surfaces here)**: [routes/transparency.ts:56-63](../backend/src/api/routes/transparency.ts#L56-L63) aggregates `gostop.game_daily` across ALL game_ids (1-6) and labels the result `house_pnl_raw`. This is misleading for lottery because lottery's `bet` and `payout` go through its own prize_pool, not the bankroll. The transparency endpoint currently mixes two different PnL semantics. The Risk Dashboard (Tier 1.3) MUST distinguish `bankroll_pnl` from `total_house_pnl`, or it will display attacker-confusing numbers.

**Remediation**: `bankrollPnl()` impl in Tier 1.0 → Tier 1.1 must exclude `game_id = 1` (lottery) bet/payout sides and include only lottery `TreasuryDeposited` events. The transparency route should be updated to expose both numbers separately (lottery PnL + bankroll PnL = total house PnL, with the lottery component clearly labeled).

### 5.2 LP distribution mechanism — **PASS (no keeper needed)**

bankroll_pool.move:487-490: `share_price_scaled = (pool.balance × 1e9) / pool.total_shares`. As `pool.balance` grows from `collect_bet` and `treasury_deposit` and shrinks from `pay_winner` and `refund_bet`, `pps` automatically reflects bankroll PnL. No `crystallize_pnl()` step exists or is needed.

**Implication for indexer**: chain does NOT snapshot pps. To answer `share_price_start` / `share_price_end` for an arbitrary window, indexer must persist running `pool_balance` and `total_shares` per bankroll event. Recommended migration 004 schema:

```
gostop.bankroll_event(
  id BIGSERIAL PRIMARY KEY,
  tx_digest TEXT, event_seq INT, timestamp_ms BIGINT,
  event_type TEXT CHECK (event_type IN
    ('bet_collected','winner_paid','bet_refunded','treasury_deposited',
     'liquidity_provided','withdraw_requested','liquidity_redeemed')),
  game_id SMALLINT NULL,           -- NULL for LP events
  amount NUMERIC(30,0) NOT NULL,
  shares NUMERIC(40,0) NULL,        -- LP events only
  pool_balance_after NUMERIC(30,0), -- running snapshot
  total_shares_after NUMERIC(40,0), -- running snapshot
  UNIQUE (tx_digest, event_seq)
);
```

This single table powers both `bankrollPnl()` and the share-price snapshot question. No keeper required; the existing bankroll-pool indexer stream extends to cover 4 additional event types (`LiquidityProvided`, `WithdrawRequested`, `LiquidityRedeemed`, `TreasuryDeposited`).

**Remediation**: Tier 1.1 PR adds the indexer streams for these 4 events + migration 004 (claim `lp_history` reservation in [_RESERVED.md](../backend/src/db/migrations/_RESERVED.md); rename to `004_bankroll_event.sql` since the schema covers more than just LP history).

### 5.3 Share math — **BLOCKER (critical)**

`bankroll_pool::provide_liquidity` first-LP branch (bankroll_pool.move:391-396):

```
shares = if (pool.total_shares == 0) amount else
         (amount × (total_shares + 1)) / (pool_balance + 1)
```

Current chain state (per [devnet-ids.json](../devnet-ids.json)): seed of 100,000 NUSDC was injected via `treasury_deposit` ([bots/seed-bankroll-v2.ts:77](../bots/seed-bankroll-v2.ts#L77)), which credits `pool.balance` but does NOT mint shares. So **at this moment**: `pool.balance ≈ 100,000 NUSDC + accumulated house PnL`, `pool.total_shares == 0`.

**Exploit scenario** (concrete numbers, NUSDC base units 6dp):
1. Attacker deposits 100 NUSDC via `provide_liquidity`. `total_shares == 0` branch → shares = 100. After: pool_balance ≈ 100,100 NUSDC, total_shares = 100.
2. Attacker calls `request_withdraw` immediately. Cooldown 24h.
3. After 24h, attacker calls `redeem_liquidity`: `amount = 100 × (100,100 + 1) / (100 + 1) ≈ 99,109 NUSDC`.
4. **Net profit ≈ 99,009 NUSDC**; admin seed effectively transferred to attacker.

This is the explicit W6 "lock first-LP shares == amount with pre-existing balance" behavior. The Move contract itself is **functioning as designed**; the missing piece is the **operational invariant**: admin must hold an LP position seeded against `pool.balance` BEFORE `provide_liquidity` is exposed to the public.

**Available mitigations**, with trade-offs:

| Option | Action | Pros | Cons |
|---|---|---|---|
| **A. Admin pre-LP** | Mint 100,000 NUSDC to admin, call `provide_liquidity` once. After: pool_balance ≈ 200K, total_shares ≈ 100K (assuming seed approximately matches). Admin holds soulbound LPToken. | Zero Move change. Ships immediately. | Admin LPToken is liquid via redeem after 24h. If admin key compromised, attacker withdraws bankroll. No on-chain restriction against this. |
| **B. Move v0.0.3 dead-shares** | Add `seed_pool_shares(admin: &AdminCap, pool: &mut BankrollPool)` that mints `total_shares := pool.balance / 1` to a burn address or as a non-redeemable accounting entry. Lock the seed permanently. | Closes the exploit at protocol layer. Aligns with ERC4626 dead-shares pattern. | Requires Move publish; contradicts HG2 decision to ship v1 without v0.0.3. Must verify upgrade compatibility (no struct change, just new fn ⇒ should be safe via UpgradeCap). |
| **C. Move v0.0.3 anchored first-LP** | Change first-LP branch: `shares = if (total_shares == 0) max(amount, 1) but pool.balance also tracked separately`. Substantive math change. | Self-consistent. | Higher code-change surface; needs new tests. |

**Recommendation: B** — `seed_pool_shares` admin-only function. Move v0.0.3 is now required regardless (see §5.2 indexer event additions can be done off-chain, but **the share-math fix cannot**). Since v0.0.3 is on the table, bundle the HG2 utilization cap into the same publish. **This re-opens HG2 decision** — option (a) becomes preferred since the v0.0.3 cost is already paid.

**Remediation (Tier 1.1)**:
1. Author `bankroll_pool` v0.0.3 with `seed_pool_shares` + `set_utilization_cap` + utilization check in `collect_bet`. Test on a fresh devnet pool first (do NOT upgrade live BankrollPool until v0.0.3 fully verified).
2. Once v0.0.3 published in-place via `UpgradeCap`, admin runs `seed_pool_shares` ONCE to lock the current 100K seed into accounting shares.
3. After (2) is confirmed on chain, Tier 1.2 LP UI can open `provide_liquidity` to public.

**Until v0.0.3 + seed-lock is on chain, [LiquidityPoolPage.tsx](../frontend/src/pages/LiquidityPoolPage.tsx) MUST NOT ship to production.**

#### Implementation status (2026-05-18)

- v0.0.3 source authored: `seed_pool_shares` + `set_utilization_cap` + `collect_bet` cap check + `is_seeded` / `utilization_cap_bps` views + events. Stored via `sui::dynamic_field` to keep `BankrollPool` struct layout unchanged (UpgradeCap `compatible` policy compatible). Move.toml bumped 0.0.2 → 0.0.3.
- Move tests (6/6 passing locally):
  - `test_first_lp_exploit_v002_pattern` — locks the W6 exploit: with treasury seed but no `seed_pool_shares`, attacker recovers ≥ 99,000 NUSDC from a 100 NUSDC deposit (asserts payout ≥ 99_000_000_000 base units, pool balance < 200 NUSDC after redeem).
  - `test_seed_pool_shares_blocks_exploit` — after `seed_pool_shares`, attacker payout is within ± 1 base unit of original 100 NUSDC deposit; seed remains in pool.
  - `test_seed_pool_shares_idempotent` — second call aborts with `EAlreadySeeded` (abort_code 9).
  - `test_seed_pool_shares_requires_balance` — call on empty pool aborts with `EEmptyPool` (abort_code 10).
  - `test_utilization_cap_disabled_default` — `utilization_cap_bps` returns 0 by default; bets pass even when GameCap max_single_payout exceeds pool.balance.
  - `test_utilization_cap_blocks_bet` — with cap_bps = 5_000 and max_single_payout 5_001 NUSDC on a 10_000 NUSDC pool, `collect_bet` aborts with `EUtilizationCapExceeded` (abort_code 12).
- **Evidence (on-chain, 2026-05-18)**:
  - **Throwaway publish**: package `0x50451aecd2e19101ae6e4fc0ed97f6f5c780e15cff7a83e937faacab18a2f195` (publish tx `7Uu19WFjFTMP6J3TXSBRuS1TF89vNBK7xH4fkuLNHtuw`). Self-issued GameCap + treasury_deposit 100 NUSDC + `seed_pool_shares` (tx `BPcXQ4W4ocVnH25fxZQR525PG2M8v25nFWWfGFKP9Bbc`). Post-state on throwaway pool `0x2294c757407fee7b2bb849f65ad8c94c3600e9072a80db66939d118f1c324d18`: `pool.balance == total_shares == 100_000_000`, `share_price_scaled == 1_000_000_000` (1.0 pps exact). Second `seed_pool_shares` call aborted with `code 9` (`EAlreadySeeded`) confirming idempotency on chain. `set_utilization_cap(5000)` succeeded (tx `mFTZSzTUygyrk5T9PZxE8gj3LVct2VZxDa7ZmLXF8ej`).
  - **Live prod upgrade**: `UpgradeCap 0xf38053fa5ce1621b7ad30a6c7408fbd7d49b360f6fcca9e15a54b9dac158dd00` consumed in tx `DMzrCdKSBx8AT7tqpb7xmKzviDUsP1DQzn8t5ELicq81`. New live packageId: `0x23fa5fcac7bd1cacfbf8421e9d5be31d9de660b7bfe5251a93b2779e4e349496` (Version 3). BankrollPool shared object id unchanged (`0xf74e8c3c16ee077651f82459f350e96027c82319686395679d10f08ed0cd306d`); accrued ~2.8M NUSDC balance preserved.
  - **Live seed lock**: `seed_pool_shares` called once on the live pool (tx `B29mvxri1UBRRC6phmBk5z1P6B4qYrGdtTkLh789WqCg`). Post-state: `pool.balance = 2_809_415_960_142`, `total_shares = 2_809_416_960_142`, `share_price_scaled = 999_999_644` (0.99999964 pps). The 1 NUSDC delta vs perfect 1.0 reflects active game PnL (a single 1 NUSDC payout settled between the seed call and the verification read); expected behavior, not a bug. Subsequent house PnL accrues into `total_shares` denominator as before. v0.0.2 `total_shares == 0` exploit window is now closed on chain.

### 5.4 Redeem cooldown UX — **PASS with two notes**

- `EXIT_COOLDOWN_MS = 86_400_000` (bankroll_pool.move:24) = exactly 24h. `request_withdraw` records `withdraw_requested_at = Some(now)` (bankroll_pool.move:427), `redeem_liquidity` asserts `now >= requested_at + EXIT_COOLDOWN_MS` (bankroll_pool.move:448). Standard linear cooldown.
- `WithdrawRequested` event emits `claimable_at = now + EXIT_COOLDOWN_MS` (bankroll_pool.move:433) — UI can read this directly without recomputing.
- **Note 1**: `redeem_liquidity` does NOT check `pool.paused` (bankroll_pool.move:439). Intentional per v0.0.2 hardening (matches `pay_winner` / `refund_bet` rationale). LP exit is therefore NOT halted by emergency pause. UI must communicate this to LP users.
- **Note 2**: No expiration cap on the redeem window. Once cooldown elapses, LP can redeem at any future block. Re-calling `request_withdraw` overwrites the prior timestamp — harmless but UI should treat it as a "restart cooldown" action, not "request additional withdraw".

**Remediation**: UI copy in Tier 1.2 must say "Withdraw available from <claimable_at> onward (no deadline)" rather than "Withdraw open for N hours". No Move change needed.

### 5.5 Concurrency — **PASS**

- `BankrollPool` is `key`-only shared object (bankroll_pool.move:60, `transfer::share_object` at :166). Sui consensus serializes `&mut BankrollPool` writes; no application-level LockConflict expected on the pool itself.
- `LPToken` has `key` only (no `store`) — soulbound (bankroll_pool.move:73). Cannot be transferred, cannot be passed to a contract that requires `store`. Confirms operational invariant N7.
- `AdminCap`, `GameCap` are `key, store` owned objects (bankroll_pool.move:42, :49). Held by deployer / game registries.
- **LockConflict surface**: only the player's own gas coin and (for redeem) their LPToken. Both are owned objects under the user's wallet — standard Sui retry pattern applies.

**Remediation**: Tier 1.2 LP UI retry policy:
- On `LockConflict` or `ObjectVersionMismatch`: retry once after 1500ms with fresh object refs.
- On second failure: surface a deterministic user-facing toast: "Wallet busy — please retry in a moment". Do not auto-retry beyond once (avoids fee storms).
- Identical to the existing gostop/pado pattern; no new infra.

---

### Week-1 summary

| Audit | Status | Action owner |
|---|---|---|
| 5.1 Per-game settlement | PASS + 1 lottery-PnL labeling gap | bankrollPnl impl |
| 5.2 LP distribution | PASS (no keeper) | indexer streams + migration 004 |
| 5.3 Share math | **BLOCKER** | Move v0.0.3 (seed_pool_shares) |
| 5.4 Cooldown UX | PASS + 2 UI copy notes | Tier 1.2 UI |
| 5.5 Concurrency | PASS | Tier 1.2 UI retry pattern |

**Week-2 work**:
- On-chain empirical verification of 5.3 using the admin signer (run the exploit on a fresh dev pool against a v0.0.2 deploy to confirm exact NUSDC drained, then on a v0.0.3 deploy to confirm `seed_pool_shares` closes it).
- Author Move v0.0.3 + tests + simulate upgrade via UpgradeCap on a throwaway pool.
- Finalize Tier 1.1 PR scope in §6.

**HG2 reconsideration**: Decision (b) "ship without Move v0.0.3" assumed Move upgrade could be deferred. Finding 5.3 now requires v0.0.3 for the LP UI to be safe to ship. **HG2 should flip to option (a)**: Move v0.0.3 is on the critical path. Utilization cap can be bundled into the same publish at marginal additional cost. The +1 week timeline cost from option (a) is now sunk regardless.

---

## 6. Tier 1.1 PR scope (locked 2026-05-18)

Sub-Plan B Tier 1.1 ships in two atomic chunks. **Chunk 1 (Move v0.0.3)** must merge and the on-chain `seed_pool_shares` call must land BEFORE Chunk 2 (LP UI in Tier 1.2) ships to production. Chunk 1 itself is split into a verification stage (throwaway devnet pool) and a production stage (live BankrollPool upgrade), gated on explicit user approval per [feedback_staging_before_prod.md].

### Chunk 1 — Move v0.0.3 (this PR)

| Item | File | Status |
|---|---|---|
| `seed_pool_shares` admin fn (idempotent seed lock, no LPToken mint) | `apps/gostop/contracts-bankroll-pool/sources/bankroll_pool.move` | authored 2026-05-18 |
| `set_utilization_cap` admin fn + `utilization_cap_bps` view | same | authored 2026-05-18 |
| `collect_bet` advisory cap check (cap_bps > 0 ⇒ reject when GameCap.max_single_payout × 10000 > pool.balance × cap_bps) | same | authored 2026-05-18 |
| `is_seeded` view (off-chain LP UI gate) | same | authored 2026-05-18 |
| `PoolSharesSeeded` + `UtilizationCapUpdated` events | same | authored 2026-05-18 |
| Storage uses `sui::dynamic_field` on `BankrollPool.id` (no struct field added → UpgradeCap `compatible` policy safe) | same | by design |
| 6 Move tests: W6 exploit lock + seed blocks exploit + idempotent + empty-pool + cap default disabled + cap blocks bet | `apps/gostop/contracts-bankroll-pool/tests/bankroll_pool_tests.move` | authored + passing 2026-05-18 |
| `Move.toml` version bump `0.0.2` → `0.0.3` | `apps/gostop/contracts-bankroll-pool/Move.toml` | done |
| Throwaway devnet publish + chain sanity (issue_game_cap, treasury_deposit, seed_pool_shares idempotency, set_utilization_cap) | on-chain | done 2026-05-18 (digests in §5.3 Evidence) |
| Live BankrollPool upgrade via `UpgradeCap` + one-shot `seed_pool_shares` call | on-chain | done 2026-05-18 (digests in §5.3 Evidence) |
| `devnet-ids.json`: bump `bankrollPool.packageId` to `0x23fa5fca...`, add `upgradeTxDigestV0_0_3` + `seedSharesTxDigest` + `version: "v0.0.3"`; prepend v0.0.3 entry to top-level `versionNotes` | `apps/gostop/devnet-ids.json` | done 2026-05-18 |

### Chunk 2 — Indexer streams + bankrollPnl SoT (follow-up PR, Tier 1.1 week-2)

| Item | File | Status |
|---|---|---|
| Migration `004_bankroll_event.sql` per §5.2 schema | `apps/gostop/backend/src/db/migrations/004_bankroll_event.sql` | not started |
| Indexer streams for `LiquidityProvided`, `WithdrawRequested`, `LiquidityRedeemed`, `TreasuryDeposited` (plus existing bet/payout/refund) writing into `gostop.bankroll_event` with `pool_balance_after` / `total_shares_after` running snapshots | `apps/gostop/backend/src/indexer/streams/` | not started |
| `bankrollPnl()` real impl (replace `NotImplementedError` stub) — excludes `game_id = 1` (lottery) bet/payout sides, includes lottery `TreasuryDeposited` only, per §5.1 | `apps/gostop/backend/src/api/lib/bankroll-pnl.ts` | not started |
| Unit test: same window via `/api/lp/apy` path and `routes/transparency.ts` path must produce identical numbers | `apps/gostop/backend/src/api/lib/bankroll-pnl.test.ts` (new) | not started |
| `routes/transparency.ts` updated to expose `lottery_pnl` and `bankroll_pnl` separately (§5.1 remediation) | `apps/gostop/backend/src/api/routes/transparency.ts` | not started |

### Explicitly out of scope (defer to Tier 1.2 or later)

- LP UI components ([LiquidityPoolPage.tsx](../frontend/src/pages/LiquidityPoolPage.tsx) production ship): blocked by Chunk 1 on-chain completion.
- Open-exposure aggregate tracking (proper utilization enforcement based on in-flight bet sum). v0.0.3 cap is per-GameCap advisory only. Aggregate tracking deferred to v0.0.4 or to off-chain monitoring + manual revocation per HG2 compensating controls (still required for v1).
- Risk Dashboard (Tier 1.3): HG4 auto-deferral rule may push to v1.1 release if Tier 1.0/1.1 week-1 < 50%.
- `lp-settlement-keeper` design note: not needed per §5.2 (passive accrual sufficient). HG3 ecosystem.config.cjs reconcile remains a separate workstream.

---

## 7. Cross-references

- HG1: [backend/src/db/migrations/_RESERVED.md](../backend/src/db/migrations/_RESERVED.md) — migration 004 reserved for `lp_history`
- HG5: [backend/src/api/lib/bankroll-pnl.ts](../backend/src/api/lib/bankroll-pnl.ts) — SoT interface stub
- HG3: PR-C ecosystem.config.cjs reconcile is a **separate workstream**. Tier 1.1 keeper rollout (if needed per §3.2 finding) blocks on HG3, but the spike itself does not. (project_gostop_backend_node3_runtime.md)
- Master plan: `/home/naru/.claude/plans/expressive-coalescing-map.md` line 580 (Sub-Plan B)
- Review warnings folded in: W4 (active exposure), W5 (matview cost), W6 (first-LP fast-path), W7 (PTB structure), W8 (Prometheus vs cron — **decided: cron + TG bot**), W9 (APY display volatility), N7 (LP authn via JWT, not URL wallet)
