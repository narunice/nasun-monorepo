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
  if (!Number.isFinite(order.triggerPrice) || order.triggerPrice <= 0) return null;
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) return null;
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

/**
 * Atomically claim an order for execution (cross-tab safety).
 * Sets status to 'executing' only if currently 'active'.
 * @returns true if successfully claimed (this tab owns execution)
 */
export function claimTPSLOrder(id: string): boolean {
  const orders = getTPSLOrders();
  const order = orders.find((o) => o.id === id);
  if (!order || order.status !== 'active') return false;

  order.status = 'executing';
  return saveOrders(orders);
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
