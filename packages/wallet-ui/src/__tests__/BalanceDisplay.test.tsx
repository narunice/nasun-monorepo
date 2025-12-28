import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BalanceDisplay } from '../BalanceDisplay';

// Get mocked functions
const mockUseWallet = vi.fn();
const mockUseBalance = vi.fn();
const mockUseRefreshBalance = vi.fn();

vi.mock('@nasun/wallet', () => ({
  useWallet: () => mockUseWallet(),
  useBalance: () => mockUseBalance(),
  useRefreshBalance: () => mockUseRefreshBalance(),
}));

describe('BalanceDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockUseWallet.mockReturnValue({ status: 'unlocked' });
    mockUseBalance.mockReturnValue({
      data: { formattedBalance: '100.5', coinCount: 3, totalBalance: '100500000000' },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseRefreshBalance.mockReturnValue(vi.fn());
  });

  describe('when wallet is not unlocked', () => {
    it('should render nothing when disconnected', () => {
      mockUseWallet.mockReturnValue({ status: 'disconnected' });

      const { container } = render(<BalanceDisplay />);
      expect(container.firstChild).toBeNull();
    });

    it('should render nothing when locked', () => {
      mockUseWallet.mockReturnValue({ status: 'locked' });

      const { container } = render(<BalanceDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when loading', () => {
    it('should show loading spinner', () => {
      mockUseBalance.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<BalanceDisplay />);
      expect(screen.getByText('Loading balance...')).toBeInTheDocument();
    });

    it('should not show loading text in compact mode', () => {
      mockUseBalance.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<BalanceDisplay compact />);
      expect(screen.queryByText('Loading balance...')).not.toBeInTheDocument();
    });
  });

  describe('when error', () => {
    it('should show error message', () => {
      mockUseBalance.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      });

      render(<BalanceDisplay />);
      expect(screen.getByText('Failed to load balance')).toBeInTheDocument();
    });

    it('should show retry button', () => {
      const refetchMock = vi.fn();
      mockUseBalance.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: refetchMock,
      });

      render(<BalanceDisplay />);
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('when balance is loaded', () => {
    it('should show formatted balance in full mode', () => {
      render(<BalanceDisplay />);

      expect(screen.getByText('100.5')).toBeInTheDocument();
      expect(screen.getByText('NASUN')).toBeInTheDocument();
      expect(screen.getByText('3 coin objects')).toBeInTheDocument();
    });

    it('should show formatted balance in compact mode', () => {
      render(<BalanceDisplay compact />);

      expect(screen.getByText('100.5')).toBeInTheDocument();
      expect(screen.getByText('NASUN')).toBeInTheDocument();
      // Should not show coin count in compact mode
      expect(screen.queryByText('3 coin objects')).not.toBeInTheDocument();
    });

    it('should show refresh button in full mode', () => {
      render(<BalanceDisplay />);
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    it('should not show refresh button in compact mode', () => {
      render(<BalanceDisplay compact />);
      expect(screen.queryByText('Refresh')).not.toBeInTheDocument();
    });
  });

  describe('when no balance data', () => {
    it('should render nothing', () => {
      mockUseBalance.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = render(<BalanceDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<BalanceDisplay className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
