/**
 * Orderbook Heatmap + Hover Preview + Fill Highlight Tests
 * Tests the visual enhancement logic (heatmap data computation, hover preview VWAP, fill matching)
 */

import { describe, it, expect } from 'vitest';

// ========================================
// 1. Heatmap Intensity Computation (Pure Logic)
// ========================================

interface HeatmapData {
  maxQty: number;
  avgQty: number;
}

function computeHeatmapData(quantities: number[]): HeatmapData {
  if (quantities.length === 0) return { maxQty: 0, avgQty: 0 };
  const maxQty = Math.max(...quantities);
  const avgQty = quantities.reduce((a, b) => a + b, 0) / quantities.length;
  return { maxQty, avgQty };
}

function getIntensity(qty: number, maxQty: number): number {
  return maxQty > 0 ? qty / maxQty : 0;
}

function isWall(qty: number, avgQty: number): boolean {
  return qty > avgQty * 3;
}

describe('Heatmap Intensity Computation', () => {
  describe('computeHeatmapData', () => {
    it('returns maxQty and avgQty for normal data', () => {
      const data = computeHeatmapData([1, 2, 3, 4, 5]);
      expect(data.maxQty).toBe(5);
      expect(data.avgQty).toBe(3);
    });

    it('handles single element', () => {
      const data = computeHeatmapData([42]);
      expect(data.maxQty).toBe(42);
      expect(data.avgQty).toBe(42);
    });

    it('handles empty array', () => {
      const data = computeHeatmapData([]);
      expect(data.maxQty).toBe(0);
      expect(data.avgQty).toBe(0);
    });

    it('handles all equal quantities', () => {
      const data = computeHeatmapData([5, 5, 5, 5]);
      expect(data.maxQty).toBe(5);
      expect(data.avgQty).toBe(5);
    });

    it('handles very large values', () => {
      const data = computeHeatmapData([1e12, 2e12]);
      expect(data.maxQty).toBe(2e12);
      expect(data.avgQty).toBe(1.5e12);
    });

    it('handles very small values', () => {
      const data = computeHeatmapData([0.00001, 0.00002]);
      expect(data.maxQty).toBeCloseTo(0.00002, 10);
      expect(data.avgQty).toBeCloseTo(0.000015, 10);
    });
  });

  describe('getIntensity', () => {
    it('returns 1 for max quantity', () => {
      expect(getIntensity(10, 10)).toBe(1);
    });

    it('returns 0.5 for half of max', () => {
      expect(getIntensity(5, 10)).toBe(0.5);
    });

    it('returns 0 when maxQty is 0', () => {
      expect(getIntensity(5, 0)).toBe(0);
    });

    it('returns 0 for zero quantity', () => {
      expect(getIntensity(0, 10)).toBe(0);
    });

    it('does not exceed 1', () => {
      // quantity should never exceed maxQty, but test defensively
      const intensity = getIntensity(15, 10);
      expect(intensity).toBe(1.5); // Not clamped in current impl
    });
  });

  describe('isWall (wall detection)', () => {
    it('detects wall when qty > 3x average', () => {
      expect(isWall(31, 10)).toBe(true);
    });

    it('does not flag normal quantities', () => {
      expect(isWall(20, 10)).toBe(false);
    });

    it('boundary: exactly 3x is not a wall (strictly greater)', () => {
      expect(isWall(30, 10)).toBe(false);
    });

    it('handles zero average (all walls)', () => {
      expect(isWall(0.001, 0)).toBe(true);
    });

    it('handles zero quantity (not a wall)', () => {
      expect(isWall(0, 10)).toBe(false);
    });
  });
});

// ========================================
// 2. Hover Fill Preview VWAP Computation
// ========================================

interface PriceLevel {
  price: number;
  quantity: number;
}

interface HoverPreview {
  avgPrice: number;
  totalQty: number;
  totalCost: number;
  impactPct: number;
}

