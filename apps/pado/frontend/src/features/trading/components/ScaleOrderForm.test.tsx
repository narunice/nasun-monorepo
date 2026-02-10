/**
 * ScaleOrderForm Tests
 * Tests computeScaleOrders logic + component rendering + edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ========================================
// 1. Pure Function Tests: computeScaleOrders
// ========================================

// Extract and test the pure function directly
// We re-implement it here to test in isolation (it's not exported)
type Distribution = 'uniform' | 'linear-asc' | 'linear-desc';
interface ScaleOrderItem { price: number; quantity: number; }

function computeScaleOrders(
  fromPrice: number,
  toPrice: number,
  numOrders: number,
  totalAmount: number,
  distribution: Distribution,
): ScaleOrderItem[] {
  if (numOrders < 2 || totalAmount <= 0 || fromPrice <= 0 || toPrice <= 0) return [];
  if (fromPrice === toPrice) {
    return [{ price: fromPrice, quantity: totalAmount }];
  }
  const orders: ScaleOrderItem[] = [];
  const step = (toPrice - fromPrice) / (numOrders - 1);
  const weights: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    switch (distribution) {
      case 'uniform': weights.push(1); break;
      case 'linear-asc': weights.push(i + 1); break;
      case 'linear-desc': weights.push(numOrders - i); break;
    }
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < numOrders; i++) {
    const price = fromPrice + step * i;
    const quantity = (totalAmount * weights[i]) / totalWeight;
    orders.push({ price, quantity });
  }
  return orders;
}

describe('computeScaleOrders', () => {
  // ---- Basic functionality ----
  describe('uniform distribution', () => {
    it('distributes equally across price range', () => {
      const orders = computeScaleOrders(100, 200, 5, 1.0, 'uniform');
      expect(orders).toHaveLength(5);
      expect(orders[0].price).toBe(100);
      expect(orders[4].price).toBe(200);
      // Each order should have 0.2 (1.0/5)
      orders.forEach(o => expect(o.quantity).toBeCloseTo(0.2, 6));
    });

    it('generates correct intermediate prices', () => {
      const orders = computeScaleOrders(100, 200, 3, 3, 'uniform');
      expect(orders[0].price).toBe(100);
      expect(orders[1].price).toBe(150);
      expect(orders[2].price).toBe(200);
    });

    it('total quantity sums to totalAmount', () => {
      const orders = computeScaleOrders(95000, 98000, 10, 0.5, 'uniform');
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      expect(totalQty).toBeCloseTo(0.5, 10);
    });
  });

  describe('linear-asc distribution', () => {
    it('assigns more quantity to higher-indexed orders', () => {
      const orders = computeScaleOrders(100, 200, 5, 1.0, 'linear-asc');
      expect(orders).toHaveLength(5);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i].quantity).toBeGreaterThan(orders[i - 1].quantity);
      }
    });

    it('total quantity sums correctly', () => {
      const orders = computeScaleOrders(100, 200, 5, 1.0, 'linear-asc');
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      expect(totalQty).toBeCloseTo(1.0, 10);
    });

    it('weights follow linear pattern (1,2,3,...,n)', () => {
      const orders = computeScaleOrders(100, 200, 3, 6, 'linear-asc');
      // Weights: 1,2,3 => totalWeight=6 => quantities: 1,2,3
      expect(orders[0].quantity).toBeCloseTo(1, 6);
      expect(orders[1].quantity).toBeCloseTo(2, 6);
      expect(orders[2].quantity).toBeCloseTo(3, 6);
    });
  });

  describe('linear-desc distribution', () => {
    it('assigns more quantity to lower-indexed orders', () => {
      const orders = computeScaleOrders(100, 200, 5, 1.0, 'linear-desc');
      expect(orders).toHaveLength(5);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i].quantity).toBeLessThan(orders[i - 1].quantity);
      }
    });

    it('total quantity sums correctly', () => {
      const orders = computeScaleOrders(100, 200, 5, 1.0, 'linear-desc');
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      expect(totalQty).toBeCloseTo(1.0, 10);
    });
  });

  // ---- Edge Cases ----
  describe('edge cases', () => {
    it('returns empty array when numOrders < 2', () => {
      expect(computeScaleOrders(100, 200, 1, 1.0, 'uniform')).toEqual([]);
      expect(computeScaleOrders(100, 200, 0, 1.0, 'uniform')).toEqual([]);
      expect(computeScaleOrders(100, 200, -5, 1.0, 'uniform')).toEqual([]);
    });

    it('returns empty array when totalAmount <= 0', () => {
      expect(computeScaleOrders(100, 200, 5, 0, 'uniform')).toEqual([]);
      expect(computeScaleOrders(100, 200, 5, -1, 'uniform')).toEqual([]);
    });

    it('returns empty array when fromPrice <= 0', () => {
      expect(computeScaleOrders(0, 200, 5, 1, 'uniform')).toEqual([]);
      expect(computeScaleOrders(-100, 200, 5, 1, 'uniform')).toEqual([]);
    });

    it('returns empty array when toPrice <= 0', () => {
      expect(computeScaleOrders(100, 0, 5, 1, 'uniform')).toEqual([]);
      expect(computeScaleOrders(100, -200, 5, 1, 'uniform')).toEqual([]);
    });

    it('returns single order when fromPrice === toPrice', () => {
      const orders = computeScaleOrders(100, 100, 5, 1.0, 'uniform');
      expect(orders).toHaveLength(1);
      expect(orders[0].price).toBe(100);
      expect(orders[0].quantity).toBe(1.0);
    });

    it('handles reversed price range (from > to)', () => {
      const orders = computeScaleOrders(200, 100, 5, 1.0, 'uniform');
      expect(orders).toHaveLength(5);
      // Prices should descend from 200 to 100
      expect(orders[0].price).toBe(200);
      expect(orders[4].price).toBe(100);
      // Quantities still uniform
      orders.forEach(o => expect(o.quantity).toBeCloseTo(0.2, 6));
    });

    it('handles very small price range', () => {
      const orders = computeScaleOrders(100.00, 100.01, 3, 0.5, 'uniform');
      expect(orders).toHaveLength(3);
      expect(orders[0].price).toBeCloseTo(100.00, 4);
      expect(orders[1].price).toBeCloseTo(100.005, 4);
      expect(orders[2].price).toBeCloseTo(100.01, 4);
    });

    it('handles very large numOrders', () => {
      const orders = computeScaleOrders(100, 200, 100, 1.0, 'uniform');
      expect(orders).toHaveLength(100);
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      expect(totalQty).toBeCloseTo(1.0, 8);
    });

    it('handles minimum numOrders = 2', () => {
      const orders = computeScaleOrders(100, 200, 2, 1.0, 'uniform');
      expect(orders).toHaveLength(2);
      expect(orders[0].price).toBe(100);
      expect(orders[1].price).toBe(200);
      expect(orders[0].quantity).toBeCloseTo(0.5, 6);
      expect(orders[1].quantity).toBeCloseTo(0.5, 6);
    });

    it('handles very small totalAmount', () => {
      const orders = computeScaleOrders(100, 200, 5, 0.00001, 'uniform');
      expect(orders).toHaveLength(5);
      orders.forEach(o => expect(o.quantity).toBeCloseTo(0.000002, 8));
    });

    it('handles very large totalAmount', () => {
      const orders = computeScaleOrders(100, 200, 5, 1e9, 'uniform');
      expect(orders).toHaveLength(5);
      orders.forEach(o => expect(o.quantity).toBeCloseTo(2e8, -2));
    });

    it('all prices are finite numbers', () => {
      const orders = computeScaleOrders(0.001, 0.002, 20, 100, 'linear-asc');
      orders.forEach(o => {
        expect(Number.isFinite(o.price)).toBe(true);
        expect(Number.isFinite(o.quantity)).toBe(true);
        expect(o.price).toBeGreaterThan(0);
        expect(o.quantity).toBeGreaterThan(0);
      });
    });
  });

  // ---- Numerical Precision ----
  describe('floating point precision', () => {
    it('does not produce NaN or Infinity', () => {
      const distributions: Distribution[] = ['uniform', 'linear-asc', 'linear-desc'];
      for (const dist of distributions) {
        const orders = computeScaleOrders(97123.45, 97456.78, 20, 0.12345, dist);
        orders.forEach(o => {
          expect(Number.isNaN(o.price)).toBe(false);
          expect(Number.isNaN(o.quantity)).toBe(false);
          expect(Number.isFinite(o.price)).toBe(true);
          expect(Number.isFinite(o.quantity)).toBe(true);
        });
      }
    });

    it('first price matches fromPrice exactly', () => {
      const orders = computeScaleOrders(97000, 98000, 10, 1, 'uniform');
      expect(orders[0].price).toBe(97000);
    });

    it('last price matches toPrice exactly', () => {
      const orders = computeScaleOrders(97000, 98000, 10, 1, 'uniform');
      expect(orders[9].price).toBeCloseTo(98000, 6);
    });
  });
});

// ========================================
// 2. Component Rendering Tests
// ========================================

// Mock the context
vi.mock('../context/MarketContext', () => ({
  useMarket: () => ({
    currentPool: {
      baseToken: { symbol: 'NBTC', decimals: 9, type: '0x::nbtc::NBTC' },
      quoteToken: { symbol: 'NUSDC', decimals: 6, type: '0x::nusdc::NUSDC' },
      tickSize: 100000,  // 0.1 NUSDC
      lotSize: 1000000,  // 0.001 NBTC
      makerFeeBps: 5,
      takerFeeBps: 10,
    },
    currentMarket: 'NBTC_NUSDC',
    markets: [],
    setMarket: vi.fn(),
  }),
}));

// Mock deepbook lib
vi.mock('../../../lib/deepbook', () => ({
  snapToTick: (price: number) => Math.round(price * 10) / 10,
  snapToLot: (qty: number) => Math.round(qty * 1000) / 1000,
  getMinPrice: () => 0.1,
  getMinQuantity: () => 0.001,
  validatePrice: (price: number) => ({ valid: price > 0, message: price > 0 ? '' : 'Invalid' }),
  validateQuantity: (qty: number) => ({ valid: qty > 0.001, message: qty > 0.001 ? '' : 'Too small' }),
}));

import { ScaleOrderForm } from './ScaleOrderForm';

function makeScaleProps(overrides: Partial<Parameters<typeof ScaleOrderForm>[0]> = {}) {
  return {
    side: 'buy' as const,
    availableQuote: 10000,
    availableBase: 1.0,
    midPrice: 97000,
    feeRate: 0.001,
    onSubmit: vi.fn(),
    disabled: false,
    isLoading: false,
    ...overrides,
  };
}

describe('ScaleOrderForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders price range inputs', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByPlaceholderText('From')).toBeTruthy();
      expect(screen.getByPlaceholderText('To')).toBeTruthy();
    });

    it('renders order count buttons', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
      expect(screen.getByText('20')).toBeTruthy();
    });

    it('renders distribution buttons', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByText('Uniform')).toBeTruthy();
    });

    it('renders total amount input', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByPlaceholderText('0.0000')).toBeTruthy();
    });

    it('renders Auto button for price range', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByText('Auto')).toBeTruthy();
    });

    it('shows percentage buttons', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      expect(screen.getByText('25%')).toBeTruthy();
      expect(screen.getByText('50%')).toBeTruthy();
      expect(screen.getByText('75%')).toBeTruthy();
      expect(screen.getByText('100%')).toBeTruthy();
    });
  });

  describe('submit button', () => {
    it('is disabled when no inputs provided', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      const submitBtn = screen.getByRole('button', { name: /Place.*Orders/i });
      expect(submitBtn).toBeDisabled();
    });

    it('is disabled when disabled prop is true', () => {
      render(<ScaleOrderForm {...makeScaleProps({ disabled: true })} />);
      const submitBtn = screen.getByRole('button', { name: /Place.*Orders/i });
      expect(submitBtn).toBeDisabled();
    });

    it('shows loading state', () => {
      render(<ScaleOrderForm {...makeScaleProps({ isLoading: true })} />);
      expect(screen.getByText('Placing...')).toBeTruthy();
    });

    it('shows Buy/Sell label based on side prop', () => {
      const { rerender } = render(<ScaleOrderForm {...makeScaleProps({ side: 'buy' })} />);
      expect(screen.getByRole('button', { name: /Buy/i })).toBeTruthy();

      rerender(<ScaleOrderForm {...makeScaleProps({ side: 'sell' })} />);
      expect(screen.getByRole('button', { name: /Sell/i })).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('cycles order count when clicking buttons', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      const btn10 = screen.getByText('10');
      fireEvent.click(btn10);
      // 10 should now be active (has pd1/20 class)
      expect(btn10.className).toContain('bg-pd1/20');
    });

    it('Auto button fills price range from midPrice', () => {
      render(<ScaleOrderForm {...makeScaleProps({ midPrice: 97000 })} />);
      fireEvent.click(screen.getByText('Auto'));
      const fromInput = screen.getByPlaceholderText('From') as HTMLInputElement;
      const toInput = screen.getByPlaceholderText('To') as HTMLInputElement;
      // Auto fills based on +-2% of midPrice for buy side
      expect(parseFloat(fromInput.value)).toBeGreaterThan(0);
      expect(parseFloat(toInput.value)).toBeGreaterThan(0);
    });

    it('Auto button is disabled when midPrice is 0', () => {
      render(<ScaleOrderForm {...makeScaleProps({ midPrice: 0 })} />);
      const autoBtn = screen.getByText('Auto');
      expect(autoBtn).toBeDisabled();
    });
  });

  describe('validation', () => {
    it('shows insufficient balance warning for buy', () => {
      render(<ScaleOrderForm {...makeScaleProps({ availableQuote: 100 })} />);
      // Fill in prices and large amount
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '10' } });
      // Should show insufficient balance (10 NBTC * ~97000 >> 100 NUSDC)
      expect(screen.getByText(/Insufficient NUSDC balance/i)).toBeTruthy();
    });

    it('shows insufficient balance warning for sell', () => {
      render(<ScaleOrderForm {...makeScaleProps({ side: 'sell', availableBase: 0.01 })} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '1' } });
      expect(screen.getByText(/Insufficient NBTC balance/i)).toBeTruthy();
    });

    it('shows per-order minimum quantity warning', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      // With 20 orders, 0.001 total => 0.00005 per order < minQty
      fireEvent.click(screen.getByText('20'));
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '0.001' } });
      expect(screen.getByText(/Each order must be at least/i)).toBeTruthy();
    });
  });

  describe('preview', () => {
    it('shows order preview when all inputs are valid', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '0.5' } });
      // Should show Preview section with 5 orders (default)
      expect(screen.getByText(/Preview \(5 orders\)/i)).toBeTruthy();
      // Check order rows exist
      expect(screen.getByText('#1')).toBeTruthy();
      expect(screen.getByText('#5')).toBeTruthy();
    });

    it('updates preview when distribution changes', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '1' } });

      // Default is uniform, switch to linear ascending
      fireEvent.click(screen.getByText(/Linear \u25B2/));
      // Preview should still show but with different quantities
      expect(screen.getByText(/Preview/i)).toBeTruthy();
    });

    it('does not show preview when inputs are incomplete', () => {
      render(<ScaleOrderForm {...makeScaleProps()} />);
      // Only fill from price
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      expect(screen.queryByText(/Preview/i)).toBeNull();
    });
  });

  describe('submission', () => {
    it('calls onSubmit with snapped orders', () => {
      const onSubmit = vi.fn();
      // availableQuote must cover total cost: 0.5 * ~97000 ≈ 48,500 NUSDC
      render(<ScaleOrderForm {...makeScaleProps({ onSubmit, availableQuote: 100000 })} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '0.5' } });

      const submitBtn = screen.getByRole('button', { name: /Place 5 Buy Orders/i });
      fireEvent.click(submitBtn);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [orders, side] = onSubmit.mock.calls[0];
      expect(side).toBe('buy');
      expect(orders).toHaveLength(5);
      expect(orders[0].price).toBeGreaterThan(0);
      expect(orders[0].quantity).toBeGreaterThan(0);
    });

    it('does not call onSubmit when disabled', () => {
      const onSubmit = vi.fn();
      render(<ScaleOrderForm {...makeScaleProps({ onSubmit, disabled: true })} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '96000' } });
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '98000' } });
      fireEvent.change(screen.getByPlaceholderText('0.0000'), { target: { value: '0.5' } });

      const submitBtn = screen.getByRole('button', { name: /Place.*Orders/i });
      fireEvent.click(submitBtn);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
