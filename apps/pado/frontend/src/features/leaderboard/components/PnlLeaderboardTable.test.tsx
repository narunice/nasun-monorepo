/**
 * PnlLeaderboardTable Tests
 * Tests loading, empty states, follow filter, table headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PnlLeaderboardTrader } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockIsFollowing = vi.fn().mockReturnValue(false);
vi.mock('../hooks/useFollowedTraders', () => ({
  useFollowedTraders: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: vi.fn(),
    followedAddresses: [],
  }),
}));

import { PnlLeaderboardTable } from './PnlLeaderboardTable';

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);
const ADDR_C = '0x' + 'c'.repeat(64);

function makeTrader(overrides: Partial<PnlLeaderboardTrader> = {}): PnlLeaderboardTrader {
  return {
    rank: 1,
    address: ADDR_A,
    nickname: null,
    pnlUsd: '1000',
    pnlPercent: 10.0,
    tradeCount: 20,
    rankChange: 0,
    ...overrides,
  };
}

describe('PnlLeaderboardTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      const { container } = render(
        <PnlLeaderboardTable traders={[]} isLoading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('does not show table when loading', () => {
      const { container } = render(
        <PnlLeaderboardTable traders={[makeTrader()]} isLoading={true} />,
      );
      expect(container.querySelector('table')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows "No PnL data yet" when empty', () => {
      render(<PnlLeaderboardTable traders={[]} isLoading={false} />);
      expect(screen.getByText('No PnL data yet')).toBeTruthy();
      expect(screen.getByText(/Complete round-trip trades/)).toBeTruthy();
    });

    it('shows follow message when filtering', () => {
      render(<PnlLeaderboardTable traders={[]} isLoading={false} followFilter={true} />);
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
    });

    it('shows follow message when traders exist but none followed', () => {
      render(
        <PnlLeaderboardTable traders={[makeTrader()]} isLoading={false} followFilter={true} />,
      );
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
    });
  });

  describe('table headers', () => {
    it('renders all 6 column headers', () => {
      render(<PnlLeaderboardTable traders={[makeTrader()]} isLoading={false} />);
      expect(screen.getByText('Rank')).toBeTruthy();
      expect(screen.getByText('Trader')).toBeTruthy();
      expect(screen.getByText('PnL')).toBeTruthy();
      expect(screen.getByText('PnL %')).toBeTruthy();
      expect(screen.getByText('Trades')).toBeTruthy();
      expect(screen.getByText('Change')).toBeTruthy();
    });
  });

  describe('data rendering', () => {
    it('renders correct number of rows', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });

    it('highlights current user', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} currentUserAddress={ADDR_A} />,
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows[0].className).toContain('bg-pd3/5');
      expect(rows[1].className).not.toContain('bg-pd3/5');
    });
  });

  describe('follow filter', () => {
    it('filters to only followed traders', () => {
      mockIsFollowing.mockImplementation((addr: string) => addr === ADDR_B);
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
        makeTrader({ rank: 3, address: ADDR_C }),
      ];
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} followFilter={true} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles trader with zero PnL', () => {
      const traders = [makeTrader({ pnlUsd: '0', pnlPercent: 0 })];
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
    });

    it('handles trader with negative PnL', () => {
      const traders = [makeTrader({ pnlUsd: '-5000', pnlPercent: -25.5 })];
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
      expect(container.querySelector('.text-red-500')).toBeTruthy();
    });

    it('handles 100 traders', () => {
      const traders = Array.from({ length: 100 }, (_, i) =>
        makeTrader({ rank: i + 1, address: '0x' + i.toString(16).padStart(64, '0') }),
      );
      const { container } = render(
        <PnlLeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(100);
    });
  });
});
