/**
 * Facade hook composing all WalletConnect state management.
 * Delegates to domain-specific sub-hooks for maintainability.
 */

import { useState, useCallback, useEffect } from "react";
import {
  useWallet,
  useZkLogin,
  useLedger,
  usePasskey,
  useNsaStore,
  useNasunSmartAccount,
  useWalletConnect,
  useWalletLabel,
  useSignerAddress,
  shortenAddressResponsive,
  type ZkLoginProvider,
} from "@nasun/wallet";
import { useAdvancedMode } from "../../stores";
import { useWalletViewState } from "./useWalletViewState";
import type { ViewMode } from "../types";
import { useConnectedViewData } from "./useConnectedViewData";
import { useWalletActions } from "./useWalletActions";

/** Truncate email for mobile display: "user@gmail.com" -> "user@..." */
function truncateEmail(email: string, isMobile: boolean): string {
  if (!isMobile) return email;
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;
  return `${email.slice(0, atIndex)}@...`;
}

/** Truncate text to max length with ellipsis */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function useWalletConnectState(initialViewMode?: ViewMode, defaultOpen?: boolean, onDropdownClose?: () => void) {
  // Compose domain-specific hooks
  const viewState = useWalletViewState(initialViewMode, defaultOpen, onDropdownClose);
  const data = useConnectedViewData();
  const actions = useWalletActions(viewState);

  // Core wallet state
  const {
    status,
    account,
    isLoading,
    error,
    lockWallet,
    clearError,
  } = useWallet();

  // zkLogin state
  const {
    isConnected: isZkLoggedIn,
    isLoading: isZkLoading,
    error: zkError,
    userInfo: zkUserInfo,
    login: zkLogin,
    logout: zkLogout,
    state: zkState,
  } = useZkLogin();

  // Chain-aware signer address (e.g., IOTA-derived vs Sui-derived)
  const signerAddress = useSignerAddress();

  // Wallet label (alias for self-custody)
  const { label: walletLabel } = useWalletLabel(account?.address);

  // Ledger state
  const {
    status: ledgerStatus,
    address: ledgerAddress,
    isConnected: isLedgerConnected,
    accountIndex: ledgerAccountIndex,
    setAccountIndex: setLedgerAccountIndex,
    connect: ledgerConnect,
    disconnect: ledgerDisconnect,
    error: ledgerError,
  } = useLedger();

  // Passkey state
  const {
    isSupported: isPasskeySupported,
    isPlatformAvailable: isPasskeyPlatformAvailable,
    wallet: passkeyWallet,
    isUnlocked: isPasskeyUnlocked,
    isLoading: isPasskeyLoading,
    error: passkeyError,
    address: passkeyAddress,
    credentials: passkeyCredentials,
    needsPassword: passkeyNeedsPassword,
    createWallet: passkeyCreateWallet,
    unlock: passkeyUnlock,
    lock: passkeyLock,
    deleteWallet: passkeyDeleteWallet,
    exportPrivateKey: passkeyExportPrivateKey,
    exportMnemonic: passkeyExportMnemonic,
    hasPendingRegistration: passkeyHasPendingRegistration,
    clearPendingRegistration,
  } = usePasskey({ autoCheck: true });

  // Passkey private key export handler (biometric re-auth gate)
  const handleExportPasskeyPrivateKey = useCallback(
    async (_pwd: string) => {
      return await passkeyExportPrivateKey();
    },
    [passkeyExportPrivateKey],
  );

  // Passkey mnemonic export handler — password passthrough for credential-id-password wallets;
  // PRF wallets ignore it (biometric provides the key material via prfOutput)
  const handleExportPasskeyMnemonic = useCallback(
    async (pwd: string) => {
      // Empty string from biometric mode becomes undefined; non-empty password is passed through
      return await passkeyExportMnemonic(pwd.length > 0 ? pwd : undefined);
    },
    [passkeyExportMnemonic],
  );

  // UI Settings
  const isAdvancedMode = useAdvancedMode();

  // NSA (Smart Account) state
  const nsaIsInitialized = useNsaStore((s) => s.isInitialized);
  const nsaPendingProposals = useNsaStore((s) => s.pendingProposals);
  const nsaIncomingInvitations = useNsaStore((s) => s.incomingInvitations);
  const nsaAccountState = useNsaStore((s) => s.accountState);
  const { refreshIncomingInvitations } = useNasunSmartAccount();

  // Recovery Readiness calculation
  const nsaHasMultipath = (nsaAccountState?.signers?.length ?? 0) >= 2;
  const nsaHasBackup =
    typeof window !== "undefined" && localStorage.getItem("nasun:nsa-backup-created") === "true";
  const nsaHasGuardian = (nsaAccountState?.guardians?.length ?? 0) > 0;
  const nsaRecoveryCompleted = [nsaHasMultipath, nsaHasBackup, nsaHasGuardian].filter(
    Boolean,
  ).length;

  // Auto-refresh incoming invitations when wallet connects
  useEffect(() => {
    if (account?.address) {
      refreshIncomingInvitations(account.address);
    }
  }, [account?.address, refreshIncomingInvitations]);

  // Count pending proposals where current user is the acceptor
  const pendingForMeFromAccount = nsaPendingProposals.filter(
    (p) => account?.address && p.pendingSigner.toLowerCase() === account.address.toLowerCase(),
  ).length;
  const pendingForMe = pendingForMeFromAccount + nsaIncomingInvitations.length;

  // WalletConnect state
  const { state: wcState } = useWalletConnect();
  const wcSessionCount = wcState.sessions.length;
  const wcPendingCount = wcState.pendingProposals.length + wcState.pendingRequests.length;

  // Auto-navigate to WC views when pending proposals/requests arrive.
  // Intentionally omitting viewMode from deps: we only want to trigger
  // on count changes, not on every viewMode transition.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wcState.pendingProposals.length > 0 && viewState.viewMode === "main") {
      viewState.setViewMode("wc-proposal");
    }
  }, [wcState.pendingProposals.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wcState.pendingRequests.length > 0 && viewState.viewMode === "main") {
      viewState.setViewMode("wc-request");
    }
  }, [wcState.pendingRequests.length]);

  // Track which provider is loading
  const [loadingProvider, setLoadingProvider] = useState<ZkLoginProvider | null>(null);

  // Handle social login
  const handleSocialLogin = useCallback(
    async (provider: ZkLoginProvider) => {
      setLoadingProvider(provider);
      try {
        await zkLogin(provider);
      } catch {
        // Error is handled by the hook
      }
      setLoadingProvider(null);
    },
    [zkLogin],
  );

  // Button text based on status
  // Priority: zkLogin > passkey > ledger > self-custody
  const getButtonText = () => {
    if (isZkLoggedIn && zkState?.address) {
      if (zkUserInfo?.name) return viewState.isMobile ? truncateText(zkUserInfo.name, 12) : zkUserInfo.name;
      if (zkUserInfo?.email) return truncateEmail(zkUserInfo.email, viewState.isMobile);
      return shortenAddressResponsive(zkState.address, viewState.isMobile);
    }
    if (isPasskeyUnlocked && passkeyAddress) {
      return shortenAddressResponsive(passkeyAddress, viewState.isMobile);
    }
    if (isLedgerConnected && ledgerAddress) {
      return shortenAddressResponsive(ledgerAddress, viewState.isMobile);
    }
    // Passkey wallet exists but is locked — self-custody status remains "disconnected"
    // (no keystore), so this check must come before the "disconnected" fallback.
    if (passkeyWallet && !isPasskeyUnlocked) return "Locked";
    if (status === "disconnected") return "Get Started";
    if (status === "locked") return "Locked";
    if (status === "unlocked" && account) {
      if (walletLabel) return viewState.isMobile ? truncateText(walletLabel, 10) : walletLabel;
      const addr = signerAddress ?? account.address;
      return shortenAddressResponsive(addr, viewState.isMobile);
    }
    return "Wallet";
  };

  // Status indicator color (text color for ▼ symbol)
  const getStatusColor = () => {
    if (isZkLoggedIn) return "text-green-500";
    if (isPasskeyUnlocked) return "text-green-500";
    if (isLedgerConnected) return "text-amber-500";
    if (status === "unlocked") return "text-green-500";
    if (status === "locked") return "text-yellow-500";
    if (passkeyWallet && !isPasskeyUnlocked) return "text-yellow-500";
    return "text-zinc-500";
  };

  return {
    // Wallet core
    status,
    account,
    isLoading,
    error,
    lockWallet,
    clearError,

    // zkLogin
    isZkLoggedIn,
    isZkLoading,
    zkError,
    zkUserInfo,
    zkLogout,
    zkState,
    loadingProvider,
    handleSocialLogin,

    // Chain-aware signer address
    signerAddress,

    // Wallet label
    walletLabel,

    // Ledger
    ledgerStatus,
    ledgerAddress,
    isLedgerConnected,
    ledgerAccountIndex,
    setLedgerAccountIndex,
    ledgerConnect,
    ledgerDisconnect,
    ledgerError,

    // UI settings
    isAdvancedMode,

    // NSA
    nsaIsInitialized,
    nsaAccountState,
    nsaRecoveryCompleted,
    pendingForMe,
    nsaIncomingInvitations,

    // Passkey
    isPasskeySupported,
    isPasskeyPlatformAvailable,
    passkeyWallet,
    isPasskeyUnlocked,
    isPasskeyLoading,
    passkeyError,
    passkeyAddress,
    passkeyCredentials,
    passkeyNeedsPassword,
    passkeyCreateWallet,
    passkeyUnlock,
    passkeyLock,
    passkeyDeleteWallet,
    handleExportPasskeyPrivateKey,
    handleExportPasskeyMnemonic,
    passkeyHasPendingRegistration,
    clearPendingRegistration,

    // WalletConnect
    wcSessionCount,
    wcPendingCount,

    // View state (from useWalletViewState)
    ...viewState,

    // Data (from useConnectedViewData)
    ...data,

    // Actions (from useWalletActions)
    ...actions,

    // Display helpers
    getButtonText,
    getStatusColor,
  };
}

export type WalletConnectStateReturn = ReturnType<typeof useWalletConnectState>;
