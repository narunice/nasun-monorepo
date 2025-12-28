/**
 * Prediction Market Transaction Builders
 */

import { Transaction } from '@mysten/sui/transactions';
import { PREDICTION_PACKAGE_ID, PREDICTION_GLOBAL_STATE, CLOCK_ID } from './constants';

/**
 * Mint YES and NO tokens by depositing NUSDC
 * 1 NUSDC = 1 YES + 1 NO (always minted in pairs)
 */
export function buildMintOutcomeTokens(
  marketId: string,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      tx.object(nusdcCoinId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Mint outcome tokens with split amount
 * Splits NUSDC from existing coin and mints tokens
 */
export function buildMintOutcomeTokensWithAmount(
  marketId: string,
  nusdcCoinId: string,
  amount: bigint,
  _senderAddress: string,
): Transaction {
  const tx = new Transaction();

  // Split the exact amount from the coin
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place a bid order to buy outcome tokens (YES or NO)
 * Payment is in NUSDC
 */
export function buildPlaceBidOrder(
  marketId: string,
  isYes: boolean,
  price: number, // In basis points (0-10000)
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.pure.bool(isYes),
      tx.pure.u64(price),
      tx.object(nusdcCoinId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place a bid order with specific amount
 */
export function buildPlaceBidOrderWithAmount(
  marketId: string,
  isYes: boolean,
  price: number,
  nusdcCoinId: string,
  amount: bigint,
): Transaction {
  const tx = new Transaction();

  // Split the exact amount
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.pure.bool(isYes),
      tx.pure.u64(price),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place an ask order to sell outcome tokens
 * Requires a Position NFT
 */
export function buildPlaceAskOrder(
  marketId: string,
  positionId: string,
  price: number, // In basis points (0-10000)
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_ask_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.object(positionId),
      tx.pure.u64(price),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Claim winnings after market resolution
 */
export function buildClaimWinnings(
  marketId: string,
  positionId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });

  return tx;
}

/**
 * Burn losing position (cleanup)
 */
export function buildBurnLosingPosition(
  marketId: string,
  positionId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::burn_losing_position`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });

  return tx;
}
