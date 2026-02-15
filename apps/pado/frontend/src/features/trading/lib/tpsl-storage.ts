/**
 * TP/SL localStorage CRUD Operations
 *
 * Persists TP/SL orders to localStorage so they survive page refreshes.
 * Active orders are restored and monitoring resumes on page load.
 */

import type { TPSLOrder, TPSLStatus } from './tpsl-types';
import { MAX_TPSL_ORDERS, TPSL_HISTORY_MAX_AGE_MS } from './tpsl-types';

const STORAGE_KEY = 'pado:tpsl:orders';

/**
 * Read all TP/SL orders from localStorage
 */
export function getTPSLOrders(): TPSLOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o: unknown): o is TPSLOrder =>
        typeof o === 'object' && o !== null &&
        'id' in o && 'side' in o && 'quantity' in o &&
        'triggerPrice' in o && 'triggerType' in o && 'status' in o
    );
  } catch {
    return [];
  }
}

/**
 * Get only active TP/SL orders
 */
export function getActiveTPSLOrders(): TPSLOrder[] {
  return getTPSLOrders().filter((o) => o.status === 'active');
}

/**
 * Get active TP/SL orders filtered by market symbol.
 * Legacy orders without marketSymbol are included (backward-compatible fallback)
 * to prevent silently breaking existing users' active orders.
 */
export function getActiveTPSLOrdersByMarket(marketSymbol: string): TPSLOrder[] {
  return getTPSLOrders().filter(
    (o) => o.status === 'active' && (!o.marketSymbol || o.marketSymbol === marketSymbol)
  );
}

/**
 * Save orders to localStorage
 * @returns true if write succeeded
 */
