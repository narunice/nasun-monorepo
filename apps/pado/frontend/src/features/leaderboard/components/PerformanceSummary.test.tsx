/**
 * PerformanceSummary Tests
 * Tests metric computation, display, loading state, badge integration.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerformanceSummary } from './PerformanceSummary';
import type { TraderStatsResponse, TraderPeriodStats, TraderFill } from '../types';
import type { TraderClassification } from '../hooks/useTraderClassification';

// ========================================
// Test Helpers
// ========================================

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
  allOverrides: Partial<TraderPeriodStats> = {},
  periodOverrides: Partial<Record<string, Partial<TraderPeriodStats> | null>> = {},
): TraderStatsResponse {
  return {
    address: '0x' + 'a'.repeat(64),
    nickname: null,
    stats: {
      '24h': periodOverrides['24h'] !== undefined
        ? (periodOverrides['24h'] === null ? null : makePeriodStats(periodOverrides['24h'] as Partial<TraderPeriodStats>))
        : null,
      '7d': periodOverrides['7d'] !== undefined
        ? (periodOverrides['7d'] === null ? null : makePeriodStats(periodOverrides['7d'] as Partial<TraderPeriodStats>))
        : null,
      '30d': periodOverrides['30d'] !== undefined
        ? (periodOverrides['30d'] === null ? null : makePeriodStats(periodOverrides['30d'] as Partial<TraderPeriodStats>))
        : null,
      'all': makePeriodStats(allOverrides),
    },
  };
}

function makeFill(overrides: Partial<TraderFill> = {}): TraderFill {
  return {
    txDigest: '0x' + Math.random().toString(16).slice(2, 18),
    poolId: '0xpool1',
    side: 'buy',
    price: '42000',
    baseQuantity: '1',
    quoteQuantity: '42000',
    timestamp: Date.now(),
    ...overrides,
  };
}

const defaultClassification: TraderClassification = {
  style: 'day-trader',
  label: 'Day Trader',
  description: 'Active intraday trading',
};

describe('PerformanceSummary', () => {
  // ========================================
  // Loading State
  // ========================================

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      const { container } = render(
        <PerformanceSummary
          stats={undefined}
          fills={[]}
          classification={defaultClassification}
          isLoading={true}
        />,
      );
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('does not show metric cards when loading', () => {
      render(
        <PerformanceSummary
          stats={undefined}
          fills={[]}
          classification={defaultClassification}
          isLoading={true}
        />,
      );
      expect(screen.queryByText('Total Volume')).toBeNull();
    });
  });

  // ========================================
  // Metric Display
  // ========================================

  describe('metric cards', () => {
    it('shows all 6 metric labels', () => {
      const stats = makeStatsResponse();
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('Total Volume')).toBeTruthy();
      expect(screen.getByText('Total Trades')).toBeTruthy();
      expect(screen.getByText('Avg Trade Size')).toBeTruthy();
      expect(screen.getByText('Largest Trade')).toBeTruthy();
      expect(screen.getByText('Best Rank')).toBeTruthy();
      expect(screen.getByText('Markets Traded')).toBeTruthy();
    });

    it('computes total volume from all-time stats', () => {
      const stats = makeStatsResponse({ volume: '75000' });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('$75.00K')).toBeTruthy();
    });

    it('computes total trades', () => {
      const stats = makeStatsResponse({ tradeCount: 350 });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('350')).toBeTruthy();
    });

    it('computes avg trade size', () => {
      const stats = makeStatsResponse({ volume: '10000', tradeCount: 100 });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      // 10000 / 100 = 100 -> $100.00
      expect(screen.getByText('$100.00')).toBeTruthy();
    });

    it('shows $0.00 avg trade size when no trades', () => {
      const stats = makeStatsResponse({ volume: '0', tradeCount: 0 });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      // Multiple $0.00 values expected
      const zeros = screen.getAllByText('$0.00');
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });

    it('computes largest trade from fills', () => {
      const fills = [
        makeFill({ quoteQuantity: '5000' }),
        makeFill({ quoteQuantity: '25000' }),
        makeFill({ quoteQuantity: '10000' }),
      ];
      const stats = makeStatsResponse();
      render(
        <PerformanceSummary
          stats={stats}
          fills={fills}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('$25.00K')).toBeTruthy();
    });

    it('shows $0.00 largest trade when no fills', () => {
      const stats = makeStatsResponse({ volume: '50000', tradeCount: 100 });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      // Largest trade should be $0.00
      const allText = screen.getByText('Largest Trade').parentElement!;
      expect(allText.textContent).toContain('$0.00');
    });

    it('computes best rank across all periods', () => {
      const stats = makeStatsResponse(
        { rank: 50 }, // all-time
        {
          '24h': { rank: 30 },
          '7d': { rank: 5 }, // best
          '30d': { rank: 20 },
        },
      );
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('#5')).toBeTruthy();
    });

    it('shows "--" when no rank data', () => {
      const stats: TraderStatsResponse = {
        address: '0x' + 'a'.repeat(64),
        nickname: null,
        stats: { '24h': null, '7d': null, '30d': null, 'all': null },
      };
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('--')).toBeTruthy();
    });

    it('shows unique pools count', () => {
      const stats = makeStatsResponse({ uniquePools: 4 });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('4')).toBeTruthy();
    });
  });

  // ========================================
  // Classification Label
  // ========================================

  describe('classification', () => {
    it('shows trading style label', () => {
      const stats = makeStatsResponse();
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('Day Trader')).toBeTruthy();
    });

    it('applies correct color for scalper', () => {
      const stats = makeStatsResponse();
      const { container } = render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={{ style: 'scalper', label: 'Scalper', description: '' }}
          isLoading={false}
        />,
      );
      expect(container.querySelector('.text-red-400')).toBeTruthy();
    });
  });

  // ========================================
  // Badges Section
  // ========================================

  describe('achievements', () => {
    it('shows achievements section for qualifying trader', () => {
      const stats = makeStatsResponse({
        volume: '100000',
        tradeCount: 500,
        uniquePools: 4,
        rank: 1,
      });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('Achievements')).toBeTruthy();
    });

    it('does not show achievements section for zero-achievement trader', () => {
      const stats = makeStatsResponse({
        volume: '10',
        tradeCount: 1,
        uniquePools: 1,
        rank: 200,
      });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.queryByText('Achievements')).toBeNull();
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('handles undefined stats', () => {
      render(
        <PerformanceSummary
          stats={undefined}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      // Should render without crashing
      expect(screen.getByText('Total Volume')).toBeTruthy();
    });

    it('handles stats with null all-period', () => {
      const stats: TraderStatsResponse = {
        address: '0x' + 'a'.repeat(64),
        nickname: null,
        stats: { '24h': null, '7d': null, '30d': null, 'all': null },
      };
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('Total Volume')).toBeTruthy();
    });

    it('formats million-dollar volume', () => {
      const stats = makeStatsResponse({ volume: '2500000' });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('$2.50M')).toBeTruthy();
    });

    it('handles non-numeric volume gracefully', () => {
      const stats = makeStatsResponse({ volume: 'invalid' });
      render(
        <PerformanceSummary
          stats={stats}
          fills={[]}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      // parseFloat('invalid') -> NaN -> 0
      const allText = screen.getByText('Total Volume').parentElement!;
      expect(allText.textContent).toContain('$0.00');
    });
  });
});
