/**
 * Points Leaderboard Tests (T2-12)
 * Tests PointsTraderRow, PointsLeaderboardTable, ModeSelector.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PointsLeaderboardTrader, LeaderboardMode } from '../types';

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useFollowedTraders
const mockIsFollowing = vi.fn().mockReturnValue(false);
const mockToggleFollow = vi.fn();
vi.mock('../hooks/useFollowedTraders', () => ({
  useFollowedTraders: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: mockToggleFollow,
    followedAddresses: [],
  }),
}));

vi.mock('@nasun/profile-react', () => ({
  useProfile: () => ({ data: null, isLoading: false, isFetched: true }),
  resolveAvatarUrl: () => null,
}));

import { PointsTraderRow } from './PointsTraderRow';
import { PointsLeaderboardTable } from './PointsLeaderboardTable';
import { ModeSelector } from './ModeSelector';

// ===== Test Data Helpers =====

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);
const ADDR_C = '0x' + 'c'.repeat(64);

function makeTrader(overrides: Partial<PointsLeaderboardTrader> = {}): PointsLeaderboardTrader {
  return {
    rank: 1,
    address: ADDR_A,
    nickname: null,
    totalPoints: 1500,
    tradeCount: 25,
    volumeUsd: '12345.67',
    rankChange: 0,
    ...overrides,
  };
}

// ========================================
// 1. PointsTraderRow
// ========================================

describe('PointsTraderRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  describe('rendering', () => {
    it('renders rank, address, points, volume, trades', () => {
      const trader = makeTrader({ rank: 5, totalPoints: 2500, tradeCount: 42, volumeUsd: '98765.43' });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const row = container.querySelector('tr')!;
      expect(row).toBeTruthy();
      // Check rank
      expect(row.textContent).toContain('5');
      // Check points formatted
      expect(row.textContent).toContain('2.5K');
      // Check trade count
      expect(row.textContent).toContain('42');
    });

    it('displays nickname when present', () => {
      const trader = makeTrader({ nickname: 'whale_trader' });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(container.textContent).toContain('whale_trader');
      // Also shows shortened address
      expect(container.textContent).toContain('0xaaaa');
    });

    it('displays shortened address when no nickname', () => {
      const trader = makeTrader({ nickname: null, address: ADDR_B });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(container.textContent).toContain('0xbbbb');
      expect(container.textContent).toContain('...bbbb');
    });

    it('highlights current user row', () => {
      const trader = makeTrader({ address: ADDR_A });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} isCurrentUser={true} /></tbody></table>
      );
      const row = container.querySelector('tr')!;
      expect(row.className).toContain('bg-pd3/5');
    });

    it('does not highlight non-current user', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} isCurrentUser={false} /></tbody></table>
      );
      const row = container.querySelector('tr')!;
      expect(row.className).not.toContain('bg-pd3/5');
    });
  });

  describe('points formatting', () => {
    it.each([
      [0, '0'],
      [999, '999'],
      [1000, '1.0K'],
      [1500, '1.5K'],
      [10000, '10.0K'],
      [999999, '1000.0K'],  // 999999 < 1M, formatted as K (toFixed, no locale)
      [1000000, '1.0M'],
      [1500000, '1.5M'],
      [50000000, '50.0M'],
    ])('formats %d points as %s', (points, expected) => {
      const trader = makeTrader({ totalPoints: points });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      // Find the pd3-colored span (points display)
      const pointsSpan = container.querySelector('.text-pd3') as HTMLElement;
      expect(pointsSpan).toBeTruthy();
      expect(pointsSpan.textContent).toBe(expected);
    });
  });

  describe('volume formatting', () => {
    it.each([
      ['0.00', '$0.00'],
      ['123.45', '$123.45'],
      ['1234.56', '$1.23K'],
      ['999999.99', '$1000.00K'],
      ['1000000.00', '$1.00M'],
      ['5000000', '$5.00M'],
    ])('formats volumeUsd "%s" as "%s"', (volumeUsd, expected) => {
      const trader = makeTrader({ volumeUsd });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const cells = container.querySelectorAll('td');
      // Volume is in the 4th td (index 3)
      expect(cells[3].textContent).toBe(expected);
    });

    it('handles empty string volumeUsd', () => {
      const trader = makeTrader({ volumeUsd: '' });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const cells = container.querySelectorAll('td');
      expect(cells[3].textContent).toBe('$0.00');
    });

    it('handles NaN volumeUsd', () => {
      const trader = makeTrader({ volumeUsd: 'not-a-number' });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const cells = container.querySelectorAll('td');
      expect(cells[3].textContent).toBe('$0.00');
    });
  });

  describe('navigation', () => {
    it('navigates to trader profile on row click', () => {
      const trader = makeTrader({ address: ADDR_A });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      fireEvent.click(container.querySelector('tr')!);
      expect(mockNavigate).toHaveBeenCalledWith(`/leaderboard/trader/${ADDR_A}`);
    });
  });

  describe('follow/unfollow', () => {
    it('calls toggleFollow on star click without navigating', () => {
      const trader = makeTrader({ address: ADDR_B });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const starBtn = container.querySelector('button')!;
      fireEvent.click(starBtn);
      expect(mockToggleFollow).toHaveBeenCalledWith(ADDR_B);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows filled star when following', () => {
      mockIsFollowing.mockReturnValue(true);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const svg = container.querySelector('svg')!;
      // fill attribute is on the <svg> element, not <polygon>
      expect(svg.getAttribute('fill')).toBe('currentColor');
    });

    it('shows outline star when not following', () => {
      mockIsFollowing.mockReturnValue(false);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('fill')).toBe('none');
    });
  });

  describe('genesis pass badge', () => {
    it('shows GP badge when hasGenesisPass is true', () => {
      const trader = makeTrader({ hasGenesisPass: true });
      render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
    });

    it('does not show GP badge when hasGenesisPass is false', () => {
      const trader = makeTrader({ hasGenesisPass: false });
      render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('does not show GP badge when hasGenesisPass is undefined', () => {
      const trader = makeTrader();
      render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(screen.queryByTitle('Genesis Pass Holder')).toBeNull();
    });

    it('shows GP badge alongside nickname', () => {
      const trader = makeTrader({ nickname: 'GPHolder', hasGenesisPass: true });
      render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(screen.getByText('GPHolder')).toBeTruthy();
      expect(screen.getByTitle('Genesis Pass Holder')).toBeTruthy();
    });
  });

  describe('rank change', () => {
    it('shows positive rank change', () => {
      const trader = makeTrader({ rankChange: 3 });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(container.textContent).toContain('3');
      const green = container.querySelector('.text-green-400');
      expect(green).toBeTruthy();
    });

    it('shows negative rank change', () => {
      const trader = makeTrader({ rankChange: -2 });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      expect(container.textContent).toContain('2');
      const red = container.querySelector('.text-red-400');
      expect(red).toBeTruthy();
    });

    it('shows dash for zero rank change', () => {
      const trader = makeTrader({ rankChange: 0 });
      const { container } = render(
        <table><tbody><PointsTraderRow trader={trader} /></tbody></table>
      );
      const muted = container.querySelector('.text-theme-text-muted');
      expect(muted).toBeTruthy();
      expect(muted!.textContent).toBe('-');
    });
  });
});

// ========================================
// 2. PointsLeaderboardTable
// ========================================

describe('PointsLeaderboardTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      const { container } = render(
        <PointsLeaderboardTable traders={[]} isLoading={true} />
      );
      // SkeletonTable renders multiple SkeletonRow divs
      const pulse = container.querySelector('.animate-pulse');
      expect(pulse).toBeTruthy();
    });

    it('does not show data rows when loading', () => {
      const { container } = render(
        <PointsLeaderboardTable traders={[makeTrader()]} isLoading={true} />
      );
      expect(container.querySelector('table')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows "No points data yet" when empty and not filtering', () => {
      render(
        <PointsLeaderboardTable traders={[]} isLoading={false} />
      );
      expect(screen.getByText('No points data yet')).toBeTruthy();
      expect(screen.getByText(/Trade on any pool/)).toBeTruthy();
    });

    it('shows follow message when filtering and no followed traders', () => {
      render(
        <PointsLeaderboardTable traders={[]} isLoading={false} followFilter={true} />
      );
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
    });

    it('shows follow message when traders exist but none are followed', () => {
      render(
        <PointsLeaderboardTable
          traders={[makeTrader()]}
          isLoading={false}
          followFilter={true}
        />
      );
      expect(screen.getByText('Not following any traders yet')).toBeTruthy();
    });
  });

  describe('table headers', () => {
    it('renders all column headers', () => {
      render(
        <PointsLeaderboardTable traders={[makeTrader()]} isLoading={false} />
      );
      expect(screen.getByText('Rank')).toBeTruthy();
      expect(screen.getByText('Trader')).toBeTruthy();
      expect(screen.getByText('Points')).toBeTruthy();
      expect(screen.getByText('Volume')).toBeTruthy();
      expect(screen.getByText('Trades')).toBeTruthy();
      expect(screen.getByText('Change')).toBeTruthy();
    });
  });

  describe('data rendering', () => {
    it('renders correct number of rows', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
        makeTrader({ rank: 3, address: ADDR_C }),
      ];
      const { container } = render(
        <PointsLeaderboardTable traders={traders} isLoading={false} />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    it('highlights current user row', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <PointsLeaderboardTable
          traders={traders}
          isLoading={false}
          currentUserAddress={ADDR_B}
        />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows[0].className).not.toContain('bg-pd3/5');
      expect(rows[1].className).toContain('bg-pd3/5');
    });
  });

  describe('follow filter', () => {
    it('filters to only followed traders', () => {
      mockIsFollowing.mockImplementation((addr: string) => addr === ADDR_A);
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
        makeTrader({ rank: 3, address: ADDR_C }),
      ];
      const { container } = render(
        <PointsLeaderboardTable
          traders={traders}
          isLoading={false}
          followFilter={true}
        />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });

    it('shows all traders when follow filter is off', () => {
      const traders = [
        makeTrader({ rank: 1, address: ADDR_A }),
        makeTrader({ rank: 2, address: ADDR_B }),
      ];
      const { container } = render(
        <PointsLeaderboardTable
          traders={traders}
          isLoading={false}
          followFilter={false}
        />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles trader with 0 points', () => {
      const { container } = render(
        <PointsLeaderboardTable
          traders={[makeTrader({ totalPoints: 0 })]}
          isLoading={false}
        />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });

    it('handles 100 traders (max API limit)', () => {
      const traders = Array.from({ length: 100 }, (_, i) =>
        makeTrader({ rank: i + 1, address: '0x' + i.toString(16).padStart(64, '0') })
      );
      const { container } = render(
        <PointsLeaderboardTable traders={traders} isLoading={false} />
      );
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(100);
    });
  });
});

// ========================================
// 3. ModeSelector
// ========================================

describe('ModeSelector', () => {
  it('renders all four mode buttons', () => {
    render(<ModeSelector selected="volume" onSelect={vi.fn()} />);
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('PnL')).toBeTruthy();
    expect(screen.getByText('Score')).toBeTruthy();
  });

  it('highlights selected mode', () => {
    render(<ModeSelector selected="score" onSelect={vi.fn()} />);
    const scoreBtn = screen.getByText('Score');
    expect(scoreBtn.className).toContain('bg-theme-bg-secondary');
    expect(scoreBtn.className).toContain('text-theme-text-primary');
  });

  it('does not highlight non-selected modes', () => {
    render(<ModeSelector selected="score" onSelect={vi.fn()} />);
    const volumeBtn = screen.getByText('Volume');
    expect(volumeBtn.className).toContain('text-theme-text-muted');
    expect(volumeBtn.className).not.toContain('bg-theme-bg-secondary');
  });

  it('calls onSelect with correct mode when clicked', () => {
    const onSelect = vi.fn();
    render(<ModeSelector selected="volume" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Activity'));
    expect(onSelect).toHaveBeenCalledWith('activity');

    fireEvent.click(screen.getByText('PnL'));
    expect(onSelect).toHaveBeenCalledWith('pnl');

    fireEvent.click(screen.getByText('Score'));
    expect(onSelect).toHaveBeenCalledWith('score');

    fireEvent.click(screen.getByText('Volume'));
    expect(onSelect).toHaveBeenCalledWith('volume');
  });

  it('calls onSelect even when clicking already selected mode', () => {
    const onSelect = vi.fn();
    render(<ModeSelector selected="score" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Score'));
    expect(onSelect).toHaveBeenCalledWith('score');
  });

  it.each(['activity', 'volume', 'pnl', 'score'] as LeaderboardMode[])(
    'correctly highlights %s mode',
    (mode) => {
      render(<ModeSelector selected={mode} onSelect={vi.fn()} />);
      const labels: Record<LeaderboardMode, string> = {
        activity: 'Activity',
        volume: 'Volume',
        pnl: 'PnL',
        score: 'Score',
      };
      const selectedBtn = screen.getByText(labels[mode]);
      expect(selectedBtn.className).toContain('bg-theme-bg-secondary');
    },
  );
});