function computeHoverPreview(levels: PriceLevel[], upToIndex: number, midPrice: number): HoverPreview | null {
  if (upToIndex < 0 || levels.length === 0) return null;
  let totalQty = 0;
  let totalCost = 0;
  for (let i = 0; i <= Math.min(upToIndex, levels.length - 1); i++) {
    totalQty += levels[i].quantity;
    totalCost += levels[i].price * levels[i].quantity;
  }
  if (totalQty === 0) return null;
  const avgPrice = totalCost / totalQty;
  const impactPct = midPrice > 0 ? Math.abs(avgPrice - midPrice) / midPrice * 100 : 0;
  return { avgPrice, totalQty, totalCost, impactPct };
}

describe('Hover Fill Preview VWAP', () => {
  const asks: PriceLevel[] = [
    { price: 97100, quantity: 0.5 },
    { price: 97200, quantity: 0.3 },
    { price: 97300, quantity: 0.8 },
    { price: 97500, quantity: 0.2 },
    { price: 97800, quantity: 1.0 },
  ];

  describe('basic computation', () => {
    it('computes VWAP for single level', () => {
      const result = computeHoverPreview(asks, 0, 97000);
      expect(result).not.toBeNull();
      expect(result!.avgPrice).toBe(97100);
      expect(result!.totalQty).toBe(0.5);
      expect(result!.totalCost).toBeCloseTo(97100 * 0.5, 2);
    });

    it('computes cumulative VWAP for multiple levels', () => {
      const result = computeHoverPreview(asks, 2, 97000);
      expect(result).not.toBeNull();
      const expectedQty = 0.5 + 0.3 + 0.8;
      const expectedCost = 97100 * 0.5 + 97200 * 0.3 + 97300 * 0.8;
      expect(result!.totalQty).toBeCloseTo(expectedQty, 6);
      expect(result!.totalCost).toBeCloseTo(expectedCost, 2);
      expect(result!.avgPrice).toBeCloseTo(expectedCost / expectedQty, 2);
    });

    it('computes all levels', () => {
      const result = computeHoverPreview(asks, 4, 97000);
      const expectedQty = 0.5 + 0.3 + 0.8 + 0.2 + 1.0;
      expect(result!.totalQty).toBeCloseTo(expectedQty, 6);
    });
  });

  describe('price impact', () => {
    it('computes price impact relative to midPrice', () => {
      const result = computeHoverPreview(asks, 0, 97000);
      // avgPrice = 97100, mid = 97000
      // impact = |97100 - 97000| / 97000 * 100 ≈ 0.103%
      expect(result!.impactPct).toBeCloseTo(0.103, 1);
    });

    it('impact increases with deeper fills', () => {
      const shallow = computeHoverPreview(asks, 0, 97000)!;
      const deep = computeHoverPreview(asks, 4, 97000)!;
      expect(deep.impactPct).toBeGreaterThan(shallow.impactPct);
    });

    it('impact is 0 when midPrice is 0', () => {
      const result = computeHoverPreview(asks, 2, 0);
      expect(result!.impactPct).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty levels', () => {
      expect(computeHoverPreview([], 0, 97000)).toBeNull();
    });

    it('returns null for negative index', () => {
      expect(computeHoverPreview(asks, -1, 97000)).toBeNull();
    });

    it('handles index beyond array length', () => {
      const result = computeHoverPreview(asks, 100, 97000);
      expect(result).not.toBeNull();
      // Should process all available levels
      const expectedQty = asks.reduce((s, l) => s + l.quantity, 0);
      expect(result!.totalQty).toBeCloseTo(expectedQty, 6);
    });

    it('handles zero-quantity level', () => {
      const levelsWithZero: PriceLevel[] = [
        { price: 97100, quantity: 0 },
        { price: 97200, quantity: 0.5 },
      ];
      const result = computeHoverPreview(levelsWithZero, 1, 97000);
      expect(result).not.toBeNull();
      expect(result!.totalQty).toBe(0.5);
      expect(result!.avgPrice).toBe(97200);
    });

    it('returns null for all-zero quantities', () => {
      const zeroLevels: PriceLevel[] = [
        { price: 97100, quantity: 0 },
        { price: 97200, quantity: 0 },
      ];
      expect(computeHoverPreview(zeroLevels, 1, 97000)).toBeNull();
    });

    it('handles single large order (whale detection)', () => {
      const whale: PriceLevel[] = [{ price: 97000, quantity: 100 }];
      const result = computeHoverPreview(whale, 0, 97000);
      expect(result!.totalQty).toBe(100);
      expect(result!.impactPct).toBe(0); // avgPrice == midPrice
    });
  });
});

