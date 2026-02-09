/**
 * TP/SL Trailing Stop Extended Tests
 * Covers: getTrailingStopPrice, shouldTriggerTrailingStop, edge cases, OCO logic
 */

import { describe, it, expect } from 'vitest';
import {
  getTrailingStopPrice,
  shouldTriggerTrailingStop,
  shouldTrigger,
} from './tpsl-types';
import type { TPSLOrder } from './tpsl-types';

// ========================================
// Helper
// ========================================
function makeTrailingOrder(overrides: Partial<TPSLOrder> = {}): TPSLOrder {
  return {
    id: 'trail-1',
    side: 'sell',
    quantity: 0.01,
    triggerPrice: 0, // not used for trailing
    triggerType: 'trailing-stop',
    status: 'active',
    createdAt: Date.now(),
    highWaterMark: 100000,
    trailAmount: 2000,
    ...overrides,
  };
}

// ========================================
// getTrailingStopPrice - Amount Based
// ========================================
describe('getTrailingStopPrice (amount-based)', () => {
  describe('sell side', () => {
    it('effectiveStop = HWM - trailAmount', () => {
      const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
      expect(getTrailingStopPrice(order)).toBe(98000);
    });

    it('updates with new HWM', () => {
      const order = makeTrailingOrder({ highWaterMark: 105000, trailAmount: 2000 });
      expect(getTrailingStopPrice(order)).toBe(103000);
    });

    it('small trail amount ($100)', () => {
      const order = makeTrailingOrder({ highWaterMark: 97000, trailAmount: 100 });
      expect(getTrailingStopPrice(order)).toBe(96900);
    });
  });

  describe('buy side', () => {
    it('effectiveStop = HWM + trailAmount (for buy trailing)', () => {
      const order = makeTrailingOrder({
        side: 'buy',
        highWaterMark: 90000, // low water mark for buy
        trailAmount: 1000,
      });
      expect(getTrailingStopPrice(order)).toBe(91000);
    });
  });
});

// ========================================
// getTrailingStopPrice - Percent Based
// ========================================
describe('getTrailingStopPrice (percent-based)', () => {
  describe('sell side', () => {
    it('effectiveStop = HWM * (1 - pct/100)', () => {
      const order = makeTrailingOrder({
        highWaterMark: 100000,
        trailPercent: 2,
        trailAmount: undefined,
      });
      expect(getTrailingStopPrice(order)).toBe(98000);
    });

    it('5% trail from $100k = $95k', () => {
      const order = makeTrailingOrder({
        highWaterMark: 100000,
        trailPercent: 5,
        trailAmount: undefined,
      });
      expect(getTrailingStopPrice(order)).toBe(95000);
    });

    it('0.5% trail', () => {
      const order = makeTrailingOrder({
        highWaterMark: 100000,
        trailPercent: 0.5,
        trailAmount: undefined,
      });
      expect(getTrailingStopPrice(order)).toBe(99500);
    });

    it('percent takes priority over amount when both set', () => {
      const order = makeTrailingOrder({
        highWaterMark: 100000,
        trailPercent: 3,
        trailAmount: 1000, // should be ignored
      });
      // percent: 100000 * 0.97 = 97000
      expect(getTrailingStopPrice(order)).toBe(97000);
    });
  });

  describe('buy side', () => {
    it('effectiveStop = HWM * (1 + pct/100)', () => {
      const order = makeTrailingOrder({
        side: 'buy',
        highWaterMark: 90000,
        trailPercent: 2,
        trailAmount: undefined,
      });
      expect(getTrailingStopPrice(order)).toBe(91800);
    });
  });
});

