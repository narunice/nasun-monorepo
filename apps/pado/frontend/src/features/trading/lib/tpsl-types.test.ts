import { describe, it, expect } from 'vitest';
import {
  shouldTrigger,
  shouldTriggerTP,
  shouldTriggerSL,
  shouldTriggerStopLimit,
  MAX_TPSL_ORDERS,
  TPSL_POLL_INTERVAL_MS,
  TPSL_HISTORY_MAX_AGE_MS,
} from './tpsl-types';
import type { TPSLOrder } from './tpsl-types';

// ========================================
// Helper: create mock TPSLOrder
// ========================================
function makeOrder(overrides: Partial<TPSLOrder> = {}): TPSLOrder {
  return {
    id: 'test-1',
    side: 'sell',
    quantity: 0.01,
    triggerPrice: 100000,
    triggerType: 'tp',
    status: 'active',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ========================================
// Constants
// ========================================
describe('TP/SL Constants', () => {
  it('MAX_TPSL_ORDERS is 50', () => {
    expect(MAX_TPSL_ORDERS).toBe(50);
  });

  it('TPSL_POLL_INTERVAL_MS is 5 seconds', () => {
    expect(TPSL_POLL_INTERVAL_MS).toBe(5000);
  });

  it('TPSL_HISTORY_MAX_AGE_MS is 7 days', () => {
    expect(TPSL_HISTORY_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ========================================
// shouldTriggerTP
// ========================================
describe('shouldTriggerTP', () => {
  describe('sell side (closing long position)', () => {
    it('triggers when price >= triggerPrice', () => {
      expect(shouldTriggerTP(100001, 100000, 'sell')).toBe(true);
    });

    it('triggers when price == triggerPrice', () => {
      expect(shouldTriggerTP(100000, 100000, 'sell')).toBe(true);
    });

    it('does NOT trigger when price < triggerPrice', () => {
      expect(shouldTriggerTP(99999, 100000, 'sell')).toBe(false);
    });
  });

  describe('buy side (closing short position)', () => {
    it('triggers when price <= triggerPrice', () => {
      expect(shouldTriggerTP(99999, 100000, 'buy')).toBe(true);
    });

    it('triggers when price == triggerPrice', () => {
      expect(shouldTriggerTP(100000, 100000, 'buy')).toBe(true);
    });

    it('does NOT trigger when price > triggerPrice', () => {
      expect(shouldTriggerTP(100001, 100000, 'buy')).toBe(false);
    });
  });
});

// ========================================
// shouldTriggerSL
// ========================================
describe('shouldTriggerSL', () => {
  describe('sell side (closing long position)', () => {
    it('triggers when price <= triggerPrice', () => {
      expect(shouldTriggerSL(99999, 100000, 'sell')).toBe(true);
    });

    it('triggers when price == triggerPrice', () => {
      expect(shouldTriggerSL(100000, 100000, 'sell')).toBe(true);
    });

    it('does NOT trigger when price > triggerPrice', () => {
      expect(shouldTriggerSL(100001, 100000, 'sell')).toBe(false);
    });
  });

  describe('buy side (closing short position)', () => {
    it('triggers when price >= triggerPrice', () => {
      expect(shouldTriggerSL(100001, 100000, 'buy')).toBe(true);
    });

    it('triggers when price == triggerPrice', () => {
      expect(shouldTriggerSL(100000, 100000, 'buy')).toBe(true);
    });

    it('does NOT trigger when price > triggerPrice', () => {
      expect(shouldTriggerSL(99999, 100000, 'buy')).toBe(false);
    });
  });
});

// ========================================
// shouldTrigger (combined)
// ========================================
describe('shouldTrigger', () => {
  it('returns false for non-active orders', () => {
    expect(shouldTrigger(makeOrder({ status: 'triggered' }), 110000)).toBe(false);
    expect(shouldTrigger(makeOrder({ status: 'cancelled' }), 110000)).toBe(false);
    expect(shouldTrigger(makeOrder({ status: 'failed' }), 110000)).toBe(false);
    expect(shouldTrigger(makeOrder({ status: 'executing' }), 110000)).toBe(false);
  });

  it('returns false for zero or negative price', () => {
    expect(shouldTrigger(makeOrder(), 0)).toBe(false);
    expect(shouldTrigger(makeOrder(), -1)).toBe(false);
  });

  it('delegates TP sell correctly', () => {
    const order = makeOrder({ triggerType: 'tp', side: 'sell', triggerPrice: 100000 });
    expect(shouldTrigger(order, 100001)).toBe(true);
    expect(shouldTrigger(order, 99999)).toBe(false);
  });

  it('delegates TP buy correctly', () => {
    const order = makeOrder({ triggerType: 'tp', side: 'buy', triggerPrice: 100000 });
    expect(shouldTrigger(order, 99999)).toBe(true);
    expect(shouldTrigger(order, 100001)).toBe(false);
  });

  it('delegates SL sell correctly', () => {
    const order = makeOrder({ triggerType: 'sl', side: 'sell', triggerPrice: 90000 });
    expect(shouldTrigger(order, 89999)).toBe(true);
    expect(shouldTrigger(order, 90001)).toBe(false);
  });

  it('delegates SL buy correctly', () => {
    const order = makeOrder({ triggerType: 'sl', side: 'buy', triggerPrice: 110000 });
    expect(shouldTrigger(order, 110001)).toBe(true);
    expect(shouldTrigger(order, 109999)).toBe(false);
  });

  it('handles exact boundary prices (TP sell at exact triggerPrice)', () => {
    const order = makeOrder({ triggerType: 'tp', side: 'sell', triggerPrice: 50000 });
    expect(shouldTrigger(order, 50000)).toBe(true);
  });

  it('handles exact boundary prices (SL sell at exact triggerPrice)', () => {
    const order = makeOrder({ triggerType: 'sl', side: 'sell', triggerPrice: 40000 });
    expect(shouldTrigger(order, 40000)).toBe(true);
  });

  it('delegates stop-limit buy correctly (breakout)', () => {
    const order = makeOrder({ triggerType: 'stop-limit', side: 'buy', triggerPrice: 100000, limitPrice: 100100 });
    expect(shouldTrigger(order, 100001)).toBe(true);  // price above stop
    expect(shouldTrigger(order, 100000)).toBe(true);   // exact stop
    expect(shouldTrigger(order, 99999)).toBe(false);   // below stop
  });

  it('delegates stop-limit sell correctly (breakdown)', () => {
    const order = makeOrder({ triggerType: 'stop-limit', side: 'sell', triggerPrice: 90000, limitPrice: 89900 });
    expect(shouldTrigger(order, 89999)).toBe(true);   // price below stop
    expect(shouldTrigger(order, 90000)).toBe(true);    // exact stop
    expect(shouldTrigger(order, 90001)).toBe(false);   // above stop
  });
});

// ========================================
// shouldTriggerStopLimit
// ========================================
describe('shouldTriggerStopLimit', () => {
  describe('buy side (breakout buy)', () => {
    it('triggers when price >= stopPrice', () => {
      expect(shouldTriggerStopLimit(100001, 100000, 'buy')).toBe(true);
    });

    it('triggers when price == stopPrice', () => {
      expect(shouldTriggerStopLimit(100000, 100000, 'buy')).toBe(true);
    });

    it('does NOT trigger when price < stopPrice', () => {
      expect(shouldTriggerStopLimit(99999, 100000, 'buy')).toBe(false);
    });
  });

  describe('sell side (breakdown sell)', () => {
    it('triggers when price <= stopPrice', () => {
      expect(shouldTriggerStopLimit(89999, 90000, 'sell')).toBe(true);
    });

    it('triggers when price == stopPrice', () => {
      expect(shouldTriggerStopLimit(90000, 90000, 'sell')).toBe(true);
    });

    it('does NOT trigger when price > stopPrice', () => {
      expect(shouldTriggerStopLimit(90001, 90000, 'sell')).toBe(false);
    });
  });
});
