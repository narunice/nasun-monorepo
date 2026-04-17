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
  rawToPrice,
  roundToTickSize,
  roundToLotSize,
} from './config.js';
import type { OrderbookState } from './orderbook.js';

// ========================================
// Strategy: Grid Order Generation
// ========================================

export function calculateOrders(
  midPrice: number,
  config: LPConfig,
  inventory: Inventory,
  orderbook?: OrderbookState,
): OrderSpec[] {
  const orders: OrderSpec[] = [];

  const baseSpread = config.spreadBps / 10000;
  const levelSpacing = config.levelSpacingBps / 10000;

  const skewAdjustment = calculateSkewAdjustment(midPrice, inventory, config.spreadBps);

  const orderQuantity = roundToLotSize(quantityToRaw(config.orderSize));

  if (orderQuantity <= 0n) {
    return orders;
  }

  // Clamp orderbook-derived constraints to within MAX_CONSTRAINT_BPS of the
  // current market price. Anomalous stale orders (e.g. bids at $400k when
  // BTC is $75k) must not push the bot's own pricing into nonsensical ranges.
  const MAX_CONSTRAINT_BPS = 300; // 3% max allowed deviation from mid

  const rawMaxBidPrice = orderbook?.hasAsks && orderbook.bestAsk > 0
    ? orderbook.bestAsk * 0.9999
    : Infinity;
  const maxBidPrice = Math.min(rawMaxBidPrice, midPrice * (1 + MAX_CONSTRAINT_BPS / 10000));

  const rawMinAskPrice = orderbook?.hasBids && orderbook.bestBid > 0
    ? orderbook.bestBid * 1.0001
    : 0;
  const minAskPrice = rawMinAskPrice > midPrice * (1 + MAX_CONSTRAINT_BPS / 10000)
    ? 0  // ignore anomalous stale bid
    : rawMinAskPrice;

  // Generate bid orders
  for (let i = 0; i < config.orderLevels; i++) {
    const offset = baseSpread + i * levelSpacing + skewAdjustment.bidAdjustment;
    const bidPrice = midPrice * (1 - offset);

    // Skip levels that would cross the best ask (POST_ONLY would reject them).
    // Do not cascade the constraint — only skip the offending level; place all
    // remaining levels at their natural grid positions.
    if (bidPrice >= maxBidPrice) continue;
    if (bidPrice <= 0) continue;

    const bidPriceRaw = roundToTickSize(priceToRaw(bidPrice));

    orders.push({
      price: bidPriceRaw,
      quantity: orderQuantity,
      isBid: true,
    });
  }

  // Generate ask orders
  for (let i = 0; i < config.orderLevels; i++) {
    const offset = baseSpread + i * levelSpacing + skewAdjustment.askAdjustment;
    const askPrice = midPrice * (1 + offset);

    // Skip levels that would cross the best bid (POST_ONLY would reject them).
    // Do not cascade the constraint — only skip the offending level; place all
    // remaining levels at their natural grid positions.
    if (minAskPrice > 0 && askPrice <= minAskPrice) continue;

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
  bidAdjustment: number;
  askAdjustment: number;
}

function calculateSkewAdjustment(midPrice: number, inventory: Inventory, spreadBps: number): SkewAdjustment {
  const baseValue = inventory.base * midPrice;
  const quoteValue = inventory.quote;
  const totalValue = baseValue + quoteValue;

  if (totalValue <= 0) {
    return { bidAdjustment: 0, askAdjustment: 0 };
  }

  const baseRatio = baseValue / totalValue;
  const quoteRatio = quoteValue / totalValue;

  const SKEW_THRESHOLD = 0.6;
  const ADJUSTMENT_PER_POINT = 0.001;
  // Cap skew adjustment to 30% of spreadBps to prevent extreme ask/bid widening.
  // Without this cap, a 99% quote imbalance produces a 39bps adjustment on a 30bps
  // spread, pushing asks to 69bps above market and breaking price discovery.
  const maxSkewAdjustment = (spreadBps / 10000) * 0.3;

  let bidAdjustment = 0;
  let askAdjustment = 0;

  if (baseRatio > SKEW_THRESHOLD) {
    // Too much base: tighten asks (sell more aggressively), widen bids (buy less)
    const excessRatio = baseRatio - SKEW_THRESHOLD;
    bidAdjustment = Math.min(excessRatio * 10 * ADJUSTMENT_PER_POINT, maxSkewAdjustment);
  } else if (quoteRatio > SKEW_THRESHOLD) {
    // Too much quote: tighten bids (buy more aggressively), widen asks (sell less)
    const excessRatio = quoteRatio - SKEW_THRESHOLD;
    askAdjustment = Math.min(excessRatio * 10 * ADJUSTMENT_PER_POINT, maxSkewAdjustment);
  }

  return { bidAdjustment, askAdjustment };
}

// ========================================
// Order Validation
// ========================================

export function validateOrders(
  orders: OrderSpec[],
  config: LPConfig,
  midPrice: number,
): OrderSpec[] {
  const maxQuantity = quantityToRaw(config.maxOrderSize);
  const minSpread = config.minSpreadBps / 10000;

  return orders.filter((order) => {
    if (order.quantity > maxQuantity) {
      return false;
    }

    const orderPrice = rawToPrice(order.price);
    const priceDiff = order.isBid
      ? (midPrice - orderPrice) / midPrice
      : (orderPrice - midPrice) / midPrice;

    if (priceDiff < minSpread) {
      return false;
    }

    return true;
  });
}
