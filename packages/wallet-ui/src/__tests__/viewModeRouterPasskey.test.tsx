/**
 * Tests for passkey routing in viewModeRouter.
 *
 * Covers:
 * - "passkey-setup" route renders PasskeySetupView
 * - "passkey-backup" route renders BackupView with mnemonic
 * - "passkey-backup" returns null when mnemonic is missing
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
        <span data-testid="passkey-cred-name">{props.header.credentialName}</span>
      )}
      {props.onSignOut && (
        <button data-testid="sign-out" onClick={props.onSignOut}>
          Sign Out
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
      <button data-testid="passkey-created" onClick={() => props.onCreated('test mnemonic words')}>Create</button>
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

    it('should transition to passkey-backup on creation', () => {
      const setViewMode = vi.fn();
      const setMnemonic = vi.fn();
      const state = createMockState({
        viewMode: 'passkey-setup',
        setViewMode,
        setMnemonic,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('passkey-created').click();
      expect(setViewMode).toHaveBeenCalledWith('passkey-backup');
      expect(setMnemonic).toHaveBeenCalledWith('test mnemonic words');
    });
  });

  // ------------------------------------------
  // Explicit ViewMode: passkey-backup
  // ------------------------------------------
  describe('passkey-backup route', () => {
    it('should render BackupView with mnemonic', () => {
      const testMnemonic = 'abandon badge cabbage dad eagle fabric gadget habit ice jacket kangaroo lamp';
      const state = createMockState({
        viewMode: 'passkey-backup',
        mnemonic: testMnemonic,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.getByTestId('backup-view')).toBeInTheDocument();
      expect(screen.getByTestId('backup-mnemonic').textContent).toBe(testMnemonic);
    });

    it('should fall through to wallet status when mnemonic is missing', () => {
      const state = createMockState({
        viewMode: 'passkey-backup',
        mnemonic: null,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      expect(screen.queryByTestId('backup-view')).not.toBeInTheDocument();
      expect(screen.getByTestId('disconnected-view')).toBeInTheDocument();
    });

    it('should clean up on backup confirm', () => {
      const setViewMode = vi.fn();
      const setMnemonic = vi.fn();
      const state = createMockState({
        viewMode: 'passkey-backup',
        mnemonic: 'test words',
        setViewMode,
        setMnemonic,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('backup-confirm').click();
      expect(setMnemonic).toHaveBeenCalledWith(null);
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

    it('should call passkeyLock on sign out', () => {
      const passkeyLock = vi.fn();
      const setShowDropdown = vi.fn();
      const state = createMockState({
        viewMode: 'main',
        status: 'disconnected',
        isPasskeyUnlocked: true,
        passkeyAddress: '0x' + 'b'.repeat(64),
        passkeyCredentials: [],
        passkeyLock,
        setShowDropdown,
      });
      const content = renderViewContent(state, sharedProps);
      render(<>{content}</>);

      screen.getByTestId('sign-out').click();
      expect(passkeyLock).toHaveBeenCalled();
      expect(setShowDropdown).toHaveBeenCalledWith(false);
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
