/**
 * PnlTraderRow Tests
 * Tests PnL formatting, positive/negative coloring, navigation, follow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { PnlLeaderboardTrader } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockIsFollowing = vi.fn().mockReturnValue(false);
const mockToggleFollow = vi.fn();
vi.mock('../hooks/useFollowedTraders', () => ({
  useFollowedTraders: () => ({
    isFollowing: mockIsFollowing,
    toggleFollow: mockToggleFollow,
    followedAddresses: [],
  }),
}));

import { PnlTraderRow } from './PnlTraderRow';

const ADDR_A = '0x' + 'a'.repeat(64);

function makeTrader(overrides: Partial<PnlLeaderboardTrader> = {}): PnlLeaderboardTrader {
  return {
    rank: 1,
    address: ADDR_A,
    nickname: null,
    pnlUsd: '1000.00',
    pnlPercent: 12.5,
    tradeCount: 20,
    rankChange: 0,
    ...overrides,
  };
}

describe('PnlTraderRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFollowing.mockReturnValue(false);
  });

  // ========================================
  // PnL Formatting
  // ========================================

  describe('PnL formatting', () => {
    it.each([
      ['0', '+$0.00'],
      ['0.00', '+$0.00'],
      ['123.45', '+$123.45'],
      ['999.99', '+$999.99'],
      ['1000', '+$1.00K'],
      ['5678.90', '+$5.68K'],
      ['1000000', '+$1.00M'],
      ['5000000', '+$5.00M'],
    ])('formats positive PnL "%s" as "%s"', (pnlUsd, expected) => {
      const trader = makeTrader({ pnlUsd });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      expect(pnlCell.textContent).toBe(expected);
    });

    it.each([
      ['-100', '-$100.00'],
      ['-1234.56', '-$1.23K'],
      ['-50000', '-$50.00K'],
      ['-1000000', '-$1.00M'],
    ])('formats negative PnL "%s" as "%s"', (pnlUsd, expected) => {
      const trader = makeTrader({ pnlUsd });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      expect(pnlCell.textContent).toBe(expected);
    });

    it('handles NaN pnlUsd', () => {
      const trader = makeTrader({ pnlUsd: 'invalid' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      // formatPnl returns '$0.00' (no sign) for NaN via early return
      expect(pnlCell.textContent).toBe('$0.00');
    });

    it('handles empty string pnlUsd', () => {
      const trader = makeTrader({ pnlUsd: '' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      // formatPnl returns '$0.00' (no sign) for NaN via early return
      expect(pnlCell.textContent).toBe('$0.00');
    });
  });

  // ========================================
  // PnL Coloring
  // ========================================

  describe('PnL coloring', () => {
    it('positive PnL is green', () => {
      const trader = makeTrader({ pnlUsd: '500' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlSpan = container.querySelectorAll('td')[2].querySelector('span')!;
      expect(pnlSpan.className).toContain('text-green-500');
    });

    it('negative PnL is red', () => {
      const trader = makeTrader({ pnlUsd: '-500' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlSpan = container.querySelectorAll('td')[2].querySelector('span')!;
      expect(pnlSpan.className).toContain('text-red-500');
    });

    it('zero PnL is green (>= 0)', () => {
      const trader = makeTrader({ pnlUsd: '0' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlSpan = container.querySelectorAll('td')[2].querySelector('span')!;
      expect(pnlSpan.className).toContain('text-green-500');
    });
  });

  // ========================================
  // PnL Percent
  // ========================================

  describe('PnL percent', () => {
    it('shows positive percent with + sign', () => {
      const trader = makeTrader({ pnlUsd: '1000', pnlPercent: 25.5 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const percentCell = container.querySelectorAll('td')[3];
      expect(percentCell.textContent).toBe('+25.50%');
    });

    it('shows negative percent without extra sign (already negative)', () => {
      const trader = makeTrader({ pnlUsd: '-500', pnlPercent: -10.25 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const percentCell = container.querySelectorAll('td')[3];
      expect(percentCell.textContent).toBe('-10.25%');
    });

    it('shows zero percent', () => {
      const trader = makeTrader({ pnlUsd: '0', pnlPercent: 0 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const percentCell = container.querySelectorAll('td')[3];
      expect(percentCell.textContent).toBe('+0.00%');
    });

    it('formats percent to 2 decimal places', () => {
      const trader = makeTrader({ pnlPercent: 99.999 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const percentCell = container.querySelectorAll('td')[3];
      expect(percentCell.textContent).toBe('+100.00%');
    });

    it('percent color matches PnL color', () => {
      const trader = makeTrader({ pnlUsd: '-100', pnlPercent: -5 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const percentSpan = container.querySelectorAll('td')[3].querySelector('span')!;
      expect(percentSpan.className).toContain('text-red-500');
    });
  });

  // ========================================
  // Navigation
  // ========================================

  describe('navigation', () => {
    it('navigates to trader profile on row click', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      fireEvent.click(container.querySelector('tr')!);
      expect(mockNavigate).toHaveBeenCalledWith(`/leaderboard/trader/${ADDR_A}`);
    });

    it('star click does not navigate', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      fireEvent.click(container.querySelector('button')!);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockToggleFollow).toHaveBeenCalledWith(ADDR_A);
    });
  });

  // ========================================
  // Current User Highlighting
  // ========================================

  describe('current user', () => {
    it('highlights current user row', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} isCurrentUser={true} /></tbody></table>,
      );
      expect(container.querySelector('tr')!.className).toContain('bg-pd3/5');
    });

    it('current user name uses accent color', () => {
      const trader = makeTrader({ nickname: 'MyName' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} isCurrentUser={true} /></tbody></table>,
      );
      expect(container.querySelector('.text-pd3')).toBeTruthy();
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('renders with 6 columns (Rank, Trader, PnL, PnL%, Trades, Change)', () => {
      const trader = makeTrader();
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      expect(container.querySelectorAll('td').length).toBe(6);
    });

    it('handles very small negative PnL', () => {
      const trader = makeTrader({ pnlUsd: '-0.01', pnlPercent: -0.001 });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      expect(pnlCell.textContent).toBe('-$0.01');
    });

    it('handles very large PnL', () => {
      const trader = makeTrader({ pnlUsd: '99999999.99' });
      const { container } = render(
        <table><tbody><PnlTraderRow trader={trader} /></tbody></table>,
      );
      const pnlCell = container.querySelectorAll('td')[2];
      expect(pnlCell.textContent).toBe('+$100.00M');
    });
  });
});
