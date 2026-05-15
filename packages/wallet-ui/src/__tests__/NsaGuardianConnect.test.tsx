/**
 * Tests for NsaGuardianConnect Component
 *
 * Verifies auto-discovery flow, manual input, error handling,
 * discovered account rendering, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './setup';
import { NsaGuardianConnect } from '../nsa/NsaGuardianConnect';
import type { NsaAccountState } from '@nasun/wallet';

// === Mock Setup ===

const mockFindAccountsWhereGuardian = vi.fn();
const mockFetchAccountState = vi.fn();
const mockFindActiveRecoveryForAccount = vi.fn();
const mockUseSigner = vi.fn();

// Override the global @nasun/wallet mock with NSA-specific functions
vi.mock('@nasun/wallet', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./setup');
  return {
    ...actual,
    findAccountsWhereGuardian: (...args: unknown[]) => mockFindAccountsWhereGuardian(...args),
    fetchAccountState: (...args: unknown[]) => mockFetchAccountState(...args),
    findActiveRecoveryForAccount: (...args: unknown[]) => mockFindActiveRecoveryForAccount(...args),
    useSigner: () => mockUseSigner(),
    NsaError: class NsaError extends Error {
      type: string;
      constructor(type: string, message: string) {
        super(message);
        this.type = type;
      }
    },
    isValidAddress: (addr: string) => /^0x[a-fA-F0-9]{64}$/.test(addr),
  };
});

// === Test Helpers ===

const GUARDIAN_ADDR = '0x' + 'aa'.repeat(32);
const ACCOUNT_OBJ_ID = '0x' + '11'.repeat(32);
const ACCOUNT_OBJ_ID_2 = '0x' + '22'.repeat(32);
const RECOVERY_ID = '0x' + '99'.repeat(32);

function makeAccountState(
  objectId: string,
  guardians: string[] = [GUARDIAN_ADDR],
  opts: { signerCount?: number; guardianThreshold?: number } = {},
): NsaAccountState {
  return {
    objectId,
    signers: Array.from({ length: opts.signerCount ?? 1 }, (_, i) => ({
      address: '0x' + (i + 1).toString(16).padStart(64, '0'),
      signerType: 'local' as const,
      weight: 1,
      addedAt: Date.now(),
      label: `signer-${i}`,
    })),
    threshold: 1,
    guardians,
    guardianThreshold: opts.guardianThreshold ?? 2,
    recoveryOwner: '0x' + 'ff'.repeat(32),
    nonce: 0,
    createdAt: Date.now(),
  };
}

const defaultProps = {
  onClose: vi.fn(),
  onConnected: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSigner.mockReturnValue({ signer: null, address: GUARDIAN_ADDR });
});

// === Tests ===

describe('NsaGuardianConnect', () => {
  describe('Auto-Discovery Flow', () => {
    it('should show discovering spinner on mount', () => {
      mockFindAccountsWhereGuardian.mockReturnValue(new Promise(() => {})); // Never resolves

      render(<NsaGuardianConnect {...defaultProps} />);

      expect(screen.getByText('Searching for accounts...')).toBeInTheDocument();
      expect(screen.getByText('Looking for accounts where you are a guardian')).toBeInTheDocument();
    });

    it('should show discovered accounts after successful discovery', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID, [GUARDIAN_ADDR, '0x' + 'bb'.repeat(32)], {
        signerCount: 2,
      });

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Your Guarded Accounts (1)')).toBeInTheDocument();
      });

      // Account ID should be truncated (rendered as "0x11111111...111111")
      const truncatedId = screen.getByText(/0x11111111/);
      expect(truncatedId).toBeInTheDocument();

      // Should show signer and guardian counts
      expect(screen.getByText('2 signers')).toBeInTheDocument();
      expect(screen.getByText('2 guardians')).toBeInTheDocument();
    });

    it('should show multiple discovered accounts', async () => {
      const account1 = makeAccountState(ACCOUNT_OBJ_ID, [GUARDIAN_ADDR], { signerCount: 1 });
      const account2 = makeAccountState(ACCOUNT_OBJ_ID_2, [GUARDIAN_ADDR], { signerCount: 3 });

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState: account1, activeRecoveryId: null },
        { accountState: account2, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Your Guarded Accounts (2)')).toBeInTheDocument();
      });

      expect(screen.getByText('1 signer')).toBeInTheDocument();
      expect(screen.getByText('3 signers')).toBeInTheDocument();
    });

    it('should show Recovery Active badge when activeRecoveryId exists', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: RECOVERY_ID },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Recovery Active')).toBeInTheDocument();
      });
    });

    it('should not show Recovery Active badge when activeRecoveryId is null', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Your Guarded Accounts (1)')).toBeInTheDocument();
      });

      expect(screen.queryByText('Recovery Active')).not.toBeInTheDocument();
    });

    it('should show guardian threshold when > 0', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID, [GUARDIAN_ADDR], {
        guardianThreshold: 3,
      });

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('threshold 3')).toBeInTheDocument();
      });
    });

    it('should call onConnected when a discovered account is clicked', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: RECOVERY_ID },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Your Guarded Accounts (1)')).toBeInTheDocument();
      });

      // Click the discovered account card
      const card = screen.getByText(/0x11111111/).closest('button');
      expect(card).toBeTruthy();
      fireEvent.click(card!);

      expect(defaultProps.onConnected).toHaveBeenCalledWith({
        accountObjectId: ACCOUNT_OBJ_ID,
        accountState,
        activeRecoveryId: RECOVERY_ID,
      });
    });

    it('should show separator and manual input when accounts are discovered', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('or enter manually')).toBeInTheDocument();
      });

      // Manual input should still be present
      expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      expect(screen.getByText('Connect as Guardian')).toBeInTheDocument();
    });

    it('should show contextual info message when accounts are discovered', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Select an account or enter an ID manually.')).toBeInTheDocument();
      });
    });
  });

  describe('Empty Discovery', () => {
    it('should show empty message when no accounts found', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/No accounts found where you are a guardian/)).toBeInTheDocument();
      });

      // Manual input should be available
      expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    });

    it('should show default info message when no accounts found', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Enter the Smart Account ID/)).toBeInTheDocument();
      });
    });

    it('should not show separator when no accounts found', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      expect(screen.queryByText('or enter manually')).not.toBeInTheDocument();
    });
  });

  describe('Discovery Failure', () => {
    it('should show network error message on discovery failure', async () => {
      mockFindAccountsWhereGuardian.mockRejectedValue(new Error('Network error'));

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Unable to search for accounts/)).toBeInTheDocument();
      });
    });

    it('should still show manual input after discovery failure', async () => {
      mockFindAccountsWhereGuardian.mockRejectedValue(new Error('RPC timeout'));

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      expect(screen.getByText('Connect as Guardian')).toBeInTheDocument();
    });
  });

  describe('No Wallet Connected', () => {
    it('should skip discovery and show manual input when no address', async () => {
      mockUseSigner.mockReturnValue({ signer: null, address: null });
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      // Should not show discovering spinner, should go directly to input
      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      // findAccountsWhereGuardian should NOT be called
      expect(mockFindAccountsWhereGuardian).not.toHaveBeenCalled();
    });
  });

  describe('Manual Input', () => {
    beforeEach(() => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);
    });

    it('should validate address format', async () => {
      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: 'invalid-address' } });

      expect(screen.getByText('Invalid address format')).toBeInTheDocument();
    });

    it('should disable button when input is empty', async () => {
      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const button = screen.getByText('Connect as Guardian');
      expect(button).toBeDisabled();
    });

    it('should enable button when valid address is entered', async () => {
      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });

      const button = screen.getByText('Connect as Guardian');
      expect(button).not.toBeDisabled();
    });

    it('should show validating state when connecting manually', async () => {
      mockFetchAccountState.mockReturnValue(new Promise(() => {})); // Never resolves

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(screen.getByText('Verifying guardian status...')).toBeInTheDocument();
      });
    });

    it('should call onConnected on successful manual connection', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);
      mockFetchAccountState.mockResolvedValue(accountState);
      mockFindActiveRecoveryForAccount.mockResolvedValue(null);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(defaultProps.onConnected).toHaveBeenCalledWith({
          accountObjectId: ACCOUNT_OBJ_ID,
          accountState,
          activeRecoveryId: null,
        });
      });
    });

    it('should show error when user is not a guardian of manually entered account', async () => {
      // Account exists but GUARDIAN_ADDR is not in guardians list
      const accountState = makeAccountState(ACCOUNT_OBJ_ID, ['0x' + 'cc'.repeat(32)]);
      mockFetchAccountState.mockResolvedValue(accountState);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(screen.getByText(/You are not a guardian of this account/)).toBeInTheDocument();
      });
    });

    it('should handle Enter key for manual submission', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID);
      mockFetchAccountState.mockResolvedValue(accountState);
      mockFindActiveRecoveryForAccount.mockResolvedValue(null);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(defaultProps.onConnected).toHaveBeenCalled();
      });
    });

    it('should show error for invalid address format on submit', async () => {
      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      // Valid length but not hex
      fireEvent.change(input, { target: { value: '0x' + 'zz'.repeat(32) } });

      fireEvent.click(screen.getByText('Connect as Guardian'));

      // Both inline validation and error state show "Invalid address format"
      const errors = screen.getAllByText(/Invalid address format/);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Recovery', () => {
    it('should show Try Again button on error step', async () => {
      const { NsaError } = await import('@nasun/wallet') as any;
      mockFindAccountsWhereGuardian.mockResolvedValue([]);
      mockFetchAccountState.mockRejectedValue(new NsaError('ACCOUNT_NOT_FOUND', 'Not found'));

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });

      expect(screen.getByText(/Smart Account not found on chain/)).toBeInTheDocument();
    });

    it('should return to input step when clicking Try Again', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);
      mockFetchAccountState.mockRejectedValue(new Error('generic error'));

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Try Again'));

      expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    });

    it('should show network error message for network failures', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);
      mockFetchAccountState.mockRejectedValue(new Error('network timeout'));

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('0x...');
      fireEvent.change(input, { target: { value: ACCOUNT_OBJ_ID } });
      fireEvent.click(screen.getByText('Connect as Guardian'));

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should call onClose when back button is clicked in discovering step', () => {
      mockFindAccountsWhereGuardian.mockReturnValue(new Promise(() => {}));

      render(<NsaGuardianConnect {...defaultProps} />);

      // Click the back button (first button in the header)
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should call onClose when back button is clicked in input step', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should show Guardian Recovery title in all steps', async () => {
      mockFindAccountsWhereGuardian.mockResolvedValue([]);

      render(<NsaGuardianConnect {...defaultProps} />);

      // Discovering step
      expect(screen.getByText('Guardian Recovery')).toBeInTheDocument();

      // Input step
      await waitFor(() => {
        expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
      });
      expect(screen.getByText('Guardian Recovery')).toBeInTheDocument();
    });
  });

  describe('Plural/Singular Formatting', () => {
    it('should show singular "signer" for 1 signer', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID, [GUARDIAN_ADDR], { signerCount: 1 });

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('1 signer')).toBeInTheDocument();
      });
    });

    it('should show singular "guardian" for 1 guardian', async () => {
      const accountState = makeAccountState(ACCOUNT_OBJ_ID, [GUARDIAN_ADDR], { signerCount: 1 });

      mockFindAccountsWhereGuardian.mockResolvedValue([
        { accountState, activeRecoveryId: null },
      ]);

      render(<NsaGuardianConnect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('1 guardian')).toBeInTheDocument();
      });
    });
  });
});
