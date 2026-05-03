/**
 * ViewMode Smoke Tests
 *
 * Ensures every ViewMode can be rendered through renderViewContent() without
 * crashing. This catches missing imports, undefined props, and broken routing
 * after refactors.
 *
 * Strategy:
 * - Mock all child view components as simple stubs
 * - Create a minimal WalletConnectStateReturn mock
 * - Iterate through every ViewMode and verify no exception is thrown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViewMode } from '../connect/types';

// Stub all view components to prevent deep rendering
vi.mock('../connect/wallet-views', () => ({
  ConnectedView: () => <div data-testid="connected-view" />,
  DisconnectedView: () => <div data-testid="disconnected-view" />,
  CreateWalletView: () => <div data-testid="create-wallet-view" />,
  AutoLockSetupView: () => <div data-testid="auto-lock-view" />,
  LedgerConnectView: () => <div data-testid="ledger-connect-view" />,
  LedgerSelectView: () => <div data-testid="ledger-select-view" />,
  LedgerConnectedView: () => <div data-testid="ledger-connected-view" />,
  NsaViewRouter: () => <div data-testid="nsa-view-router" />,
  PasskeySetupView: () => <div data-testid="passkey-setup-view" />,
  BackupView: () => <div data-testid="backup-view" />,
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
  DeleteConfirmationView: () => <div data-testid="delete-confirmation-view" />,
}));

vi.mock('../connect/LockedStateUI', () => ({
  LockedStateUI: () => <div data-testid="locked-state-ui" />,
}));

vi.mock('../walletconnect', () => ({
  WCViewRouter: () => <div data-testid="wc-view-router" />,
}));

vi.mock('../nsa', () => ({
  NsaRestorePanel: () => <div data-testid="nsa-restore-panel" />,
}));

// Mock the hook helpers to no-ops
vi.mock('../connect/hooks/useWalletViewState', () => ({
  setPendingPasskeyMnemonic: vi.fn(),
  setPendingRestoreKey: vi.fn(),
  consumePendingRestoreKey: vi.fn(() => null),
}));

// Now import the function under test (after mocks are set up)
import { renderViewContent } from '../connect/viewModeRouter';

/** Create a minimal mock WalletConnectStateReturn */
function createMockState(overrides: Record<string, any> = {}): any {
  return {
    // ViewMode
    viewMode: 'main' as ViewMode,
    setViewMode: vi.fn(),

    // Wallet status
    status: 'disconnected',
    account: null,
    isLoading: false,
    error: null,
    lockWallet: vi.fn(),

    // zkLogin
    isZkLoggedIn: false,
    isZkLoading: false,
    zkError: null,
    zkUserInfo: null,
    zkState: null,
    zkLogout: vi.fn(),
    handleSocialLogin: vi.fn(),
    loadingProvider: null,

    // Ledger
    isLedgerConnected: false,
    ledgerStatus: 'disconnected',
    ledgerAddress: null,
    ledgerError: null,
    ledgerAccountIndex: 0,
    setLedgerAccountIndex: vi.fn(),
    ledgerConnect: vi.fn(),
    ledgerDisconnect: vi.fn(),

    // Passkey
    isPasskeySupported: false,
    isPasskeyPlatformAvailable: false,
    isPasskeyUnlocked: false,
    isPasskeyLoading: false,
    passkeyAddress: null,
    passkeyWallet: null,
    passkeyError: null,
    passkeyNeedsPassword: false,
    passkeyUnlock: vi.fn(),
    passkeyLock: vi.fn(),
    passkeyCreateWallet: vi.fn(),
    passkeyCredentials: [],

    // Create wallet
    password: '',
    setPassword: vi.fn(),
    confirmPassword: '',
    setConfirmPassword: vi.fn(),
    handleCreate: vi.fn(),

    // Backup
    mnemonic: null as string | null,
    setMnemonic: vi.fn(),
    handleBackupConfirmed: vi.fn(),
    handleAutoLockComplete: vi.fn(),

    // Import
    handleImportMnemonic: vi.fn(),
    handleImportPrivateKey: vi.fn(),
    handleExportPrivateKey: vi.fn(),
    handleExportPasskeyPrivateKey: vi.fn(),
    handleExportMnemonic: vi.fn(),
    handleExportPasskeyMnemonic: vi.fn(),
    passkeyHasPendingRegistration: false,
    clearPendingRegistration: vi.fn(),

    // Send
    sendRecipient: null,
    setSendRecipient: vi.fn(),

    // Delete
    handleDelete: vi.fn(),
    confirmDelete: vi.fn(),
    passkeyDeleteWallet: vi.fn(),
    handleUnlock: vi.fn(),
    resetView: vi.fn(),
    closeDropdown: vi.fn(),

    // UI
    isMobile: false,
    showDropdown: true,
    setShowDropdown: vi.fn(),
    signerAddress: null,

    // Chain
    chain: { name: 'Nasun Devnet', nativeCurrency: { symbol: 'NSN' } },
    isEVM: false,
    storedEVMAddress: null,

    // NSA
    selectedProposalId: null,
    setSelectedProposalId: vi.fn(),
    setProposalBannerDismissed: vi.fn(),

    // WalletConnect
    walletLabel: '',

    ...overrides,
  };
}

