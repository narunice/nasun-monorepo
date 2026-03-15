/**
 * Tests for passkey routing in viewModeRouter.
 *
 * Covers:
 * - "passkey-setup" route renders PasskeySetupView
 * - Passkey connected state in renderByWalletStatus
 * - Auth priority: zkLogin > passkey > locked > unlocked
 * - Disconnected state includes passkey props
 *
 * Uses dynamic import for renderViewContent to avoid module
 * initialization ordering issues with vitest setup files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock wallet-views components
vi.mock('../connect/wallet-views', () => ({
  ConnectedView: (props: any) => (
    <div data-testid="connected-view" data-variant={props.header?.variant}>
      {props.header?.variant === 'passkey' && (
        <>
          <span data-testid="passkey-cred-name">{props.header.credentialName}</span>
          <span data-testid="passkey-display-address">{props.header.displayAddress}</span>
          <span data-testid="passkey-address-label">{props.header.addressLabel}</span>
        </>
      )}
      {props.onSignOut && (
        <button data-testid="sign-out" onClick={props.onSignOut}>
          Sign Out
        </button>
      )}
      {props.onLock && (
        <button data-testid="lock-btn" onClick={props.onLock}>
          Lock
        </button>
      )}
      {props.onDelete && (
        <button data-testid="delete-btn" onClick={props.onDelete}>
          Delete
        </button>
      )}
    </div>
  ),
  DisconnectedView: (props: any) => (
    <div data-testid="disconnected-view">
      {props.isPasskeySupported && <span data-testid="passkey-supported">passkey-supported</span>}
      {props.passkeyWallet && <span data-testid="has-passkey-wallet">has-wallet</span>}
    </div>
  ),
  CreateWalletView: () => <div data-testid="create-view" />,
  AutoLockSetupView: () => <div data-testid="autolock-view" />,
  LedgerConnectView: () => <div data-testid="ledger-connect-view" />,
  LedgerSelectView: () => <div data-testid="ledger-select-view" />,
  LedgerConnectedView: () => <div data-testid="ledger-connected-view" />,
  NsaViewRouter: () => <div data-testid="nsa-view" />,
  PasskeySetupView: (props: any) => (
    <div data-testid="passkey-setup-view">
      <button data-testid="passkey-back" onClick={props.onBack}>Back</button>
      <button data-testid="passkey-created" onClick={() => props.onCreated()}>Create</button>
    </div>
  ),
  BackupView: (props: any) => (
    <div data-testid="backup-view">
      <span data-testid="backup-mnemonic">{props.mnemonic}</span>
      <button data-testid="backup-confirm" onClick={props.onConfirm}>Confirm</button>
    </div>
  ),
  ImportView: () => <div data-testid="import-view" />,
  ExportView: () => <div data-testid="export-view" />,
  SendView: () => <div data-testid="send-view" />,
  StakingView: () => <div data-testid="staking-view" />,
  PortfolioView: () => <div data-testid="portfolio-view" />,
  NasunLinkView: () => <div data-testid="nasun-link-view" />,
  SettingsView: () => <div data-testid="settings-view" />,
  AddressBookView: () => <div data-testid="address-book-view" />,
  ReceiveView: () => <div data-testid="receive-view" />,
  AddTokenView: () => <div data-testid="add-token-view" />,
}));

vi.mock('../connect/LockedStateUI', () => ({
  LockedStateUI: () => <div data-testid="locked-ui" />,
}));

vi.mock('../../walletconnect', () => ({
  WCViewRouter: () => <div data-testid="wc-view" />,
}));

// Mock @nasun/wallet module with proper usePasskeyStore.getState()
const mockSetPendingMnemonic = vi.fn();
vi.mock('@nasun/wallet', () => ({
  secureZeroString: vi.fn(),
  usePasskeyStore: {
    getState: () => ({
      setPendingMnemonic: mockSetPendingMnemonic,
      pendingMnemonic: null,
    }),
  },
  useChainStore: {
    getState: () => ({
      resetToDefault: vi.fn(),
    }),
  },
}));

// Helper: create mock state
function createMockState(overrides: Record<string, any> = {}): any {
  return {
    viewMode: 'main',
    setViewMode: vi.fn(),
    status: 'disconnected',
    account: null,
    isLoading: false,
    error: null,
    password: '',
    setPassword: vi.fn(),
    confirmPassword: '',
    setConfirmPassword: vi.fn(),
    mnemonic: null,
    setMnemonic: vi.fn(),
    showDropdown: true,
    setShowDropdown: vi.fn(),
    handleCreate: vi.fn(),
    handleUnlock: vi.fn(),
    handleDelete: vi.fn(),
    confirmDelete: vi.fn(),
    handleSocialLogin: vi.fn(),
    handleBackupConfirmed: vi.fn(),
    handleAutoLockComplete: vi.fn(),
    handleImportMnemonic: vi.fn(),
    handleImportPrivateKey: vi.fn(),
    handleExportPrivateKey: vi.fn(),
    handleExportPasskeyPrivateKey: vi.fn(),
    handleExportMnemonic: vi.fn(),
    handleExportPasskeyMnemonic: vi.fn(),
    passkeyNeedsPassword: false,
    passkeyHasPendingRegistration: false,
    clearPendingRegistration: vi.fn(),
    resetView: vi.fn(),
    lockWallet: vi.fn(),
    isZkLoggedIn: false,
    isZkLoading: false,
    loadingProvider: null,
    zkError: null,
    zkState: null,
    zkUserInfo: null,
    zkLogout: vi.fn(),
    isMobile: false,
    isPasskeySupported: false,
    isPasskeyPlatformAvailable: null,
    isPasskeyUnlocked: false,
    isPasskeyLoading: false,
    passkeyAddress: null,
    passkeyWallet: null,
    passkeyUnlock: vi.fn(),
    passkeyLock: vi.fn(),
    passkeyCredentials: [],
    isLedgerConnected: false,
    ledgerAddress: null,
    ledgerStatus: 'disconnected',
    ledgerError: null,
    ledgerConnect: vi.fn(),
    ledgerDisconnect: vi.fn(),
    ledgerAccountIndex: 0,
    setLedgerAccountIndex: vi.fn(),
    activeTab: 'assets',
    setActiveTab: vi.fn(),
    selectedNFT: null,
    setSelectedNFT: vi.fn(),
    sendRecipient: undefined,
    setSendRecipient: vi.fn(),
    selectedProposalId: '',
    setSelectedProposalId: vi.fn(),
    proposalBannerDismissed: false,
    setProposalBannerDismissed: vi.fn(),
    isNetworkModalOpen: false,
    setIsNetworkModalOpen: vi.fn(),
    showMoreMenu: false,
    setShowMoreMenu: vi.fn(),
    signerAddress: null,
    isEVM: false,
    chain: { id: 'nasun-devnet', name: 'Nasun Devnet', type: 'move', nativeCurrency: { symbol: 'NSN', name: 'Nasun', decimals: 9 }, rpcUrl: '' },
    storedEVMAddress: null,
    isExternalMove: false,
    closeDropdown: vi.fn(),
    ...overrides,
  };
}

const sharedProps: any = {};

describe('viewModeRouter - Passkey Routes', () => {
  let renderViewContent: (s: any, p: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to ensure mocks are fully applied first
    const mod = await import('../connect/viewModeRouter');
    renderViewContent = mod.renderViewContent;
  });

  // ------------------------------------------
  // Explicit ViewMode: passkey-setup
  // ------------------------------------------
  describe('passkey-setup route', () => {
    it('should render PasskeySetupView', () => {
      const state = createMockState({ viewMode: 'passkey-setup' });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-setup-view')).toBeInTheDocument();
    });

    it('should call setViewMode("main") when back is clicked', () => {
      const setViewMode = vi.fn();
      const state = createMockState({ viewMode: 'passkey-setup', setViewMode });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('passkey-back').click();
      expect(setViewMode).toHaveBeenCalledWith('main');
    });

    it('should transition to main on creation (backup skipped — viewable later via Settings)', () => {
      const setViewMode = vi.fn();
      const state = createMockState({
        viewMode: 'passkey-setup',
        setViewMode,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('passkey-created').click();
      expect(setViewMode).toHaveBeenCalledWith('main');
    });
  });

  // ------------------------------------------
  // Wallet Status Fallback: Passkey Connected
  // ------------------------------------------
  describe('Passkey Connected State', () => {
    it('should render ConnectedView with passkey variant when unlocked', () => {
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [{
          id: 'cred-1',
          publicKey: '',
          algorithm: -7,
          authenticatorType: 'platform',
          discoverable: true,
          userVerification: 'required',
          createdAt: Date.now(),
          name: 'My Passkey',
        }],
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      const view = screen.getByTestId('connected-view');
      expect(view).toHaveAttribute('data-variant', 'passkey');
      expect(screen.getByTestId('passkey-cred-name').textContent).toBe('My Passkey');
    });

    it('should use fallback name when no credentials', () => {
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-cred-name').textContent).toBe('Passkey Wallet');
    });

    it('should call passkeyLock and closeDropdown on Lock button click', () => {
      const passkeyLock = vi.fn();
      const closeDropdown = vi.fn();
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
        passkeyLock,
        closeDropdown,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('lock-btn').click();
      expect(passkeyLock).toHaveBeenCalled();
      expect(closeDropdown).toHaveBeenCalled();
    });

    it('should route passkey delete through delete-confirm view', () => {
      const setViewMode = vi.fn();
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
        setViewMode,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('delete-btn')).toBeInTheDocument();
      screen.getByTestId('delete-btn').click();
      expect(setViewMode).toHaveBeenCalledWith('delete-confirm');
    });

    it('should NOT show Sign Out button for passkey (uses Lock instead)', () => {
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
      expect(screen.getByTestId('lock-btn')).toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // displayAddress / addressLabel (Fix 2b)
  // ------------------------------------------
  describe('Passkey displayAddress and addressLabel', () => {
    it('should use signerAddress for displayAddress on Move chain', () => {
      const passkeyAddr = '0x' + 'b'.repeat(64);
      const signerAddr = '0x' + 'c'.repeat(64); // chain-derived address
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: passkeyAddr,
        signerAddress: signerAddr,
        passkeyCredentials: [],
        isEVM: false,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-display-address').textContent).toBe(signerAddr);
      expect(screen.getByTestId('passkey-address-label').textContent).toBe('Connected Address');
    });

    it('should fall back to passkeyAddress when signerAddress is null', () => {
      const passkeyAddr = '0x' + 'b'.repeat(64);
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: passkeyAddr,
        signerAddress: null,
        passkeyCredentials: [],
        isEVM: false,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-display-address').textContent).toBe(passkeyAddr);
    });

    it('should use storedEVMAddress when on EVM chain', () => {
      const passkeyAddr = '0x' + 'b'.repeat(64);
      const evmAddr = '0x' + 'ee'.repeat(20);
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: passkeyAddr,
        signerAddress: null,
        storedEVMAddress: evmAddr,
        passkeyCredentials: [],
        isEVM: true,
        chain: { id: 'evm-sepolia', name: 'Sepolia', type: 'evm', nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 }, rpcUrl: '' },
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-display-address').textContent).toBe(evmAddr);
      expect(screen.getByTestId('passkey-address-label').textContent).toBe('Sepolia Address');
    });

    it('should show "EVM Wallet Not Configured" when EVM but no storedEVMAddress', () => {
      const passkeyAddr = '0x' + 'b'.repeat(64);
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: passkeyAddr,
        signerAddress: passkeyAddr,
        storedEVMAddress: null,
        passkeyCredentials: [],
        isEVM: true,
        chain: { id: 'evm-sepolia', name: 'Sepolia', type: 'evm', nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 }, rpcUrl: '' },
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('passkey-address-label').textContent).toBe('EVM Wallet Not Configured');
    });
  });

  // ------------------------------------------
  // Auth Priority: zkLogin > passkey
  // ------------------------------------------
  describe('Auth Priority', () => {
    it('zkLogin should take priority over passkey when both active', () => {
      const state = createMockState({
        viewMode: 'main',
        isZkLoggedIn: true,
        zkState: { address: '0x' + 'c'.repeat(64) },
        zkUserInfo: { name: 'ZK User', email: 'zk@test.com' },
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      const view = screen.getByTestId('connected-view');
      expect(view).toHaveAttribute('data-variant', 'zkLogin');
    });

    it('passkey should show when zkLogin is NOT active', () => {
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isZkLoggedIn: false,
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      const view = screen.getByTestId('connected-view');
      expect(view).toHaveAttribute('data-variant', 'passkey');
    });
  });

  // ------------------------------------------
  // Disconnected State with Passkey Props
  // ------------------------------------------
  describe('Disconnected with Passkey Props', () => {
    it('should pass passkey props to DisconnectedView', () => {
      const mockWallet = { address: '0x123', credentials: [] };
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeySupported: true,
        isPasskeyPlatformAvailable: true,
        passkeyWallet: mockWallet,
        isPasskeyUnlocked: false,
        isZkLoggedIn: false,
        isLedgerConnected: false,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('disconnected-view')).toBeInTheDocument();
      expect(screen.getByTestId('passkey-supported')).toBeInTheDocument();
      expect(screen.getByTestId('has-passkey-wallet')).toBeInTheDocument();
    });

    it('should not show passkey-supported when not supported', () => {
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeySupported: false,
        isPasskeyUnlocked: false,
        isZkLoggedIn: false,
        isLedgerConnected: false,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.queryByTestId('passkey-supported')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Non-passkey routes still work
  // ------------------------------------------
  describe('Non-passkey routes', () => {
    it('create route should render CreateWalletView', () => {
      const state = createMockState({ viewMode: 'create' });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('create-view')).toBeInTheDocument();
    });

    it('import route should render ImportView', () => {
      const state = createMockState({ viewMode: 'import' });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('import-view')).toBeInTheDocument();
    });
  });
});
