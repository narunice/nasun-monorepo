/**
 * Strategy Module Tests
 *
 * Tests grid order generation, inventory skew adjustment,
 * and order validation against risk limits.
 */

import { describe, it, expect } from 'vitest';
import { calculateOrders, validateOrders } from './strategy.js';
import type { LPConfig, OrderSpec, Inventory } from './config.js';
import type { OrderbookState } from './orderbook.js';

// ========================================
// Test Helpers
// ========================================

function makeConfig(overrides: Partial<LPConfig> = {}): LPConfig {
  return {
    spreadBps: 30,
    levelSpacingBps: 10,
    orderLevels: 3,
    orderSize: 0.01,
    updateIntervalMs: 10000,
    requoteThresholdBps: 50,
    refillThresholdBase: 0.5,
    refillThresholdQuote: 50000,
    maxOrderSize: 0.1,
    minSpreadBps: 10,
    maxConsecutiveFailures: 5,
    minPriceUsd: 50000,
    maxPriceUsd: 200000,
    gasRefillThreshold: 0.5,
    enableArbitrage: false,
    minArbitrageProfitBps: 10,
    maxArbitrageQuantity: 0.5,
    ...overrides,
  };
}

function makeInventory(base: number, quote: number): Inventory {
  return { base, quote };
}

function makeOrderbook(bestBid: number, bestAsk: number): OrderbookState {
  return {
    bestBid,
    bestAsk,
    midPrice: (bestBid + bestAsk) / 2,
    spread: bestAsk - bestBid,
    hasBids: bestBid > 0,
    hasAsks: bestAsk > 0,
  };
}

// ========================================
// calculateOrders
// ========================================

describe('calculateOrders', () => {
  it('generates correct number of bid and ask orders', () => {
    const config = makeConfig({ orderLevels: 5 });
    const inventory = makeInventory(1, 100000);
    const orders = calculateOrders(100000, config, inventory);

    const bids = orders.filter(o => o.isBid);
    const asks = orders.filter(o => !o.isBid);

    expect(bids.length).toBe(5);
    expect(asks.length).toBe(5);
    expect(orders.length).toBe(10);
  });

  it('places bids below mid price and asks above', () => {
    const config = makeConfig({ orderLevels: 3 });
    const midPrice = 100000;
    const inventory = makeInventory(0.5, 50000);
    const orders = calculateOrders(midPrice, config, inventory);

    const bids = orders.filter(o => o.isBid);
    const asks = orders.filter(o => !o.isBid);

    // All bid prices should be below mid price (in raw units: 100000 * 1e6 = 100000000000)
    const midPriceRaw = BigInt(midPrice * 1e6);
    for (const bid of bids) {
      expect(bid.price).toBeLessThan(midPriceRaw);
    }
    for (const ask of asks) {
      expect(ask.price).toBeGreaterThan(midPriceRaw);
    }
  });

  it('spreads levels correctly with spacing', () => {
    const config = makeConfig({
      spreadBps: 100, // 1%
      levelSpacingBps: 50, // 0.5%
      orderLevels: 3,
    });
    const midPrice = 100000;
    const inventory = makeInventory(0.5, 50000); // balanced
    const orders = calculateOrders(midPrice, config, inventory);

    const bids = orders.filter(o => o.isBid);

    // Bid 0: midPrice * (1 - 1%) = $99,000
    // Bid 1: midPrice * (1 - 1.5%) = $98,500
    // Bid 2: midPrice * (1 - 2.0%) = $98,000
    // With tick rounding to 100000 (0.1), these should be close
    expect(bids[0].price).toBeGreaterThan(bids[1].price);
    expect(bids[1].price).toBeGreaterThan(bids[2].price);
  });

  it('returns empty array when order quantity rounds to zero', () => {
    // With NBTC default lot size 1000 (0.00001), order size 0.000001 rounds to 0
    const config = makeConfig({ orderSize: 0.000001 });
    const inventory = makeInventory(1, 100000);
    const orders = calculateOrders(100000, config, inventory);

    expect(orders.length).toBe(0);
  });

  it('clamps bid price when it would cross best ask', () => {
    const config = makeConfig({ spreadBps: 5, orderLevels: 2 }); // very tight spread
    const midPrice = 100000;
    const inventory = makeInventory(0.5, 50000);
    const orderbook = makeOrderbook(99990, 100010); // tight orderbook

    const orders = calculateOrders(midPrice, config, inventory, orderbook);
    const bids = orders.filter(o => o.isBid);

    // All bids must be below best ask * 0.9999
    const maxBidRaw = BigInt(Math.floor(100010 * 0.9999 * 1e6));
    for (const bid of bids) {
      expect(bid.price).toBeLessThanOrEqual(maxBidRaw);
    }
  });

  it('clamps ask price when it would cross best bid', () => {
    const config = makeConfig({ spreadBps: 5, orderLevels: 2 });
    const midPrice = 100000;
    const inventory = makeInventory(0.5, 50000);
    const orderbook = makeOrderbook(99990, 100010);

    const orders = calculateOrders(midPrice, config, inventory, orderbook);
    const asks = orders.filter(o => !o.isBid);

    // All asks must be above best bid * 1.0001
    const minAskRaw = BigInt(Math.ceil(99990 * 1.0001 * 1e6));
    for (const ask of asks) {
      expect(ask.price).toBeGreaterThanOrEqual(minAskRaw);
    }
  });
});

