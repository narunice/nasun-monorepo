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

  const skewAdjustment = calculateSkewAdjustment(midPrice, inventory);

  const orderQuantity = roundToLotSize(quantityToRaw(config.orderSize));

  if (orderQuantity <= 0n) {
    return orders;
  }

  const maxBidPrice = orderbook?.hasAsks && orderbook.bestAsk > 0
    ? orderbook.bestAsk * 0.9999
    : Infinity;
  const minAskPrice = orderbook?.hasBids && orderbook.bestBid > 0
    ? orderbook.bestBid * 1.0001
    : 0;

  // Generate bid orders
  for (let i = 0; i < config.orderLevels; i++) {
    const offset = baseSpread + i * levelSpacing + skewAdjustment.bidAdjustment;
    let bidPrice = midPrice * (1 - offset);

    if (bidPrice >= maxBidPrice) {
      bidPrice = maxBidPrice * (1 - i * levelSpacing);
    }

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
    let askPrice = midPrice * (1 + offset);

    if (askPrice <= minAskPrice) {
      askPrice = minAskPrice * (1 + i * levelSpacing);
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
  bidAdjustment: number;
  askAdjustment: number;
}

function calculateSkewAdjustment(midPrice: number, inventory: Inventory): SkewAdjustment {
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

  let bidAdjustment = 0;
  let askAdjustment = 0;

  if (baseRatio > SKEW_THRESHOLD) {
    // Too much base: tighten asks (sell more aggressively), widen bids (buy less)
    const excessRatio = baseRatio - SKEW_THRESHOLD;
    bidAdjustment = excessRatio * 10 * ADJUSTMENT_PER_POINT;
  } else if (quoteRatio > SKEW_THRESHOLD) {
    // Too much quote: tighten bids (buy more aggressively), widen asks (sell less)
    const excessRatio = quoteRatio - SKEW_THRESHOLD;
    askAdjustment = excessRatio * 10 * ADJUSTMENT_PER_POINT;
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