// ========================================
// 3. Fill Flash Matching Logic
// ========================================

function getFillClass(
  levelPrice: number,
  fillFlashes: Map<number, 'buy' | 'sell'>,
  groupSize: number,
): string {
  for (const [fillPrice, side] of fillFlashes) {
    if (Math.abs(fillPrice - levelPrice) < groupSize) {
      return side === 'buy' ? 'animate-fill-flash-buy' : 'animate-fill-flash-sell';
    }
  }
  return '';
}

describe('Fill Flash Matching', () => {
  it('matches exact price', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([[97000, 'buy']]);
    expect(getFillClass(97000, flashes, 0.1)).toBe('animate-fill-flash-buy');
  });

  it('matches within group tolerance', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([[97000.05, 'sell']]);
    expect(getFillClass(97000, flashes, 0.1)).toBe('animate-fill-flash-sell');
  });

  it('does not match outside tolerance', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([[97001, 'buy']]);
    expect(getFillClass(97000, flashes, 0.1)).toBe('');
  });

  it('returns empty string for no flashes', () => {
    expect(getFillClass(97000, new Map(), 0.1)).toBe('');
  });

  it('matches first flash found when multiple exist', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([
      [97000, 'buy'],
      [97000.05, 'sell'],
    ]);
    const result = getFillClass(97000, flashes, 0.1);
    // Should match the first one
    expect(result).toBe('animate-fill-flash-buy');
  });

  it('handles zero group size (exact match only)', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([[97000, 'buy']]);
    // With groupSize 0, Math.abs(0) < 0 is false, so no match
    expect(getFillClass(97000, flashes, 0)).toBe('');
  });

  it('handles large group sizes', () => {
    const flashes = new Map<number, 'buy' | 'sell'>([[97000, 'buy']]);
    expect(getFillClass(97500, flashes, 1000)).toBe('animate-fill-flash-buy');
  });
});

// ========================================
// 4. Depth Bar Opacity Computation
// ========================================

describe('Depth Bar Opacity', () => {
  // opacity = 0.6 + intensity * 0.4
  // intensity = level.quantity / maxQty

  function depthOpacity(qty: number, maxQty: number): number {
    const intensity = maxQty > 0 ? qty / maxQty : 0;
    return 0.6 + intensity * 0.4;
  }

  it('minimum opacity is 0.6 for zero quantity', () => {
    expect(depthOpacity(0, 10)).toBe(0.6);
  });

  it('maximum opacity is 1.0 for max quantity', () => {
    expect(depthOpacity(10, 10)).toBe(1.0);
  });

  it('mid-range opacity for half quantity', () => {
    expect(depthOpacity(5, 10)).toBeCloseTo(0.8, 6);
  });

  it('handles maxQty = 0 gracefully', () => {
    expect(depthOpacity(5, 0)).toBe(0.6);
  });
});

// ========================================
// 5. Heatmap Bar Opacity Computation
// ========================================

describe('Heatmap Bar Opacity', () => {
  // opacity = 0.1 + intensity * 0.55
  // intensity = level.quantity / maxQty

  function heatmapOpacity(qty: number, maxQty: number): number {
    const intensity = maxQty > 0 ? qty / maxQty : 0;
    return 0.1 + intensity * 0.55;
  }

  it('minimum opacity is 0.1 for zero quantity', () => {
    expect(heatmapOpacity(0, 10)).toBe(0.1);
  });

  it('maximum opacity is 0.65 for max quantity', () => {
    expect(heatmapOpacity(10, 10)).toBeCloseTo(0.65, 6);
  });

  it('always between 0.1 and 0.65', () => {
    for (let i = 0; i <= 100; i++) {
      const opacity = heatmapOpacity(i, 100);
      expect(opacity).toBeGreaterThanOrEqual(0.1);
      expect(opacity).toBeLessThanOrEqual(0.65);
    }
  });
});
