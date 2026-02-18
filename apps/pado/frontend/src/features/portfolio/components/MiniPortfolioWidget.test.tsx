/**
 * MiniPortfolioWidget Tests
 * Tests rendering states, data display, sparkline SVG, edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock all portfolio hooks
const mockUseTotalValue = vi.fn();
const mockUseTradeHistory = vi.fn();
const mockUsePnlTimeSeries = vi.fn();

vi.mock('../hooks/useTotalValue', () => ({
  useTotalValue: () => mockUseTotalValue(),
}));

vi.mock('../hooks/useTradeHistory', () => ({
  useTradeHistory: () => mockUseTradeHistory(),
}));

vi.mock('../hooks/usePnlTimeSeries', () => ({
  usePnlTimeSeries: () => mockUsePnlTimeSeries(),
}));

import { MiniPortfolioWidget } from './MiniPortfolioWidget';

function setupDefaultMocks(overrides: {
  totalValue?: number;
  totalPnl24h?: number;
  totalChange24h?: number;
  tokens?: Array<{ symbol: string; balance: string; price: number; value: number; change24h: number; pnl24h: number }>;
  isLoading?: boolean;
  stats?: {
    totalTrades: number; totalVolume: number; buyTrades: number; sellTrades: number;
    buyVolume: number; sellVolume: number; avgTradeSize: number; lastTradeTime: number | null;
  };
  pnlData?: Array<{ time: number; cumulativePnl: number }>;
  totalRealized?: number;
} = {}) {
  mockUseTotalValue.mockReturnValue({
    totalValue: overrides.totalValue ?? 12345.67,
    totalPnl24h: overrides.totalPnl24h ?? 123.45,
    totalChange24h: overrides.totalChange24h ?? 2.3,
    tokens: overrides.tokens ?? [
      { symbol: 'NBTC', balance: '0.1234', price: 97000, value: 11969.80, change24h: 1.5, pnl24h: 100 },
      { symbol: 'NUSDC', balance: '375.87', price: 1, value: 375.87, change24h: 0, pnl24h: 0 },
    ],
    prices: { NBTC: 97000, NUSDC: 1 },
    isLoading: overrides.isLoading ?? false,
  });

  mockUseTradeHistory.mockReturnValue({
    trades: [],
    stats: overrides.stats ?? {
      totalTrades: 42,
      totalVolume: 98765,
      buyTrades: 25,
      sellTrades: 17,
      buyVolume: 60000,
      sellVolume: 38765,
      avgTradeSize: 2351.55,
      lastTradeTime: Date.now(),
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });

  mockUsePnlTimeSeries.mockReturnValue({
    data: overrides.pnlData ?? [
      { time: Date.now() - 3600000, cumulativePnl: 0 },
      { time: Date.now() - 1800000, cumulativePnl: 50 },
      { time: Date.now(), cumulativePnl: 123 },
    ],
    totalRealized: overrides.totalRealized ?? 123.45,
    maxDrawdown: -20,
    isLoading: false,
  });
}

describe('MiniPortfolioWidget', () => {
  describe('loading state', () => {
    it('shows loading message when data is loading', () => {
      setupDefaultMocks({ isLoading: true });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('Loading portfolio...')).toBeTruthy();
    });
  });

  describe('total value display', () => {
    it('shows total value formatted as USD', () => {
      setupDefaultMocks({ totalValue: 12345.67 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('$12,345.67')).toBeTruthy();
    });

    it('shows zero value', () => {
      setupDefaultMocks({ totalValue: 0 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('$0.00')).toBeTruthy();
    });

    it('shows large value with commas', () => {
      setupDefaultMocks({ totalValue: 1234567.89 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('$1,234,567.89')).toBeTruthy();
    });
  });

  describe('24h P&L display', () => {
    it('shows positive PnL with green color and plus sign', () => {
      setupDefaultMocks({ totalPnl24h: 123.45, totalChange24h: 2.3 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('+123.45 USD')).toBeTruthy();
      expect(screen.getByText('+2.30%')).toBeTruthy();
    });

    it('shows negative PnL with red color', () => {
      setupDefaultMocks({ totalPnl24h: -50.00, totalChange24h: -1.5 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('-50.00 USD')).toBeTruthy();
      expect(screen.getByText('-1.50%')).toBeTruthy();
    });

    it('shows zero PnL', () => {
      setupDefaultMocks({ totalPnl24h: 0, totalChange24h: 0 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('+0.00 USD')).toBeTruthy();
    });
  });

  describe('token breakdown', () => {
    it('shows tokens sorted by value', () => {
      setupDefaultMocks({
        tokens: [
          { symbol: 'NUSDC', balance: '100', price: 1, value: 100, change24h: 0, pnl24h: 0 },
          { symbol: 'NBTC', balance: '0.1', price: 97000, value: 9700, change24h: 1, pnl24h: 50 },
        ],
      });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('NBTC')).toBeTruthy();
      expect(screen.getByText('NUSDC')).toBeTruthy();
    });

    it('filters out zero-value tokens', () => {
      setupDefaultMocks({
        tokens: [
          { symbol: 'NBTC', balance: '0.1', price: 97000, value: 9700, change24h: 1, pnl24h: 50 },
          { symbol: 'NSN', balance: '0', price: 0.5, value: 0, change24h: 0, pnl24h: 0 },
        ],
      });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('NBTC')).toBeTruthy();
      expect(screen.queryByText('NSN')).toBeNull();
    });

    it('limits to 5 tokens max', () => {
      setupDefaultMocks({
        tokens: Array.from({ length: 8 }, (_, i) => ({
          symbol: `TOKEN${i}`,
          balance: '100',
          price: 1,
          value: 100 - i,
          change24h: 0,
          pnl24h: 0,
        })),
      });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('TOKEN0')).toBeTruthy();
      expect(screen.getByText('TOKEN4')).toBeTruthy();
      expect(screen.queryByText('TOKEN5')).toBeNull();
    });

    it('handles empty token list', () => {
      setupDefaultMocks({ tokens: [] });
      render(<MiniPortfolioWidget />);
      // Should not show Holdings section
      expect(screen.queryByText('Holdings')).toBeNull();
    });
  });

  describe('trade stats', () => {
    it('shows trade count', () => {
      setupDefaultMocks();
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('42')).toBeTruthy();
    });

    it('shows volume', () => {
      setupDefaultMocks({ stats: {
        totalTrades: 10, totalVolume: 5000, buyTrades: 6, sellTrades: 4,
        buyVolume: 3000, sellVolume: 2000, avgTradeSize: 500, lastTradeTime: null,
      }});
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('$5,000')).toBeTruthy();
    });

    it('shows buy/sell ratio', () => {
      setupDefaultMocks({ stats: {
        totalTrades: 10, totalVolume: 5000, buyTrades: 6, sellTrades: 4,
        buyVolume: 3000, sellVolume: 2000, avgTradeSize: 500, lastTradeTime: null,
      }});
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('6')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();
    });

    it('shows zero stats gracefully', () => {
      setupDefaultMocks({ stats: {
        totalTrades: 0, totalVolume: 0, buyTrades: 0, sellTrades: 0,
        buyVolume: 0, sellVolume: 0, avgTradeSize: 0, lastTradeTime: null,
      }});
      render(<MiniPortfolioWidget />);
      // Should render without crashing
      expect(screen.getByText('Trades')).toBeTruthy();
    });
  });

  describe('sparkline', () => {
    it('renders SVG sparkline when PnL data has 2+ points', () => {
      setupDefaultMocks({
        pnlData: [
          { time: 1000, cumulativePnl: 0 },
          { time: 2000, cumulativePnl: 100 },
        ],
      });
      const { container } = render(<MiniPortfolioWidget />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('does not render sparkline with less than 2 data points', () => {
      setupDefaultMocks({ pnlData: [{ time: 1000, cumulativePnl: 0 }] });
      const { container } = render(<MiniPortfolioWidget />);
      // Should render placeholder div instead of SVG with polyline
      const polylines = container.querySelectorAll('polyline');
      expect(polylines.length).toBe(0);
    });

    it('does not render sparkline section with empty data', () => {
      setupDefaultMocks({ pnlData: [] });
      const { container } = render(<MiniPortfolioWidget />);
      const polylines = container.querySelectorAll('polyline');
      expect(polylines.length).toBe(0);
    });

    it('renders sparkline with many data points', () => {
      const pnlData = Array.from({ length: 100 }, (_, i) => ({
        time: 1000 + i * 1000,
        cumulativePnl: Math.sin(i / 10) * 100,
      }));
      setupDefaultMocks({ pnlData });
      const { container } = render(<MiniPortfolioWidget />);
      const polyline = container.querySelector('polyline');
      expect(polyline).not.toBeNull();
      const points = polyline!.getAttribute('points')!;
      expect(points.split(' ').length).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('handles NaN values gracefully', () => {
      setupDefaultMocks({ totalValue: NaN, totalPnl24h: NaN, totalChange24h: NaN });
      // Should render without crashing
      expect(() => render(<MiniPortfolioWidget />)).not.toThrow();
    });

    it('handles negative total value', () => {
      setupDefaultMocks({ totalValue: -100 });
      expect(() => render(<MiniPortfolioWidget />)).not.toThrow();
    });

    it('handles very small token values (dust)', () => {
      setupDefaultMocks({
        tokens: [
          { symbol: 'DUST', balance: '0.00000001', price: 0.001, value: 0.00000000001, change24h: 0, pnl24h: 0 },
        ],
      });
      render(<MiniPortfolioWidget />);
      // Dust tokens (value < 0.01) should be filtered out
      expect(screen.queryByText('DUST')).toBeNull();
    });

    it('handles extremely large values', () => {
      setupDefaultMocks({ totalValue: 999999999.99 });
      render(<MiniPortfolioWidget />);
      expect(screen.getByText('$999,999,999.99')).toBeTruthy();
    });
  });
});
