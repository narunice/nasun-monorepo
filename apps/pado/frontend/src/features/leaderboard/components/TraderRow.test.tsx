/**
 * TraderRow Tests (Volume Leaderboard)
 * Tests rendering, volume formatting, active indicator, badges, navigation, follow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { LeaderboardTrader } from '../types';

// Mock navigate
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

import { TraderRow } from './TraderRow';

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);

function makeTrader(overrides: Partial<LeaderboardTrader> = {}): LeaderboardTrader {
  return {
    rank: 1,
    address: ADDR_A,
    nickname: null,
    volumeUsd: '5000.00',
    tradeCount: 10,
    uniquePools: 2,
    rankChange: 0,
    lastTradeAt: 0,
    ...overrides,
  };
}

describe('TraderRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  // ========================================
  // Rendering
  // ========================================

  describe('rendering', () => {
    it('renders rank, address, volume, trades', () => {
      const trader = makeTrader({ rank: 7, volumeUsd: '12345.67', tradeCount: 42 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.textContent).toContain('7');
      expect(container.textContent).toContain('$12.35K');
      expect(container.textContent).toContain('42');
    });

    it('displays nickname when present', () => {
      const trader = makeTrader({ nickname: 'CryptoKing' });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.textContent).toContain('CryptoKing');
      // Also shows shortened address below nickname
      expect(container.textContent).toContain('0xaaaa');
    });

    it('displays shortened address when no nickname', () => {
      const trader = makeTrader({ nickname: null, address: ADDR_B });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.textContent).toContain('0xbbbb');
      expect(container.textContent).toContain('...bbbb');
    });

    it('does not show secondary address line when no nickname', () => {
      const trader = makeTrader({ nickname: null });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      // Only one instance of shortened address (in name slot), no font-mono sub-line
      const monoSpans = container.querySelectorAll('.font-mono');
      // Should have the volume span (font-mono) but not address sub-line
      const addressSubLine = container.querySelector('.text-xs.text-theme-text-muted.font-mono');
      expect(addressSubLine).toBeNull();
    });

    it('highlights current user row', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} isCurrentUser={true} /></tbody></table>,
      );
      const row = container.querySelector('tr')!;
      expect(row.className).toContain('bg-pd3/5');
    });

    it('does not highlight non-current user row', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} isCurrentUser={false} /></tbody></table>,
      );
      const row = container.querySelector('tr')!;
      expect(row.className).not.toContain('bg-pd3/5');
    });

    it('current user name is styled with text-pd3', () => {
      const trader = makeTrader({ nickname: 'Me' });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} isCurrentUser={true} /></tbody></table>,
      );
      const nameSpan = container.querySelector('.text-pd3');
      expect(nameSpan).toBeTruthy();
      expect(nameSpan!.textContent).toContain('Me');
    });

    it('short address (<=12 chars) is not truncated', () => {
      const trader = makeTrader({ nickname: null, address: '0xabcd1234' });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.textContent).toContain('0xabcd1234');
      expect(container.textContent).not.toContain('...');
    });
  });

  // ========================================
  // Volume Formatting
  // ========================================

  describe('volume formatting', () => {
    it.each([
      ['0', '$0.00'],
      ['0.00', '$0.00'],
      ['123.45', '$123.45'],
      ['999.99', '$999.99'],
      ['1000', '$1.00K'],
      ['1234.56', '$1.23K'],
      ['50000', '$50.00K'],
      ['999999.99', '$1000.00K'],
      ['1000000', '$1.00M'],
      ['5000000', '$5.00M'],
      ['123456789', '$123.46M'],
    ])('formats volumeUsd "%s" as "%s"', (volumeUsd, expected) => {
      const trader = makeTrader({ volumeUsd });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const volumeCell = container.querySelectorAll('td')[2];
      expect(volumeCell.textContent).toBe(expected);
    });

    it('handles NaN volumeUsd', () => {
      const trader = makeTrader({ volumeUsd: 'not-a-number' });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const volumeCell = container.querySelectorAll('td')[2];
      expect(volumeCell.textContent).toBe('$0.00');
    });

    it('handles empty string volumeUsd', () => {
      const trader = makeTrader({ volumeUsd: '' });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const volumeCell = container.querySelectorAll('td')[2];
      expect(volumeCell.textContent).toBe('$0.00');
    });
  });

  // ========================================
  // Active Indicator
  // ========================================

  describe('active indicator', () => {
    it('shows green dot when last trade is within 15 minutes', () => {
      const trader = makeTrader({ lastTradeAt: Date.now() - 5 * 60 * 1000 }); // 5 min ago
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeTruthy();
    });

    it('does not show green dot when last trade is older than 15 minutes', () => {
      const trader = makeTrader({ lastTradeAt: Date.now() - 20 * 60 * 1000 }); // 20 min ago
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeNull();
    });

    it('does not show green dot when lastTradeAt is 0', () => {
      const trader = makeTrader({ lastTradeAt: 0 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeNull();
    });

    it('shows green dot at exactly 15-minute boundary', () => {
      // At exactly 15 minutes, Date.now() - lastTradeAt === 15*60*1000, which is NOT < threshold
      const trader = makeTrader({ lastTradeAt: Date.now() - 15 * 60 * 1000 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeNull();
    });

    it('shows green dot at just under 15 minutes', () => {
      const trader = makeTrader({ lastTradeAt: Date.now() - 14 * 60 * 1000 - 59 * 1000 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const dot = container.querySelector('.bg-green-400.animate-pulse');
      expect(dot).toBeTruthy();
    });
  });

  // ========================================
  // Badges (silver/gold only from leaderboard data)
  // ========================================

  describe('inline badges', () => {
    it('shows no badges for small trader', () => {
      const trader = makeTrader({ volumeUsd: '100', tradeCount: 1, uniquePools: 1, rank: 200 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      // BadgeDisplay returns null for empty badges, no badge title attributes
      // (note: follow button has title="Follow" so we check for badge-specific titles)
      const badgeEl = container.querySelector('[title*="Trader"]');
      expect(badgeEl).toBeNull();
    });

    it('shows silver badge for $10K+ volume trader', () => {
      const trader = makeTrader({ volumeUsd: '15000', tradeCount: 5, rank: 100 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const badge = container.querySelector('[title*="Serious Trader"]');
      expect(badge).toBeTruthy();
    });

    it('shows gold badge for $100K+ volume trader', () => {
      const trader = makeTrader({ volumeUsd: '150000', tradeCount: 5, rank: 100 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const badge = container.querySelector('[title*="Whale"]');
      expect(badge).toBeTruthy();
    });
  });

  // ========================================
  // Navigation
  // ========================================

  describe('navigation', () => {
    it('navigates to trader profile on row click', () => {
      const trader = makeTrader({ address: ADDR_A });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      fireEvent.click(container.querySelector('tr')!);
      expect(mockNavigate).toHaveBeenCalledWith(`/leaderboard/trader/${ADDR_A}`);
    });

    it('does not navigate when star button is clicked', () => {
      const trader = makeTrader({ address: ADDR_B });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const starBtn = container.querySelector('button')!;
      fireEvent.click(starBtn);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Follow/Unfollow
  // ========================================

  describe('follow/unfollow', () => {
    it('calls toggleFollow on star click', () => {
      const trader = makeTrader({ address: ADDR_B });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      fireEvent.click(container.querySelector('button')!);
      expect(mockToggleFollow).toHaveBeenCalledWith(ADDR_B);
    });

    it('shows filled star when following', () => {
      mockIsFollowing.mockReturnValue(true);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('fill')).toBe('currentColor');
    });

    it('shows outline star when not following', () => {
      mockIsFollowing.mockReturnValue(false);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('fill')).toBe('none');
    });

    it('star button has correct title attribute', () => {
      mockIsFollowing.mockReturnValue(true);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.querySelector('button')!.getAttribute('title')).toBe('Unfollow');
    });

    it('unfollowed star button has Follow title', () => {
      mockIsFollowing.mockReturnValue(false);
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.querySelector('button')!.getAttribute('title')).toBe('Follow');
    });
  });

  // ========================================
  // Rank Change
  // ========================================

  describe('rank change', () => {
    it('shows positive rank change in green', () => {
      const trader = makeTrader({ rankChange: 5 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.querySelector('.text-green-400')).toBeTruthy();
    });

    it('shows negative rank change in red', () => {
      const trader = makeTrader({ rankChange: -3 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      expect(container.querySelector('.text-red-400')).toBeTruthy();
    });

    it('shows dash for zero rank change', () => {
      const trader = makeTrader({ rankChange: 0 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const lastCell = container.querySelectorAll('td')[4];
      expect(lastCell.textContent).toBe('-');
    });
  });

  // ========================================
  // Trade Count Formatting
  // ========================================

  describe('trade count formatting', () => {
    it('formats trade count with locale string', () => {
      const trader = makeTrader({ tradeCount: 1234 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const tradeCell = container.querySelectorAll('td')[3];
      expect(tradeCell.textContent).toBe('1,234');
    });

    it('shows 0 trades', () => {
      const trader = makeTrader({ tradeCount: 0 });
      const { container } = render(
        <table><tbody><TraderRow trader={trader} /></tbody></table>,
      );
      const tradeCell = container.querySelectorAll('td')[3];
      expect(tradeCell.textContent).toBe('0');
    });
  });
});
