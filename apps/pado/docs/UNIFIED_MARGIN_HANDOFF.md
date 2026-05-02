# Unified Margin Sprint B Handoff

## Sprint A Completed

- `unified_margin::withdraw_nusdc_as_coin` deployed (additive upgrade, UpgradeCap preserved)
  - Package: `0xbc2cbc6a529cf0da10113a4d76cde3019da64d3512f481a8227bcedde8827031`
  - Original: `0x1a1a6e86712a866e8bf7b2d6320b364282b5b257f8f9419db652914cf2d7a472`
  - UpgradeCap: `0xd6217812c9e3ae56b142ab89d88ee64be5ce0c2cb6f0c7ecd03f4b60ae53ec12`
- Prediction MA-first PTB routing (single tx, atomic: MA withdraw + predict)
- `payment.ts` refactored to MA-first options object pattern (`UnifiedPaymentOptions`)
- TradingBalanceBar + OutcomeOrderForm show MA balance in "Available" total
- UI labels unified: "Trading Balance" removed, replaced with "Pado Balance" / "In Pado"

## Sprint B Implementation Goals

### 1. Spot MA-first (atomic PTB)

**Problem**: Current Spot trading funds wallet → BM in a separate tx before placing the order.
MA-first requires MA withdraw + BM deposit as pre-steps in the same PTB as the order.
2 separate blockchain transactions = ~5-8s extra wait time for users.

**Solution**: Inject optional `preSteps` into `buildLimitOrderTx` in `useTrading.ts`.
- `useAutoDeposit.ts` checks MA balance first
- If MA has sufficient funds: MA withdraw + BM deposit appended to order PTB as pre-steps
- Result: single atomic tx for the whole flow

**Key files**:
- `apps/pado/frontend/src/features/trading/useTrading.ts`
- `apps/pado/frontend/src/features/trading/hooks/useAutoDeposit.ts`

### 2. Perp MA-first

**Problem**: `usePerpOrder.ts` sources collateral directly from wallet, not MA.

**Solution**: Change collateral sourcing to MA-first, same pattern as Prediction (Sprint A).
- Check `maBalance >= collateralAmount`
- If yes: `withdrawNusdcFromMa` in perp PTB
- If no: fall back to wallet

**Key file**: `apps/pado/frontend/src/features/perp/hooks/usePerpOrder.ts`

### 3. NBTC MA-first (future)

Sprint A handles NUSDC only. NBTC sell-side currently stays wallet → BM.

When needed:
1. Add `withdraw_nbtc_as_coin` to `contracts-margin/unified_margin.move` (same pattern as `withdraw_nusdc_as_coin`)
2. Extend `UnifiedPaymentOptions` with `maBaseBalance?: bigint`
3. Update `useAutoDeposit.ts` to route NBTC through MA

## Known Constraints

- **Owned object LockConflict**: MA is an owned object. If two sequential txs use the same MA
  before the first is indexed, the second will fail with `LockConflict`. Workaround: `waitForTransaction`
  between calls. Sprint B Spot atomization eliminates this issue at the root.
- `waitForTransaction` is already implemented in `usePredictionTrade.ts` as `waitForTx`.
  Sprint B should use the same pattern until full atomization is achieved.
- "2 transactions" means 2 blockchain txs (~5-8s wait), NOT 2 user signature popups.
  zkLogin/Passkey auto-signs silently. The latency is the only UX cost.
