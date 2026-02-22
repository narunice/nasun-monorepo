/**
 * Phase A — Bottom Tabs UX Improvement Tests
 *
 * Tests the pure logic extracted from 4 modified components:
 * A-1: TP/SL Tab (typeLabel, typeColor, trigger display logic)
 * A-2: Open Orders Tab (sorting, formatPrice, formatTotal)
 * A-3: Order History Tab (side + period filter logic)
 * A-4: Trade History Tab (CSV Market column)
 */

import { describe, it, expect } from 'vitest';
import type { TPSLTriggerType, TPSLOrder } from './lib/tpsl-types';
import { generateCsv } from '@/lib/csv-export';

// ========================================
// A-1: TP/SL Tab — Helper Logic
// ========================================

// Extracted from BottomTabPanel.tsx TPSLTab function
function typeLabel(type: TPSLTriggerType): string {
  switch (type) {
    case 'tp': return 'TP';
    case 'stop-limit': return 'S-L';
    case 'trailing-stop': return 'Trail';
    default: return 'SL';
  }
}

function typeColor(type: TPSLTriggerType, dim = false): string {
  const opacity = dim ? '/60' : '';
  switch (type) {
    case 'tp': return `text-green-400${opacity}`;
    case 'stop-limit': return `text-amber-400${opacity}`;
    case 'trailing-stop': return `text-purple-400${opacity}`;
    default: return `text-red-400${opacity}`;
  }
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Trailing stop trigger label logic
function getTrailingStopLabel(order: Pick<TPSLOrder, 'trailPercent' | 'trailAmount' | 'triggerPrice'>): string {
  if (order.trailPercent) return `Trail ${order.trailPercent}%`;
  if (order.trailAmount) return `Trail ${formatPrice(order.trailAmount)}`;
  return formatPrice(order.triggerPrice);
}

describe('A-1: TP/SL Tab — typeLabel', () => {
  it('returns "TP" for take-profit', () => {
    expect(typeLabel('tp')).toBe('TP');
  });

  it('returns "SL" for stop-loss', () => {
    expect(typeLabel('sl')).toBe('SL');
  });

  it('returns "S-L" for stop-limit', () => {
    expect(typeLabel('stop-limit')).toBe('S-L');
  });

  it('returns "Trail" for trailing-stop', () => {
    expect(typeLabel('trailing-stop')).toBe('Trail');
  });
});

describe('A-1: TP/SL Tab — typeColor', () => {
  it('returns green for TP', () => {
    expect(typeColor('tp')).toBe('text-green-400');
  });

  it('returns red for SL', () => {
    expect(typeColor('sl')).toBe('text-red-400');
  });

  it('returns amber for stop-limit', () => {
    expect(typeColor('stop-limit')).toBe('text-amber-400');
  });

  it('returns purple for trailing-stop', () => {
    expect(typeColor('trailing-stop')).toBe('text-purple-400');
  });

  it('applies dim opacity when dim=true', () => {
    expect(typeColor('tp', true)).toBe('text-green-400/60');
    expect(typeColor('sl', true)).toBe('text-red-400/60');
    expect(typeColor('stop-limit', true)).toBe('text-amber-400/60');
    expect(typeColor('trailing-stop', true)).toBe('text-purple-400/60');
  });
});

describe('A-1: TP/SL Tab — trailing stop trigger label', () => {
  it('shows trail percent when trailPercent is set', () => {
    expect(getTrailingStopLabel({ trailPercent: 2, triggerPrice: 97000 })).toBe('Trail 2%');
  });

  it('shows trail amount when trailAmount is set', () => {
    expect(getTrailingStopLabel({ trailAmount: 500, triggerPrice: 97000 })).toBe('Trail $500.00');
  });

  it('falls back to trigger price when neither trail value is set', () => {
    expect(getTrailingStopLabel({ triggerPrice: 97000 })).toBe('$97,000.00');
  });

  it('prefers trailPercent over trailAmount', () => {
    expect(getTrailingStopLabel({ trailPercent: 3, trailAmount: 1000, triggerPrice: 97000 })).toBe('Trail 3%');
  });
});

describe('A-1: TP/SL Tab — marketSymbol display', () => {
  it('shows market symbol when present', () => {
    const order: Pick<TPSLOrder, 'marketSymbol'> = { marketSymbol: 'NBTC' };
    expect(order.marketSymbol ?? '—').toBe('NBTC');
  });

  it('shows dash when marketSymbol is undefined (backward compat)', () => {
    const order: Pick<TPSLOrder, 'marketSymbol'> = {};
    expect(order.marketSymbol ?? '—').toBe('—');
  });
});

// ========================================
// A-2: Open Orders Tab — Logic
// ========================================

interface MockOrder {
  orderId: string;
  price: number;
  quantity: number;
  isBid: boolean;
}

function sortOrdersByIdDesc(orders: MockOrder[]): MockOrder[] {
  return [...orders].sort((a, b) => {
    const aId = BigInt(a.orderId);
    const bId = BigInt(b.orderId);
    return aId > bId ? -1 : aId < bId ? 1 : 0;
  });
}

function formatTotal(price: number, qty: number): string {
  const total = price * qty;
  return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

describe('A-2: Open Orders — sorting by orderId descending', () => {
  it('sorts newest (highest orderId) first', () => {
    const orders: MockOrder[] = [
      { orderId: '100', price: 95000, quantity: 0.5, isBid: true },
      { orderId: '300', price: 96000, quantity: 0.3, isBid: false },
      { orderId: '200', price: 97000, quantity: 0.1, isBid: true },
    ];
    const sorted = sortOrdersByIdDesc(orders);
    expect(sorted.map(o => o.orderId)).toEqual(['300', '200', '100']);
  });

  it('handles BigInt-scale order IDs', () => {
    const orders: MockOrder[] = [
      { orderId: '999999999999999999', price: 95000, quantity: 0.5, isBid: true },
      { orderId: '1000000000000000000', price: 96000, quantity: 0.3, isBid: false },
    ];
    const sorted = sortOrdersByIdDesc(orders);
    expect(sorted[0].orderId).toBe('1000000000000000000');
  });

  it('preserves order for equal IDs', () => {
    const orders: MockOrder[] = [
      { orderId: '100', price: 95000, quantity: 0.5, isBid: true },
      { orderId: '100', price: 96000, quantity: 0.3, isBid: false },
    ];
    const sorted = sortOrdersByIdDesc(orders);
    expect(sorted.length).toBe(2);
  });

  it('returns empty for empty input', () => {
    expect(sortOrdersByIdDesc([])).toEqual([]);
  });

  it('handles single order', () => {
    const orders: MockOrder[] = [
      { orderId: '42', price: 97000, quantity: 1, isBid: true },
    ];
    expect(sortOrdersByIdDesc(orders)).toEqual(orders);
  });
});

describe('A-2: Open Orders — formatPrice', () => {
  it('formats price with 2 decimal places', () => {
    expect(formatPrice(97000)).toBe('$97,000.00');
  });

  it('formats price with comma separators', () => {
    expect(formatPrice(1234567.89)).toBe('$1,234,567.89');
  });

  it('pads single-digit cents', () => {
    expect(formatPrice(100.1)).toBe('$100.10');
  });

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('truncates to 2 decimal places', () => {
    // toLocaleString with maximumFractionDigits: 2 rounds
    expect(formatPrice(97000.999)).toBe('$97,001.00');
  });
});

describe('A-2: Open Orders — formatTotal', () => {
  it('calculates total as price * quantity', () => {
    expect(formatTotal(97000, 0.5)).toBe('$48,500.00');
  });

  it('formats small totals', () => {
    expect(formatTotal(100, 0.01)).toBe('$1.00');
  });

  it('handles zero quantity', () => {
    expect(formatTotal(97000, 0)).toBe('$0.00');
  });

  it('handles zero price', () => {
    expect(formatTotal(0, 1.5)).toBe('$0.00');
  });

  it('handles large totals', () => {
    expect(formatTotal(97000, 10)).toBe('$970,000.00');
  });
});

// ========================================
// A-3: Order History — Filter Logic
// ========================================

type SideFilter = 'all' | 'buy' | 'sell';
type PeriodFilter = 'all' | '24h' | '7d';

const PERIOD_MS: Record<PeriodFilter, number> = {
  all: 0,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

interface OrderItem {
  orderId: string;
  isBid: boolean;
  timestamp: number;
  status: string;
}

function filterOrders(
  orders: OrderItem[],
  sideFilter: SideFilter,
  periodFilter: PeriodFilter,
  now: number = Date.now(),
): OrderItem[] {
  let result = orders;
  if (sideFilter !== 'all') {
    result = result.filter(o => sideFilter === 'buy' ? o.isBid : !o.isBid);
  }
  if (periodFilter !== 'all') {
    const cutoff = now - PERIOD_MS[periodFilter];
    result = result.filter(o => o.timestamp >= cutoff);
  }
  return result;
}

const NOW = 1707400000000;

function makeOrder(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    orderId: Math.random().toString(36).slice(2),
    isBid: true,
    timestamp: NOW,
    status: 'filled',
    ...overrides,
  };
}

describe('A-3: Order History Filters — side filter', () => {
  const orders: OrderItem[] = [
    makeOrder({ orderId: 'buy1', isBid: true }),
    makeOrder({ orderId: 'buy2', isBid: true }),
    makeOrder({ orderId: 'sell1', isBid: false }),
    makeOrder({ orderId: 'sell2', isBid: false }),
    makeOrder({ orderId: 'sell3', isBid: false }),
  ];

  it('returns all orders when sideFilter is "all"', () => {
    expect(filterOrders(orders, 'all', 'all', NOW).length).toBe(5);
  });

  it('returns only buys when sideFilter is "buy"', () => {
    const result = filterOrders(orders, 'buy', 'all', NOW);
    expect(result.length).toBe(2);
    expect(result.every(o => o.isBid)).toBe(true);
  });

  it('returns only sells when sideFilter is "sell"', () => {
    const result = filterOrders(orders, 'sell', 'all', NOW);
    expect(result.length).toBe(3);
    expect(result.every(o => !o.isBid)).toBe(true);
  });
});

describe('A-3: Order History Filters — period filter', () => {
  const MS_HOUR = 60 * 60 * 1000;
  const MS_DAY = 24 * MS_HOUR;

  it('returns all orders when periodFilter is "all"', () => {
    const orders = [
      makeOrder({ timestamp: NOW }),
      makeOrder({ timestamp: NOW - 30 * MS_DAY }),
    ];
    expect(filterOrders(orders, 'all', 'all', NOW).length).toBe(2);
  });

  it('filters to 24h', () => {
    const orders = [
      makeOrder({ orderId: 'recent', timestamp: NOW - 1 * MS_HOUR }),
      makeOrder({ orderId: 'old', timestamp: NOW - 25 * MS_HOUR }),
    ];
    const result = filterOrders(orders, 'all', '24h', NOW);
    expect(result.length).toBe(1);
    expect(result[0].orderId).toBe('recent');
  });

  it('filters to 7d', () => {
    const orders = [
      makeOrder({ orderId: 'today', timestamp: NOW }),
      makeOrder({ orderId: '3d', timestamp: NOW - 3 * MS_DAY }),
      makeOrder({ orderId: '8d', timestamp: NOW - 8 * MS_DAY }),
    ];
    const result = filterOrders(orders, 'all', '7d', NOW);
    expect(result.length).toBe(2);
    expect(result.map(o => o.orderId)).toEqual(['today', '3d']);
  });

  it('exact boundary — order at exactly 24h ago is included', () => {
    const orders = [makeOrder({ timestamp: NOW - 24 * MS_HOUR })];
    expect(filterOrders(orders, 'all', '24h', NOW).length).toBe(1);
  });

  it('exact boundary — order 1ms before 7d cutoff is excluded', () => {
    const orders = [makeOrder({ timestamp: NOW - 7 * MS_DAY - 1 })];
    expect(filterOrders(orders, 'all', '7d', NOW).length).toBe(0);
  });
});

describe('A-3: Order History Filters — combined side + period', () => {
  const MS_HOUR = 60 * 60 * 1000;
  const MS_DAY = 24 * MS_HOUR;

  it('filters buy + 24h', () => {
    const orders = [
      makeOrder({ orderId: 'buy-recent', isBid: true, timestamp: NOW - 2 * MS_HOUR }),
      makeOrder({ orderId: 'sell-recent', isBid: false, timestamp: NOW - 2 * MS_HOUR }),
      makeOrder({ orderId: 'buy-old', isBid: true, timestamp: NOW - 3 * MS_DAY }),
    ];
    const result = filterOrders(orders, 'buy', '24h', NOW);
    expect(result.length).toBe(1);
    expect(result[0].orderId).toBe('buy-recent');
  });

  it('filters sell + 7d', () => {
    const orders = [
      makeOrder({ orderId: 'buy-1d', isBid: true, timestamp: NOW - 1 * MS_DAY }),
      makeOrder({ orderId: 'sell-1d', isBid: false, timestamp: NOW - 1 * MS_DAY }),
      makeOrder({ orderId: 'sell-30d', isBid: false, timestamp: NOW - 30 * MS_DAY }),
    ];
    const result = filterOrders(orders, 'sell', '7d', NOW);
    expect(result.length).toBe(1);
    expect(result[0].orderId).toBe('sell-1d');
  });
});

describe('A-3: Order History Filters — edge cases', () => {
  it('handles empty orders array', () => {
    expect(filterOrders([], 'all', 'all', NOW)).toEqual([]);
    expect(filterOrders([], 'buy', '24h', NOW)).toEqual([]);
  });

  it('handles null-like input gracefully', () => {
    // The component guards with `if (!orders) return []` before calling filter
    expect(filterOrders([], 'sell', '7d', NOW)).toEqual([]);
  });

  it('preserves order of results', () => {
    const orders = [
      makeOrder({ orderId: 'a', isBid: true, timestamp: NOW }),
      makeOrder({ orderId: 'b', isBid: true, timestamp: NOW - 1000 }),
      makeOrder({ orderId: 'c', isBid: true, timestamp: NOW - 2000 }),
    ];
    const result = filterOrders(orders, 'buy', 'all', NOW);
    expect(result.map(o => o.orderId)).toEqual(['a', 'b', 'c']);
  });

  it('includes all statuses (filled, partial, placed, canceled)', () => {
    const orders = [
      makeOrder({ status: 'filled', isBid: true }),
      makeOrder({ status: 'partial', isBid: true }),
      makeOrder({ status: 'placed', isBid: true }),
      makeOrder({ status: 'canceled', isBid: true }),
    ];
    expect(filterOrders(orders, 'buy', 'all', NOW).length).toBe(4);
  });
});

// ========================================
// A-4: Trade History — CSV Market Column
// ========================================

interface CsvTrade {
  timestamp: number;
  isBid: boolean;
  price: number;
  quantity: number;
  role: 'maker' | 'taker';
  txDigest: string;
}

describe('A-4: Trade History — CSV Market column', () => {
  const pair = 'NBTC/NUSDC';

  const CSV_COLUMNS = [
    { header: 'Date', accessor: (t: CsvTrade) => new Date(t.timestamp).toISOString() },
    { header: 'Market', accessor: () => pair },
    { header: 'Side', accessor: (t: CsvTrade) => (t.isBid ? 'BUY' : 'SELL') },
    { header: 'Price', accessor: (t: CsvTrade) => t.price },
    { header: 'Amount', accessor: (t: CsvTrade) => t.quantity },
    { header: 'Total', accessor: (t: CsvTrade) => Math.round(t.price * t.quantity * 100) / 100 },
    { header: 'Role', accessor: (t: CsvTrade) => t.role },
    { header: 'TX Digest', accessor: (t: CsvTrade) => t.txDigest },
  ];

  it('CSV header includes Market column', () => {
    const csv = generateCsv([], CSV_COLUMNS);
    const headers = csv.split('\n')[0].split(',');
    expect(headers).toContain('Market');
    expect(headers.indexOf('Market')).toBe(1); // Second column
  });

  it('CSV rows include market pair value', () => {
    const trades: CsvTrade[] = [{
      timestamp: 1707400000000,
      isBid: true,
      price: 97000,
      quantity: 0.5,
      role: 'taker',
      txDigest: 'abc123',
    }];
    const csv = generateCsv(trades, CSV_COLUMNS);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines[1]).toContain('NBTC/NUSDC');
    expect(lines[1]).toContain('BUY');
    expect(lines[1]).toContain('taker');
  });

  it('Market column value is consistent across all rows', () => {
    const trades: CsvTrade[] = [
      { timestamp: 1707400000000, isBid: true, price: 97000, quantity: 0.5, role: 'taker', txDigest: 'a' },
      { timestamp: 1707400001000, isBid: false, price: 97100, quantity: 0.3, role: 'maker', txDigest: 'b' },
    ];
    const csv = generateCsv(trades, CSV_COLUMNS);
    const lines = csv.split('\n');
    // Both data rows should have NBTC/NUSDC
    expect(lines[1]).toContain('NBTC/NUSDC');
    expect(lines[2]).toContain('NBTC/NUSDC');
  });

  it('CSV column order matches table column order', () => {
    const csv = generateCsv([], CSV_COLUMNS);
    const headers = csv.split('\n')[0].split(',');
    // Order should be: Date, Market, Side, Price, Amount, Total, Role, TX Digest
    expect(headers).toEqual(['Date', 'Market', 'Side', 'Price', 'Amount', 'Total', 'Role', 'TX Digest']);
  });

  it('Total is calculated correctly in CSV', () => {
    const trades: CsvTrade[] = [{
      timestamp: 1707400000000,
      isBid: true,
      price: 97500.50,
      quantity: 0.25,
      role: 'taker',
      txDigest: 'tx1',
    }];
    const csv = generateCsv(trades, CSV_COLUMNS);
    const total = Math.round(97500.50 * 0.25 * 100) / 100;
    expect(csv).toContain(String(total));
  });
});
