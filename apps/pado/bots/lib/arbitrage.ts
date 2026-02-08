/**
 * Arbitrage Module
 *
 * Detects and executes arbitrage opportunities against user orders.
 * Uses MARKET config for pool and token types.
 */

import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE,
  MARKET,
  CLOCK_ID,
  ORDER_TYPE,
  SELF_MATCHING,
  priceToRaw,
  quantityToRaw,
  roundToTickSize,
  roundToLotSize,
  type BotState,
  timestamp,
} from './config.js';
import type { OrderbookLevel } from './orderbook.js';

// ========================================
// Types
// ========================================

export interface ArbitrageOpportunity {
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  profitBps: number;
}

export interface ArbitrageConfig {
  enabled: boolean;
  minProfitBps: number;
  maxQuantity: number;
}

// ========================================
// Opportunity Detection
// ========================================

export function findArbitrageOpportunities(
  bids: OrderbookLevel[],
  asks: OrderbookLevel[],
  marketPrice: number,
  config: ArbitrageConfig,
): ArbitrageOpportunity[] {
  if (!config.enabled || marketPrice <= 0) {
    return [];
  }

  const opportunities: ArbitrageOpportunity[] = [];

  // Check user BIDS that are above market price (sell to them for profit)
  for (const bid of bids) {
    if (bid.price <= marketPrice) break;

    const profitBps = ((bid.price - marketPrice) / marketPrice) * 10000;
    if (profitBps >= config.minProfitBps) {
      opportunities.push({
        type: 'sell',
        price: bid.price,
        quantity: Math.min(bid.quantity, config.maxQuantity),
        profitBps,
      });
    }
  }

  // Check user ASKS that are below market price (buy from them for profit)
  for (const ask of asks) {
    if (ask.price >= marketPrice) break;

    const profitBps = ((marketPrice - ask.price) / marketPrice) * 10000;
    if (profitBps >= config.minProfitBps) {
      opportunities.push({
        type: 'buy',
        price: ask.price,
        quantity: Math.min(ask.quantity, config.maxQuantity),
        profitBps,
      });
    }
  }

  return opportunities;
}

// ========================================
// Transaction Builder
// ========================================

function generateProofAsOwner(tx: Transaction, balanceManagerId: string) {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(balanceManagerId)],
  });
}

export function buildArbitrageTrades(
  balanceManagerId: string,
  opportunities: ArbitrageOpportunity[],
  state: BotState,
): Transaction {
  const tx = new Transaction();
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  for (const opp of opportunities) {
    const clientOrderId = state.clientOrderIdCounter++;
    const isBid = opp.type === 'buy';

    const priceRaw = roundToTickSize(priceToRaw(opp.price));
    const quantityRaw = roundToLotSize(quantityToRaw(opp.quantity));

    if (quantityRaw <= 0n) continue;

    const orderInfo = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.u8(ORDER_TYPE.IMMEDIATE_OR_CANCEL),
        tx.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx.pure.u64(priceRaw),
        tx.pure.u64(quantityRaw),
        tx.pure.bool(isBid),
        tx.pure.bool(false),
        tx.pure.u64(Date.now() + 60000),
        tx.object(CLOCK_ID),
      ],
    });

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::order_info::order_id`,
      arguments: [orderInfo],
    });
  }

  return tx;
}

export function logArbitrageOpportunities(
  opportunities: ArbitrageOpportunity[],
  marketPrice: number,
): void {
  if (opportunities.length === 0) return;

  console.log(`[${timestamp()}] Found ${opportunities.length} arbitrage opportunities:`);

  for (const opp of opportunities) {
    const direction = opp.type === 'buy' ? 'BUY from user' : 'SELL to user';
    console.log(
      `  ${direction} @ $${opp.price.toLocaleString()} ` +
      `(${opp.quantity.toFixed(4)} ${MARKET.name}, +${opp.profitBps.toFixed(1)}bps vs $${marketPrice.toLocaleString()})`
    );
  }
}
