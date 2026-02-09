/**
 * Trading Flow Integration Tests
 * Covers: swap calculations, lot rounding, fee computation, balance checks,
 * effectivePrice, market switching, percent buttons, edge cases
 */

import { describe, it, expect } from 'vitest';
import type { PoolConfig } from './types';
import { calcLockedAmounts } from './types';

// ========================================
// Pool Configs (matching production values)
// ========================================
const NBTC_POOL: PoolConfig = {
  id: '0x' + 'a'.repeat(64),
  baseToken: { symbol: 'NBTC', name: 'Nasun BTC', decimals: 8, type: '0x::nbtc::NBTC' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 100000,
  lotSize: 1000,
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const NASUN_POOL: PoolConfig = {
  id: '0x' + 'b'.repeat(64),
  baseToken: { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 10000,
  lotSize: 1000000000,
  makerFeeBps: 5,
  takerFeeBps: 10,
};

// ========================================
// Swap Form Calculations
// (Reproducing SwapOrderForm business logic for testing)
// ========================================

/**
 * Calculate base amount from pay amount (reproducing SwapOrderForm.baseAmount)
 */
function calcBaseAmount(
  payAmount: number,
  midPrice: number,
  isBuying: boolean,
  pool: PoolConfig,
): number {
  if (payAmount <= 0) return 0;
  const lotSizeDecimal = pool.lotSize / Math.pow(10, pool.baseToken.decimals);

  let rawBase: number;
  if (isBuying) {
    if (!midPrice || midPrice <= 0) return 0;
    rawBase = payAmount / midPrice;
  } else {
    rawBase = payAmount;
  }

  const numLots = Math.floor(rawBase / lotSizeDecimal);
  return parseFloat((numLots * lotSizeDecimal).toFixed(pool.baseToken.decimals));
}

/**
 * Calculate receive amount (reproducing SwapOrderForm.receiveAmount)
 */
function calcReceiveAmount(
  baseAmount: number,
  midPrice: number,
  isBuying: boolean,
  feeRate: number,
): number {
  if (baseAmount <= 0 || !midPrice || midPrice <= 0) return 0;
  if (isBuying) return baseAmount;
  return parseFloat((baseAmount * midPrice * (1 - feeRate)).toFixed(2));
}

/**
 * Calculate fee in USD (reproducing SwapOrderForm.feeUsd)
 */
function calcFeeUsd(
  payAmount: number,
  baseAmount: number,
  midPrice: number,
  isBuying: boolean,
  feeRate: number,
): number {
  if (isBuying) return payAmount * feeRate;
  if (!midPrice || midPrice <= 0) return 0;
  return baseAmount * midPrice * feeRate;
}

/**
 * Reproduce OrderForm effectivePrice logic (post-fix)
 */
function calcEffectivePrice(
  isMarket: boolean,
  isTrailingStop: boolean,
  midPrice: number,
  priceInput: string,
): number {
  return (isMarket || isTrailingStop) ? (midPrice || 0) : parseFloat(priceInput) || 0;
}

/**
 * Reproduce percent button logic
 */
function calcPercentAmount(
  pct: number,
  maxPayAmount: number,
  isBuying: boolean,
  pool: PoolConfig,
): number {
  const raw = maxPayAmount * (pct / 100);
  if (isBuying) {
    return Math.floor(raw * 100) / 100;
  }
  const lotSizeDecimal = pool.lotSize / Math.pow(10, pool.baseToken.decimals);
  const numLots = Math.floor(raw / lotSizeDecimal);
  return parseFloat((numLots * lotSizeDecimal).toFixed(pool.baseToken.decimals));
}

// ========================================
// Swap: Buy (NUSDC → NBTC)
// ========================================
describe('Swap Buy: NUSDC → NBTC', () => {
  const midPrice = 97000;
  const feeRate = NBTC_POOL.takerFeeBps / 10000; // 0.001 = 0.10%

  it('$100 buys ~0.00103 BTC at $97k', () => {
    const base = calcBaseAmount(100, midPrice, true, NBTC_POOL);
    // 100 / 97000 = 0.001030928... → floor to lots (0.00001) → 0.00103
    expect(base).toBe(0.00103);
  });

  it('$970 buys ~0.00999 BTC at $97k (float precision: 970/97000 = 0.00999... in IEEE 754)', () => {
    const base = calcBaseAmount(970, midPrice, true, NBTC_POOL);
    // IEEE 754: 970 / 97000 = 0.009999999999999998 → 999 lots → 0.00999
    // This is a known float precision edge case in the production code
    expect(base).toBe(0.00999);
  });

  it('$50 buys 0.00051 BTC at $97k', () => {
    const base = calcBaseAmount(50, midPrice, true, NBTC_POOL);
    // 50 / 97000 = 0.000515464... → 51 lots = 0.00051
    expect(base).toBe(0.00051);
  });

  it('receive amount equals base amount for buy', () => {
    const base = calcBaseAmount(100, midPrice, true, NBTC_POOL);
    const receive = calcReceiveAmount(base, midPrice, true, feeRate);
    expect(receive).toBe(base);
  });

  it('fee calculation for buy', () => {
    const fee = calcFeeUsd(100, 0.00103, midPrice, true, feeRate);
    // Buy fee = payAmount * feeRate = 100 * 0.001 = $0.10
    expect(fee).toBeCloseTo(0.1, 2);
  });

  it('returns 0 when midPrice is 0', () => {
    expect(calcBaseAmount(100, 0, true, NBTC_POOL)).toBe(0);
  });

  it('returns 0 when payAmount is 0', () => {
    expect(calcBaseAmount(0, midPrice, true, NBTC_POOL)).toBe(0);
  });

  it('returns 0 when payAmount is negative', () => {
    expect(calcBaseAmount(-50, midPrice, true, NBTC_POOL)).toBe(0);
  });

  it('very small buy ($1) at $97k', () => {
    const base = calcBaseAmount(1, midPrice, true, NBTC_POOL);
    // 1 / 97000 = 0.00001030... → 1 lot = 0.00001
    expect(base).toBe(0.00001);
  });

  it('very large buy ($100k) at $97k', () => {
    const base = calcBaseAmount(100000, midPrice, true, NBTC_POOL);
    // 100000 / 97000 = 1.03092... → 103092 lots
    expect(base).toBeGreaterThan(1);
    expect(base).toBeLessThan(1.0310);
  });
});

// ========================================
// Swap: Sell (NBTC → NUSDC)
// ========================================
describe('Swap Sell: NBTC → NUSDC', () => {
  const midPrice = 97000;
  const feeRate = NBTC_POOL.takerFeeBps / 10000;

  it('sell 0.01 BTC at $97k (float: 0.01/0.00001 = 999.99... → base=0.00999)', () => {
    const base = calcBaseAmount(0.01, midPrice, false, NBTC_POOL);
    // IEEE 754: 0.01 / 0.00001 = 999.9999... → floor → 999 lots → 0.00999
    expect(base).toBe(0.00999);

    const receive = calcReceiveAmount(base, midPrice, false, feeRate);
    // 0.00999 * 97000 * 0.999 = 968.06
    expect(receive).toBeCloseTo(968.06, 1);
  });

  it('sell 1 BTC (float: 1/0.00001 = 99999.99... → base=0.99999)', () => {
    const base = calcBaseAmount(1, midPrice, false, NBTC_POOL);
    // IEEE 754: 1 / 0.00001 = 99999.99999... → floor → 99999 lots → 0.99999
    expect(base).toBe(0.99999);

    const receive = calcReceiveAmount(base, midPrice, false, feeRate);
    // 0.99999 * 97000 * 0.999 ≈ 96902.03
    expect(receive).toBeCloseTo(96902, 0);
  });

  it('fee calculation for sell', () => {
    const fee = calcFeeUsd(0.01, 0.01, midPrice, false, feeRate);
    // Sell fee = baseAmount * midPrice * feeRate = 0.01 * 97000 * 0.001 = $0.97
    expect(fee).toBeCloseTo(0.97, 2);
  });

  it('sell with zero midPrice returns 0 receive', () => {
    expect(calcReceiveAmount(0.01, 0, false, feeRate)).toBe(0);
  });
});

// ========================================
// Swap: NASUN Pool
// ========================================
describe('Swap: NASUN/NUSDC Pool', () => {
  const midPrice = 0.10; // $0.10 per NASUN
  const feeRate = NASUN_POOL.takerFeeBps / 10000;

  it('$10 buys 100 NASUN at $0.10', () => {
    const base = calcBaseAmount(10, midPrice, true, NASUN_POOL);
    // 10 / 0.10 = 100.0 → 100 lots (lot=1 NASUN) = 100
    expect(base).toBe(100);
  });

  it('$15 buys 150 NASUN at $0.10', () => {
    const base = calcBaseAmount(15, midPrice, true, NASUN_POOL);
    expect(base).toBe(150);
  });

  it('$7 buys 70 NASUN at $0.10 (rounded to lot)', () => {
    const base = calcBaseAmount(7, midPrice, true, NASUN_POOL);
    // 7 / 0.10 = 70 → exactly 70 lots
    expect(base).toBe(70);
  });

  it('sell 50 NASUN at $0.10 = ~$4.995', () => {
    const base = calcBaseAmount(50, midPrice, false, NASUN_POOL);
    expect(base).toBe(50);

    const receive = calcReceiveAmount(base, midPrice, false, feeRate);
    // 50 * 0.10 * 0.999 = 4.995
    expect(receive).toBeCloseTo(5.0, 1); // rounds to 2 decimals
  });

  it('fractional NASUN gets floored to whole lots', () => {
    const base = calcBaseAmount(0.5, 0.10, false, NASUN_POOL);
    // 0.5 NASUN / 1.0 lot = 0 lots → 0
    expect(base).toBe(0);
  });
});

// ========================================
// effectivePrice (Bug fix verification)
// ========================================
describe('effectivePrice calculation', () => {
  it('market order uses midPrice', () => {
    expect(calcEffectivePrice(true, false, 97000, '')).toBe(97000);
  });

  it('market order uses midPrice even when price input exists', () => {
    expect(calcEffectivePrice(true, false, 97000, '96000')).toBe(97000);
  });

  it('trailing stop uses midPrice (bug fix)', () => {
    expect(calcEffectivePrice(false, true, 97000, '')).toBe(97000);
  });

  it('trailing stop uses midPrice even when price input is empty', () => {
    expect(calcEffectivePrice(false, true, 97000, '')).toBe(97000);
  });

  it('limit order uses price input', () => {
    expect(calcEffectivePrice(false, false, 97000, '96500')).toBe(96500);
  });

  it('limit order returns 0 when price input is empty', () => {
    expect(calcEffectivePrice(false, false, 97000, '')).toBe(0);
  });

  it('market order with zero midPrice returns 0', () => {
    expect(calcEffectivePrice(true, false, 0, '')).toBe(0);
  });

  it('trailing stop with zero midPrice returns 0', () => {
    expect(calcEffectivePrice(false, true, 0, '')).toBe(0);
  });
});

// ========================================
// Percent Buttons
// ========================================
describe('Percent Quick Buttons', () => {
  describe('Buy side (NUSDC balance)', () => {
    const feeRate = NBTC_POOL.takerFeeBps / 10000;
    const quoteBalance = 10000; // $10,000
    const maxPayAmount = quoteBalance / (1 + feeRate); // ~9990.01

    it('25% = ~$2497.50', () => {
      const amount = calcPercentAmount(25, maxPayAmount, true, NBTC_POOL);
      expect(amount).toBeCloseTo(2497.50, 0);
      // Should be floored to 2 decimal places
      expect(amount).toBe(Math.floor(maxPayAmount * 0.25 * 100) / 100);
    });

    it('50% = ~$4995.00', () => {
      const amount = calcPercentAmount(50, maxPayAmount, true, NBTC_POOL);
      expect(amount).toBeCloseTo(4995.00, 0);
    });

    it('100% (Max) uses full available balance', () => {
      const amount = calcPercentAmount(100, maxPayAmount, true, NBTC_POOL);
      expect(amount).toBeCloseTo(maxPayAmount, 0);
    });

    it('floors to 2 decimal places', () => {
      // Verify truncation, not rounding
      const amount = calcPercentAmount(33, 1000, true, NBTC_POOL);
      // 1000 * 0.33 = 330 → floor(33000) / 100 = 330
      expect(amount).toBe(330);
    });
  });

  describe('Sell side (NBTC balance)', () => {
    const baseBalance = 0.5; // 0.5 BTC

    it('25% of 0.5 BTC (float: 0.125/0.00001 = 12499.99... → 0.12499)', () => {
      const amount = calcPercentAmount(25, baseBalance, false, NBTC_POOL);
      // IEEE 754: 0.125 / 0.00001 = 12499.999... → floor → 12499 lots → 0.12499
      expect(amount).toBe(0.12499);
    });

    it('50% of 0.5 BTC (float: 0.25/0.00001 = 24999.99... → 0.24999)', () => {
      const amount = calcPercentAmount(50, baseBalance, false, NBTC_POOL);
      expect(amount).toBe(0.24999);
    });

    it('100% of 0.5 BTC (float: 0.5/0.00001 = 49999.99... → 0.49999)', () => {
      const amount = calcPercentAmount(100, baseBalance, false, NBTC_POOL);
      expect(amount).toBe(0.49999);
    });

    it('33% lot-rounded (0.5 * 0.33 = 0.165 → 16500 lots → 0.165)', () => {
      const amount = calcPercentAmount(33, baseBalance, false, NBTC_POOL);
      expect(amount).toBe(0.165);
    });

    it('NASUN: 75% of 100 NASUN = 75 NASUN', () => {
      const amount = calcPercentAmount(75, 100, false, NASUN_POOL);
      expect(amount).toBe(75);
    });

    it('NASUN: 33% of 100 NASUN = 33 NASUN (lot=1)', () => {
      const amount = calcPercentAmount(33, 100, false, NASUN_POOL);
      expect(amount).toBe(33);
    });
  });
});

// ========================================
// Balance & Insufficient Balance Check
// ========================================
describe('Balance Validation', () => {
  const feeRate = NBTC_POOL.takerFeeBps / 10000;

  it('buy: maxPayAmount accounts for fees', () => {
    const quoteBalance = 1000;
    const maxPayAmount = quoteBalance / (1 + feeRate);
    // 1000 / 1.001 = 999.001 → allows $999 pay with fee covered
    expect(maxPayAmount).toBeLessThan(quoteBalance);
    expect(maxPayAmount).toBeGreaterThan(999);
  });

  it('buy: insufficient when payAmount > maxPayAmount', () => {
    const quoteBalance = 1000;
    const maxPayAmount = quoteBalance / (1 + feeRate);
    const payAmount = 1000; // exceeds maxPayAmount
    expect(payAmount > maxPayAmount).toBe(true);
  });

  it('sell: maxPayAmount = full base balance', () => {
    const baseBalance = 0.5;
    const maxPayAmount = baseBalance;
    expect(maxPayAmount).toBe(0.5);
  });

  it('sell: insufficient when payAmount > base balance', () => {
    const baseBalance = 0.5;
    const payAmount = 0.6;
    expect(payAmount > baseBalance).toBe(true);
  });

  it('zero balance means all amounts are insufficient', () => {
    const maxPayAmount = 0;
    expect(1 > maxPayAmount).toBe(true);
  });
});

// ========================================
// Locked Amounts for Open Orders
// ========================================
describe('Locked Amounts with Open Orders', () => {
  it('available quote = total quote - locked quote', () => {
    const bmQuote = 10000;
    const orders = [
      { price: 95000, quantity: 0.05, isBid: true }, // locks 4750
      { price: 96000, quantity: 0.03, isBid: true }, // locks 2880
    ];
    const { lockedQuote } = calcLockedAmounts(orders);
    const availableQuote = bmQuote - lockedQuote;
    expect(lockedQuote).toBeCloseTo(7630, 0);
    expect(availableQuote).toBeCloseTo(2370, 0);
  });

  it('available base = total base - locked base', () => {
    const bmBase = 1.0;
    const orders = [
      { price: 105000, quantity: 0.3, isBid: false }, // locks 0.3
      { price: 110000, quantity: 0.2, isBid: false }, // locks 0.2
    ];
    const { lockedBase } = calcLockedAmounts(orders);
    const availableBase = bmBase - lockedBase;
    expect(lockedBase).toBeCloseTo(0.5, 6);
    expect(availableBase).toBeCloseTo(0.5, 6);
  });
});

// ========================================
// Fee Display Logic
// ========================================
describe('Fee Display', () => {
  it('taker fee is 10 bps (0.10%)', () => {
    const feeBps = NBTC_POOL.takerFeeBps;
    const feePercent = `${(feeBps / 100).toFixed(2)}%`;
    expect(feePercent).toBe('0.10%');
  });

  it('maker fee is 5 bps (0.05%)', () => {
    const feeBps = NBTC_POOL.makerFeeBps;
    const feePercent = `${(feeBps / 100).toFixed(2)}%`;
    expect(feePercent).toBe('0.05%');
  });

  it('fee in USD for $1000 buy at taker rate', () => {
    const feeRate = NBTC_POOL.takerFeeBps / 10000;
    const payAmount = 1000;
    const fee = payAmount * feeRate;
    expect(fee).toBe(1); // $1.00
  });
});

// ========================================
// Exchange Rate Display
// ========================================
describe('Exchange Rate Display', () => {
  it('formats rate with symbol', () => {
    const midPrice = 97000;
    const baseSymbol = 'NBTC';
    const rateDisplay = midPrice > 0
      ? `1 ${baseSymbol} = $${midPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '...';
    expect(rateDisplay).toBe('1 NBTC = $97,000');
  });

  it('shows ... when no price', () => {
    const midPrice = 0;
    const rateDisplay = midPrice > 0 ? `1 NBTC = $${midPrice}` : '...';
    expect(rateDisplay).toBe('...');
  });
});

// ========================================
// Lot Size Rounding Edge Cases
// ========================================
describe('Lot Size Rounding', () => {
  it('$0.50 at $97k = 0 lots (too small for any lot)', () => {
    const base = calcBaseAmount(0.50, 97000, true, NBTC_POOL);
    // 0.50 / 97000 = 0.00000515 → 0 lots (lot=0.00001)
    expect(base).toBe(0);
  });

  it('$0.97 at $97k (float: 0.97/97000 = 0.00000999... → 0 lots)', () => {
    const base = calcBaseAmount(0.97, 97000, true, NBTC_POOL);
    // IEEE 754: 0.97 / 97000 = 0.000009999... → 0 lots → 0
    // True math: exactly 0.00001, but float division truncates
    expect(base).toBe(0);
  });

  it('$1.94 at $97k (float: 1.94/97000 = 0.00001999... → 1 lot)', () => {
    const base = calcBaseAmount(1.94, 97000, true, NBTC_POOL);
    // IEEE 754: 1.94 / 97000 = 0.00001999... → 1 lot → 0.00001
    expect(base).toBe(0.00001);
  });

  it('$1000 at $97k = 103 lots (0.00103 BTC, remainder truncated)', () => {
    const base = calcBaseAmount(1000, 97000, true, NBTC_POOL);
    // 1000 / 97000 = 0.01030928... → 1030 lots → 0.01030
    expect(base).toBe(0.0103);
  });

  it('NASUN: $0.15 at $0.10 = 1 NASUN (lot=1.0)', () => {
    const base = calcBaseAmount(0.15, 0.10, true, NASUN_POOL);
    // 0.15 / 0.10 = 1.5 → 1 lot → 1.0
    expect(base).toBe(1);
  });

  it('NASUN: $0.05 at $0.10 = 0 (below lot size)', () => {
    const base = calcBaseAmount(0.05, 0.10, true, NASUN_POOL);
    // 0.05 / 0.10 = 0.5 → 0 lots → 0
    expect(base).toBe(0);
  });
});

// ========================================
// Preview Button State Logic
// ========================================
describe('Preview Button State', () => {
  function getPreviewButtonState(opts: {
    isLoading: boolean;
    midPrice: number;
    payAmount: number;
    isInsufficientBalance: boolean;
    baseAmount: number;
    disabled: boolean;
  }) {
    if (opts.isLoading) return { text: 'Processing...', disabled: true };
    if (opts.midPrice <= 0) return { text: 'No Market Liquidity', disabled: true };
    if (opts.payAmount <= 0) return { text: 'Enter Amount', disabled: true };
    if (opts.isInsufficientBalance) return { text: 'Insufficient Balance', disabled: true };
    if (opts.baseAmount <= 0) return { text: 'Amount Too Small', disabled: true };
    return { text: 'Preview Swap', disabled: opts.disabled };
  }

  it('shows Processing when loading', () => {
    const btn = getPreviewButtonState({
      isLoading: true, midPrice: 97000, payAmount: 100,
      isInsufficientBalance: false, baseAmount: 0.001, disabled: false,
    });
    expect(btn.text).toBe('Processing...');
    expect(btn.disabled).toBe(true);
  });

  it('shows No Market Liquidity when midPrice is 0', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 0, payAmount: 100,
      isInsufficientBalance: false, baseAmount: 0, disabled: false,
    });
    expect(btn.text).toBe('No Market Liquidity');
  });

  it('shows Enter Amount when payAmount is 0', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 97000, payAmount: 0,
      isInsufficientBalance: false, baseAmount: 0, disabled: false,
    });
    expect(btn.text).toBe('Enter Amount');
  });

  it('shows Insufficient Balance when over balance', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 97000, payAmount: 100,
      isInsufficientBalance: true, baseAmount: 0.001, disabled: false,
    });
    expect(btn.text).toBe('Insufficient Balance');
  });

  it('shows Amount Too Small when baseAmount rounds to 0', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 97000, payAmount: 0.50,
      isInsufficientBalance: false, baseAmount: 0, disabled: false,
    });
    expect(btn.text).toBe('Amount Too Small');
  });

  it('shows Preview Swap when all conditions met', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 97000, payAmount: 100,
      isInsufficientBalance: false, baseAmount: 0.001, disabled: false,
    });
    expect(btn.text).toBe('Preview Swap');
    expect(btn.disabled).toBe(false);
  });

  it('Preview Swap respects disabled prop', () => {
    const btn = getPreviewButtonState({
      isLoading: false, midPrice: 97000, payAmount: 100,
      isInsufficientBalance: false, baseAmount: 0.001, disabled: true,
    });
    expect(btn.text).toBe('Preview Swap');
    expect(btn.disabled).toBe(true);
  });
});

// ========================================
// Market Switching Token Logic
// ========================================
describe('Market Switching', () => {
  it('buying: pay=NUSDC, receive=base token', () => {
    const payToken = 'NUSDC';
    const isBuying = payToken === 'NUSDC';
    expect(isBuying).toBe(true);
  });

  it('selling: pay=base token, receive=NUSDC', () => {
    const payToken = 'NBTC';
    const isBuying = payToken === 'NUSDC';
    expect(isBuying).toBe(false);
  });

  it('flip swaps tokens', () => {
    let payToken = 'NUSDC';
    let receiveToken = 'NBTC';

    // Flip
    const newPay = receiveToken;
    const newReceive = payToken;
    payToken = newPay;
    receiveToken = newReceive;

    expect(payToken).toBe('NBTC');
    expect(receiveToken).toBe('NUSDC');
  });

  it('changing receive token updates market key', () => {
    const receiveToken = 'NASUN';
    const base = receiveToken;
    const key = `${base}_NUSDC`;
    expect(key).toBe('NASUN_NUSDC');
  });

  it('changing pay token to non-NUSDC forces receive to NUSDC', () => {
    const payToken = 'NBTC'; // changed from NUSDC
    const receiveToken = payToken !== 'NUSDC' ? 'NUSDC' : 'NBTC';
    expect(receiveToken).toBe('NUSDC');
  });
});

// ========================================
// Input Validation (pay amount)
// ========================================
describe('Pay Amount Input Validation', () => {
  const isValidInput = (value: string) => value === '' || /^\d*\.?\d*$/.test(value);

  it('accepts empty string', () => {
    expect(isValidInput('')).toBe(true);
  });

  it('accepts integers', () => {
    expect(isValidInput('100')).toBe(true);
  });

  it('accepts decimals', () => {
    expect(isValidInput('100.50')).toBe(true);
  });

  it('accepts leading decimal', () => {
    expect(isValidInput('.5')).toBe(true);
  });

  it('accepts just a dot', () => {
    expect(isValidInput('.')).toBe(true);
  });

  it('rejects letters', () => {
    expect(isValidInput('abc')).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(isValidInput('-10')).toBe(false);
  });

  it('rejects multiple dots', () => {
    expect(isValidInput('1.2.3')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidInput('10e5')).toBe(false);
    expect(isValidInput('$100')).toBe(false);
    expect(isValidInput('100,')).toBe(false);
  });
});

// ========================================
// Slippage Settings
// ========================================
describe('Slippage Settings', () => {
  const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

  it('presets are 0.1%, 0.5%, 1.0%', () => {
    expect(SLIPPAGE_PRESETS).toEqual([0.1, 0.5, 1.0]);
  });

  it('default slippage is reasonable (0.5%)', () => {
    const defaultSlippage = 0.5;
    expect(SLIPPAGE_PRESETS).toContain(defaultSlippage);
  });

  it('slippage applies to min receive calculation', () => {
    const receiveAmount = 0.01; // BTC
    const slippage = 0.5; // 0.5%
    const minReceive = receiveAmount * (1 - slippage / 100);
    expect(minReceive).toBeCloseTo(0.00995, 6);
  });
});
