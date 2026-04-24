# GoStop Manual E2E Checklist

No Playwright / Cypress setup exists for gostop (prototype phase). Walk
this list before any production cut — each step notes the expected
on-chain effect so regressions are catchable in minutes via the Explorer.

## Preconditions

- Wallet connected (zkLogin, local, or passkey)
- Sufficient NUSDC in wallet (faucet: `https://faucet.devnet.nasun.io`)
- Dev server: `pnpm dev:gostop` → http://localhost:5173
- RPC: `https://rpc.devnet.nasun.io` (chain `272218f1`)
- Explorer: `https://explorer.nasun.io/devnet`

For each test, record the tx digest and spot-check on Explorer:
`/tx/<digest>` → confirm `status = success`, expected events emitted,
balance deltas correct.

---

## Lottery (Phase 2-A regression)

Route: `/lottery`

| # | Action | Expected |
|---|---|---|
| L1 | Manual pick — 5 numbers, "Buy Ticket" | Tx lands; `TicketPurchased` event; ticket appears in "My Tickets" |
| L2 | Quick Buy 1 — "Buy 1" button | Tx lands; 1 ticket with random numbers |
| L3 | Quick Buy 5 — "Buy 5" button | Single tx, 5 `TicketPurchased` events, 5 ticket NFTs in wallet |
| L4 | Quick Buy 10 — "Buy 10" button | Single tx, 10 events; `MAX_TICKETS_PER_ADDRESS=300` respected |
| L5 | Insufficient NUSDC | Error toast "need X NUSDC"; no tx submitted |

---

## Scratch Card

Route: `/scratch`

| # | Action | Expected |
|---|---|---|
| S1 | Buy 1 | Tx lands; 1 `ScratchCardPurchased` event; Card enters results grid |
| S2 | Reveal card (click) | `multiplier` + `prize_amount` rendered; reveal animation plays |
| S3 | Buy 10 | Single tx; 10 events sorted by `bulk_index`; results grid shows 10 cards |
| S4 | Winner (multiplier > 0) | NUSDC balance increased by `prize_amount`; `ScratchCard` NFT appears in wallet |
| S5 | Loser (multiplier = 0) | No NFT; "No win" rendered; no balance change |
| S6 | Reveal all button | All remaining cards flip simultaneously |
| S7 | Insufficient bankroll | If pool low, `EInsufficientBankroll` → "Bankroll pool is temporarily low" toast |

Spot-check on Explorer: `ScratchCardPurchased` event `card_nft_id` is
`Some(...)` only for winners. Verify `BetCollected` (bankroll) for full
payment and `WinnerPaid` only for wins.

---

## Number Match

Route: `/numbermatch`

| # | Action | Expected |
|---|---|---|
| N1 | Pick 1 number, Play | Tx lands; `NumberMatchPlayed` event; result card renders `winning_number` |
| N2 | Pick 3 winning combo (includes winning_number) | `is_win=true`; payout = 18 NUSDC; balance +18 NUSDC |
| N3 | Pick 3 losing combo | `is_win=false`; refund = 3 NUSDC (20% of 15); balance +3 NUSDC |
| N4 | Click "Clear" | Picks array resets; result panel hides |
| N5 | Duplicate pick attempted | Blocked client-side (toggle behavior); no duplicate submit possible |
| N6 | Payment mismatch (tampered tx) | Contract `EInsufficientPayment` — skipped; frontend computes exact `cost` |

---

## Mines

Route: `/mines`

| # | Action | Expected |
|---|---|---|
| M1 | Bet 1 NUSDC, 3 mines, "Start Session" | Tx lands; `SessionCreated` event; grid becomes active with 0 reveals |
| M2 | Reveal a safe cell | `CellRevealed is_mine=false`; `safe_reveals++`; multiplier grows |
| M3 | Reveal 3 cells in rapid succession | 3 parallel txs; `pendingCells` Set shows 3 loading simultaneously (per-cell concurrency) |
| M4 | Cashout (after ≥ 1 safe reveal) | Tx lands; `SessionFinished outcome=1`; FinishCard shows +payout; session object deleted |
| M5 | Mine hit | `CellRevealed is_mine=true` + `SessionFinished outcome=2`; session object deleted; FinishCard shows explosion |
| M6 | Bet too large (e.g. 100 NUSDC @ 1 mine) | `EBetTooLarge` (code 7) → error toast "Bet too large for this mine count" |
| M7 | Double session attempt | After M1 succeeds, try again immediately → `ESessionAlreadyActive` (code 8) toast |
| M8 | Zero-reveal cashout | Cashout button disabled when `safe_reveals === 0` |
| M9 | UI bet auto-cap | Enter very large bet → UI caps to `maxBetAllowed` at current mine_count |

Spot-check on Explorer: `BetCollected` on `create_session`, `WinnerPaid`
only on `cashout`. `GameResult` event emitted for every session end
(game_id=5).

---

## Cross-cutting checks

- **Hamburger menu (<md viewport)**: resize browser to ~375px wide; hamburger button appears, panel opens on tap, closes on outside click or route change.
- **HomePage**: 4 featured cards in "The Floor", Mines shows amber "Devnet prototype" badge. "On the Rail" lists 4 upcoming (Crash, Plinko, Roulette, Wheel).
- **Wallet switching**: disconnect → reconnect via different auth path (zkLogin vs local); gameplay should resume without stale state.
- **Router state**: navigate between all 5 routes (/, /lottery, /scratch, /numbermatch, /mines), mid-game state should persist only on its own page.

---

## Known devnet limitations

- **Mines fairness**: `mine_positions` readable via `getObject(showContent:true)`. `max_single_payout = 100 NUSDC` caps exploit upside. Encrypted placement required before mainnet.
- **BankrollPool LP truncation**: pending bug evaluation task. Does not affect gameplay; only LP redemption math.
- **Concurrent tx version conflicts**: occasional `Object ... not available for consumption` on rapid sequential txs (e.g., two admin calls back-to-back). Retry after ~3 s.