// ========================================
// getTrailingStopPrice - Edge Cases
// ========================================
describe('getTrailingStopPrice edge cases', () => {
  it('returns 0 when HWM is 0', () => {
    const order = makeTrailingOrder({ highWaterMark: 0 });
    expect(getTrailingStopPrice(order)).toBe(0);
  });

  it('returns 0 when HWM is undefined', () => {
    const order = makeTrailingOrder({ highWaterMark: undefined });
    expect(getTrailingStopPrice(order)).toBe(0);
  });

  it('returns 0 when HWM is negative', () => {
    const order = makeTrailingOrder({ highWaterMark: -100 });
    expect(getTrailingStopPrice(order)).toBe(0);
  });

  it('handles zero trail amount (effectiveStop = HWM)', () => {
    const order = makeTrailingOrder({
      highWaterMark: 100000,
      trailAmount: 0,
      trailPercent: undefined,
    });
    expect(getTrailingStopPrice(order)).toBe(100000);
  });

  it('handles undefined trail (falls to 0 trail)', () => {
    const order = makeTrailingOrder({
      highWaterMark: 100000,
      trailAmount: undefined,
      trailPercent: undefined,
    });
    expect(getTrailingStopPrice(order)).toBe(100000);
  });

  it('sell: trail larger than HWM gives negative stop', () => {
    const order = makeTrailingOrder({
      highWaterMark: 1000,
      trailAmount: 5000,
    });
    // 1000 - 5000 = -4000 (negative stop price)
    expect(getTrailingStopPrice(order)).toBe(-4000);
  });

  it('100% trail for sell gives stop = 0', () => {
    const order = makeTrailingOrder({
      highWaterMark: 100000,
      trailPercent: 100,
      trailAmount: undefined,
    });
    expect(getTrailingStopPrice(order)).toBe(0);
  });
});

