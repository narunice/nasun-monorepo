/**
 * canvasRenderer Tests
 * Tests the canvas-based share card rendering utilities.
 * Since canvas operations require a DOM, we test the pure helper functions
 * and verify card generation doesn't throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderTradeCard,
  renderPnlCard,
  renderPortfolioCard,
  canvasToBlob,
  downloadShareCard,
  copyShareCardToClipboard,
  type TradeCardData,
  type PnlCardData,
  type PortfolioCardData,
} from './canvasRenderer';

// ========================================
// 1. Trade Card Rendering
// ========================================

describe('renderTradeCard', () => {
  const baseData: TradeCardData = {
    pair: 'NBTC/NUSDC',
    side: 'BUY',
    price: 97000,
    quantity: 0.1234,
    total: 11969.80,
    timestamp: Date.now(),
  };

  it('returns an HTMLCanvasElement with correct dimensions', () => {
    const canvas = renderTradeCard(baseData);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
  });

  it('renders buy side without PnL', () => {
    const canvas = renderTradeCard({ ...baseData, side: 'BUY' });
    expect(canvas.width).toBe(600);
  });

  it('renders sell side without PnL', () => {
    const canvas = renderTradeCard({ ...baseData, side: 'SELL' });
    expect(canvas.width).toBe(600);
  });

  it('renders with positive PnL', () => {
    const canvas = renderTradeCard({
      ...baseData,
      pnl: 500.25,
      pnlPct: 4.18,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with negative PnL', () => {
    const canvas = renderTradeCard({
      ...baseData,
      pnl: -200.50,
      pnlPct: -1.67,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with zero PnL', () => {
    const canvas = renderTradeCard({
      ...baseData,
      pnl: 0,
      pnlPct: 0,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with nickname', () => {
    const canvas = renderTradeCard({
      ...baseData,
      nickname: 'whale_trader',
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with txDigest', () => {
    const canvas = renderTradeCard({
      ...baseData,
      txDigest: 'abc123...xyz',
    });
    expect(canvas.width).toBe(600);
  });

  it('handles very large values', () => {
    const canvas = renderTradeCard({
      ...baseData,
      price: 999999.99,
      quantity: 100,
      total: 99999999,
      pnl: 5000000,
      pnlPct: 500,
    });
    expect(canvas.width).toBe(600);
  });

  it('handles very small values', () => {
    const canvas = renderTradeCard({
      ...baseData,
      price: 0.0001,
      quantity: 0.000001,
      total: 0.0000001,
    });
    expect(canvas.width).toBe(600);
  });
});

// ========================================
// 2. PnL Card Rendering
// ========================================

describe('renderPnlCard', () => {
  const baseData: PnlCardData = {
    totalPnl: 1234.56,
    totalPnlPct: 12.34,
    period: '24H',
    winRate: 65.5,
    totalTrades: 42,
    totalVolume: 98765,
    bestTrade: 500,
    worstTrade: -200,
    timestamp: Date.now(),
  };

  it('returns an HTMLCanvasElement with correct dimensions', () => {
    const canvas = renderPnlCard(baseData);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
  });

  it('renders positive PnL', () => {
    const canvas = renderPnlCard(baseData);
    expect(canvas.width).toBe(600);
  });

  it('renders negative PnL', () => {
    const canvas = renderPnlCard({
      ...baseData,
      totalPnl: -500,
      totalPnlPct: -5.5,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders zero PnL', () => {
    const canvas = renderPnlCard({
      ...baseData,
      totalPnl: 0,
      totalPnlPct: 0,
      winRate: 0,
      totalTrades: 0,
      totalVolume: 0,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with nickname', () => {
    const canvas = renderPnlCard({
      ...baseData,
      nickname: 'top_trader',
    });
    expect(canvas.width).toBe(600);
  });

  it('renders different periods', () => {
    for (const period of ['24H', '7D', '30D', 'All Time']) {
      const canvas = renderPnlCard({ ...baseData, period });
      expect(canvas.width).toBe(600);
    }
  });

  it('handles 100% win rate', () => {
    const canvas = renderPnlCard({
      ...baseData,
      winRate: 100,
      worstTrade: 0,
    });
    expect(canvas.width).toBe(600);
  });

  it('handles 0% win rate', () => {
    const canvas = renderPnlCard({
      ...baseData,
      winRate: 0,
      bestTrade: 0,
    });
    expect(canvas.width).toBe(600);
  });

  it('handles large volume values', () => {
    const canvas = renderPnlCard({
      ...baseData,
      totalVolume: 5_000_000,
    });
    expect(canvas.width).toBe(600);
  });
});

// ========================================
// 3. Portfolio Card Rendering
// ========================================

describe('renderPortfolioCard', () => {
  const baseData: PortfolioCardData = {
    totalValue: 12345.67,
    pnl24h: 123.45,
    change24h: 2.3,
    tokens: [
      { symbol: 'NBTC', value: 9700, allocation: 78.5 },
      { symbol: 'NUSDC', value: 2500, allocation: 20.2 },
      { symbol: 'NASUN', value: 145, allocation: 1.3 },
    ],
    totalTrades: 42,
    totalVolume: 98765,
    timestamp: Date.now(),
  };

  it('returns an HTMLCanvasElement with correct dimensions', () => {
    const canvas = renderPortfolioCard(baseData);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
  });

  it('renders positive portfolio change', () => {
    const canvas = renderPortfolioCard(baseData);
    expect(canvas.width).toBe(600);
  });

  it('renders negative portfolio change', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      pnl24h: -50,
      change24h: -1.5,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with balance masking', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      maskBalances: true,
    });
    expect(canvas.width).toBe(600);
  });

  it('renders with nickname', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      nickname: 'portfolio_king',
    });
    expect(canvas.width).toBe(600);
  });

  it('handles empty token list', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      tokens: [],
    });
    expect(canvas.width).toBe(600);
  });

  it('handles single token', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      tokens: [{ symbol: 'NBTC', value: 12345, allocation: 100 }],
    });
    expect(canvas.width).toBe(600);
  });

  it('handles 5+ tokens (limits to 5)', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      tokens: Array.from({ length: 8 }, (_, i) => ({
        symbol: `TOKEN${i}`,
        value: 1000 - i * 100,
        allocation: 12.5,
      })),
    });
    expect(canvas.width).toBe(600);
  });

  it('handles zero total value', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      totalValue: 0,
      pnl24h: 0,
      change24h: 0,
    });
    expect(canvas.width).toBe(600);
  });

  it('handles very large portfolio value', () => {
    const canvas = renderPortfolioCard({
      ...baseData,
      totalValue: 999999999.99,
    });
    expect(canvas.width).toBe(600);
  });
});

// ========================================
// 4. Export Utilities
// ========================================

describe('canvasToBlob', () => {
  it('converts canvas to blob', async () => {
    const canvas = renderTradeCard({
      pair: 'NBTC/NUSDC',
      side: 'BUY',
      price: 97000,
      quantity: 0.1,
      total: 9700,
      timestamp: Date.now(),
    });
    const blob = await canvasToBlob(canvas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('downloadShareCard', () => {
  it('creates and clicks a download link', async () => {
    const canvas = renderTradeCard({
      pair: 'NBTC/NUSDC',
      side: 'BUY',
      price: 97000,
      quantity: 0.1,
      total: 9700,
      timestamp: Date.now(),
    });

    // Mock URL.createObjectURL and revokeObjectURL
    const mockUrl = 'blob:mock-url';
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => mockUrl);
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    await downloadShareCard(canvas, 'test.png');

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

    // Restore
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });
});

describe('copyShareCardToClipboard', () => {
  it('returns false when clipboard API is not available', async () => {
    const canvas = renderTradeCard({
      pair: 'NBTC/NUSDC',
      side: 'BUY',
      price: 97000,
      quantity: 0.1,
      total: 9700,
      timestamp: Date.now(),
    });

    // Mock clipboard.write to throw
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: vi.fn().mockRejectedValue(new Error('Not supported')),
      },
      writable: true,
      configurable: true,
    });

    const result = await copyShareCardToClipboard(canvas);
    expect(result).toBe(false);

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when clipboard write succeeds', async () => {
    const canvas = renderTradeCard({
      pair: 'NBTC/NUSDC',
      side: 'BUY',
      price: 97000,
      quantity: 0.1,
      total: 9700,
      timestamp: Date.now(),
    });

    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });

    // Need to mock ClipboardItem
    const originalClipboardItem = globalThis.ClipboardItem;
    globalThis.ClipboardItem = vi.fn() as unknown as typeof ClipboardItem;

    const result = await copyShareCardToClipboard(canvas);
    expect(result).toBe(true);

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    globalThis.ClipboardItem = originalClipboardItem;
  });
});
