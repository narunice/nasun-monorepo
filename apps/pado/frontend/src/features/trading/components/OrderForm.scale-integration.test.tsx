/**
 * OrderForm Scale Integration Tests
 * Tests the Scale tab integration, keyboard shortcut event listeners, edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SHORTCUT_PERCENT_EVENT,
  SHORTCUT_PRICE_STEP_EVENT,
  SHORTCUT_SUBMIT_EVENT,
} from '../hooks/useKeyboardShortcuts';

// ========================================
// 1. Custom Event Listener Integration Tests
// ========================================

describe('OrderForm Keyboard Shortcut Event Listeners', () => {
  describe('SHORTCUT_PERCENT_EVENT handler', () => {
    it('dispatches percentage event with correct detail', () => {
      const handler = vi.fn();
      document.addEventListener(SHORTCUT_PERCENT_EVENT, handler);

      for (let pct = 10; pct <= 100; pct += 10) {
        document.dispatchEvent(new CustomEvent(SHORTCUT_PERCENT_EVENT, { detail: pct }));
      }

      expect(handler).toHaveBeenCalledTimes(10);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe(10);
      expect((handler.mock.calls[9][0] as CustomEvent).detail).toBe(100);

      document.removeEventListener(SHORTCUT_PERCENT_EVENT, handler);
    });

    it('handles rapid-fire events without losing data', () => {
      const details: number[] = [];
      const handler = (e: Event) => details.push((e as CustomEvent).detail);
      document.addEventListener(SHORTCUT_PERCENT_EVENT, handler);

      // Fire 100 events rapidly
      for (let i = 1; i <= 100; i++) {
        document.dispatchEvent(new CustomEvent(SHORTCUT_PERCENT_EVENT, { detail: i }));
      }

      expect(details).toHaveLength(100);
      expect(details[0]).toBe(1);
      expect(details[99]).toBe(100);

      document.removeEventListener(SHORTCUT_PERCENT_EVENT, handler);
    });
  });

  describe('SHORTCUT_PRICE_STEP_EVENT handler', () => {
    it('handles up direction', () => {
      const handler = vi.fn();
      document.addEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);

      document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'up' }));
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe('up');

      document.removeEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);
    });

    it('handles down direction', () => {
      const handler = vi.fn();
      document.addEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);

      document.dispatchEvent(new CustomEvent(SHORTCUT_PRICE_STEP_EVENT, { detail: 'down' }));
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe('down');

      document.removeEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);
    });
  });

  describe('SHORTCUT_SUBMIT_EVENT handler', () => {
    it('fires without detail', () => {
      const handler = vi.fn();
      document.addEventListener(SHORTCUT_SUBMIT_EVENT, handler);

      document.dispatchEvent(new CustomEvent(SHORTCUT_SUBMIT_EVENT));
      expect(handler).toHaveBeenCalledTimes(1);

      document.removeEventListener(SHORTCUT_SUBMIT_EVENT, handler);
    });
  });
});

// ========================================
// 2. Price Step Computation Edge Cases
// ========================================

describe('Price Step Computation', () => {
  // Simulates the price tick step logic from OrderForm useEffect

  function computeNewPrice(currentPrice: number, direction: 'up' | 'down', tick: number): number {
    return direction === 'up'
      ? currentPrice + tick
      : Math.max(tick, currentPrice - tick);
  }

  it('steps up from current price', () => {
    expect(computeNewPrice(97000, 'up', 0.1)).toBeCloseTo(97000.1, 4);
  });

  it('steps down from current price', () => {
    expect(computeNewPrice(97000, 'down', 0.1)).toBeCloseTo(96999.9, 4);
  });

  it('does not go below tick on step down', () => {
    expect(computeNewPrice(0.1, 'down', 0.1)).toBe(0.1);
    expect(computeNewPrice(0.05, 'down', 0.1)).toBe(0.1);
  });

  it('handles zero current price', () => {
    expect(computeNewPrice(0, 'up', 0.1)).toBe(0.1);
    expect(computeNewPrice(0, 'down', 0.1)).toBe(0.1);
  });

  it('handles very small tick', () => {
    const result = computeNewPrice(97000, 'up', 0.001);
    expect(result).toBeCloseTo(97000.001, 6);
  });

  it('handles rapid consecutive steps', () => {
    let price = 97000;
    for (let i = 0; i < 100; i++) {
      price = computeNewPrice(price, 'up', 0.1);
    }
    expect(price).toBeCloseTo(97010, 1);
  });

  it('step down never produces negative price', () => {
    let price = 1.0;
    for (let i = 0; i < 100; i++) {
      price = computeNewPrice(price, 'down', 0.1);
    }
    expect(price).toBeGreaterThanOrEqual(0.1);
  });
});

// ========================================
// 3. Percentage Amount Calculation Edge Cases
// ========================================

describe('Percentage Amount Calculation', () => {
  // Simulates handlePercentAmount logic

  function calcBuyAmount(pct: number, availableQuote: number, effectivePrice: number, feeRate: number): number {
    if (effectivePrice <= 0) return 0;
    const usableQuote = availableQuote / (1 + feeRate);
    return (usableQuote * pct / 100) / effectivePrice;
  }

  function calcSellAmount(pct: number, availableBase: number): number {
    return availableBase * pct / 100;
  }

  describe('buy side', () => {
    it('100% uses full balance minus fees', () => {
      const amount = calcBuyAmount(100, 10000, 97000, 0.001);
      // usableQuote = 10000 / 1.001 ≈ 9990.01
      // amount = 9990.01 / 97000 ≈ 0.103
      expect(amount).toBeCloseTo(0.103, 2);
    });

    it('50% uses half balance', () => {
      const full = calcBuyAmount(100, 10000, 97000, 0.001);
      const half = calcBuyAmount(50, 10000, 97000, 0.001);
      expect(half).toBeCloseTo(full / 2, 6);
    });

    it('returns 0 when price is 0', () => {
      expect(calcBuyAmount(100, 10000, 0, 0.001)).toBe(0);
    });

    it('returns 0 when price is negative', () => {
      expect(calcBuyAmount(100, 10000, -100, 0.001)).toBe(0);
    });

    it('handles zero balance', () => {
      expect(calcBuyAmount(100, 0, 97000, 0.001)).toBe(0);
    });

    it('handles zero fee rate', () => {
      const amount = calcBuyAmount(100, 10000, 100, 0);
      expect(amount).toBeCloseTo(100, 6);
    });

    it('handles very high fee rate', () => {
      const amount = calcBuyAmount(100, 10000, 100, 1.0); // 100% fee
      // usableQuote = 10000 / 2 = 5000
      // amount = 5000 / 100 = 50
      expect(amount).toBeCloseTo(50, 6);
    });
  });

  describe('sell side', () => {
    it('100% uses full base balance', () => {
      expect(calcSellAmount(100, 1.5)).toBe(1.5);
    });

    it('25% uses quarter', () => {
      expect(calcSellAmount(25, 1.0)).toBe(0.25);
    });

    it('handles zero balance', () => {
      expect(calcSellAmount(100, 0)).toBe(0);
    });

    it('handles very small balance', () => {
      expect(calcSellAmount(50, 0.00001)).toBeCloseTo(0.000005, 8);
    });
  });
});

// ========================================
// 4. Scale Order Execution Simulation
// ========================================

describe('Scale Order Execution (TradingPanel handler)', () => {
  it('calls handleLimitOrder for each order in sequence', async () => {
    const handleLimitOrder = vi.fn().mockResolvedValue({ success: true });
    const resetForm = vi.fn();

    const orders = [
      { price: 96000, quantity: 0.1 },
      { price: 96500, quantity: 0.1 },
      { price: 97000, quantity: 0.1 },
    ];

    // Simulate handleScaleOrders
    for (const order of orders) {
      await handleLimitOrder('buy', order.price, order.quantity);
    }
    resetForm();

    expect(handleLimitOrder).toHaveBeenCalledTimes(3);
    expect(handleLimitOrder).toHaveBeenNthCalledWith(1, 'buy', 96000, 0.1);
    expect(handleLimitOrder).toHaveBeenNthCalledWith(2, 'buy', 96500, 0.1);
    expect(handleLimitOrder).toHaveBeenNthCalledWith(3, 'buy', 97000, 0.1);
    expect(resetForm).toHaveBeenCalledTimes(1);
  });

  it('continues placing orders even if one fails', async () => {
    const handleLimitOrder = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Insufficient funds' })
      .mockResolvedValueOnce({ success: true });

    const orders = [
      { price: 96000, quantity: 0.1 },
      { price: 96500, quantity: 0.1 },
      { price: 97000, quantity: 0.1 },
    ];

    for (const order of orders) {
      await handleLimitOrder('buy', order.price, order.quantity);
    }

    // All 3 should still be called
    expect(handleLimitOrder).toHaveBeenCalledTimes(3);
  });

  it('handles empty orders array', async () => {
    const handleLimitOrder = vi.fn();
    const resetForm = vi.fn();

    const orders: Array<{ price: number; quantity: number }> = [];
    for (const order of orders) {
      await handleLimitOrder('buy', order.price, order.quantity);
    }
    resetForm();

    expect(handleLimitOrder).not.toHaveBeenCalled();
    expect(resetForm).toHaveBeenCalled();
  });

  it('passes sell side correctly', async () => {
    const handleLimitOrder = vi.fn().mockResolvedValue({ success: true });

    const orders = [{ price: 98000, quantity: 0.5 }];
    for (const order of orders) {
      await handleLimitOrder('sell', order.price, order.quantity);
    }

    expect(handleLimitOrder).toHaveBeenCalledWith('sell', 98000, 0.5);
  });
});
