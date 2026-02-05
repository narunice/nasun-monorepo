/**
 * Market Making Strategy Module
 *
 * Calculates grid orders around the mid price.
 * Ensures POST_ONLY orders don't cross existing orderbook.
 */

import {
  type LPConfig,
  type OrderSpec,
  type Inventory,
  priceToRaw,
  quantityToRaw,
  roundToTickSize,
  roundToLotSize,
} from './config.js';
import type { OrderbookState } from './orderbook.js';

// ========================================
// Strategy: Grid Order Generation
// ========================================

/**
 * Calculate bid and ask orders around the mid price
 *
 * Grid structure:
 * - 5 bids below mid price: midPrice * (1 - spread - i * spacing)
 * - 5 asks above mid price: midPrice * (1 + spread + i * spacing)
 *
 * Example with midPrice = $100,000, spread = 0.3%, spacing = 0.1%:
 * - Bid 0: $99,700 (0.3% below)
 * - Bid 1: $99,600 (0.4% below)
 * - Bid 2: $99,500 (0.5% below)
 * - Ask 0: $100,300 (0.3% above)
 * - Ask 1: $100,400 (0.4% above)
 * - Ask 2: $100,500 (0.5% above)
 *
 * IMPORTANT: Orders are adjusted to avoid crossing existing orderbook.
 * - Bids must be below best ask (to avoid immediate execution)
 * - Asks must be above best bid (to avoid immediate execution)
 */
export function calculateOrders(
  midPrice: number,
  config: LPConfig,
  inventory: Inventory,
  orderbook?: OrderbookState,
): OrderSpec[] {
  const orders: OrderSpec[] = [];

  // Convert basis points to multipliers
  const baseSpread = config.spreadBps / 10000;
  const levelSpacing = config.levelSpacingBps / 10000;

  // Calculate inventory skew adjustment
  const skewAdjustment = calculateSkewAdjustment(midPrice, inventory);

  // Order size in raw units
  const orderQuantity = roundToLotSize(quantityToRaw(config.orderSizeNbtc));

  // Skip if order size is too small
  if (orderQuantity <= 0n) {
    return orders;
  }

  // Calculate price boundaries to avoid crossing the orderbook
  // For POST_ONLY orders:
  // - Bids must be strictly BELOW best ask (bid < bestAsk)
  // - Asks must be strictly ABOVE best bid (ask > bestBid)
  const maxBidPrice = orderbook?.hasAsks && orderbook.bestAsk > 0
    ? orderbook.bestAsk * 0.9999 // Just below best ask (0.01% buffer)
    : Infinity;
  const minAskPrice = orderbook?.hasBids && orderbook.bestBid > 0
    ? orderbook.bestBid * 1.0001 // Just above best bid (0.01% buffer)
    : 0;

  // Generate bid orders (buy orders below mid price)
  for (let i = 0; i < config.orderLevels; i++) {
    const offset = baseSpread + i * levelSpacing + skewAdjustment.bidAdjustment;
    let bidPrice = midPrice * (1 - offset);

    // Clamp bid price to avoid crossing
    if (bidPrice >= maxBidPrice) {
      bidPrice = maxBidPrice * (1 - i * levelSpacing); // Stack below the cap
    }

    // Skip invalid prices
    if (bidPrice <= 0) continue;

    const bidPriceRaw = roundToTickSize(priceToRaw(bidPrice));

    orders.push({
      price: bidPriceRaw,
      quantity: orderQuantity,
      isBid: true,
    });
  }

  // Generate ask orders (sell orders above mid price)
  for (let i = 0; i < config.orderLevels; i++) {
    const offset = baseSpread + i * levelSpacing + skewAdjustment.askAdjustment;
    let askPrice = midPrice * (1 + offset);

    // Clamp ask price to avoid crossing
    if (askPrice <= minAskPrice) {
      askPrice = minAskPrice * (1 + i * levelSpacing); // Stack above the floor
    }

    const askPriceRaw = roundToTickSize(priceToRaw(askPrice));

    orders.push({
      price: askPriceRaw,
      quantity: orderQuantity,
      isBid: false,
    });
  }

  return orders;
}

// ========================================
// Inventory Skew Adjustment
// ========================================

interface SkewAdjustment {
  bidAdjustment: number; // Additional spread on bids (0 = no adjustment)
  askAdjustment: number; // Additional spread on asks (0 = no adjustment)
}

/**
 * Calculate spread adjustment based on inventory skew
 *
 * If we have too much NBTC, widen ask spread (sell less aggressively)
 * If we have too much NUSDC, widen bid spread (buy less aggressively)
 */
function calculateSkewAdjustment(midPrice: number, inventory: Inventory): SkewAdjustment {
  // Calculate inventory values in USD
  const nbtcValue = inventory.nbtc * midPrice;
  const nusdcValue = inventory.nusdc;
  const totalValue = nbtcValue + nusdcValue;

  // Default: no adjustment
  if (totalValue <= 0) {
    return { bidAdjustment: 0, askAdjustment: 0 };
  }

  // Calculate skew ratios
  const nbtcRatio = nbtcValue / totalValue;
  const nusdcRatio = nusdcValue / totalValue;

  // Skew threshold: if one side > 60%, apply adjustment
  const SKEW_THRESHOLD = 0.6;
  const ADJUSTMENT_PER_POINT = 0.001; // 0.1% per 10% skew above threshold

  let bidAdjustment = 0;
  let askAdjustment = 0;

  if (nbtcRatio > SKEW_THRESHOLD) {
    // Too much NBTC, widen ask spread (sell less aggressively)
    const excessRatio = nbtcRatio - SKEW_THRESHOLD;
    askAdjustment = excessRatio * 10 * ADJUSTMENT_PER_POINT;
  } else if (nusdcRatio > SKEW_THRESHOLD) {
    // Too much NUSDC, widen bid spread (buy less aggressively)
    const excessRatio = nusdcRatio - SKEW_THRESHOLD;
    bidAdjustment = excessRatio * 10 * ADJUSTMENT_PER_POINT;
  }

  return { bidAdjustment, askAdjustment };
}

// ========================================
// Order Validation
// ========================================

/**
 * Validate and filter orders against risk limits
 */
export function validateOrders(
  orders: OrderSpec[],
  config: LPConfig,
  midPrice: number,
): OrderSpec[] {
  const maxQuantity = quantityToRaw(config.maxOrderSizeNbtc);
  const minSpread = config.minSpreadBps / 10000;

  return orders.filter((order) => {
    // Check quantity limits
    if (order.quantity > maxQuantity) {
      return false;
    }

    // Check minimum spread
    const orderPrice = Number(order.price) / 1e6;
    const priceDiff = order.isBid
      ? (midPrice - orderPrice) / midPrice
      : (orderPrice - midPrice) / midPrice;

    if (priceDiff < minSpread) {
      return false;
    }

    return true;
  });
}
