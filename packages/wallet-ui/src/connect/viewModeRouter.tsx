/**
 * Declarative ViewMode router for WalletConnect dropdown content.
 * Replaces the if-else chain in WalletConnect.tsx with a map-based approach.
 *
 * Resolution order:
 * 1. Explicit ViewMode match (e.g., "create", "send")
 * 2. Prefix-based routing (e.g., "nsa-*", "wc-*")
 * 3. Wallet status fallback (disconnected, locked, unlocked, zkLogin)
 */

import type { ReactNode } from "react";
import type { WalletConnectStateReturn } from "./hooks/useWalletConnectState";
import type { ViewMode } from "./types";
import { LockedStateUI } from "./LockedStateUI";
import {
  ConnectedView,
  type ConnectedViewProps,
  DisconnectedView,
  CreateWalletView,
  AutoLockSetupView,
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
import { WCViewRouter } from "../walletconnect";

type ViewRenderer = (s: WalletConnectStateReturn) => ReactNode | null;

// Step 1: Explicit ViewMode -> renderer mapping
const VIEW_RENDERERS: Partial<Record<ViewMode, ViewRenderer>> = {
  "create-backup": (s) =>
    s.mnemonic ? <BackupView mnemonic={s.mnemonic} onConfirm={s.handleBackupConfirmed} /> : null,

  "create-auto-lock": (s) => (
    <AutoLockSetupView onComplete={s.handleAutoLockComplete} />
  ),

  "create": (s) => (
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
  ),

  "import": (s) => (
    <ImportView
      onImportMnemonic={s.handleImportMnemonic}
      onImportPrivateKey={s.handleImportPrivateKey}
      resetView={s.resetView}
      isLoading={s.isLoading}
    />
  ),

  "export": (s) => (
    <ExportView onExport={s.handleExportPrivateKey} setViewMode={s.setViewMode} />
  ),

  "send": (s) => (
    <SendView
      setViewMode={s.setViewMode}
      setSendRecipient={s.setSendRecipient}
      initialRecipient={s.sendRecipient}
    />
  ),

  "staking": (s) => <StakingView setViewMode={s.setViewMode} />,
  "portfolio": (s) => <PortfolioView setViewMode={s.setViewMode} />,
  "nasun-link": (s) => <NasunLinkView setViewMode={s.setViewMode} />,
  "settings": (s) => <SettingsView setViewMode={s.setViewMode} />,
  "receive": (s) => <ReceiveView setViewMode={s.setViewMode} />,

  "address-book": (s) => (
    <AddressBookView
      setViewMode={s.setViewMode}
      setSendRecipient={s.setSendRecipient}
      sendRecipient={s.sendRecipient}
    />
  ),

  "ledger-connect": (s) => (
    <LedgerConnectView
      ledgerStatus={s.ledgerStatus}
      ledgerError={s.ledgerError}
      ledgerConnect={s.ledgerConnect}
      setViewMode={s.setViewMode}
    />
  ),

  "ledger-select": (s) => (
    <LedgerSelectView
      ledgerAccountIndex={s.ledgerAccountIndex}
      setLedgerAccountIndex={s.setLedgerAccountIndex}
      ledgerAddress={s.ledgerAddress}
      setViewMode={s.setViewMode}
    />
  ),
};

// Step 2: Prefix-based routers
const PREFIX_RENDERERS: [string, ViewRenderer][] = [
  [
    "nsa-",
    (s) => (
      <NsaViewRouter
        viewMode={s.viewMode}
        setViewMode={s.setViewMode}
        selectedProposalId={s.selectedProposalId}
        setSelectedProposalId={s.setSelectedProposalId}
      />
    ),
  ],
  ["wc-", (s) => <WCViewRouter viewMode={s.viewMode} setViewMode={s.setViewMode} />],
];

type SharedConnectedProps = Omit<ConnectedViewProps, "header" | "onSignOut" | "onLock" | "onDelete">;

// Step 3: Wallet status fallback (viewMode === "main" or no explicit match)
function renderByWalletStatus(
  s: WalletConnectStateReturn,
  connectedViewSharedProps: SharedConnectedProps,
): ReactNode | null {
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
    const displayAddress = s.isEVM && s.storedEVMAddress
      ? s.storedEVMAddress
      : s.signerAddress ?? s.account.address;
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
}

/**
 * Render the appropriate view content based on current ViewMode and wallet status.
 */
export function renderViewContent(
  s: WalletConnectStateReturn,
  connectedViewSharedProps: SharedConnectedProps,
): ReactNode {
  // 1. Explicit ViewMode match
  const renderer = VIEW_RENDERERS[s.viewMode];
  if (renderer) {
    const result = renderer(s);
    if (result) return result;
  }

  // 2. Prefix-based routing
  for (const [prefix, render] of PREFIX_RENDERERS) {
    if (s.viewMode.startsWith(prefix)) return render(s);
  }

  // 3. Wallet status fallback
  return renderByWalletStatus(s, connectedViewSharedProps);
}