function saveOrders(orders: TPSLOrder[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

/**
 * Add a new TP/SL order with input validation
 * @returns The created order, or null if validation fails or max limit reached
 */
export function addTPSLOrder(
  order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>
): TPSLOrder | null {
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) return null;
  // Trailing-stop orders don't use triggerPrice; they use trailAmount/trailPercent
  if (order.triggerType === 'trailing-stop') {
    const hasTrail = (order.trailAmount && Number.isFinite(order.trailAmount) && order.trailAmount > 0)
      || (order.trailPercent && Number.isFinite(order.trailPercent) && order.trailPercent > 0 && order.trailPercent < 100);
    if (!hasTrail) return null;
    if (!order.highWaterMark || !Number.isFinite(order.highWaterMark) || order.highWaterMark <= 0) return null;
  } else {
    if (!Number.isFinite(order.triggerPrice) || order.triggerPrice <= 0) return null;
  }
  // Stop-limit orders require a valid limitPrice
  if (order.triggerType === 'stop-limit') {
    if (!order.limitPrice || !Number.isFinite(order.limitPrice) || order.limitPrice <= 0) return null;
  }

  const orders = getTPSLOrders();
  const activeCount = orders.filter((o) => o.status === 'active').length;

  if (activeCount >= MAX_TPSL_ORDERS) {
    return null;
  }

  const newOrder: TPSLOrder = {
    ...order,
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: Date.now(),
  };

  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
}

const LOCK_TTL_MS = 30_000;

/**
 * Claim an order for execution with cross-tab safety.
 *
 * Uses a per-order lock key with a unique nonce to reduce the race window.
 * Flow: acquire lock → verify lock ownership → update order status.
 * The lock has a TTL to prevent deadlocks if a tab crashes mid-execution.
 *
 * @returns true if successfully claimed (this tab owns execution)
 */
export function claimTPSLOrder(id: string): boolean {
  const lockKey = `pado:tpsl:lock:${id}`;
  const nonce = crypto.randomUUID();
  const now = Date.now();

  try {
    // Check for existing fresh lock
    const existing = localStorage.getItem(lockKey);
    if (existing) {
      const parsed = JSON.parse(existing) as { v: string; at: number };
      if (now - parsed.at < LOCK_TTL_MS) return false;
    }

    // Set lock with our nonce
    localStorage.setItem(lockKey, JSON.stringify({ v: nonce, at: now }));

    // Verify we own the lock (narrows race window)
    const verify = localStorage.getItem(lockKey);
    if (!verify || (JSON.parse(verify) as { v: string }).v !== nonce) return false;

    // Lock acquired — update order status
    const orders = getTPSLOrders();
    const order = orders.find((o) => o.id === id);
    if (!order || order.status !== 'active') {
      localStorage.removeItem(lockKey);
      return false;
    }

    order.status = 'executing';
    const saved = saveOrders(orders);
    if (!saved) {
      localStorage.removeItem(lockKey);
      return false;
    }

    return true;
  } catch {
    try { localStorage.removeItem(lockKey); } catch { /* noop */ }
    return false;
  }
}

/**
 * Update a TP/SL order's status
 */
export function updateTPSLStatus(
  id: string,
  status: TPSLStatus,
  extra?: { triggeredAt?: number; error?: string; digest?: string }
): void {
  const orders = getTPSLOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return;

  orders[idx] = { ...orders[idx], status, ...extra };
  saveOrders(orders);
}

/**
 * Update highWaterMark for all active trailing-stop orders.
 * For sell trailing: hwm = max(hwm, currentPrice)
 * For buy trailing: hwm = min(hwm, currentPrice) [hwm tracks low-water-mark]
 * @returns true if any order was updated
 */
export function updateTrailingHighWaterMarks(currentPrice: number): boolean {
  if (currentPrice <= 0) return false;

  const orders = getTPSLOrders();
  let updated = false;

  for (const order of orders) {
    if (order.status !== 'active' || order.triggerType !== 'trailing-stop') continue;
    if (!order.highWaterMark) continue;

    if (order.side === 'sell') {
      if (currentPrice > order.highWaterMark) {
        order.highWaterMark = currentPrice;
        updated = true;
      }
    } else {
      if (currentPrice < order.highWaterMark) {
        order.highWaterMark = currentPrice;
        updated = true;
      }
    }
  }

  if (updated) saveOrders(orders);
  return updated;
}

/**
 * Cancel all active orders in an OCO group except the triggering order.
 * @returns number of orders cancelled
 */
export function cancelLinkedOrders(ocoGroupId: string, exceptId: string): number {
  if (!ocoGroupId) return 0;

  const orders = getTPSLOrders();
  let cancelled = 0;

  for (const order of orders) {
    if (order.ocoGroupId === ocoGroupId && order.id !== exceptId && order.status === 'active') {
      order.status = 'cancelled';
      cancelled++;
    }
  }

  if (cancelled > 0) saveOrders(orders);
  return cancelled;
}

/**
 * Remove a TP/SL order by ID
 */
export function removeTPSLOrder(id: string): void {
  const orders = getTPSLOrders().filter((o) => o.id !== id);
  saveOrders(orders);
}

/**
 * Cancel an active TP/SL order
 */
export function cancelTPSLOrder(id: string): void {
  updateTPSLStatus(id, 'cancelled');
}

/**
 * Remove all non-active orders (cleanup triggered/cancelled/failed history)
 */
export function clearTPSLHistory(): void {
  const orders = getTPSLOrders().filter((o) => o.status === 'active' || o.status === 'executing');
  saveOrders(orders);
}

/**
 * Remove all TP/SL orders
 */
export function clearAllTPSLOrders(): void {
  saveOrders([]);
}

/**
 * Auto-prune old history entries (> 7 days).
 * Call on app startup to prevent localStorage bloat.
 */
export function pruneTPSLHistory(): void {
  const orders = getTPSLOrders();
  const cutoff = Date.now() - TPSL_HISTORY_MAX_AGE_MS;
  const filtered = orders.filter(
    (o) => o.status === 'active' || o.status === 'executing' ||
      (o.triggeredAt ?? o.createdAt) > cutoff
  );
  if (filtered.length < orders.length) {
    saveOrders(filtered);
  }
}
