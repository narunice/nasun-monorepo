/**
 * MyRankCard Tests
 * Tests loading, null/empty stats, rank display across periods.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TraderStatsResponse, TraderPeriodStats } from '../types';

// Mock useTraderStats
const mockUseTraderStats = vi.fn();
vi.mock('../hooks/useTraderStats', () => ({
  useTraderStats: (...args: unknown[]) => mockUseTraderStats(...args),
}));

import { MyRankCard } from './MyRankCard';

const ADDR = '0x' + 'a'.repeat(64);

function makePeriodStats(overrides: Partial<TraderPeriodStats> = {}): TraderPeriodStats {
  return {
    rank: 10,
    volume: '50000',
    tradeCount: 200,
    uniquePools: 3,
    rankChange: 0,
    ...overrides,
  };
}

function makeStatsResponse(
  periods: Partial<Record<string, Partial<TraderPeriodStats> | null>> = {},
): TraderStatsResponse {
  return {
    address: ADDR,
    nickname: null,
    stats: {
      '24h': periods['24h'] !== undefined
        ? (periods['24h'] === null ? null : makePeriodStats(periods['24h'] as Partial<TraderPeriodStats>))
        : null,
      '7d': periods['7d'] !== undefined
        ? (periods['7d'] === null ? null : makePeriodStats(periods['7d'] as Partial<TraderPeriodStats>))
        : null,
      '30d': periods['30d'] !== undefined
        ? (periods['30d'] === null ? null : makePeriodStats(periods['30d'] as Partial<TraderPeriodStats>))
        : null,
      'all': periods['all'] !== undefined
        ? (periods['all'] === null ? null : makePeriodStats(periods['all'] as Partial<TraderPeriodStats>))
        : null,
    },
  };
}

describe('MyRankCard', () => {
  // ========================================
  // Loading State
  // ========================================

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      mockUseTraderStats.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = render(<MyRankCard address={ADDR} />);
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('renders 4 skeleton cells (one per period)', () => {
      mockUseTraderStats.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = render(<MyRankCard address={ADDR} />);
      const skeletons = container.querySelectorAll('.bg-theme-bg-tertiary');
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ========================================
  // Null/Empty Data
  // ========================================

  describe('null/empty data', () => {
    it('returns null when stats is undefined', () => {
      mockUseTraderStats.mockReturnValue({ data: undefined, isLoading: false });
      const { container } = render(<MyRankCard address={ADDR} />);
      expect(container.innerHTML).toBe('');
    });

    it('returns null when all periods are null', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '24h': null, '7d': null, '30d': null, 'all': null }),
        isLoading: false,
      });
      const { container } = render(<MyRankCard address={ADDR} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ========================================
  // Data Display
  // ========================================

  describe('data display', () => {
    it('shows "My Ranking" title', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': { rank: 5, volume: '10000' } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('My Ranking')).toBeTruthy();
    });

    it('shows all 4 period labels', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '24h': {}, '7d': {}, '30d': {}, 'all': {} }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('24H')).toBeTruthy();
      expect(screen.getByText('7D')).toBeTruthy();
      expect(screen.getByText('30D')).toBeTruthy();
      expect(screen.getByText('All')).toBeTruthy();
    });

    it('shows rank number with # prefix', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': { rank: 42 } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('#42')).toBeTruthy();
    });

    it('shows volume formatted as USD', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': { rank: 5, volume: '75000' } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      // Volume: $75,000 (using toLocaleString with no fraction digits)
      expect(screen.getByText('$75,000')).toBeTruthy();
    });

    it('shows "-" for periods with no data', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': { rank: 5 }, '24h': null, '30d': null, 'all': null }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      // 3 periods with null data show "-"
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBe(3);
    });

    it('shows nickname when available', () => {
      const stats = makeStatsResponse({ '7d': {} });
      stats.nickname = 'TestUser';
      mockUseTraderStats.mockReturnValue({ data: stats, isLoading: false });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('TestUser')).toBeTruthy();
    });

    it('does not show nickname when null', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': {} }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.queryByText(ADDR)).toBeNull();
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('renders when only one period has data', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ 'all': { rank: 99, volume: '500' } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('#99')).toBeTruthy();
      expect(screen.getByText('$500')).toBeTruthy();
    });

    it('passes address to useTraderStats', () => {
      mockUseTraderStats.mockReturnValue({ data: undefined, isLoading: false });
      render(<MyRankCard address={ADDR} />);
      expect(mockUseTraderStats).toHaveBeenCalledWith(ADDR);
    });

    it('handles volume of 0', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '7d': { rank: 50, volume: '0' } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('$0')).toBeTruthy();
    });

    it('handles rank 1', () => {
      mockUseTraderStats.mockReturnValue({
        data: makeStatsResponse({ '24h': { rank: 1 } }),
        isLoading: false,
      });
      render(<MyRankCard address={ADDR} />);
      expect(screen.getByText('#1')).toBeTruthy();
    });
  });
});
