/**
 * Price Alert Storage — localStorage persistence
 *
 * Same pattern as tpsl-storage.ts but for notification-only alerts.
 */

import type { PriceAlert, PriceAlertStatus } from './price-alert-types';
import {
  MAX_PRICE_ALERTS,
  PRICE_ALERT_HISTORY_MAX_AGE_MS,
} from './price-alert-types';

const STORAGE_KEY = 'pado:price:alerts';
const ALLOWED_SYMBOLS = ['NBTC', 'NSN', 'NUSDC'];
const MAX_ALERT_PRICE = 10_000_000;

function saveAlerts(alerts: PriceAlert[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    return true;
  } catch {
    return false;
  }
}

export function getPriceAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o: unknown): o is PriceAlert =>
        typeof o === 'object' && o !== null &&
        'id' in o && 'symbol' in o && 'targetPrice' in o &&
        'direction' in o && 'status' in o && 'createdAt' in o
    );
  } catch {
    return [];
  }
}

export function getActivePriceAlerts(): PriceAlert[] {
  return getPriceAlerts().filter((a) => a.status === 'active');
}

export function addPriceAlert(
  alert: Omit<PriceAlert, 'id' | 'status' | 'createdAt'>
): PriceAlert | null {
  // Validate inputs
  if (
    !alert.symbol ||
    !ALLOWED_SYMBOLS.includes(alert.symbol) ||
    !Number.isFinite(alert.targetPrice) ||
    alert.targetPrice <= 0 ||
    alert.targetPrice > MAX_ALERT_PRICE ||
    !['above', 'below'].includes(alert.direction)
  ) {
    return null;
  }

  const alerts = getPriceAlerts();
  const activeCount = alerts.filter((a) => a.status === 'active').length;
  if (activeCount >= MAX_PRICE_ALERTS) return null;

  const newAlert: PriceAlert = {
    ...alert,
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: Date.now(),
  };

  alerts.push(newAlert);
  saveAlerts(alerts);
  return newAlert;
}

export function updatePriceAlertStatus(
  id: string,
  status: PriceAlertStatus,
  meta?: { triggeredAt?: number }
): void {
  const alerts = getPriceAlerts();
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return;

  alert.status = status;
  if (meta?.triggeredAt) alert.triggeredAt = meta.triggeredAt;

  saveAlerts(alerts);
}

export function cancelPriceAlert(id: string): void {
  updatePriceAlertStatus(id, 'cancelled');
}

export function removePriceAlert(id: string): void {
  const alerts = getPriceAlerts().filter((a) => a.id !== id);
  saveAlerts(alerts);
}

export function clearPriceAlertHistory(): void {
  const alerts = getPriceAlerts().filter((a) => a.status === 'active');
  saveAlerts(alerts);
}

export function prunePriceAlertHistory(): void {
  const now = Date.now();
  const alerts = getPriceAlerts().filter(
    (a) =>
      a.status === 'active' ||
      (a.triggeredAt && now - a.triggeredAt < PRICE_ALERT_HISTORY_MAX_AGE_MS) ||
      now - a.createdAt < PRICE_ALERT_HISTORY_MAX_AGE_MS
  );
  saveAlerts(alerts);
}
