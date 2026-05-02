# Emergency Asset Recovery — Pado

If you have funds locked in Pado smart accounts (BalanceManager, MarginAccount,
Prediction Positions) and need to recover them, this guide lists every path
in order from easiest to most resilient.

Your funds always live on the Nasun blockchain. The Pado website is just a UI.
As long as the chain is up, you can withdraw.

## Path 1 — In-app recovery (recommended)

1. Open https://pado.nasun.io
2. Connect the same wallet that owns the assets.
3. Click your wallet button → "Recover funds" (or visit `/recover` directly).
4. Click "Withdraw all" / "Claim winnings" / "Claim refund" on each item.

The Recovery page discovers all on-chain assets via direct RPC calls. No
backend, no database — only the Sui RPC matters.

## Path 2 — Other Nasun apps

The same "Recover funds" entry point lives in the wallet menu of every Nasun
app that uses `@nasun/wallet-ui`. If pado.nasun.io is unreachable, try
nasun.io or any other Nasun app — they will discover the same on-chain
assets (provided they ship a Pado adapter; otherwise use Path 3 or 4).

## Path 3 — Local build

If all hosted Nasun apps are down, you can run Pado yourself:

```bash
git clone https://github.com/narunice/nasun-monorepo
cd nasun-monorepo
pnpm install
pnpm dev:pado
# Open http://localhost:5176/recover
```

## Path 4 — Sui CLI (last resort)

You can call the recovery functions directly from the Sui CLI without any
frontend. Replace placeholders with your values.

```bash
# Set up
nasun client switch --env devnet
nasun client switch --address <YOUR_ADDRESS>

# 1. Drain a BalanceManager (NBTC + NUSDC)
nasun client ptb \
  --move-call $DEEPBOOK_PACKAGE::balance_manager::withdraw_all "<NBTC_TYPE>" "@<BM_ID>" \
  --assign nbtc_coin \
  --transfer-objects "[nbtc_coin]" "@<YOUR_ADDRESS>" \
  --move-call $DEEPBOOK_PACKAGE::balance_manager::withdraw_all "<NUSDC_TYPE>" "@<BM_ID>" \
  --assign nusdc_coin \
  --transfer-objects "[nusdc_coin]" "@<YOUR_ADDRESS>" \
  --gas-budget 50000000

# 2. Withdraw from MarginAccount
nasun client call \
  --package $UNIFIED_MARGIN_PACKAGE \
  --module unified_margin \
  --function withdraw_all \
  --args <MARGIN_ACCOUNT_ID>

# 3. Claim winnings on a resolved Prediction Position
nasun client call \
  --package $PREDICTION_PACKAGE \
  --module prediction_market \
  --function claim_winnings \
  --args <MARKET_ID> <POSITION_ID>
```

Find your object IDs:

```bash
# BalanceManager (shared object) — query event index
# (See apps/pado/frontend/src/features/trading/lib/balanceManagerValidation.ts
#  for the exact event filter pattern.)

# MarginAccount (owned object)
nasun client objects --address <YOUR_ADDRESS> | grep MarginAccount

# Prediction Positions (owned objects)
nasun client objects --address <YOUR_ADDRESS> | grep prediction_market::Position
```

## Notes

- BalanceManager is a **shared** Sui object — it cannot be transferred. Only
  withdrawals work. Anyone holding the right capability/admin can withdraw,
  but Pado's BM permits the owner to drain at will.
- MarginAccount is **owned** by your address. `getOwnedObjects` finds it.
- Position NFTs are also **owned** objects.
- Prediction `claim_winnings` and `claim_cancelled_refund` are user-callable
  on resolved/cancelled markets respectively. There is no admin gate on those.
