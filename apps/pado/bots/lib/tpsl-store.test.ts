import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TPSLStore, MAX_TRANSIENT_FAILURES, type TPSLOrder } from './tpsl-store.js';

const BASE_ORDER: Omit<TPSLOrder, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
  userAddress: '0xuser',
  poolId: '0xpool',
  marketSymbol: 'NBTC/NUSDC',
  side: 'sell',
  triggerType: 'stop_loss',
  triggerPrice: 60000,
  quantity: 0.01,
  tradeCapId: '0xcap',
  balanceManagerId: '0xbm',
};

let tmpDir: string;
let store: TPSLStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tpsl-store-'));
  store = new TPSLStore(join(tmpDir, 'tpsl-orders.json'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('TPSLStore.markFailed', () => {
  it('returns promoted=false and keeps active on transient failure below ceiling', () => {
    const order = store.create(BASE_ORDER);
    const res = store.markFailed(order.id, 'transient rpc error', false);
    expect(res.promoted).toBe(false);

    const reloaded = store.getById(order.id)!;
    expect(reloaded.status).toBe('active');
    expect(reloaded.consecutiveFailures).toBe(1);
    expect(reloaded.lastFailureReason).toBe('transient rpc error');
    expect(reloaded.lastFailureAt).toBeGreaterThan(0);
  });

  it('promotes to failed when transient failures hit MAX_TRANSIENT_FAILURES', () => {
    const order = store.create(BASE_ORDER);
    for (let i = 0; i < MAX_TRANSIENT_FAILURES - 1; i++) {
      expect(store.markFailed(order.id, `err ${i}`, false).promoted).toBe(false);
    }
    expect(store.getById(order.id)!.status).toBe('active');

    const res = store.markFailed(order.id, 'final straw', false);
    expect(res.promoted).toBe(true);

    const reloaded = store.getById(order.id)!;
    expect(reloaded.status).toBe('failed');
    expect(reloaded.consecutiveFailures).toBe(MAX_TRANSIENT_FAILURES);
    expect(reloaded.lastFailureReason).toBe('final straw');
  });

  it('permanent=true short-circuits to failed without bumping the counter', () => {
    const order = store.create(BASE_ORDER);
    const res = store.markFailed(order.id, 'TradeCap revoked', true);
    expect(res.promoted).toBe(false);

    const reloaded = store.getById(order.id)!;
    expect(reloaded.status).toBe('failed');
    expect(reloaded.consecutiveFailures).toBeUndefined();
    expect(reloaded.lastFailureReason).toBe('TradeCap revoked');
  });

  it('markFilled resets the consecutive-failures counter', () => {
    const order = store.create(BASE_ORDER);
    store.markFailed(order.id, 'transient', false);
    store.markFailed(order.id, 'transient again', false);
    expect(store.getById(order.id)!.consecutiveFailures).toBe(2);

    // claim → fill (mirrors the keeper's success path)
    store.claim(order.id);
    store.markFilled(order.id, '0xdigest');
    expect(store.getById(order.id)!.consecutiveFailures).toBe(0);
  });

  it('returns promoted=false when order id is unknown', () => {
    expect(store.markFailed('tpsl-missing', 'noop', false).promoted).toBe(false);
    expect(store.markFailed('tpsl-missing', 'noop', true).promoted).toBe(false);
  });
});
