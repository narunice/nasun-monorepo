/**
 * Tests for PasskeySetupView component.
 *
 * Two-phase flow:
 *   Phase 1: Enter display name → WebAuthn gesture (no password input)
 *   Phase 2: hasPendingRegistration=true → Enter password + confirm
 *
 * Covers:
 * - Phase 1 rendering and validation
 * - Phase 2 rendering and validation (hasPendingRegistration=true)
 * - Wallet creation success → onCreated() (no args)
 * - Error display from props
 * - Loading states
 * - Back/cancel handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './setup';
import { PasskeySetupView } from '../connect/wallet-views/PasskeySetupView';

const defaultProps = {
  onBack: vi.fn(),
  onCreated: vi.fn(),
  createWallet: vi.fn(),
  isLoading: false,
  error: null as any,
  hasPendingRegistration: false,
  clearPendingRegistration: vi.fn(),
};

describe('PasskeySetupView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.createWallet.mockResolvedValue({
      address: '0x' + 'a'.repeat(64),
      mnemonic: 'word '.repeat(11) + 'word',
    });
  });

  describe('Phase 1 — display name + WebAuthn gesture', () => {
    it('should render setup form with title and description', () => {
      render(<PasskeySetupView {...defaultProps} />);

      expect(screen.getByText('Setup Passkey Wallet')).toBeInTheDocument();
      expect(screen.getAllByText(/biometrics/i).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
    });

    it('should NOT show password inputs in Phase 1', () => {
      render(<PasskeySetupView {...defaultProps} />);

      expect(screen.queryByPlaceholderText(/password/i)).toBeNull();
    });

    it('should render Cancel and Create buttons', () => {
      render(<PasskeySetupView {...defaultProps} />);

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });

    it('should disable Create button when name is empty', () => {
      render(<PasskeySetupView {...defaultProps} />);

      const createBtn = screen.getByText('Create').closest('button')!;
      expect(createBtn).toBeDisabled();
    });

    it('should enable Create button when display name is entered', () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: 'My Wallet' },
      });

      const createBtn = screen.getByText('Create').closest('button')!;
      expect(createBtn).not.toBeDisabled();
    });

    it('should disable Create button for whitespace-only input', () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: '   ' },
      });

      const createBtn = screen.getByText('Create').closest('button')!;
      expect(createBtn).toBeDisabled();
    });

    it('should call createWallet with trimmed name and no password on Create click', async () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: '  My Wallet  ' },
      });
      fireEvent.click(screen.getByText('Create').closest('button')!);

      await waitFor(() => {
        expect(defaultProps.createWallet).toHaveBeenCalledWith('My Wallet', undefined);
      });
    });

    it('should call onCreated (no args) after successful Phase 1 creation', async () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: 'Test Wallet' },
      });
      fireEvent.click(screen.getByText('Create').closest('button')!);

      await waitFor(() => {
        expect(defaultProps.onCreated).toHaveBeenCalledWith();
      });
    });

    it('should call onBack when Cancel is clicked', () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.click(screen.getByText('Cancel'));
      expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('should show loading state (Authenticating...) during Phase 1', () => {
      render(<PasskeySetupView {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.queryByText('Create')).not.toBeInTheDocument();
    });

    it('should disable input and Cancel button during loading', () => {
      render(<PasskeySetupView {...defaultProps} isLoading={true} />);

      expect(screen.getByPlaceholderText(/display name/i)).toBeDisabled();
      expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
    });

    it('should display error message from props', () => {
      const mockError = {
        name: 'PasskeyError',
        type: 'CANCELLED',
        message: 'User cancelled passkey registration',
      } as any;

      render(<PasskeySetupView {...defaultProps} error={mockError} />);

      expect(screen.getByText('User cancelled passkey registration')).toBeInTheDocument();
    });

    it('should not display error when error is null', () => {
      render(<PasskeySetupView {...defaultProps} />);

      expect(screen.queryAllByText(/error|failed|cancelled/i)).toHaveLength(0);
    });

    it('should submit on Enter key in display name input', async () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: 'My Wallet' },
      });
      fireEvent.keyDown(screen.getByPlaceholderText(/display name/i), { key: 'Enter' });

      await waitFor(() => {
        expect(defaultProps.createWallet).toHaveBeenCalledWith('My Wallet', undefined);
      });
    });

    it('should NOT submit on Enter with empty display name', async () => {
      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.keyDown(screen.getByPlaceholderText(/display name/i), { key: 'Enter' });

      await new Promise((r) => setTimeout(r, 50));
      expect(defaultProps.createWallet).not.toHaveBeenCalled();
    });

    it('should not call onCreated when createWallet throws', async () => {
      defaultProps.createWallet.mockRejectedValue(new Error('Registration failed'));

      render(<PasskeySetupView {...defaultProps} />);

      fireEvent.change(screen.getByPlaceholderText(/display name/i), {
        target: { value: 'Test' },
      });
      fireEvent.click(screen.getByText('Create').closest('button')!);

      await waitFor(() => {
        expect(defaultProps.createWallet).toHaveBeenCalled();
      });

      expect(defaultProps.onCreated).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2 — recovery password (PRF unavailable)', () => {
    const phase2Props = {
      ...defaultProps,
      hasPendingRegistration: true,
    };

    it('should render Set a Recovery Password heading', () => {
      render(<PasskeySetupView {...phase2Props} />);

      expect(screen.getByText('Set a Recovery Password')).toBeInTheDocument();
    });

    it('should show password and confirm password inputs', () => {
      render(<PasskeySetupView {...phase2Props} />);

      expect(screen.getByPlaceholderText(/password \(min/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/confirm password/i)).toBeInTheDocument();
    });

    it('should show Cancel and Create Wallet buttons', () => {
      render(<PasskeySetupView {...phase2Props} />);

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Create Wallet')).toBeInTheDocument();
    });

    it('should disable Create Wallet when password fields are empty', () => {
      render(<PasskeySetupView {...phase2Props} />);

      const createBtn = screen.getByText('Create Wallet').closest('button')!;
      expect(createBtn).toBeDisabled();
    });

    it('should show error when password is too short (< 12 chars)', async () => {
      render(<PasskeySetupView {...phase2Props} />);

      fireEvent.change(screen.getByPlaceholderText(/password \(min/i), {
        target: { value: 'short' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
        target: { value: 'short' },
      });
      fireEvent.click(screen.getByText('Create Wallet').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
      });
    });

    it('should show error when passwords do not match', async () => {
      render(<PasskeySetupView {...phase2Props} />);

      fireEvent.change(screen.getByPlaceholderText(/password \(min/i), {
        target: { value: 'strongpassword1' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
        target: { value: 'strongpassword2' },
      });
      fireEvent.click(screen.getByText('Create Wallet').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText(/do not match/i)).toBeInTheDocument();
      });
    });

    it('should call createWallet with password on valid submission', async () => {
      render(<PasskeySetupView {...phase2Props} />);

      fireEvent.change(screen.getByPlaceholderText(/password \(min/i), {
        target: { value: 'strongpassword1' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
        target: { value: 'strongpassword1' },
      });
      fireEvent.click(screen.getByText('Create Wallet').closest('button')!);

      await waitFor(() => {
        expect(defaultProps.createWallet).toHaveBeenCalledWith(
          expect.any(String),
          'strongpassword1',
        );
      });
    });

    it('should call onCreated (no args) after successful Phase 2 creation', async () => {
      render(<PasskeySetupView {...phase2Props} />);

      fireEvent.change(screen.getByPlaceholderText(/password \(min/i), {
        target: { value: 'strongpassword1' },
      });
      fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
        target: { value: 'strongpassword1' },
      });
      fireEvent.click(screen.getByText('Create Wallet').closest('button')!);

      await waitFor(() => {
        expect(defaultProps.onCreated).toHaveBeenCalledWith();
      });
    });

    it('should call clearPendingRegistration and onBack when Cancel is clicked', () => {
      render(<PasskeySetupView {...phase2Props} />);

      fireEvent.click(screen.getByText('Cancel'));

      expect(defaultProps.clearPendingRegistration).toHaveBeenCalled();
      expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('should NOT show PASSWORD_REQUIRED error in Phase 2', () => {
      const passwordRequiredError = {
        name: 'PasskeyError',
        type: 'PASSWORD_REQUIRED',
        message: 'Your device does not support advanced biometric key storage.',
      } as any;

      render(<PasskeySetupView {...phase2Props} error={passwordRequiredError} />);

      // PASSWORD_REQUIRED is expected state — should not be shown as an error
      expect(screen.queryByText(/does not support advanced biometric/i)).not.toBeInTheDocument();
    });

    it('should show non-PASSWORD_REQUIRED errors in Phase 2', () => {
      const otherError = {
        name: 'PasskeyError',
        type: 'DECRYPTION_FAILED',
        message: 'Decryption failed',
      } as any;

      render(<PasskeySetupView {...phase2Props} error={otherError} />);

      expect(screen.getByText('Decryption failed')).toBeInTheDocument();
    });

    it('should show Creating... during loading in Phase 2', () => {
      render(<PasskeySetupView {...phase2Props} isLoading={true} />);

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });
});
