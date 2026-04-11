/**
 * LeaderboardTable (Volume) Tests
 * Tests loading, empty states, follow filter, table headers, data rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LeaderboardTrader } from '../types';

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

import { LeaderboardTable } from './LeaderboardTable';

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);
const ADDR_C = '0x' + 'c'.repeat(64);

function makeTrader(overrides: Partial<LeaderboardTrader> = {}): LeaderboardTrader {
  return {
    rank: 1,
    address: ADDR_A,
    nickname: null,
    volumeUsd: '5000',
    tradeCount: 10,
    uniquePools: 1,
    rankChange: 0,
    lastTradeAt: 0,
    ...overrides,
  };
}

describe('LeaderboardTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  // ========================================
  // Loading State
  // ========================================

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      const { container } = render(
        <LeaderboardTable traders={[]} isLoading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('does not show table when loading', () => {
      const { container } = render(
        <LeaderboardTable traders={[makeTrader()]} isLoading={true} />,
      );
      expect(container.querySelector('table')).toBeNull();
    });
  });

  // ========================================
  // Empty States
  // ========================================

  describe('empty state', () => {
    it('shows "No traders yet" when empty and not filtering', () => {
      render(<LeaderboardTable traders={[]} isLoading={false} />);
      expect(screen.getByText('No traders yet')).toBeTruthy();
      expect(screen.getByText(/Start trading to appear/)).toBeTruthy();
    });

    it('shows follow message when filtering and no followed traders', () => {
      render(<LeaderboardTable traders={[]} isLoading={false} followFilter={true} />);
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
      expect(screen.getByText(/Star traders to track/)).toBeTruthy();
    });

    it('shows follow message when traders exist but none are followed', () => {
      render(
        <LeaderboardTable traders={[makeTrader()]} isLoading={false} followFilter={true} />,
      );
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
    });
  });

  // ========================================
  // Table Headers
  // ========================================

  describe('table headers', () => {
    it('renders all column headers', () => {
      render(<LeaderboardTable traders={[makeTrader()]} isLoading={false} />);
      expect(screen.getByText('Rank')).toBeTruthy();
      expect(screen.getByText('Trader')).toBeTruthy();
      expect(screen.getByText('Volume')).toBeTruthy();
      expect(screen.getByText('Trades')).toBeTruthy();
      expect(screen.getByText('Change')).toBeTruthy();
    });
  });

  // ========================================
  // Data Rendering
  // ========================================

  describe('data rendering', () => {
    it('renders correct number of rows', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
        makeTrader({ rank: 3, address: ADDR_C }),
      ];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(3);
    });

    it('highlights current user row', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <LeaderboardTable
          traders={traders}
          isLoading={false}
          currentUserAddress={ADDR_B}
        />,
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows[0].className).not.toContain('bg-pd3/5');
      expect(rows[1].className).toContain('bg-pd3/5');
    });

    it('handles null currentUserAddress (no highlights)', () => {
      const traders = [makeTrader({ rank: 1, address: ADDR_A })];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} currentUserAddress={null} />,
      );
      const row = container.querySelector('tbody tr')!;
      expect(row.className).not.toContain('bg-pd3/5');
    });
  });

  // ========================================
  // Follow Filter
  // ========================================

  describe('follow filter', () => {
    it('filters to only followed traders', () => {
      mockIsFollowing.mockImplementation((addr: string) => addr === ADDR_A);
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
        makeTrader({ rank: 3, address: ADDR_C }),
      ];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} followFilter={true} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
    });

    it('shows all traders when follow filter is off', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} followFilter={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });

    it('shows all when followFilter is undefined (default)', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('handles single trader', () => {
      const { container } = render(
        <LeaderboardTable traders={[makeTrader()]} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
    });

    it('handles 100 traders (max API limit)', () => {
      const traders = Array.from({ length: 100 }, (_, i) =>
        makeTrader({ rank: i + 1, address: '0x' + i.toString(16).padStart(64, '0') }),
      );
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(100);
    });

    it('uses address as key (no duplicate key warnings for unique addresses)', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A, nickname: 'same' }),
        makeTrader({ rank: 2, address: ADDR_B, nickname: 'same' }),
      ];
      const { container } = render(
        <LeaderboardTable traders={traders} isLoading={false} />,
      );
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    });
  });

  // ========================================
  // Genesis Pass Badge
  // ========================================

  describe('genesis pass badge', () => {
    it('shows GP badge for genesis pass holder', () => {
      const traders = [makeTrader({ rank: 1, address: ADDR_A, hasGenesisPass: true })];
      render(<LeaderboardTable traders={traders} isLoading={false} />);
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
    });

    it('does not show GP badge when hasGenesisPass is false', () => {
      const traders = [makeTrader({ rank: 1, address: ADDR_A, hasGenesisPass: false })];
      render(<LeaderboardTable traders={traders} isLoading={false} />);
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('does not show GP badge when hasGenesisPass is undefined', () => {
      const traders = [makeTrader({ rank: 1, address: ADDR_A })];
      render(<LeaderboardTable traders={traders} isLoading={false} />);
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('shows GP badge only for holders in a mixed list', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A, hasGenesisPass: true }),
        makeTrader({ rank: 2, address: ADDR_B, hasGenesisPass: false }),
        makeTrader({ rank: 3, address: ADDR_C, hasGenesisPass: true }),
      ];
      render(<LeaderboardTable traders={traders} isLoading={false} />);
      expect(screen.getAllByTitle('Genesis Pass Holder').length).toBe(2);
    });

    it('shows GP badge alongside nickname', () => {
      const traders = [makeTrader({ rank: 1, address: ADDR_A, nickname: 'Whale', hasGenesisPass: true })];
      render(<LeaderboardTable traders={traders} isLoading={false} />);
      expect(screen.getByText('Whale')).toBeTruthy();
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
    });
  });
});