/** Minimal shared connected props */
const sharedConnectedProps: any = {
  setViewMode: vi.fn(),
  setSendRecipient: vi.fn(),
  sendRecipient: null,
  balances: { native: { formatted: '0' }, tokens: {} },
  balancesLoading: false,
  getAllTokens: () => [],
  erc20Balances: [],
  erc20BalancesLoading: false,
  chain: { name: 'Nasun Devnet', nativeCurrency: { symbol: 'NSN' } },
  isEVM: false,
  storedEVMAddress: null,
  evmBalance: null,
  evmBalanceLoading: false,
  networkType: 'devnet',
  accumulatedNfts: [],
  nftsLoading: false,
  onSelectNFT: vi.fn(),
  selectedNFT: null,
  isMobile: false,
  pendingForMe: 0,
  proposalBannerDismissed: false,
  setProposalBannerDismissed: vi.fn(),
  setSelectedProposalId: vi.fn(),
  onNFTDetailBack: vi.fn(),
};

// All explicit ViewModes (from VIEW_RENDERERS in viewModeRouter.tsx)
const EXPLICIT_VIEW_MODES: ViewMode[] = [
  'create',
  'create-backup',
  'create-auto-lock',
  'delete-confirm',
  'import',
  'export',
  'send',
  'staking',
  'portfolio',
  'nasun-link',
  'settings',
  'receive',
  'add-token',
  'address-book',
  'ledger-connect',
  'ledger-select',
  'passkey-setup',
  'nsa-restore',
];

// Prefix-routed ViewModes
const NSA_VIEW_MODES: ViewMode[] = [
  'nsa-setup',
  'nsa-info',
  'nsa-add-signer',
  'nsa-accept-proposal',
  'nsa-backup',
  'nsa-guardians',
  'nsa-recovery',
  'nsa-guardian-connect',
];

const WC_VIEW_MODES: ViewMode[] = [
  'wc-main',
  'wc-pair',
  'wc-proposal',
  'wc-request',
  'wc-session-detail',
];

// Main fallback statuses
const FALLBACK_STATUSES = [
  { name: 'disconnected', overrides: { status: 'disconnected' } },
  { name: 'locked', overrides: { status: 'locked' } },
  {
    name: 'unlocked (self-custody)',
    overrides: {
      status: 'unlocked',
      account: { address: '0x' + '1'.repeat(64) },
    },
  },
  {
    name: 'zkLogin connected',
    overrides: {
      status: 'disconnected',
      isZkLoggedIn: true,
      zkState: { address: '0x' + '2'.repeat(64) },
    },
  },
  {
    name: 'passkey connected',
    overrides: {
      status: 'disconnected',
      isPasskeyUnlocked: true,
      passkeyAddress: '0x' + '3'.repeat(64),
    },
  },
  {
    name: 'ledger connected',
    overrides: {
      status: 'disconnected',
      isLedgerConnected: true,
      ledgerAddress: '0x' + '4'.repeat(64),
    },
  },
];

describe('ViewMode Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Explicit ViewMode renderers', () => {
    it.each(EXPLICIT_VIEW_MODES)(
      'should render "%s" without crashing',
      (viewMode) => {
        const state = createMockState({
          viewMode,
          // Provide mnemonic for backup views
          mnemonic: viewMode.includes('backup') ? 'test word '.repeat(11) + 'word' : null,
        });

        expect(() => {
          renderViewContent(state, sharedConnectedProps);
        }).not.toThrow();
      },
    );
  });

  describe('NSA prefix routing', () => {
    it.each(NSA_VIEW_MODES)(
      'should route "%s" to NsaViewRouter without crashing',
      (viewMode) => {
        const state = createMockState({
          viewMode,
          status: 'unlocked',
          account: { address: '0x' + '1'.repeat(64) },
        });

        expect(() => {
          renderViewContent(state, sharedConnectedProps);
        }).not.toThrow();
      },
    );
  });

  describe('WalletConnect prefix routing', () => {
    it.each(WC_VIEW_MODES)(
      'should route "%s" to WCViewRouter without crashing',
      (viewMode) => {
        const state = createMockState({ viewMode });

        expect(() => {
          renderViewContent(state, sharedConnectedProps);
        }).not.toThrow();
      },
    );
  });

  describe('Main fallback by wallet status', () => {
    it.each(FALLBACK_STATUSES)(
      'should render main view for $name without crashing',
      ({ overrides }) => {
        const state = createMockState({ viewMode: 'main', ...overrides });

        expect(() => {
          renderViewContent(state, sharedConnectedProps);
        }).not.toThrow();
      },
    );
  });

  describe('ViewMode coverage', () => {
    it('should have all ViewModes covered by tests', () => {
      const ALL_VIEW_MODES: ViewMode[] = [
        // Core
        'main', 'create', 'create-backup', 'create-auto-lock', 'delete-confirm', 'import', 'export', 'send', 'receive',
        // Asset
        'staking', 'portfolio', 'add-token',
        // Settings
        'settings', 'address-book',
        // Ledger
        'ledger-connect', 'ledger-select',
        // Passkey
        'passkey-setup',
        // NSA
        'nsa-setup', 'nsa-info', 'nsa-add-signer', 'nsa-accept-proposal', 'nsa-backup',
        'nsa-restore', 'nsa-guardians', 'nsa-recovery', 'nsa-guardian-connect',
        // WC
        'wc-main', 'wc-pair', 'wc-proposal', 'wc-request', 'wc-session-detail',
        // Link
        'nasun-link',
      ];

      const testedModes = new Set([
        ...EXPLICIT_VIEW_MODES,
        ...NSA_VIEW_MODES,
        ...WC_VIEW_MODES,
        'main', // Covered by fallback tests
      ]);

      const untestedModes = ALL_VIEW_MODES.filter((m) => !testedModes.has(m));
      expect(untestedModes).toEqual([]);
    });
  });
});
