import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SendTransaction } from '../transaction/SendTransaction';

// Use vi.hoisted so mock fns are available inside hoisted vi.mock factory
const {
  mockSendTokenTransaction,
  mockClearError,
  mockClearResult,
  mockUseWallet,
} = vi.hoisted(() => ({
  mockSendTokenTransaction: vi.fn(),
  mockClearError: vi.fn(),
  mockClearResult: vi.fn(),
  mockUseWallet: vi.fn(),
}));

// Mock @nasun/wallet
vi.mock('@nasun/wallet', async () => {
  const { walletMockDefaults } = await import('./setup');
  return {
    ...walletMockDefaults,
    useWallet: () => mockUseWallet(),
    useTokenTransaction: vi.fn(() => ({
      sendTokenTransaction: mockSendTokenTransaction,
      isPending: false,
      error: null,
      lastResult: null,
      clearError: mockClearError,
      clearResult: mockClearResult,
    })),
    useMultiBalance: vi.fn(() => ({
      data: {
        native: { symbol: 'NSN', balance: 1000000000n, formatted: '1.000', decimals: 9, type: '0x2::sui::SUI' },
        tokens: {
          NBTC: { symbol: 'NBTC', balance: 50000000n, formatted: '0.500', decimals: 8, type: '0xabc::nbtc::NBTC' },
        },
      },
      isLoading: false,
      error: null,
    })),
    getAllTokens: vi.fn(() => [
      { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
      { symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, type: '0xabc::nbtc::NBTC' },
    ]),
    getTokenByType: vi.fn((type: string) => {
      if (type === '0x2::sui::SUI') return { symbol: 'NSN', name: 'Nasun', decimals: 9, type };
      if (type === '0xabc::nbtc::NBTC') return { symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, type };
      return null;
    }),
  };
});

describe('SendTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to unlocked wallet
    mockUseWallet.mockReturnValue({
      status: 'unlocked',
      account: { address: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
    });
  });

  describe('Initial State', () => {
    it('should render the send form', () => {
      render(<SendTransaction />);

      expect(screen.getByText('Send Token')).toBeDefined();
      expect(screen.getByText('Token')).toBeDefined();
      expect(screen.getByText('Available Balance')).toBeDefined();
      expect(screen.getByText('Recipient Address')).toBeDefined();
    });

    it('should show NSN as default token', () => {
      render(<SendTransaction />);

      // NSN should be selected by default (multiple instances in UI)
      const nasunElements = screen.getAllByText('NSN');
      expect(nasunElements.length).toBeGreaterThan(0);

      // Balance should be shown
      const balanceElements = screen.getAllByText('1.000');
      expect(balanceElements.length).toBeGreaterThan(0);
    });

    it('should disable send button when form is empty', () => {
      render(<SendTransaction />);

      const sendButton = screen.getByRole('button', { name: /Send NSN/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Token Selection', () => {
    it('should allow selecting a different token', async () => {
      render(<SendTransaction defaultToken="NSN" />);

      // Click on token selector (first button with NSN text is the token selector)
      const buttons = screen.getAllByRole('button');
      const selectorButton = buttons[0]; // Token selector is the first button
      fireEvent.click(selectorButton);

      // NBTC option should be available in dropdown
      await waitFor(() => {
        expect(screen.getByText('Nasun Bitcoin')).toBeDefined();
      });
    });
  });

  describe('Form Validation', () => {
    it('should show error for invalid address', async () => {
      render(<SendTransaction />);

      const addressInput = screen.getByPlaceholderText('0x...');
      fireEvent.change(addressInput, { target: { value: 'invalid-address' } });

      await waitFor(() => {
        expect(screen.getByText('Invalid address format')).toBeDefined();
      });
    });

    it('should show error for invalid amount', async () => {
      render(<SendTransaction />);

      const amountInput = screen.getByPlaceholderText('0.0');
      fireEvent.change(amountInput, { target: { value: '-1' } });

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid amount')).toBeDefined();
      });
    });

    it('should enable send button with valid inputs', async () => {
      render(<SendTransaction />);

      const addressInput = screen.getByPlaceholderText('0x...');
      const amountInput = screen.getByPlaceholderText('0.0');

      // Enter valid address
      fireEvent.change(addressInput, {
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
      });

      // Enter valid amount
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      await waitFor(() => {
        const sendButton = screen.getByRole('button', { name: /Send NSN/i });
        expect(sendButton).not.toBeDisabled();
      });
    });
  });

  describe('Confirmation Flow', () => {
    it('should show confirmation screen when clicking send', async () => {
      render(<SendTransaction />);

      // Fill form
      const addressInput = screen.getByPlaceholderText('0x...');
      const amountInput = screen.getByPlaceholderText('0.0');

      fireEvent.change(addressInput, {
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
      });
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      // Click send
      const sendButton = screen.getByRole('button', { name: /Send NSN/i });
      fireEvent.click(sendButton);

      // Confirmation screen should appear
      await waitFor(() => {
        expect(screen.getByText('Confirm Transfer')).toBeDefined();
        expect(screen.getByText('0x123456...abcdef')).toBeDefined();
      });
    });

    it('should go back to form when clicking cancel', async () => {
      render(<SendTransaction />);

      // Fill form and go to confirmation
      const addressInput = screen.getByPlaceholderText('0x...');
      const amountInput = screen.getByPlaceholderText('0.0');

      fireEvent.change(addressInput, {
        target: { value: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
      });
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      const sendButton = screen.getByRole('button', { name: /Send NSN/i });
      fireEvent.click(sendButton);

      // Click cancel
      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /Cancel/i });
        fireEvent.click(cancelButton);
      });

      // Should be back at form
      await waitFor(() => {
        expect(screen.getByText('Send Token')).toBeDefined();
      });
    });
  });

  describe('Wallet Not Connected', () => {
    it('should show message when wallet is not unlocked', () => {
      // Override the mock for this test
      mockUseWallet.mockReturnValue({
        status: 'disconnected',
        account: null,
      });

      render(<SendTransaction />);

      expect(screen.getByText('Please connect your wallet first.')).toBeDefined();
    });
  });

  describe('Back Navigation', () => {
    it('should call onClose when back button is clicked', () => {
      const onClose = vi.fn();
      render(<SendTransaction onClose={onClose} />);

      // Find back button (chevron icon with aria-label="Back")
      const backButton = screen.getByLabelText('Back');
      fireEvent.click(backButton);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
