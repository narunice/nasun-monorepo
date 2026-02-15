/**
 * Tests for passkey-specific functionality in DisconnectedView.
 *
 * Covers:
 * - Conditional rendering of biometric wallet section
 * - "Setup Passkey Wallet" button (no existing wallet)
 * - "Unlock with Passkey" button (existing wallet)
 * - Loading state during unlock
 * - Hidden section when passkey not supported
 * - Hidden section when platform authenticator unavailable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { DisconnectedView } from '../connect/wallet-views/DisconnectedView';
import type { PasskeyWalletState } from '@nasun/wallet';

const mockPasskeyWallet: PasskeyWalletState = {
  address: '0x' + 'a'.repeat(64),
  primaryCredentialId: 'dGVzdC1jcmVk',
  credentials: [{
    id: 'dGVzdC1jcmVk',
    publicKey: 'cHVi',
    algorithm: -7,
    authenticatorType: 'platform',
    discoverable: true,
    userVerification: 'required',
    createdAt: Date.now(),
    name: 'Test Passkey',
  }],
  encryptedPrivateKey: 'ZW5j',
  iv: 'aXY',
  salt: 'c2FsdA',
  keyDerivationMethod: 'credential-id',
  createdAt: Date.now(),
};

describe('DisconnectedView - Passkey Integration', () => {
  const baseProps = {
    handleSocialLogin: vi.fn(),
    isZkLoading: false,
    loadingProvider: null as null,
    zkError: null as { message: string } | null,
    setViewMode: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------
  // Biometric Wallet Section Visibility
  // ------------------------------------------
  describe('Section Visibility', () => {
    it('should show biometric wallet section when passkey is supported and platform available', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
        />
      );

      expect(screen.getByText('Biometric Wallet')).toBeInTheDocument();
    });

    it('should NOT show biometric section when passkey not supported', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={false}
          isPasskeyPlatformAvailable={true}
        />
      );

      expect(screen.queryByText('Biometric Wallet')).not.toBeInTheDocument();
    });

    it('should NOT show biometric section when platform authenticator unavailable', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={false}
        />
      );

      expect(screen.queryByText('Biometric Wallet')).not.toBeInTheDocument();
    });

    it('should NOT show biometric section when platform availability is null (loading)', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={null}
        />
      );

      expect(screen.queryByText('Biometric Wallet')).not.toBeInTheDocument();
    });

    it('should NOT show biometric section when passkey props are undefined', () => {
      render(<DisconnectedView {...baseProps} />);

      expect(screen.queryByText('Biometric Wallet')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Setup Passkey Wallet (no existing wallet)
  // ------------------------------------------
  describe('Setup Passkey Wallet', () => {
    it('should show "Setup Passkey Wallet" when no wallet exists', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={null}
        />
      );

      expect(screen.getByText('Setup Passkey Wallet')).toBeInTheDocument();
    });

    it('should navigate to passkey-setup on click', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={null}
        />
      );

      fireEvent.click(screen.getByText('Setup Passkey Wallet'));
      expect(baseProps.setViewMode).toHaveBeenCalledWith('passkey-setup');
    });

    it('should show "Setup Passkey Wallet" when passkeyWallet is undefined', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
        />
      );

      expect(screen.getByText('Setup Passkey Wallet')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Unlock with Passkey (existing wallet)
  // ------------------------------------------
  describe('Unlock with Passkey', () => {
    it('should show "Unlock with Passkey" when wallet exists', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={mockPasskeyWallet}
          onPasskeyUnlock={vi.fn()}
        />
      );

      expect(screen.getByText('Unlock with Passkey')).toBeInTheDocument();
      expect(screen.queryByText('Setup Passkey Wallet')).not.toBeInTheDocument();
    });

    it('should call onPasskeyUnlock when unlock button clicked', () => {
      const onUnlock = vi.fn();
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={mockPasskeyWallet}
          onPasskeyUnlock={onUnlock}
        />
      );

      fireEvent.click(screen.getByText('Unlock with Passkey'));
      expect(onUnlock).toHaveBeenCalled();
    });

    it('should show "Authenticating..." and be disabled during loading', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={mockPasskeyWallet}
          onPasskeyUnlock={vi.fn()}
          passkeyIsLoading={true}
        />
      );

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.queryByText('Unlock with Passkey')).not.toBeInTheDocument();

      const btn = screen.getByText('Authenticating...').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('should NOT be disabled when not loading', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={mockPasskeyWallet}
          onPasskeyUnlock={vi.fn()}
          passkeyIsLoading={false}
        />
      );

      const btn = screen.getByText('Unlock with Passkey').closest('button')!;
      expect(btn).not.toBeDisabled();
    });
  });

  // ------------------------------------------
  // Coexistence with other auth methods
  // ------------------------------------------
  describe('Coexistence', () => {
    it('should still show social login and traditional wallet options alongside passkey', () => {
      render(
        <DisconnectedView
          {...baseProps}
          isPasskeySupported={true}
          isPasskeyPlatformAvailable={true}
          passkeyWallet={null}
        />
      );

      // Social login section
      expect(screen.getByText('Quick Start')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();

      // Biometric
      expect(screen.getByText('Biometric Wallet')).toBeInTheDocument();

      // Traditional
      expect(screen.getByText('Create Password Wallet')).toBeInTheDocument();
      expect(screen.getByText('Import Existing Wallet')).toBeInTheDocument();
    });
  });
});
