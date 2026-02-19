/**
 * Declarative ViewMode router for WalletConnect dropdown content.
 * Replaces the if-else chain in WalletConnect.tsx with a map-based approach.
 *
 * Resolution order:
 * 1. Explicit ViewMode match (e.g., "create", "send")
 * 2. Prefix-based routing (e.g., "nsa-*", "wc-*")
 * 3. Wallet status fallback (disconnected, locked, unlocked, zkLogin)
 */

import { useState, type ReactNode } from "react";
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
  PasskeySetupView,
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
  AddTokenView,
  DeleteConfirmationView,
} from "./wallet-views";
import { NFTGallery } from "../nft/NFTGallery";
import { WCViewRouter } from "../walletconnect";
import { setPendingPasskeyMnemonic, getPendingPasskeyMnemonic, setPendingRestoreKey, consumePendingRestoreKey } from "./hooks/useWalletViewState";
import { secureZeroString, usePasskeyStore } from "@nasun/wallet";
import { NsaRestorePanel } from "../nsa";
import { WalletBackupPanel, RestoreBackupPanel } from "../backup";

type ViewRenderer = (s: WalletConnectStateReturn) => ReactNode | null;

// Step 1: Explicit ViewMode -> renderer mapping
const VIEW_RENDERERS: Partial<Record<ViewMode, ViewRenderer>> = {
  // NSA restore: when disconnected, render directly (bypass NsaViewRouter)
  "nsa-restore": (s) => {
    if (s.status === "disconnected" && !s.isZkLoggedIn && !s.isLedgerConnected && !s.isPasskeyUnlocked) {
      return (
        <NsaRestorePanel
          onClose={() => s.setViewMode("main")}
          onImportKey={(key) => {
            setPendingRestoreKey(key);
            s.setViewMode("import");
          }}
        />
      );
    }
    // Connected: fall through to prefix-based NsaViewRouter
    return null;
  },

  "create-backup": (s) =>
    s.mnemonic ? <BackupView mnemonic={s.mnemonic} onConfirm={s.handleBackupConfirmed} /> : null,

  "passkey-setup": (s) => (
    <PasskeySetupView
      onBack={() => s.setViewMode("main")}
      onCreated={(mnemonic) => {
        setPendingPasskeyMnemonic(mnemonic);
        s.setMnemonic(mnemonic);
        s.setViewMode("passkey-backup");
      }}
      createWallet={s.passkeyCreateWallet}
      isLoading={s.isPasskeyLoading}
      error={s.passkeyError}
    />
  ),

  "passkey-backup": (s) => {
    // Mnemonic resolution order (handles WalletConnect unmount/remount race):
    // 1. React state (s.mnemonic) — set by onCreated if same component instance
    // 2. Module-level var — set by onCreated, survives within same JS context
    // 3. Zustand store — set BEFORE setUnlocked in mutation onSuccess, survives
    //    across component unmount/remount (e.g., WelcomeBanner → Header transition)
    const mnemonic = s.mnemonic
      ?? getPendingPasskeyMnemonic()
      ?? usePasskeyStore.getState().pendingMnemonic;

    if (!mnemonic) {
      // Mnemonic not yet available — return empty fragment (truthy) so renderViewContent
      // does NOT fall through to renderByWalletStatus (which would show ConnectedView).
      return <></>;
    }

    return (
      <BackupView
        mnemonic={mnemonic}
        onConfirm={() => {
          // Best-effort secure cleanup of mnemonic from memory
          const toZero = s.mnemonic ?? mnemonic;
          secureZeroString(toZero);
          setPendingPasskeyMnemonic(null);
          usePasskeyStore.getState().setPendingMnemonic(null);
          s.setMnemonic(null);
          try {
            localStorage.removeItem("nasun_wallet_backup_pending");
          } catch {
            // Ignore localStorage errors
          }
          s.setViewMode("main");
        }}
      />
    );
  },

  "create-auto-lock": (s) => (
    <AutoLockSetupView onComplete={s.handleAutoLockComplete} />
  ),

  "delete-confirm": (s) => (
    <DeleteConfirmationView
      onConfirm={s.confirmDelete}
      onCancel={() => s.setViewMode("main")}
    />
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
    <ImportViewWithRestore
      onImportMnemonic={s.handleImportMnemonic}
      onImportPrivateKey={s.handleImportPrivateKey}
      resetView={s.resetView}
      isLoading={s.isLoading}
    />
  ),

  "export": (s) => {
    const isPasskey = s.isPasskeyUnlocked && s.passkeyAddress;
    return (
      <ExportView
        onExport={isPasskey ? s.handleExportPasskeyPrivateKey : s.handleExportPrivateKey}
        setViewMode={s.setViewMode}
        authMode={isPasskey ? "biometric" : "password"}
      />
    );
  },

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
  "add-token": (s) => <AddTokenView setViewMode={s.setViewMode} />,

  "nfts": (s) => (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200 dark:border-zinc-700">
        <button
          onClick={() => s.setViewMode("main")}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base xl:text-lg font-medium text-gray-900 dark:text-white">My NFTs</h2>
      </div>

      {/* NFT Gallery */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <NFTGallery columns={3} hideHeader />
      </div>
    </div>
  ),

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

  "wallet-backup": (s) => (
    <WalletBackupPanel onClose={() => s.setViewMode("main")} />
  ),

  "restore-backup": (s) => {
    // Only available when disconnected (prevent overwriting existing keys)
    if (s.status === "disconnected" && !s.isZkLoggedIn && !s.isLedgerConnected && !s.isPasskeyUnlocked) {
      return (
        <RestoreBackupPanel
          onClose={() => s.setViewMode("main")}
          onImportKey={(key) => {
            setPendingRestoreKey(key);
            s.setViewMode("import");
          }}
        />
      );
    }
    // Connected: redirect to main
    s.setViewMode("main");
    return null;
  },
};

// Wrapper: consume pending restore key safely in a useState initializer (runs once)
function ImportViewWithRestore(props: {
  onImportMnemonic: (m: string, p: string) => Promise<void>;
  onImportPrivateKey: (k: string, p: string) => Promise<void>;
  resetView: () => void;
  isLoading: boolean;
}) {
  const [restoredKey] = useState(() => consumePendingRestoreKey());
  return (
    <ImportView
      {...props}
      initialPrivateKey={restoredKey ?? undefined}
    />
  );
}

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
        setProposalBannerDismissed={s.setProposalBannerDismissed}
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

  // Disconnected state (no auth method active)
  if (s.status === "disconnected" && !s.isZkLoggedIn && !s.isLedgerConnected && !s.isPasskeyUnlocked) {
    return (
      <DisconnectedView
        handleSocialLogin={s.handleSocialLogin}
        isZkLoading={s.isZkLoading}
        loadingProvider={s.loadingProvider}
        zkError={s.zkError}
        setViewMode={s.setViewMode}
        isPasskeySupported={s.isPasskeySupported}
        isPasskeyPlatformAvailable={s.isPasskeyPlatformAvailable}
        passkeyWallet={s.passkeyWallet}
        onPasskeyUnlock={s.passkeyUnlock}
        passkeyIsLoading={s.isPasskeyLoading}
        passkeyNeedsPassword={s.passkeyNeedsPassword}
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

  // Passkey connected state (after zkLogin, before ledger/self-custody)
  if (s.isPasskeyUnlocked && s.passkeyAddress) {
    const credName = s.passkeyCredentials?.[0]?.name ?? "Passkey Wallet";
    // Mirror self-custody: use chain-aware signer address for display
    const displayAddress = s.isEVM && s.storedEVMAddress
      ? s.storedEVMAddress
      : s.signerAddress ?? s.passkeyAddress;
    const addressLabel = s.isEVM
      ? s.storedEVMAddress
        ? `${s.chain.name} Address`
        : "EVM Wallet Not Configured"
      : "Connected Address";

    return (
      <ConnectedView
        header={{
          variant: "passkey",
          address: s.passkeyAddress,
          displayAddress,
          addressLabel,
          credentialName: credName,
        }}
        {...connectedViewSharedProps}
        onLock={() => {
          s.passkeyLock();
          s.setShowDropdown(false);
        }}
        onDelete={s.passkeyDeleteWallet}
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
    if (result != null) return result;
    // passkey-backup / create-backup: never fall through to ConnectedView.
    // The renderer returns null only transiently (before mnemonic arrives).
    if (s.viewMode === "passkey-backup" || s.viewMode === "create-backup") {
      return null;
    }
  }

  // 2. Prefix-based routing
  for (const [prefix, render] of PREFIX_RENDERERS) {
    if (s.viewMode.startsWith(prefix)) return render(s);
  }

  // 3. Wallet status fallback
  return renderByWalletStatus(s, connectedViewSharedProps);
}
