/**
 * Phase C — Account Polish E2E Tests
 *
 * Validates:
 * 13. TransferHistory filters (direction + token type)
 * 14. InsufficientBalancePrompt guidance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferHistory } from './TransferHistory';
import { InsufficientBalancePrompt } from '../../trading/components/InsufficientBalancePrompt';

// ======================================================
// Mock Hooks
// ======================================================

const mockTransfers = [
  { id: 'tx1_NBTC_0', type: 'sent' as const, token: 'NBTC', amount: 0.5, address: '0xabc...', timestamp: 1709600000000, txDigest: 'tx1' },
  { id: 'tx2_NUSDC_0', type: 'received' as const, token: 'NUSDC', amount: 100.0, address: '0xdef...', timestamp: 1709590000000, txDigest: 'tx2' },
  { id: 'tx3_NBTC_0', type: 'received' as const, token: 'NBTC', amount: 1.0, address: '0xghi...', timestamp: 1709580000000, txDigest: 'tx3' },
  { id: 'tx4_NUSDC_0', type: 'sent' as const, token: 'NUSDC', amount: 50.0, address: '0xjkl...', timestamp: 1709570000000, txDigest: 'tx4' },
  { id: 'tx5_NSN_0', type: 'received' as const, token: 'NSN', amount: 1000.0, address: '0xmno...', timestamp: 1709560000000, txDigest: 'tx5' },
];

let mockHookReturn = {
  transfers: mockTransfers,
  isLoading: false,
  error: null as string | null,
  refetch: vi.fn(),
};

vi.mock('@nasun/wallet', () => ({
  useWallet: () => ({ status: 'unlocked', account: { address: '0xtest' } }),
  useZkLogin: () => ({ isConnected: false }),
  usePasskeyStore: (selector: (s: { isUnlocked: boolean }) => boolean) =>
    selector({ isUnlocked: false }),
}));

vi.mock('../hooks/useTransferHistory', () => ({
  useTransferHistory: () => mockHookReturn,
}));

// ======================================================
// C.13 — TransferHistory Filters
// ======================================================

describe('Phase C.13 — TransferHistory Filters', () => {
  beforeEach(() => {
    mockHookReturn = {
      transfers: mockTransfers,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  describe('filter UI rendering', () => {
    it('renders direction filter buttons (All, Sent, Received)', () => {
      render(<TransferHistory />);
      expect(screen.getByText('All')).toBeTruthy();
      expect(screen.getByText('Sent')).toBeTruthy();
      expect(screen.getByText('Received')).toBeTruthy();
    });

    it('renders token dropdown when multiple tokens exist', () => {
      render(<TransferHistory />);
      expect(screen.getByText('All Tokens')).toBeTruthy();
    });

    it('shows transfer count', () => {
      render(<TransferHistory />);
      expect(screen.getByText('5 transfers')).toBeTruthy();
    });

    it('All direction is active by default', () => {
      render(<TransferHistory />);
      const allBtn = screen.getByText('All');
      expect(allBtn.className).toContain('bg-pd1/20');
    });
  });

  describe('direction filtering', () => {
    it('filters to Sent only', () => {
      render(<TransferHistory />);
      fireEvent.click(screen.getByText('Sent'));
      // Only 2 sent transfers (NBTC + NUSDC)
      expect(screen.getByText('2 of 5 transfers')).toBeTruthy();
      // All visible rows should be SENT
      const sentBadges = screen.getAllByText('SENT');
      expect(sentBadges.length).toBe(2);
      expect(screen.queryByText('RECEIVED')).toBeNull();
    });

    it('filters to Received only', () => {
      render(<TransferHistory />);
      fireEvent.click(screen.getByText('Received'));
      // 3 received transfers
      expect(screen.getByText('3 of 5 transfers')).toBeTruthy();
      const receivedBadges = screen.getAllByText('RECEIVED');
      expect(receivedBadges.length).toBe(3);
      expect(screen.queryByText('SENT')).toBeNull();
    });

    it('shows all transfers when All is clicked', () => {
      render(<TransferHistory />);
      // Switch to Sent first
      fireEvent.click(screen.getByText('Sent'));
      expect(screen.getByText('2 of 5 transfers')).toBeTruthy();
      // Switch back to All
      fireEvent.click(screen.getByText('All'));
      expect(screen.getByText('5 transfers')).toBeTruthy();
    });
  });

  describe('token filtering', () => {
    it('filters by NBTC token', () => {
      render(<TransferHistory />);
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NBTC' } });
      // 2 NBTC transfers (1 sent, 1 received)
      expect(screen.getByText('2 of 5 transfers')).toBeTruthy();
    });

    it('filters by NUSDC token', () => {
      render(<TransferHistory />);
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NUSDC' } });
      // 2 NUSDC transfers
      expect(screen.getByText('2 of 5 transfers')).toBeTruthy();
    });

    it('filters by NSN token', () => {
      render(<TransferHistory />);
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NSN' } });
      // 1 NSN transfer
      expect(screen.getByText('1 of 5 transfers')).toBeTruthy();
    });

    it('token dropdown lists unique tokens alphabetically', () => {
      const { container } = render(<TransferHistory />);
      const options = container.querySelectorAll('option');
      // All Tokens + NBTC + NSN + NUSDC = 4
      expect(options.length).toBe(4);
      expect(options[1].textContent).toBe('NBTC');
      expect(options[2].textContent).toBe('NSN');
      expect(options[3].textContent).toBe('NUSDC');
    });
  });

  describe('combined filters', () => {
    it('filters by direction AND token simultaneously', () => {
      render(<TransferHistory />);
      // Set direction to Sent
      fireEvent.click(screen.getByText('Sent'));
      // Set token to NBTC
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NBTC' } });
      // Only 1 transfer: sent NBTC
      expect(screen.getByText('1 of 5 transfers')).toBeTruthy();
    });

    it('shows empty state when combined filters match nothing', () => {
      render(<TransferHistory />);
      // Set direction to Sent
      fireEvent.click(screen.getByText('Sent'));
      // Set token to NSN (only received NSN exists)
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NSN' } });
      expect(screen.getByText('No transfers match the selected filters.')).toBeTruthy();
    });
  });

  describe('clear filters', () => {
    it('shows "Clear filters" button when filters are active', () => {
      render(<TransferHistory />);
      fireEvent.click(screen.getByText('Sent'));
      // Should show Clear filters button (there are 2: one in filter bar, one in empty state if applicable)
      expect(screen.getByText('Clear filters')).toBeTruthy();
    });

    it('does not show "Clear filters" when no filters active', () => {
      render(<TransferHistory />);
      expect(screen.queryByText('Clear filters')).toBeNull();
    });

    it('resets all filters when Clear filters is clicked', () => {
      render(<TransferHistory />);
      // Apply filters
      fireEvent.click(screen.getByText('Sent'));
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NBTC' } });
      expect(screen.getByText('1 of 5 transfers')).toBeTruthy();
      // Clear
      fireEvent.click(screen.getByText('Clear filters'));
      expect(screen.getByText('5 transfers')).toBeTruthy();
    });

    it('empty state has its own Clear filters button', () => {
      render(<TransferHistory />);
      fireEvent.click(screen.getByText('Sent'));
      const select = screen.getByDisplayValue('All Tokens');
      fireEvent.change(select, { target: { value: 'NSN' } });
      // Empty state should render
      expect(screen.getByText('No transfers match the selected filters.')).toBeTruthy();
      // Click the Clear filters in empty state
      const clearButtons = screen.getAllByText('Clear filters');
      fireEvent.click(clearButtons[clearButtons.length - 1]);
      expect(screen.getByText('5 transfers')).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('shows no-transfers message when data is empty', () => {
      mockHookReturn = { transfers: [], isLoading: false, error: null, refetch: vi.fn() };
      render(<TransferHistory />);
      expect(screen.getByText(/No transfers yet/)).toBeTruthy();
    });

    it('shows loading state', () => {
      mockHookReturn = { transfers: [], isLoading: true, error: null, refetch: vi.fn() };
      render(<TransferHistory />);
      expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('shows error state with retry', () => {
      const refetch = vi.fn();
      mockHookReturn = { transfers: [], isLoading: false, error: 'Network error', refetch };
      render(<TransferHistory />);
      expect(screen.getByText('Network error')).toBeTruthy();
      fireEvent.click(screen.getByText('Retry'));
      expect(refetch).toHaveBeenCalledOnce();
    });

    it('does not show token dropdown with single token type', () => {
      mockHookReturn = {
        transfers: [mockTransfers[0]], // Only NBTC
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      };
      render(<TransferHistory />);
      expect(screen.queryByText('All Tokens')).toBeNull();
    });
  });
});

// ======================================================
// C.14 — InsufficientBalancePrompt
// ======================================================

describe('Phase C.14 — InsufficientBalancePrompt', () => {
  it('renders shortfall message', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={150}
        availableAmount={100}
      />
    );
    expect(screen.getByText('Need 50.00 more NUSDC')).toBeTruthy();
  });

  it('shows available balance', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={150}
        availableAmount={100}
      />
    );
    expect(screen.getByText('Available: 100.00 NUSDC')).toBeTruthy();
  });

  it('shows Faucet guidance', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NBTC"
        requiredAmount={1}
        availableAmount={0}
      />
    );
    expect(screen.getByText(/Get NBTC from Faucet/)).toBeTruthy();
  });

  it('does not render when no shortfall', () => {
    const { container } = render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={100}
        availableAmount={200}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('does not render when exact match (shortfall = 0)', () => {
    const { container } = render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={100}
        availableAmount={100}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('respects custom message override', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={150}
        availableAmount={100}
        message="Insufficient margin"
      />
    );
    expect(screen.getByText('Insufficient margin')).toBeTruthy();
  });

  it('uses correct decimal precision for high-decimal tokens', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NBTC"
        requiredAmount={1.123456}
        availableAmount={0}
        decimals={9}
      />
    );
    // decimals > 6 → displayDecimals = min(4, 9) = 4
    expect(screen.getByText('Need 1.1235 more NBTC')).toBeTruthy();
  });

  it('uses 2 decimal places for low-decimal tokens', () => {
    render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={100.555}
        availableAmount={0}
        decimals={6}
      />
    );
    // decimals=6, not > 6, so min(2, 6) = 2
    expect(screen.getByText('Need 100.56 more NUSDC')).toBeTruthy();
  });

  it('has warning icon (svg) and red styling', () => {
    const { container } = render(
      <InsufficientBalancePrompt
        tokenSymbol="NUSDC"
        requiredAmount={200}
        availableAmount={100}
      />
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('.bg-red-500\\/10')).toBeTruthy();
    expect(container.querySelector('.border-red-500\\/30')).toBeTruthy();
  });
});
