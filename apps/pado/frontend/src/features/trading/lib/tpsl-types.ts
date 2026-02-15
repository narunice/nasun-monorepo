/**
 * TP/SL (Take Profit / Stop Loss) Type Definitions
 *
 * Client-side conditional order types for browser-based price monitoring.
 * DeepBook V3 spot does not support on-chain conditional orders,
 * so TP/SL is implemented via client-side oracle polling + market order execution.
 */

export type TPSLTriggerType = 'tp' | 'sl' | 'stop-limit' | 'trailing-stop';
export type TPSLStatus = 'active' | 'executing' | 'triggered' | 'cancelled' | 'failed';

export interface TPSLOrder {
  /** Unique identifier (crypto.randomUUID()) */
  id: string;
  /** Linked open order ID (optional, for order-attached TP/SL) */
  orderId?: string;
  /** Execution side when triggered */
  side: 'buy' | 'sell';
  /** BTC quantity to execute */
  quantity: number;
  /** USD trigger price */
  triggerPrice: number;
  /** Take profit or stop loss */
  triggerType: TPSLTriggerType;
  /** Limit price for stop-limit orders (places limit order instead of market) */
  limitPrice?: number;
  /** Trail amount in USD (for trailing-stop) */
  trailAmount?: number;
  /** Trail percentage (for trailing-stop, 0-100) */
  trailPercent?: number;
  /** High water mark for trailing-stop (auto-updated during monitoring) */
  highWaterMark?: number;
  /** Current status */
  status: TPSLStatus;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Trigger execution timestamp (ms) */
  triggeredAt?: number;
  /** Error message if failed */
  error?: string;
  /** Transaction digest if executed */
  digest?: string;
  /** OCO group ID — when one order in the group triggers, all others are cancelled */
  ocoGroupId?: string;
  /** Market symbol this order belongs to (e.g. 'NBTC'). Optional for backward compat. */
  marketSymbol?: string;
}

/** Maximum active TP/SL orders per user */
export const MAX_TPSL_ORDERS = 50;

/** Polling interval for price monitoring (ms) */
export const TPSL_POLL_INTERVAL_MS = 5_000;

/** Maximum age for TP/SL history entries before auto-pruning (7 days) */
export const TPSL_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check if a TP order should trigger.
 * TP for a sell (closing long): triggers when price >= triggerPrice
 * TP for a buy (closing short): triggers when price <= triggerPrice
 */
export function shouldTriggerTP(currentPrice: number, triggerPrice: number, side: 'buy' | 'sell'): boolean {
  return side === 'sell'
    ? currentPrice >= triggerPrice
    : currentPrice <= triggerPrice;
}

/**
 * Check if an SL order should trigger.
 * SL for a sell (closing long): triggers when price <= triggerPrice
 * SL for a buy (closing short): triggers when price >= triggerPrice
 */
export function shouldTriggerSL(currentPrice: number, triggerPrice: number, side: 'buy' | 'sell'): boolean {
  return side === 'sell'
    ? currentPrice <= triggerPrice
    : currentPrice >= triggerPrice;
}

/**
 * Check if a stop-limit order should trigger.
 * Buy stop-limit: triggers when price >= stopPrice (breakout buy)
 * Sell stop-limit: triggers when price <= stopPrice (breakdown sell)
 */
export function shouldTriggerStopLimit(currentPrice: number, triggerPrice: number, side: 'buy' | 'sell'): boolean {
  return side === 'buy'
    ? currentPrice >= triggerPrice
    : currentPrice <= triggerPrice;
}

/**
 * Calculate the effective stop price for a trailing-stop order.
 * For sell: effectiveStop = highWaterMark - trailAmount (or * (1 - trailPercent/100))
 * For buy: effectiveStop = lowWaterMark + trailAmount (or * (1 + trailPercent/100))
 */
export function getTrailingStopPrice(order: TPSLOrder): number {
  const hwm = order.highWaterMark ?? 0;
  if (hwm <= 0) return 0;

  if (order.trailPercent && order.trailPercent > 0) {
    return order.side === 'sell'
      ? hwm * (1 - order.trailPercent / 100)
      : hwm * (1 + order.trailPercent / 100);
  }

  const trail = order.trailAmount ?? 0;
  return order.side === 'sell'
    ? hwm - trail
    : hwm + trail;
}

/**
 * Check if a trailing-stop should trigger.
 * Sell trailing: trigger when currentPrice <= effectiveStop
 * Buy trailing: trigger when currentPrice >= effectiveStop
 */
export function shouldTriggerTrailingStop(order: TPSLOrder, currentPrice: number): boolean {
  const effectiveStop = getTrailingStopPrice(order);
  if (effectiveStop <= 0) return false;

  return order.side === 'sell'
    ? currentPrice <= effectiveStop
    : currentPrice >= effectiveStop;
}

/**
 * Check if a TP/SL order should trigger at the current price.
 */
export function shouldTrigger(order: TPSLOrder, currentPrice: number): boolean {
  if (order.status !== 'active') return false;
  if (currentPrice <= 0) return false;

  if (order.triggerType === 'stop-limit') {
    return shouldTriggerStopLimit(currentPrice, order.triggerPrice, order.side);
  }

  if (order.triggerType === 'trailing-stop') {
    return shouldTriggerTrailingStop(order, currentPrice);
  }

  return order.triggerType === 'tp'
    ? shouldTriggerTP(currentPrice, order.triggerPrice, order.side)
    : shouldTriggerSL(currentPrice, order.triggerPrice, order.side);
}