// ========================================
// Inventory Skew Adjustment
// ========================================

describe('inventory skew adjustment', () => {
  it('widens bids when base is heavy (sell more aggressively)', () => {
    // 80% base value, 20% quote value
    // At $100k, 0.8 BTC = $80k, quote = $20k → baseRatio = 80%
    const config = makeConfig({ orderLevels: 1, spreadBps: 100 });
    const heavyBase = makeInventory(0.8, 20000); // 80% base
    const balanced = makeInventory(0.5, 50000);  // 50/50

    const heavyOrders = calculateOrders(100000, config, heavyBase);
    const balancedOrders = calculateOrders(100000, config, balanced);

    const heavyBid = heavyOrders.find(o => o.isBid)!;
    const balancedBid = balancedOrders.find(o => o.isBid)!;

    // Heavy base should have wider bid spread (lower bid price)
    expect(heavyBid.price).toBeLessThan(balancedBid.price);
  });

  it('widens asks when quote is heavy (buy more aggressively)', () => {
    // 80% quote value
    const config = makeConfig({ orderLevels: 1, spreadBps: 100 });
    const heavyQuote = makeInventory(0.2, 80000); // ~80% quote at $100k
    const balanced = makeInventory(0.5, 50000);

    const heavyOrders = calculateOrders(100000, config, heavyQuote);
    const balancedOrders = calculateOrders(100000, config, balanced);

    const heavyAsk = heavyOrders.find(o => !o.isBid)!;
    const balancedAsk = balancedOrders.find(o => !o.isBid)!;

    // Heavy quote should have wider ask spread (higher ask price)
    expect(heavyAsk.price).toBeGreaterThan(balancedAsk.price);
  });

  it('no adjustment when inventory is balanced', () => {
    const config = makeConfig({ orderLevels: 1, spreadBps: 100 });
    // 50/50 split at $100k: 0.5 BTC = $50k, $50k NUSDC
    const balanced = makeInventory(0.5, 50000);

    const orders = calculateOrders(100000, config, balanced);
    const bid = orders.find(o => o.isBid)!;
    const ask = orders.find(o => !o.isBid)!;

    // Spread should be symmetric around mid
    const midPriceRaw = BigInt(100000 * 1e6);
    const bidDist = midPriceRaw - bid.price;
    const askDist = ask.price - midPriceRaw;

    // Should be approximately equal (within tick rounding)
    const diff = Number(bidDist > askDist ? bidDist - askDist : askDist - bidDist);
    expect(diff).toBeLessThan(200000); // < $0.2 difference
  });

  it('handles zero inventory gracefully', () => {
    const config = makeConfig({ orderLevels: 1 });
    const empty = makeInventory(0, 0);

    const orders = calculateOrders(100000, config, empty);
    expect(orders.length).toBe(2); // still generates 1 bid + 1 ask
  });
});

// ========================================
// validateOrders
// ========================================

describe('validateOrders', () => {
  it('filters orders exceeding max quantity', () => {
    const config = makeConfig({ maxOrderSize: 0.01, minSpreadBps: 1 });
    const midPrice = 100000;

    // Create an order with quantity exceeding max (0.1 BTC when max is 0.01)
    const orders: OrderSpec[] = [
      { price: BigInt(99000 * 1e6), quantity: BigInt(0.1 * 1e8), isBid: true },  // too large
      { price: BigInt(99000 * 1e6), quantity: BigInt(0.005 * 1e8), isBid: true }, // ok
    ];

    const valid = validateOrders(orders, config, midPrice);
    expect(valid.length).toBe(1);
    expect(valid[0].quantity).toBe(BigInt(0.005 * 1e8));
  });

  it('filters orders below minimum spread', () => {
    const config = makeConfig({ minSpreadBps: 50, maxOrderSize: 1 }); // 0.5% min spread
    const midPrice = 100000;

    const orders: OrderSpec[] = [
      // Bid at $99,800 → 0.2% spread (below min)
      { price: BigInt(99800 * 1e6), quantity: 1000n, isBid: true },
      // Bid at $99,000 → 1.0% spread (above min)
      { price: BigInt(99000 * 1e6), quantity: 1000n, isBid: true },
      // Ask at $100,100 → 0.1% spread (below min)
      { price: BigInt(100100 * 1e6), quantity: 1000n, isBid: false },
      // Ask at $101,000 → 1.0% spread (above min)
      { price: BigInt(101000 * 1e6), quantity: 1000n, isBid: false },
    ];

    const valid = validateOrders(orders, config, midPrice);
    expect(valid.length).toBe(2);
    expect(valid.some(o => o.isBid && o.price === BigInt(99000 * 1e6))).toBe(true);
    expect(valid.some(o => !o.isBid && o.price === BigInt(101000 * 1e6))).toBe(true);
  });

  it('keeps orders within all limits', () => {
    const config = makeConfig({ minSpreadBps: 10, maxOrderSize: 0.1 });
    const midPrice = 100000;

    const orders: OrderSpec[] = [
      { price: BigInt(99500 * 1e6), quantity: BigInt(0.01 * 1e8), isBid: true },
      { price: BigInt(100500 * 1e6), quantity: BigInt(0.01 * 1e8), isBid: false },
    ];

    const valid = validateOrders(orders, config, midPrice);
    expect(valid.length).toBe(2);
  });
});
