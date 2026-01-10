/**
 * Perpetual Futures Transaction Builders
 * @module features/perp/transactions
 */

import { Transaction } from '@mysten/sui/transactions';
import { PERP_PACKAGE_ID, PERP_MODULE, ORACLE_REGISTRY_ID } from './constants';
import type {
  OpenPositionParams,
  ClosePositionParams,
  AddCollateralParams,
  RemoveCollateralParams,
} from './types';

/** Standard clock object ID */
const CLOCK_ID = '0x6';

/**
 * Build transaction to open a new perpetual position
 *
 * @param params - Position parameters
 * @param nusdcCoinId - NUSDC coin object ID to use as collateral
 * @param senderAddress - Address to receive the position
 * @returns Transaction object
 */
export function buildOpenPosition(
  params: OpenPositionParams,
  nusdcCoinId: string,
  senderAddress: string,
): Transaction {
  const tx = new Transaction();

  // Call open_position
  // open_position(market, is_long, size, leverage, collateral, current_price, clock, ctx)
  const [position] = tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::open_position`,
    arguments: [
      tx.object(params.marketId),
      tx.pure.bool(params.isLong),
      tx.pure.u64(params.size),
      tx.pure.u64(params.leverage),
      tx.object(nusdcCoinId),
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  // Transfer position to sender
  tx.transferObjects([position], tx.pure.address(senderAddress));

  return tx;
}

/**
 * Build transaction to open a position with split amount
 * Splits exact collateral amount from existing NUSDC coin
 *
 * @param params - Position parameters
 * @param nusdcCoinId - Source NUSDC coin to split from
 * @returns Transaction object
 */
export function buildOpenPositionWithAmount(
  params: OpenPositionParams,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  // Split the exact collateral amount from the coin
  const [collateralCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(params.collateralAmount),
  ]);

  // Call open_position - returns PerpPosition owned object
  // Note: Sui automatically transfers returned owned objects to sender
  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::open_position`,
    arguments: [
      tx.object(params.marketId),
      tx.pure.bool(params.isLong),
      tx.pure.u64(params.size),
      tx.pure.u64(params.leverage),
      collateralCoin,
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to close an entire position
 *
 * @param params - Close parameters
 * @returns Transaction object
 */
export function buildClosePosition(params: ClosePositionParams): Transaction {
  const tx = new Transaction();

  // close_position returns Coin<NUSDC> (collateral + P&L)
  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::close_position`,
    arguments: [
      tx.object(params.marketId),
      tx.object(params.positionId),
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  // The returned NUSDC coin will be transferred to sender automatically

  return tx;
}

/**
 * Build transaction to add collateral to a position
 * Reduces leverage and improves margin ratio
 *
 * @param params - Add collateral parameters
 * @param nusdcCoinId - NUSDC coin to add
 * @returns Transaction object
 */
export function buildAddCollateral(
  params: AddCollateralParams,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::add_collateral`,
    arguments: [
      tx.object(params.positionId),
      tx.object(nusdcCoinId),
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to add collateral with split amount
 *
 * @param params - Add collateral parameters
 * @param nusdcCoinId - Source NUSDC coin to split from
 * @returns Transaction object
 */
export function buildAddCollateralWithAmount(
  params: AddCollateralParams,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  // Split the exact amount
  const [additionalCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(params.amount),
  ]);

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::add_collateral`,
    arguments: [
      tx.object(params.positionId),
      additionalCoin,
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to remove collateral from a position
 * Increases leverage (must stay within limits)
 *
 * @param params - Remove collateral parameters
 * @returns Transaction object
 */
export function buildRemoveCollateral(
  params: RemoveCollateralParams,
): Transaction {
  const tx = new Transaction();

  // remove_collateral returns Coin<NUSDC>
  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::remove_collateral`,
    arguments: [
      tx.object(params.positionId),
      tx.object(params.marketId),
      tx.pure.u64(params.amount),
      tx.pure.u64(params.currentPrice),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

// ===== Admin Functions =====

/**
 * Build transaction to create a new perpetual market
 * Note: This is a public fun, not entry fun, so must be called via PTB
 *
 * @param baseSymbol - Oracle symbol ID (1=BTC, 2=ETH, 3=NASUN)
 * @param name - Market name (e.g., "BTC-PERP")
 * @param maxOpenInterest - Maximum open interest per side
 * @returns Transaction object
 */
export function buildCreateMarket(
  baseSymbol: number,
  name: string,
  maxOpenInterest: bigint,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::create_market`,
    arguments: [
      tx.pure.u64(baseSymbol),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(name))),
      tx.pure.u64(maxOpenInterest),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build transaction to pause/unpause a market
 *
 * @param marketId - Market object ID
 * @param isActive - True to activate, false to pause
 * @returns Transaction object
 */
export function buildSetMarketActive(
  marketId: string,
  isActive: boolean,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::set_market_active`,
    arguments: [tx.object(marketId), tx.pure.bool(isActive)],
  });

  return tx;
}

/**
 * Build transaction to update market fees
 *
 * @param marketId - Market object ID
 * @param makerFeeBps - Maker fee in basis points
 * @param takerFeeBps - Taker fee in basis points
 * @returns Transaction object
 */
export function buildSetMarketFees(
  marketId: string,
  makerFeeBps: number,
  takerFeeBps: number,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::${PERP_MODULE}::set_market_fees`,
    arguments: [
      tx.object(marketId),
      tx.pure.u64(makerFeeBps),
      tx.pure.u64(takerFeeBps),
    ],
  });

  return tx;
}

// ===== Funding Functions =====

/**
 * Build transaction to settle funding rate
 * Anyone can call this to trigger funding settlement
 *
 * @param marketId - Market object ID
 * @returns Transaction object
 */
export function buildSettleFunding(marketId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::funding::settle_funding`,
    arguments: [
      tx.object(marketId),
      tx.object(ORACLE_REGISTRY_ID),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}
