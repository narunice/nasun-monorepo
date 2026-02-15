/**
 * Tests for passkey header variant in ConnectedView.
 *
 * Covers:
 * - Passkey header rendering (credential name, address, fingerprint icon)
 * - Sign Out button for passkey variant (same as zkLogin)
 * - No Lock/Delete buttons for passkey variant
 * - Tab rendering with passkey variant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from './setup';
import { ConnectedView, type ConnectedViewProps } from '../connect/wallet-views/ConnectedView';

// Mock child components — paths resolve from __tests__/ to match source imports
vi.mock('../address/CopyableAddress', () => ({
  CopyableAddress: ({ value }: { value: string }) => (
    <span data-testid="copyable-address">{value.slice(0, 8)}...{value.slice(-6)}</span>
  ),
}));

vi.mock('../connect/WalletLabelEditor', () => ({
  WalletLabelEditor: () => <div data-testid="wallet-label-editor" />,
}));

vi.mock('../nft/NFTDetail', () => ({
  NFTDetail: () => <div data-testid="nft-detail" />,
}));

vi.mock('../network/NetworkSelectorModal', () => ({
  NetworkSelectorModal: () => <div data-testid="network-modal" />,
}));

vi.mock('../connect/TabBar', () => ({
  TabBar: ({ onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) => (
    <div data-testid="tab-bar">
      <button onClick={() => onTabChange('assets')}>Assets</button>
      <button onClick={() => onTabChange('account')}>Account</button>
      <button onClick={() => onTabChange('history')}>History</button>
    </div>
  ),
}));

vi.mock('../connect/QuickActionsBar', () => ({
  QuickActionsBar: () => <div data-testid="quick-actions" />,
}));

vi.mock('../connect/MoreMenu', () => ({
  MoreMenu: () => <div data-testid="more-menu" />,
}));

vi.mock('../connect/wallet-views/NetworkSelector', () => ({
  NetworkSelector: () => <div data-testid="network-selector" />,
}));

vi.mock('../connect/wallet-views/AssetsTabContent', () => ({
  AssetsTabContent: () => <div data-testid="assets-tab" />,
}));

vi.mock('../connect/wallet-views/AccountTabContent', () => ({
  AccountTabContent: ({ variant }: { variant: string }) => (
    <div data-testid="account-tab" data-variant={variant} />
  ),
}));

vi.mock('../connect/wallet-views/HistoryTabContent', () => ({
  HistoryTabContent: () => <div data-testid="history-tab" />,
}));

describe('ConnectedView - Passkey Variant', () => {
  const testAddress = '0x' + 'a'.repeat(64);

  const baseSharedProps: Omit<ConnectedViewProps, 'header' | 'onSignOut' | 'onLock' | 'onDelete'> = {
    isMobile: false,
    isAdvancedMode: false,
    chain: { name: 'Nasun Devnet', type: 'move', nativeCurrency: { symbol: 'NSN' } },
    isNetworkModalOpen: false,
    setIsNetworkModalOpen: vi.fn(),
    activeTab: 'assets' as const,
    setActiveTab: vi.fn(),
    isEVM: false,
    isExternalMove: false,
    storedEVMAddress: null,
    evmBalance: null,
    evmBalanceLoading: false,
    erc20Balances: [],
    erc20Loading: false,
    moveNativeBalance: { formattedBalance: '100' },
    moveNativeLoading: false,
    balances: undefined,
    balancesLoading: false,
    networkType: 'move',
    getAllTokens: () => [{ symbol: 'NSN' }],
    accumulatedNfts: [],
    nftsLoading: false,
    selectedNFT: null,
    setSelectedNFT: vi.fn(),
    nsaIsInitialized: false,
    nsaRecoveryCompleted: 0,
    showMoreMenu: false,
    setShowMoreMenu: vi.fn(),
    pendingForMe: 0,
    setViewMode: vi.fn(),
    setSendRecipient: vi.fn(),
    proposalBannerDismissed: false,
    setProposalBannerDismissed: vi.fn(),
    nsaIncomingInvitations: [],
    setSelectedProposalId: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------
  // Passkey Header Rendering
  // ------------------------------------------
  describe('Passkey Header', () => {
    it('should display credential name', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'My Biometric Key' }}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByText('My Biometric Key')).toBeInTheDocument();
    });

    it('should display "Passkey Wallet" label', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test Key' }}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByText('Passkey Wallet')).toBeInTheDocument();
    });

    it('should display copyable address', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={vi.fn()}
        />
      );

      const addr = screen.getByTestId('copyable-address');
      expect(addr).toBeInTheDocument();
      expect(addr.textContent).toContain(testAddress.slice(0, 8));
    });
  });

  // ------------------------------------------
  // Session Actions
  // ------------------------------------------
  describe('Session Actions', () => {
    it('should show Sign Out button (not Lock/Delete)', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByText('Sign Out')).toBeInTheDocument();
      expect(screen.queryByText('Lock')).not.toBeInTheDocument();
      expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    });

    it('should call onSignOut when Sign Out is clicked', () => {
      const onSignOut = vi.fn();
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={onSignOut}
        />
      );

      fireEvent.click(screen.getByText('Sign Out'));
      expect(onSignOut).toHaveBeenCalled();
    });

    it('should NOT show proposal banner for passkey variant', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={vi.fn()}
          pendingForMe={3}
          proposalBannerDismissed={false}
        />
      );

      // Proposal banner only shows for self-custody variant
      expect(screen.queryByText(/pending signer invitation/)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Tab Support
  // ------------------------------------------
  describe('Tabs', () => {
    it('should render tab bar', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
    });

    it('should pass passkey variant to AccountTabContent', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{ variant: 'passkey', address: testAddress, credentialName: 'Test' }}
          onSignOut={vi.fn()}
          activeTab={'account' as any}
        />
      );

      const accountTab = screen.getByTestId('account-tab');
      expect(accountTab).toHaveAttribute('data-variant', 'passkey');
    });
  });

  // ------------------------------------------
  // Comparison: zkLogin should also show Sign Out
  // ------------------------------------------
  describe('Behavior parity with zkLogin', () => {
    it('zkLogin variant should also show Sign Out (not Lock/Delete)', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{
            variant: 'zkLogin',
            zkUserInfo: { name: 'Test User', email: 'test@test.com' },
            zkAddress: testAddress,
          }}
          onSignOut={vi.fn()}
        />
      );

      expect(screen.getByText('Sign Out')).toBeInTheDocument();
      expect(screen.queryByText('Lock')).not.toBeInTheDocument();
      expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // Comparison: self-custody should show Lock/Delete
  // ------------------------------------------
  describe('Self-custody variant difference', () => {
    it('self-custody variant should show Lock and Remove (not Sign Out)', () => {
      render(
        <ConnectedView
          {...baseSharedProps}
          header={{
            variant: 'self-custody',
            accountAddress: testAddress,
            displayAddress: testAddress,
            addressLabel: 'Connected Address',
            isEVM: false,
            storedEVMAddress: null,
          }}
          onLock={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText('Lock')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
      expect(screen.queryByText('Sign Out')).not.toBeInTheDocument();
    });
  });
});
