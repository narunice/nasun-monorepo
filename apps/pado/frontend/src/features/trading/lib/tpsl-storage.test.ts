import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTPSLOrders,
  getActiveTPSLOrders,
  addTPSLOrder,
  claimTPSLOrder,
  updateTPSLStatus,
  removeTPSLOrder,
  cancelTPSLOrder,
  clearTPSLHistory,
  clearAllTPSLOrders,
  pruneTPSLHistory,
} from './tpsl-storage';
import type { TPSLOrder } from './tpsl-types';

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter++;
    return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}`;
  });
});

// ========================================
// getTPSLOrders
// ========================================
describe('getTPSLOrders', () => {
  it('returns empty array when no orders in localStorage', () => {
    expect(getTPSLOrders()).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem('pado:tpsl:orders', 'not-json');
    expect(getTPSLOrders()).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    localStorage.setItem('pado:tpsl:orders', '{"key":"value"}');
    expect(getTPSLOrders()).toEqual([]);
  });

  it('filters out malformed entries', () => {
    const orders = [
      { id: 'valid', side: 'buy', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'active' },
      { id: 'missing-side' },
      null,
      'string-entry',
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));
    const result = getTPSLOrders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('valid');
  });

  it('preserves valid orders from localStorage', () => {
    const orders: TPSLOrder[] = [
      { id: 'a', side: 'sell', quantity: 0.5, triggerPrice: 100000, triggerType: 'tp', status: 'active', createdAt: 1000 },
      { id: 'b', side: 'buy', quantity: 1.0, triggerPrice: 90000, triggerType: 'sl', status: 'triggered', createdAt: 2000 },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));
    expect(getTPSLOrders()).toEqual(orders);
  });
});

// ========================================
// getActiveTPSLOrders
// ========================================
describe('getActiveTPSLOrders', () => {
  it('returns only active orders', () => {
    const orders: TPSLOrder[] = [
      { id: 'a', side: 'sell', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'active', createdAt: 1000 },
      { id: 'b', side: 'sell', quantity: 1, triggerPrice: 90, triggerType: 'sl', status: 'triggered', createdAt: 2000 },
      { id: 'c', side: 'buy', quantity: 1, triggerPrice: 110, triggerType: 'tp', status: 'active', createdAt: 3000 },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));
    const active = getActiveTPSLOrders();
    expect(active).toHaveLength(2);
    expect(active.map(o => o.id)).toEqual(['a', 'c']);
  });
});

// ========================================
// addTPSLOrder
// ========================================
describe('addTPSLOrder', () => {
  it('creates new order with generated ID, active status, and timestamp', () => {
    const order = addTPSLOrder({
      side: 'sell',
      quantity: 0.5,
      triggerPrice: 100000,
      triggerType: 'tp',
    });

    expect(order).not.toBeNull();
    expect(order!.id).toMatch(/^00000000-/);
    expect(order!.status).toBe('active');
    expect(order!.createdAt).toBeGreaterThan(0);
    expect(order!.side).toBe('sell');
    expect(order!.quantity).toBe(0.5);
    expect(order!.triggerPrice).toBe(100000);
  });

  it('persists order to localStorage', () => {
    addTPSLOrder({ side: 'buy', quantity: 1, triggerPrice: 50000, triggerType: 'sl' });
    const stored = getTPSLOrders();
    expect(stored).toHaveLength(1);
  });

  it('rejects zero or negative triggerPrice', () => {
    expect(addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 0, triggerType: 'tp' })).toBeNull();
    expect(addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: -100, triggerType: 'tp' })).toBeNull();
  });

  it('rejects zero or negative quantity', () => {
    expect(addTPSLOrder({ side: 'sell', quantity: 0, triggerPrice: 100, triggerType: 'tp' })).toBeNull();
    expect(addTPSLOrder({ side: 'sell', quantity: -1, triggerPrice: 100, triggerType: 'tp' })).toBeNull();
  });

  it('rejects NaN and Infinity', () => {
    expect(addTPSLOrder({ side: 'sell', quantity: NaN, triggerPrice: 100, triggerType: 'tp' })).toBeNull();
    expect(addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: Infinity, triggerType: 'tp' })).toBeNull();
  });

  it('enforces MAX_TPSL_ORDERS limit (50)', () => {
    // Seed with 50 active orders
    const orders: TPSLOrder[] = Array.from({ length: 50 }, (_, i) => ({
      id: `order-${i}`,
      side: 'sell' as const,
      quantity: 0.01,
      triggerPrice: 100000 + i,
      triggerType: 'tp' as const,
      status: 'active' as const,
      createdAt: Date.now(),
    }));
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));

    const result = addTPSLOrder({ side: 'buy', quantity: 1, triggerPrice: 50000, triggerType: 'sl' });
    expect(result).toBeNull();
  });

  it('allows adding when non-active orders exist up to limit', () => {
    const orders: TPSLOrder[] = [
      { id: 'done', side: 'sell', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'triggered', createdAt: 1000 },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));

    const result = addTPSLOrder({ side: 'buy', quantity: 1, triggerPrice: 50000, triggerType: 'sl' });
    expect(result).not.toBeNull();
    expect(getTPSLOrders()).toHaveLength(2);
  });

  it('creates stop-limit order with valid limitPrice', () => {
    const order = addTPSLOrder({
      side: 'buy',
      quantity: 0.5,
      triggerPrice: 100000,
      triggerType: 'stop-limit',
      limitPrice: 100100,
    });
    expect(order).not.toBeNull();
    expect(order!.triggerType).toBe('stop-limit');
    expect(order!.limitPrice).toBe(100100);
  });

  it('rejects stop-limit order with missing limitPrice', () => {
    expect(addTPSLOrder({
      side: 'buy', quantity: 0.5, triggerPrice: 100000, triggerType: 'stop-limit',
    })).toBeNull();
  });

  it('rejects stop-limit order with zero limitPrice', () => {
    expect(addTPSLOrder({
      side: 'buy', quantity: 0.5, triggerPrice: 100000, triggerType: 'stop-limit', limitPrice: 0,
    })).toBeNull();
  });

  it('rejects stop-limit order with negative limitPrice', () => {
    expect(addTPSLOrder({
      side: 'sell', quantity: 0.5, triggerPrice: 90000, triggerType: 'stop-limit', limitPrice: -100,
    })).toBeNull();
  });

  it('rejects stop-limit order with NaN limitPrice', () => {
    expect(addTPSLOrder({
      side: 'buy', quantity: 0.5, triggerPrice: 100000, triggerType: 'stop-limit', limitPrice: NaN,
    })).toBeNull();
  });
});

// ========================================
// claimTPSLOrder
// ========================================
describe('claimTPSLOrder', () => {
  it('sets active order to executing and returns true', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const orders = getTPSLOrders();
    const id = orders[0].id;

    const claimed = claimTPSLOrder(id);
    expect(claimed).toBe(true);
    expect(getTPSLOrders()[0].status).toBe('executing');
  });

  it('returns false for non-existent order', () => {
    expect(claimTPSLOrder('non-existent')).toBe(false);
  });

  it('returns false for already executing order (cross-tab safety)', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const id = getTPSLOrders()[0].id;

    claimTPSLOrder(id); // First claim succeeds
    expect(claimTPSLOrder(id)).toBe(false); // Second claim fails
  });

  it('returns false for triggered/cancelled/failed orders', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const id = getTPSLOrders()[0].id;
    updateTPSLStatus(id, 'triggered');

    expect(claimTPSLOrder(id)).toBe(false);
  });
});

// ========================================
// updateTPSLStatus
// ========================================
describe('updateTPSLStatus', () => {
  it('updates status of existing order', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const id = getTPSLOrders()[0].id;

    updateTPSLStatus(id, 'triggered', { triggeredAt: 12345, digest: 'tx-abc' });
    const updated = getTPSLOrders()[0];
    expect(updated.status).toBe('triggered');
    expect(updated.triggeredAt).toBe(12345);
    expect(updated.digest).toBe('tx-abc');
  });

  it('no-op for non-existent order', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    updateTPSLStatus('non-existent', 'failed');
    expect(getTPSLOrders()[0].status).toBe('active');
  });

  it('stores error message on failure', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const id = getTPSLOrders()[0].id;

    updateTPSLStatus(id, 'failed', { error: 'Insufficient gas' });
    expect(getTPSLOrders()[0].error).toBe('Insufficient gas');
  });
});

// ========================================
// removeTPSLOrder / cancelTPSLOrder
// ========================================
describe('removeTPSLOrder', () => {
  it('removes order by ID', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    addTPSLOrder({ side: 'buy', quantity: 2, triggerPrice: 50000, triggerType: 'sl' });
    const orders = getTPSLOrders();
    expect(orders).toHaveLength(2);

    removeTPSLOrder(orders[0].id);
    expect(getTPSLOrders()).toHaveLength(1);
    expect(getTPSLOrders()[0].id).toBe(orders[1].id);
  });
});

describe('cancelTPSLOrder', () => {
  it('sets order status to cancelled', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    const id = getTPSLOrders()[0].id;

    cancelTPSLOrder(id);
    expect(getTPSLOrders()[0].status).toBe('cancelled');
  });
});

// ========================================
// clearTPSLHistory / clearAllTPSLOrders
// ========================================
describe('clearTPSLHistory', () => {
  it('removes triggered/cancelled/failed orders, keeps active and executing', () => {
    const orders: TPSLOrder[] = [
      { id: 'a', side: 'sell', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'active', createdAt: 1000 },
      { id: 'b', side: 'sell', quantity: 1, triggerPrice: 90, triggerType: 'sl', status: 'triggered', createdAt: 2000 },
      { id: 'c', side: 'buy', quantity: 1, triggerPrice: 110, triggerType: 'tp', status: 'executing', createdAt: 3000 },
      { id: 'd', side: 'buy', quantity: 1, triggerPrice: 80, triggerType: 'sl', status: 'cancelled', createdAt: 4000 },
      { id: 'e', side: 'sell', quantity: 1, triggerPrice: 120, triggerType: 'tp', status: 'failed', createdAt: 5000 },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));

    clearTPSLHistory();
    const remaining = getTPSLOrders();
    expect(remaining).toHaveLength(2);
    expect(remaining.map(o => o.id)).toEqual(['a', 'c']);
  });
});

describe('clearAllTPSLOrders', () => {
  it('removes all orders', () => {
    addTPSLOrder({ side: 'sell', quantity: 1, triggerPrice: 100000, triggerType: 'tp' });
    addTPSLOrder({ side: 'buy', quantity: 1, triggerPrice: 50000, triggerType: 'sl' });
    expect(getTPSLOrders()).toHaveLength(2);

    clearAllTPSLOrders();
    expect(getTPSLOrders()).toEqual([]);
  });
});

// ========================================
// pruneTPSLHistory
// ========================================
describe('pruneTPSLHistory', () => {
  it('removes old triggered orders (> 7 days)', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const orders: TPSLOrder[] = [
      { id: 'old', side: 'sell', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'triggered', createdAt: eightDaysAgo, triggeredAt: eightDaysAgo },
      { id: 'recent', side: 'sell', quantity: 1, triggerPrice: 90, triggerType: 'sl', status: 'triggered', createdAt: oneDayAgo, triggeredAt: oneDayAgo },
      { id: 'active', side: 'buy', quantity: 1, triggerPrice: 110, triggerType: 'tp', status: 'active', createdAt: eightDaysAgo },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));

    pruneTPSLHistory();
    const remaining = getTPSLOrders();
    expect(remaining).toHaveLength(2);
    expect(remaining.map(o => o.id)).toEqual(['recent', 'active']);
  });

  it('preserves active and executing orders regardless of age', () => {
    const oldDate = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const orders: TPSLOrder[] = [
      { id: 'active-old', side: 'sell', quantity: 1, triggerPrice: 100, triggerType: 'tp', status: 'active', createdAt: oldDate },
      { id: 'exec-old', side: 'buy', quantity: 1, triggerPrice: 90, triggerType: 'sl', status: 'executing', createdAt: oldDate },
    ];
    localStorage.setItem('pado:tpsl:orders', JSON.stringify(orders));

    pruneTPSLHistory();
    expect(getTPSLOrders()).toHaveLength(2);
  });
});
