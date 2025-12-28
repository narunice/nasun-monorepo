import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SendTransaction } from '../SendTransaction';

// Mock functions
const mockSendTokenTransaction = vi.fn();
const mockClearError = vi.fn();
const mockClearResult = vi.fn();
const mockUseWallet = vi.fn();

// Mock @nasun/wallet
vi.mock('@nasun/wallet', () => ({
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
      native: { symbol: 'NASUN', balance: 1000000000n, formatted: '1.000', decimals: 9, type: '0x2::sui::SUI' },
      tokens: {
        NBTC: { symbol: 'NBTC', balance: 50000000n, formatted: '0.500', decimals: 8, type: '0xabc::nbtc::NBTC' },
      },
    },
    isLoading: false,
    error: null,
  })),
  isValidAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{64}$/.test(addr)),
  shortenAddress: vi.fn((addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`),
  getAllTokens: vi.fn(() => [
    { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
    { symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, type: '0xabc::nbtc::NBTC' },
  ]),
  getTokenByType: vi.fn((type: string) => {
    if (type === '0x2::sui::SUI') return { symbol: 'NASUN', name: 'Nasun', decimals: 9, type };
    if (type === '0xabc::nbtc::NBTC') return { symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, type };
    return null;
  }),
  NATIVE_TOKEN: { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  // Explorer URL functions
  getExplorerTxUrl: vi.fn((digest: string) => `https://explorer.devnet.nasun.io/tx/${digest}`),
  getExplorerAddressUrl: vi.fn((address: string) => `https://explorer.devnet.nasun.io/address/${address}`),
  getExplorerObjectUrl: vi.fn((objectId: string) => `https://explorer.devnet.nasun.io/object/${objectId}`),
}));

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

    it('should show NASUN as default token', () => {
      render(<SendTransaction />);

      // NASUN should be selected by default (multiple instances in UI)
      const nasunElements = screen.getAllByText('NASUN');
      expect(nasunElements.length).toBeGreaterThan(0);

      // Balance should be shown
      const balanceElements = screen.getAllByText('1.000');
      expect(balanceElements.length).toBeGreaterThan(0);
    });

    it('should disable send button when form is empty', () => {
      render(<SendTransaction />);

      const sendButton = screen.getByRole('button', { name: /Send NASUN/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Token Selection', () => {
    it('should allow selecting a different token', async () => {
      render(<SendTransaction defaultToken="NASUN" />);

      // Click on token selector (first button with NASUN text is the token selector)
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
        const sendButton = screen.getByRole('button', { name: /Send NASUN/i });
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
      const sendButton = screen.getByRole('button', { name: /Send NASUN/i });
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

      const sendButton = screen.getByRole('button', { name: /Send NASUN/i });
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

  describe('Close Button', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<SendTransaction onClose={onClose} />);

      // Find and click close button (X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(btn => btn.querySelector('svg'));

      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });
});
