/**
 * Arbitrage Module
 *
 * Detects and executes arbitrage opportunities against user orders.
 * When a user's order is priced favorably compared to the external market,
 * the bot can fill it for profit.
 *
 * Example:
 * - User Buy @ $70,722, Binance = $69,500 → Bot sells at $70,722 (1.76% profit)
 * - User Sell @ $68,000, Binance = $70,000 → Bot buys at $68,000 (2.94% profit)
 */

import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE,
  NBTC_NUSDC_POOL,
  NBTC_TYPE,
  NUSDC_TYPE,
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
  /** 'buy' = bot buys from user's ask, 'sell' = bot sells to user's bid */
  type: 'buy' | 'sell';
  /** Price at which the user order exists */
  price: number;
  /** Quantity available at this price */
  quantity: number;
  /** Estimated profit in basis points */
  profitBps: number;
}

export interface ArbitrageConfig {
  /** Enable/disable arbitrage (default: true) */
  enabled: boolean;
  /** Minimum profit threshold in bps to execute (default: 10 = 0.1%) */
  minProfitBps: number;
  /** Maximum quantity per arbitrage trade in BTC (default: 0.1) */
  maxQuantityNbtc: number;
}

// ========================================
// Opportunity Detection
// ========================================

/**
 * Find arbitrage opportunities in the orderbook
 *
 * @param bids User bid orders (sorted by price descending)
 * @param asks User ask orders (sorted by price ascending)
 * @param btcPrice External BTC price from Binance
 * @param config Arbitrage configuration
 * @returns Array of profitable arbitrage opportunities
 */
export function findArbitrageOpportunities(
  bids: OrderbookLevel[],
  asks: OrderbookLevel[],
  btcPrice: number,
  config: ArbitrageConfig,
): ArbitrageOpportunity[] {
  if (!config.enabled || btcPrice <= 0) {
    return [];
  }

  const opportunities: ArbitrageOpportunity[] = [];

  // Check user BIDS that are above market price
  // If user wants to buy at $70,722 but market is $69,500,
  // we can sell to them at $70,722 for profit
  for (const bid of bids) {
    if (bid.price <= btcPrice) {
      // No more profitable bids (sorted descending)
      break;
    }

    const profitBps = ((bid.price - btcPrice) / btcPrice) * 10000;
    if (profitBps >= config.minProfitBps) {
      opportunities.push({
        type: 'sell',
        price: bid.price,
        quantity: Math.min(bid.quantity, config.maxQuantityNbtc),
        profitBps,
      });
    }
  }

  // Check user ASKS that are below market price
  // If user wants to sell at $68,000 but market is $70,000,
  // we can buy from them at $68,000 for profit
  for (const ask of asks) {
    if (ask.price >= btcPrice) {
      // No more profitable asks (sorted ascending)
      break;
    }

    const profitBps = ((btcPrice - ask.price) / btcPrice) * 10000;
    if (profitBps >= config.minProfitBps) {
      opportunities.push({
        type: 'buy',
        price: ask.price,
        quantity: Math.min(ask.quantity, config.maxQuantityNbtc),
        profitBps,
      });
    }
  }

  return opportunities;
}

// ========================================
// Transaction Builder
// ========================================

/**
 * Generate trade proof (ownership proof for BalanceManager)
 */
function generateProofAsOwner(tx: Transaction, balanceManagerId: string) {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(balanceManagerId)],
  });
}

/**
 * Build transaction to execute arbitrage trades
 *
 * Uses IOC (Immediate-Or-Cancel) orders to fill user orders.
 * IOC orders immediately match against existing orders and cancel unfilled portion.
 */
export function buildArbitrageTrades(
  balanceManagerId: string,
  opportunities: ArbitrageOpportunity[],
  state: BotState,
): Transaction {
  const tx = new Transaction();

  // Generate trade proof
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  for (const opp of opportunities) {
    const clientOrderId = state.clientOrderIdCounter++;
    const isBid = opp.type === 'buy';

    // Convert to raw units
    const priceRaw = roundToTickSize(priceToRaw(opp.price));
    const quantityRaw = roundToLotSize(quantityToRaw(opp.quantity));

    if (quantityRaw <= 0n) {
      continue;
    }

    const orderInfo = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        tx.object(NBTC_NUSDC_POOL),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.u8(ORDER_TYPE.IMMEDIATE_OR_CANCEL), // IOC to fill immediately
        tx.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx.pure.u64(priceRaw),
        tx.pure.u64(quantityRaw),
        tx.pure.bool(isBid),
        tx.pure.bool(false), // pay_with_deep = false
        tx.pure.u64(Date.now() + 60000), // 1 minute expiry (short since IOC)
        tx.object(CLOCK_ID),
      ],
    });

    // Return order info (required for Move)
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::order_info::order_id`,
      arguments: [orderInfo],
    });
  }

  return tx;
}

/**
 * Log arbitrage opportunities for monitoring
 */
export function logArbitrageOpportunities(
  opportunities: ArbitrageOpportunity[],
  btcPrice: number,
): void {
  if (opportunities.length === 0) {
    return;
  }

  console.log(`[${timestamp()}] Found ${opportunities.length} arbitrage opportunities:`);

  for (const opp of opportunities) {
    const direction = opp.type === 'buy' ? 'BUY from user' : 'SELL to user';
    console.log(
      `  ${direction} @ $${opp.price.toLocaleString()} ` +
      `(${opp.quantity.toFixed(4)} BTC, +${opp.profitBps.toFixed(1)}bps vs $${btcPrice.toLocaleString()})`
    );
  }
}
