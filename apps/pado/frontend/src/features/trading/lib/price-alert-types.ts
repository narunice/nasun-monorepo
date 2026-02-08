/**
 * Price Alert Type Definitions
 *
 * Client-side price alerts that notify users when a target price is reached.
 * Unlike TP/SL, price alerts only send notifications — they do not execute orders.
 */

export type PriceAlertDirection = 'above' | 'below';
export type PriceAlertStatus = 'active' | 'triggered' | 'cancelled';

export interface PriceAlert {
  /** Unique identifier (crypto.randomUUID()) */
  id: string;
  /** Token symbol to monitor (e.g. 'NBTC') */
  symbol: string;
  /** Target price in USD */
  targetPrice: number;
  /** Trigger when price goes above or below target */
  direction: PriceAlertDirection;
  /** Current status */
  status: PriceAlertStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Trigger timestamp (set when alert fires) */
  triggeredAt?: number;
  /** Optional user note */
  note?: string;
}

/** Maximum active price alerts */
export const MAX_PRICE_ALERTS = 20;

/** Polling interval — reuses same interval as TP/SL */
export const PRICE_ALERT_POLL_INTERVAL_MS = 5_000;

/** Auto-prune history older than 3 days */
export const PRICE_ALERT_HISTORY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Check if a price alert should trigger.
 */
export function shouldTriggerAlert(
  alert: PriceAlert,
  currentPrice: number
): boolean {
  if (alert.status !== 'active') return false;
  if (currentPrice <= 0) return false;

  return alert.direction === 'above'
    ? currentPrice >= alert.targetPrice
    : currentPrice <= alert.targetPrice;
}
