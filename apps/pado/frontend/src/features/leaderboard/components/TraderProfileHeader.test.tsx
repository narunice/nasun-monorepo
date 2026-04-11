/**
 * TraderProfileHeader Tests
 * Tests profile identity, active indicator, classification badge, follow, explorer link, stats grid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TraderStatsResponse, TraderPeriodStats } from '../types';
import type { TraderClassification } from '../hooks/useTraderClassification';

// Mock network config
vi.mock('../../../config/network', () => ({
  NETWORK_CONFIG: {
    explorerUrl: 'https://explorer.nasun.io/devnet',
  },
}));

// Mock useFollowedTraders
const mockIsFollowing = vi.fn().mockReturnValue(false);
const mockToggleFollow = vi.fn();
vi.mock('../hooks/useFollowedTraders', () => ({
  useFollowedTraders: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: mockToggleFollow,
    followedAddresses: [],
    followCount: 5,
  }),
}));

import { TraderProfileHeader } from './TraderProfileHeader';

const ADDR = '0x' + 'a'.repeat(64);

function makeStats(overrides: Partial<TraderPeriodStats> = {}): TraderPeriodStats {
  return {
    rank: 10,
    volume: '50000',
    tradeCount: 200,
    uniquePools: 3,
    rankChange: 2,
    ...overrides,
  };
}

function makeStatsResponse(
  opts: {
    nickname?: string | null;
    lastTradeAt?: number | null;
    periods?: Partial<Record<string, Partial<TraderPeriodStats> | null>>;
  } = {},
): TraderStatsResponse {
  const { nickname = null, lastTradeAt = null, periods = {} } = opts;
  return {
    address: ADDR,
    nickname,
    lastTradeAt,
    stats: {
      '24h': periods['24h'] !== undefined
        ? (periods['24h'] === null ? null : makeStats(periods['24h'] as Partial<TraderPeriodStats>))
        : null,
      '7d': periods['7d'] !== undefined
        ? (periods['7d'] === null ? null : makeStats(periods['7d'] as Partial<TraderPeriodStats>))
        : makeStats(),
      '30d': periods['30d'] !== undefined
        ? (periods['30d'] === null ? null : makeStats(periods['30d'] as Partial<TraderPeriodStats>))
        : null,
      'all': periods['all'] !== undefined
        ? (periods['all'] === null ? null : makeStats(periods['all'] as Partial<TraderPeriodStats>))
        : makeStats(),
    },
  };
}

const defaultClassification: TraderClassification = {
  style: 'day-trader',
  label: 'Day Trader',
  description: 'Active intraday trading',
};

describe('TraderProfileHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  // ========================================
  // Identity Display
  // ========================================

  describe('identity', () => {
    it('shows nickname when available', () => {
      const stats = makeStatsResponse({ nickname: 'CryptoKing' });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('CryptoKing')).toBeTruthy();
    });

    it('shows shortened address when no nickname', () => {
      const stats = makeStatsResponse({ nickname: null });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText(/0xaaaa.*aaaa/)).toBeTruthy();
    });

    it('shows shortened address under nickname', () => {
      const stats = makeStatsResponse({ nickname: 'TestUser' });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('TestUser')).toBeTruthy();
      // Also shows shortened address as secondary
      const addrEl = screen.getByText(/0xaaaa.*aaaa/);
      expect(addrEl.className).toContain('font-mono');
    });

    it('renders TraderAvatar', () => {
      const stats = makeStatsResponse();
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      // TraderAvatar renders an SVG
      expect(container.querySelector('svg')).toBeTruthy();
    });
  });

  // ========================================
  // Active Indicator
  // ========================================

  describe('active indicator', () => {
    it('shows active indicator when last trade < 15 minutes', () => {
      const stats = makeStatsResponse({ lastTradeAt: Date.now() - 5 * 60 * 1000 });
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeTruthy();
    });

    it('does not show active indicator when last trade > 15 minutes', () => {
      const stats = makeStatsResponse({ lastTradeAt: Date.now() - 20 * 60 * 1000 });
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeNull();
    });

    it('does not show active indicator when lastTradeAt is null', () => {
      const stats = makeStatsResponse({ lastTradeAt: null });
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeNull();
    });

    it('shows "Active" text label when active', () => {
      const stats = makeStatsResponse({ lastTradeAt: Date.now() });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const activeLabels = screen.getAllByText('Active');
      expect(activeLabels.length).toBeGreaterThan(0);
    });
  });

  // ========================================
  // Classification Badge
  // ========================================

  describe('classification badge', () => {
    it('shows classification label', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader
          address={ADDR}
          stats={stats}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByText('Day Trader')).toBeTruthy();
    });

    it('applies correct color for scalper', () => {
      const stats = makeStatsResponse();
      const { container } = render(
        <TraderProfileHeader
          address={ADDR}
          stats={stats}
          classification={{ style: 'scalper', label: 'Scalper', description: '' }}
          isLoading={false}
        />,
      );
      const badge = container.querySelector('.text-red-400');
      expect(badge).toBeTruthy();
    });

    it('applies correct color for holder', () => {
      const stats = makeStatsResponse();
      const { container } = render(
        <TraderProfileHeader
          address={ADDR}
          stats={stats}
          classification={{ style: 'holder', label: 'Holder', description: '' }}
          isLoading={false}
        />,
      );
      const badge = container.querySelector('.text-emerald-400');
      expect(badge).toBeTruthy();
    });

    it('does not show classification when undefined', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.queryByText('Scalper')).toBeNull();
      expect(screen.queryByText('Day Trader')).toBeNull();
      expect(screen.queryByText('Swing Trader')).toBeNull();
      expect(screen.queryByText('Holder')).toBeNull();
    });
  });

  // ========================================
  // Follow Button
  // ========================================

  describe('follow button', () => {
    it('shows "Follow" when not following', () => {
      mockIsFollowing.mockReturnValue(false);
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('Follow')).toBeTruthy();
    });

    it('shows "Following" when following', () => {
      mockIsFollowing.mockReturnValue(true);
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('Following')).toBeTruthy();
    });

    it('calls toggleFollow on click', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      fireEvent.click(screen.getByText('Follow'));
      expect(mockToggleFollow).toHaveBeenCalledWith(ADDR);
    });

    it('follow button has min-height for accessibility', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const btn = screen.getByText('Follow');
      expect(btn.className).toContain('min-h-[44px]');
    });
  });

  // ========================================
  // Explorer Link
  // ========================================

  describe('explorer link', () => {
    it('renders explorer link with correct URL', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const link = screen.getByText('View on Explorer');
      expect(link.closest('a')!.getAttribute('href')).toBe(
        `https://explorer.nasun.io/devnet/address/${ADDR}`,
      );
    });

    it('opens explorer link in new tab', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const link = screen.getByText('View on Explorer').closest('a')!;
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  // ========================================
  // Stats Grid
  // ========================================

  describe('stats grid', () => {
    it('shows loading skeleton when isLoading', () => {
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={undefined} isLoading={true} />,
      );
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('shows period labels', () => {
      const stats = makeStatsResponse({
        periods: { '24h': {}, '7d': {}, '30d': {}, 'all': {} },
      });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('24H')).toBeTruthy();
      expect(screen.getByText('7D')).toBeTruthy();
      expect(screen.getByText('30D')).toBeTruthy();
      expect(screen.getByText('All')).toBeTruthy();
    });

    it('shows "No activity" for null period stats', () => {
      const stats = makeStatsResponse({
        periods: { '24h': null, '7d': null, '30d': null, 'all': null },
      });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      const noActivities = screen.getAllByText('No activity');
      expect(noActivities.length).toBe(4);
    });

    it('shows rank and volume for periods with data', () => {
      const stats = makeStatsResponse({
        periods: { '7d': { rank: 5, volume: '25000' } },
      });
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      // Volume formatted as $25.00K
      expect(container.textContent).toContain('$25.00K');
    });

    it('shows trade count in stats grid', () => {
      const stats = makeStatsResponse({
        periods: { 'all': { tradeCount: 150 } },
      });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText('150 trades')).toBeTruthy();
    });
  });

  // ========================================
  // Follower Count
  // ========================================

  describe('follower count', () => {
    it('shows "< 10 followers" when count is less than 10', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} followerCount={5} />,
      );
      expect(screen.getByText(/< 10/)).toBeTruthy();
      expect(screen.getByText(/followers/)).toBeTruthy();
    });

    it('shows actual count when 10 or more', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} followerCount={42} />,
      );
      expect(screen.getByText(/42/)).toBeTruthy();
    });

    it('defaults to 0 (< 10) when followerCount not provided', () => {
      const stats = makeStatsResponse();
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByText(/< 10/)).toBeTruthy();
    });
  });

  // ========================================
  // Genesis Pass Badge
  // ========================================

  describe('genesis pass badge', () => {
    it('shows GP badge when hasGenesisPass is true (with nickname)', () => {
      const stats = makeStatsResponse({ nickname: 'GPWhale' });
      (stats as any).hasGenesisPass = true;
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
      expect(screen.getByText('GPWhale')).toBeTruthy();
    });

    it('shows GP badge when hasGenesisPass is true (without nickname)', () => {
      const stats = makeStatsResponse({ nickname: null });
      (stats as any).hasGenesisPass = true;
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
    });

    it('does not show GP badge when hasGenesisPass is false', () => {
      const stats = makeStatsResponse({ nickname: 'NoGP' });
      (stats as any).hasGenesisPass = false;
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('does not show GP badge when hasGenesisPass is undefined', () => {
      const stats = makeStatsResponse({ nickname: 'Regular' });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('does not show GP badge when stats is undefined (loading)', () => {
      render(
        <TraderProfileHeader address={ADDR} stats={undefined} isLoading={true} />,
      );
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('shows GP badge alongside classification badge', () => {
      const stats = makeStatsResponse({ nickname: 'GPTrader' });
      (stats as any).hasGenesisPass = true;
      render(
        <TraderProfileHeader
          address={ADDR}
          stats={stats}
          classification={defaultClassification}
          isLoading={false}
        />,
      );
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
      expect(screen.getByText('Day Trader')).toBeTruthy();
    });
  });

  // ========================================
  // Badges
  // ========================================

  describe('badges', () => {
    it('shows earned badges for qualifying stats', () => {
      const stats = makeStatsResponse({
        periods: { 'all': { volume: '100000', tradeCount: 500, uniquePools: 4, rank: 1 } },
      });
      const { container } = render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      // Should display badge elements
      const badgeTitles = container.querySelectorAll('[title]');
      expect(badgeTitles.length).toBeGreaterThan(0);
    });

    it('shows no badges for new trader', () => {
      const stats = makeStatsResponse({
        periods: { 'all': { volume: '10', tradeCount: 1, uniquePools: 1, rank: 200 } },
      });
      render(
        <TraderProfileHeader address={ADDR} stats={stats} isLoading={false} />,
      );
      // No badge title attributes for qualifying achievements
      expect(screen.queryByText('Whale')).toBeNull();
      expect(screen.queryByText('Machine Gun')).toBeNull();
    });
  });
});
