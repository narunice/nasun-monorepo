/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 * All forms are displayed as dropdowns to maintain consistent header height
 */

import { createPortal } from "react-dom";
import { LockedStateUI } from "./LockedStateUI";
import { useWalletConnectState } from "./hooks/useWalletConnectState";
import { WALLET_STYLES } from "../shared/styles";
import {
  ConnectedView,
  DisconnectedView,
  CreateWalletView,
  LedgerConnectView,
  LedgerSelectView,
  LedgerConnectedView,
  NsaViewRouter,
  BackupView,
  ImportView,
  ExportView,
  SendView,
  StakingView,
  PortfolioView,
  NasunLinkView,
  SettingsView,
  AddressBookView,
  ReceiveView,
} from "./wallet-views";

interface WalletConnectProps {
  /** Dropdown position relative to button */
  dropdownPosition?: "top" | "bottom";
  /** Dropdown horizontal alignment */
  dropdownAlign?: "left" | "right" | "center";
  /** Number of characters to show after 0x prefix (default: 6) */
  addressStartChars?: number;
  /** Number of characters to show at the end (default: same as start) */
  addressEndChars?: number;
  /** @deprecated Use addressStartChars instead */
  addressLength?: number;
  /** Button style variant */
  variant?: string;
  /** Button size variant */
  size?: "default" | "sm";
}

