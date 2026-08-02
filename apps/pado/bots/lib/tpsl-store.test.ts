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

describe('TPSLStore.cancelLinkedOrders', () => {
  it('cancels the OCO sibling and leaves the filled leg alone', () => {
    const sl = store.create({ ...BASE_ORDER, ocoGroupId: 'g1' });
    const tp = store.create({ ...BASE_ORDER, triggerType: 'take_profit', triggerPrice: 70000, ocoGroupId: 'g1' });

    store.markFilled(sl.id, '0xdigest');
    const canceled = store.cancelLinkedOrders('g1', sl.id, BASE_ORDER.userAddress);

    expect(canceled).toEqual([tp.id]);
    expect(store.getById(tp.id)!.status).toBe('canceled');
    expect(store.getById(tp.id)!.error).toBe('OCO: linked order filled');
    expect(store.getById(sl.id)!.status).toBe('filled');
  });

  it('never touches another user orders sharing the same group id', () => {
    const mine = store.create({ ...BASE_ORDER, ocoGroupId: 'shared' });
    const theirs = store.create({ ...BASE_ORDER, userAddress: '0xvictim', ocoGroupId: 'shared' });

    const canceled = store.cancelLinkedOrders('shared', mine.id, BASE_ORDER.userAddress);

    expect(canceled).toEqual([]);
    expect(store.getById(theirs.id)!.status).toBe('active');
  });

  it('leaves unrelated groups and non-active orders alone', () => {
    const other = store.create({ ...BASE_ORDER, ocoGroupId: 'g2' });
    const ungrouped = store.create(BASE_ORDER);
    const sibling = store.create({ ...BASE_ORDER, ocoGroupId: 'g1' });
    const alreadyFailed = store.create({ ...BASE_ORDER, ocoGroupId: 'g1' });
    store.markFailed(alreadyFailed.id, 'permanent', true);

    const canceled = store.cancelLinkedOrders('g1', 'tpsl-filled-elsewhere', BASE_ORDER.userAddress);

    expect(canceled).toEqual([sibling.id]);
    expect(store.getById(other.id)!.status).toBe('active');
    expect(store.getById(ungrouped.id)!.status).toBe('active');
    expect(store.getById(alreadyFailed.id)!.status).toBe('failed');
  });

  it('is a no-op for orders with no group', () => {
    const solo = store.create(BASE_ORDER);
    expect(store.cancelLinkedOrders('', solo.id, BASE_ORDER.userAddress)).toEqual([]);
    expect(store.getById(solo.id)!.status).toBe('active');
  });

  it('persists cancellations across reload', () => {
    const sl = store.create({ ...BASE_ORDER, ocoGroupId: 'g1' });
    const tp = store.create({ ...BASE_ORDER, triggerType: 'take_profit', ocoGroupId: 'g1' });
    store.cancelLinkedOrders('g1', sl.id, BASE_ORDER.userAddress);

    const reopened = new TPSLStore(join(tmpDir, 'tpsl-orders.json'));
    expect(reopened.getById(tp.id)!.status).toBe('canceled');
    expect(reopened.getActive().map((o) => o.id)).toEqual([sl.id]);
  });
});