// ========================================
// shouldTriggerTrailingStop
// ========================================
describe('shouldTriggerTrailingStop', () => {
  describe('sell trailing stop', () => {
    it('triggers when price drops below effective stop', () => {
      const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
      // effectiveStop = 98000
      expect(shouldTriggerTrailingStop(order, 97999)).toBe(true);
    });

    it('triggers at exact effective stop', () => {
      const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
      expect(shouldTriggerTrailingStop(order, 98000)).toBe(true);
    });

    it('does NOT trigger above effective stop', () => {
      const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
      expect(shouldTriggerTrailingStop(order, 98001)).toBe(false);
    });

    it('does NOT trigger when price rises (HWM should update externally)', () => {
      const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
      expect(shouldTriggerTrailingStop(order, 105000)).toBe(false);
    });
  });

  describe('buy trailing stop', () => {
    it('triggers when price rises above effective stop', () => {
      const order = makeTrailingOrder({
        side: 'buy',
        highWaterMark: 90000,
        trailAmount: 1000,
      });
      // effectiveStop = 91000
      expect(shouldTriggerTrailingStop(order, 91001)).toBe(true);
    });

    it('triggers at exact effective stop', () => {
      const order = makeTrailingOrder({
        side: 'buy',
        highWaterMark: 90000,
        trailAmount: 1000,
      });
      expect(shouldTriggerTrailingStop(order, 91000)).toBe(true);
    });

    it('does NOT trigger below effective stop', () => {
      const order = makeTrailingOrder({
        side: 'buy',
        highWaterMark: 90000,
        trailAmount: 1000,
      });
      expect(shouldTriggerTrailingStop(order, 90999)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('does not trigger when HWM is 0', () => {
      const order = makeTrailingOrder({ highWaterMark: 0, trailAmount: 2000 });
      // effectiveStop = 0 → returns false
      expect(shouldTriggerTrailingStop(order, 50000)).toBe(false);
    });

    it('does not trigger when effectiveStop is 0 (percent=100)', () => {
      const order = makeTrailingOrder({
        highWaterMark: 100000,
        trailPercent: 100,
        trailAmount: undefined,
      });
      // effectiveStop = 0
      expect(shouldTriggerTrailingStop(order, 0)).toBe(false);
    });
  });
});

// ========================================
// shouldTrigger - Trailing Stop Integration
// ========================================
describe('shouldTrigger with trailing-stop type', () => {
  it('only triggers for active orders', () => {
    const order = makeTrailingOrder({ status: 'triggered' });
    expect(shouldTrigger(order, 50000)).toBe(false);
  });

  it('returns false for zero current price', () => {
    const order = makeTrailingOrder();
    expect(shouldTrigger(order, 0)).toBe(false);
  });

  it('returns false for negative current price', () => {
    const order = makeTrailingOrder();
    expect(shouldTrigger(order, -100)).toBe(false);
  });

  it('correctly delegates sell trailing-stop', () => {
    const order = makeTrailingOrder({ highWaterMark: 100000, trailAmount: 2000 });
    expect(shouldTrigger(order, 97999)).toBe(true);
    expect(shouldTrigger(order, 98001)).toBe(false);
  });

  it('correctly delegates buy trailing-stop', () => {
    const order = makeTrailingOrder({
      side: 'buy',
      highWaterMark: 90000,
      trailAmount: 1000,
    });
    expect(shouldTrigger(order, 91001)).toBe(true);
    expect(shouldTrigger(order, 90999)).toBe(false);
  });
});

// ========================================
// OCO (One-Cancels-Other) Scenarios
// ========================================
describe('OCO Group Logic', () => {
  it('two orders can share an ocoGroupId', () => {
    const tp: TPSLOrder = {
      id: 'tp-1',
      side: 'sell',
      quantity: 0.01,
      triggerPrice: 110000,
      triggerType: 'tp',
      status: 'active',
      createdAt: Date.now(),
      ocoGroupId: 'oco-group-1',
    };
    const sl: TPSLOrder = {
      id: 'sl-1',
      side: 'sell',
      quantity: 0.01,
      triggerPrice: 90000,
      triggerType: 'sl',
      status: 'active',
      createdAt: Date.now(),
      ocoGroupId: 'oco-group-1',
    };

    // TP triggers at 110001
    expect(shouldTrigger(tp, 110001)).toBe(true);
    expect(shouldTrigger(sl, 110001)).toBe(false);

    // SL triggers at 89999
    expect(shouldTrigger(tp, 89999)).toBe(false);
    expect(shouldTrigger(sl, 89999)).toBe(true);
  });

  it('cancelled OCO partner does not trigger', () => {
    const sl: TPSLOrder = {
      id: 'sl-2',
      side: 'sell',
      quantity: 0.01,
      triggerPrice: 90000,
      triggerType: 'sl',
      status: 'cancelled', // cancelled by OCO partner triggering
      createdAt: Date.now(),
      ocoGroupId: 'oco-group-2',
    };
    expect(shouldTrigger(sl, 50000)).toBe(false);
  });
});

// ========================================
// Trailing Stop Simulation Scenarios
// ========================================
describe('Trailing Stop Price Movement Scenarios', () => {
  it('Scenario: BTC rises $100k→$105k→drops to $103k → triggers', () => {
    const order = makeTrailingOrder({
      side: 'sell',
      highWaterMark: 105000, // updated as price rose
      trailAmount: 2000,
    });
    // effectiveStop = 103000
    expect(shouldTriggerTrailingStop(order, 103000)).toBe(true);
    expect(shouldTriggerTrailingStop(order, 103001)).toBe(false);
  });

  it('Scenario: BTC rises $100k→$110k, trail 3% → stop at $106.7k', () => {
    const order = makeTrailingOrder({
      side: 'sell',
      highWaterMark: 110000,
      trailPercent: 3,
      trailAmount: undefined,
    });
    const stop = getTrailingStopPrice(order);
    expect(stop).toBeCloseTo(106700, 0);

    expect(shouldTriggerTrailingStop(order, 106700)).toBe(true);
    expect(shouldTriggerTrailingStop(order, 106701)).toBe(false);
  });

  it('Scenario: NASUN drops $0.10→$0.08, buy trailing $0.005 → triggers at $0.085', () => {
    const order = makeTrailingOrder({
      side: 'buy',
      highWaterMark: 0.08, // low water mark
      trailAmount: 0.005,
    });
    const stop = getTrailingStopPrice(order);
    expect(stop).toBeCloseTo(0.085, 4);

    expect(shouldTriggerTrailingStop(order, 0.085)).toBe(true);
    expect(shouldTriggerTrailingStop(order, 0.084)).toBe(false);
  });
});