export function WalletConnect({
  dropdownPosition = "bottom",
  dropdownAlign = "right",
  // Reserved for future customization
  addressStartChars: _addressStartChars,
  addressEndChars: _addressEndChars,
  addressLength: _addressLength = 6,
  variant,
  size = "default",
}: WalletConnectProps) {
  const s = useWalletConnectState();

  // Shared props for ConnectedView
  const connectedViewSharedProps = {
    isMobile: s.isMobile,
    isAdvancedMode: s.isAdvancedMode,
    chain: s.chain,
    isNetworkModalOpen: s.isNetworkModalOpen,
    setIsNetworkModalOpen: s.setIsNetworkModalOpen,
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    isEVM: s.isEVM,
    storedEVMAddress: s.storedEVMAddress,
    evmBalance: s.evmBalance,
    evmBalanceLoading: s.evmBalanceLoading,
    balances: s.balances,
    balancesLoading: s.balancesLoading,
    networkType: s.networkType,
    getAllTokens: s.getAllTokens,
    accumulatedNfts: s.accumulatedNfts,
    nftsLoading: s.nftsLoading,
    selectedNFT: s.selectedNFT,
    setSelectedNFT: s.setSelectedNFT,
    nsaIsInitialized: s.nsaIsInitialized,
    nsaRecoveryCompleted: s.nsaRecoveryCompleted,
    showMoreMenu: s.showMoreMenu,
    setShowMoreMenu: s.setShowMoreMenu,
    pendingForMe: s.pendingForMe,
    setViewMode: s.setViewMode,
    setSendRecipient: s.setSendRecipient,
    proposalBannerDismissed: s.proposalBannerDismissed,
    setProposalBannerDismissed: s.setProposalBannerDismissed,
    nsaIncomingInvitations: s.nsaIncomingInvitations,
    setSelectedProposalId: s.setSelectedProposalId,
  } as const;

  // Render dropdown content based on status and viewMode
  const renderDropdownContent = () => {
    // Mnemonic backup screen
    if (s.viewMode === "create-backup" && s.mnemonic) {
      return <BackupView mnemonic={s.mnemonic} onConfirm={s.handleBackupConfirmed} />;
    }

    // Create wallet form
    if (s.viewMode === "create") {
      return (
        <CreateWalletView
          password={s.password}
          setPassword={s.setPassword}
          confirmPassword={s.confirmPassword}
          setConfirmPassword={s.setConfirmPassword}
          isLoading={s.isLoading}
          error={s.error}
          handleCreate={s.handleCreate}
          resetView={s.resetView}
        />
      );
    }

    // Import wallet
    if (s.viewMode === "import") {
      return (
        <ImportView
          onImportMnemonic={s.handleImportMnemonic}
          onImportPrivateKey={s.handleImportPrivateKey}
          resetView={s.resetView}
          isLoading={s.isLoading}
        />
      );
    }

    // Export private key
    if (s.viewMode === "export") {
      return <ExportView onExport={s.handleExportPrivateKey} setViewMode={s.setViewMode} />;
    }

    // Send transaction
    if (s.viewMode === "send") {
      return (
        <SendView
          setViewMode={s.setViewMode}
          setSendRecipient={s.setSendRecipient}
          initialRecipient={s.sendRecipient}
        />
      );
    }

    // Simple sub-views
    if (s.viewMode === "staking") return <StakingView setViewMode={s.setViewMode} />;
    if (s.viewMode === "portfolio") return <PortfolioView setViewMode={s.setViewMode} />;
    if (s.viewMode === "nasun-link") return <NasunLinkView setViewMode={s.setViewMode} />;
    if (s.viewMode === "settings") return <SettingsView setViewMode={s.setViewMode} />;
    if (s.viewMode === "receive") return <ReceiveView setViewMode={s.setViewMode} />;

    if (s.viewMode === "address-book") {
      return (
        <AddressBookView
          setViewMode={s.setViewMode}
          setSendRecipient={s.setSendRecipient}
          sendRecipient={s.sendRecipient}
        />
      );
    }

    // Ledger views
    if (s.viewMode === "ledger-connect") {
      return (
        <LedgerConnectView
          ledgerStatus={s.ledgerStatus}
          ledgerError={s.ledgerError}
          ledgerConnect={s.ledgerConnect}
          setViewMode={s.setViewMode}
        />
      );
    }
    if (s.viewMode === "ledger-select") {
      return (
        <LedgerSelectView
          ledgerAccountIndex={s.ledgerAccountIndex}
          setLedgerAccountIndex={s.setLedgerAccountIndex}
          ledgerAddress={s.ledgerAddress}
          setViewMode={s.setViewMode}
        />
      );
    }

    // NSA Smart Account views
    if (s.viewMode.startsWith("nsa-")) {
      return (
        <NsaViewRouter
          viewMode={s.viewMode}
          setViewMode={s.setViewMode}
          selectedProposalId={s.selectedProposalId}
          setSelectedProposalId={s.setSelectedProposalId}
        />
      );
    }

    // Ledger connected state (no software wallet)
    if (s.isLedgerConnected && s.ledgerAddress && s.status === "disconnected" && !s.isZkLoggedIn) {
      return (
        <LedgerConnectedView
          ledgerAddress={s.ledgerAddress}
          isMobile={s.isMobile}
          setViewMode={s.setViewMode}
          ledgerDisconnect={s.ledgerDisconnect}
        />
      );
    }

    // Disconnected state
    if (s.status === "disconnected" && !s.isZkLoggedIn && !s.isLedgerConnected) {
      return (
        <DisconnectedView
          handleSocialLogin={s.handleSocialLogin}
          isZkLoading={s.isZkLoading}
          loadingProvider={s.loadingProvider}
          zkError={s.zkError}
          setViewMode={s.setViewMode}
        />
      );
    }

    // zkLogin connected state
    if (s.isZkLoggedIn && s.zkState) {
      return (
        <ConnectedView
          header={{
            variant: "zkLogin",
            zkUserInfo: s.zkUserInfo,
            zkAddress: s.zkState.address,
          }}
          {...connectedViewSharedProps}
          onSignOut={() => {
            s.zkLogout();
            s.setShowDropdown(false);
          }}
        />
      );
    }

    // Locked state
    if (s.status === "locked") {
      return (
        <LockedStateUI
          password={s.password}
          setPassword={s.setPassword}
          isLoading={s.isLoading}
          error={s.error}
          handleUnlock={s.handleUnlock}
          handleDelete={s.handleDelete}
          setViewMode={s.setViewMode}
        />
      );
    }

    // Unlocked state (self-custody)
    if (s.status === "unlocked" && s.account) {
      const displayAddress = s.isEVM && s.storedEVMAddress ? s.storedEVMAddress : s.account.address;
      const addressLabel = s.isEVM
        ? s.storedEVMAddress
          ? `${s.chain.name} Address`
          : "EVM Wallet Not Configured"
        : "Connected Address";

      return (
        <ConnectedView
          header={{
            variant: "self-custody",
            accountAddress: s.account.address,
            displayAddress,
            addressLabel,
            isEVM: s.isEVM,
            storedEVMAddress: s.storedEVMAddress,
          }}
          {...connectedViewSharedProps}
          onLock={() => {
            s.lockWallet();
            s.setShowDropdown(false);
          }}
          onDelete={s.handleDelete}
        />
      );
    }

    return null;
  };

  return (
    <div ref={s.dropdownRef} className="relative">
      {/* Main button - consistent across all states */}
      <button
        onClick={() => s.setShowDropdown(!s.showDropdown)}
        className={`flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
          variant === "filledOutlineC7"
            ? `ring-1 ring-inset ring-nasun-c7/70 bg-nasun-c7/10 text-nasun-c7 hover:bg-transparent hover:ring-nasun-c7 rounded-full ${
                size === "sm"
                  ? "text-xs lg:text-sm px-5 md:px-7 lg:px-9 py-1"
                  : "text-sm md:text-base px-3 py-2"
              }`
            : `bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded ${
                size === "sm" ? "text-xs lg:text-sm px-4 py-1" : "text-sm md:text-base px-3 py-2"
              }`
        }`}
      >
        <span className={`w-2 h-2 ${s.getStatusColor()} rounded-full flex-shrink-0`} />
        <span
          className={`font-mono truncate ${
            variant === "filledOutlineC7" ? "" : "text-gray-900 dark:text-white"
          }`}
        >
          {s.getButtonText()}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${s.showDropdown ? "rotate-180" : ""} ${
            variant === "filledOutlineC7" ? "text-nasun-c7" : "text-gray-500 dark:text-zinc-400"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - Desktop: relative to button, Mobile: portal to body for proper stacking */}
      {s.showDropdown && !s.isMobile && (
        <div
          className={`bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[9999] absolute ${WALLET_STYLES.dropdownDesktop} overflow-hidden ${
            dropdownAlign === "left"
              ? "left-0"
              : dropdownAlign === "center"
                ? "left-1/2 -translate-x-1/2"
                : "right-0"
          } ${dropdownPosition === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {renderDropdownContent()}
        </div>
      )}

      {/* Mobile dropdown - rendered via portal to escape stacking context issues */}
      {s.showDropdown &&
        s.isMobile &&
        createPortal(
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-[99998]"
              onClick={() => s.setShowDropdown(false)}
            />
            <div
              ref={s.mobileDropdownRef}
              className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${WALLET_STYLES.dropdownMobile} overflow-hidden bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[99999]`}
            >
              {renderDropdownContent()}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
