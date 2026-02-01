/**
 * Custom hook encapsulating all WalletConnect state management and handlers.
 * Extracted from WalletConnect.tsx to separate concerns.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useWallet,
  useNFTs,
  useZkLogin,
  useMultiBalance,
  useNetwork,
  useLedger,
  useChain,
  useChainStore,
  useEVMBalance,
  getStoredEVMAddress,
  shortenAddressResponsive,
  getAllTokens,
  useNsaStore,
  useNasunSmartAccount,
  useWalletLabel,
  type NFTInfo,
  type NFTSortBy,
  type ZkLoginProvider,
} from "@nasun/wallet";
import { useAdvancedMode, useUISettingsStore } from "../../stores";
import type { ViewMode } from "../LockedStateUI";
import type { TabMode } from "../TabBar";

export type ViewportTier = "mobile" | "tablet" | "desktop";

/** Truncate email for mobile display: "user@gmail.com" → "user@..." */
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

const CUSTOM_SCROLLBAR_ID = "nasun-wallet-scrollbar";

function injectScrollbarStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CUSTOM_SCROLLBAR_ID)) return;
  const style = document.createElement("style");
  style.id = CUSTOM_SCROLLBAR_ID;
  style.textContent = `
    .nasun-thin-scroll::-webkit-scrollbar { width: 4px; }
    .nasun-thin-scroll::-webkit-scrollbar-track { background: transparent; }
    .nasun-thin-scroll::-webkit-scrollbar-thumb {
      background: rgba(156,163,175,0.4);
      border-radius: 9999px;
    }
    .nasun-thin-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(156,163,175,0.6);
    }
    @media (prefers-color-scheme: dark) {
      .nasun-thin-scroll::-webkit-scrollbar-thumb {
        background: rgba(161,161,170,0.3);
      }
      .nasun-thin-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(161,161,170,0.5);
      }
    }
    .nasun-thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(156,163,175,0.4) transparent; }
  `;
  document.head.appendChild(style);
}

export function useWalletConnectState() {
  // Core wallet state
  const {
    status,
    account,
    isLoading,
    error,
    createWalletWithBackup,
    unlockWallet,
    lockWallet,
    deleteWallet,
    importFromMnemonic,
    importFromPrivateKey,
    exportPrivateKey,
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

  // UI Settings (Advanced mode)
  const isAdvancedMode = useAdvancedMode();
  const resetSettings = useUISettingsStore((state) => state.resetSettings);

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

  // Inject custom scrollbar styles
  useEffect(() => {
    injectScrollbarStyles();
  }, []);

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

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("assets");
  const [nftSortBy, _setNftSortBy] = useState<NFTSortBy>("newest");
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);
  const [viewport, setViewport] = useState<ViewportTier>("tablet");
  const [nftCursor, setNftCursor] = useState<string | undefined>(undefined);
  const [accumulatedNfts, setAccumulatedNfts] = useState<NFTInfo[]>([]);
  const [sendRecipient, setSendRecipient] = useState<string | undefined>(undefined);
  const [proposalBannerDismissed, setProposalBannerDismissed] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Detect viewport tier (mobile < 640px, tablet 640-1279px, desktop >= 1280px)
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setViewport(w < 640 ? "mobile" : w < 1280 ? "tablet" : "desktop");
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isMobile = viewport === "mobile";

  // Save backup pending state to localStorage
  useEffect(() => {
    if (viewMode === "create-backup" && mnemonic) {
      try {
        localStorage.setItem("nasun_wallet_backup_pending", "true");
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [viewMode, mnemonic]);

  // Fetch NFTs
  const {
    data: nfts = [],
    isLoading: nftsLoading,
    hasNextPage: _nftsHasNextPage,
  } = useNFTs({
    limit: 50,
    cursor: nftCursor,
    refetchInterval: nftCursor ? undefined : 15000,
    sortBy: nftSortBy,
  });

  // Accumulate NFTs when loading more pages
  useEffect(() => {
    if (nftCursor === undefined) {
      setAccumulatedNfts(nfts);
    } else if (nfts.length > 0) {
      setAccumulatedNfts((prev) => {
        const existingIds = new Set(prev.map((n) => n.objectId));
        const newNfts = nfts.filter((n) => !existingIds.has(n.objectId));
        return [...prev, ...newNfts];
      });
    }
  }, [nfts, nftCursor]);

  // Reset cursor when sort changes
  useEffect(() => {
    setNftCursor(undefined);
  }, [nftSortBy]);

  // Fetch token balances
  const { data: balances, isLoading: balancesLoading } = useMultiBalance({
    pollingInterval: 15000,
  });

  // Network info
  const { networkType } = useNetwork();

  // Chain selection
  const { isEVM, chain } = useChain();
  const storedEVMAddress = isEVM ? getStoredEVMAddress() : null;
  const evmAddressForHook: string | undefined = storedEVMAddress ?? undefined;
  const { balance: evmBalance, isLoading: evmBalanceLoading } = useEVMBalance(evmAddressForHook);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!target) return;

      if (target instanceof Element && !target.isConnected) {
        return;
      }

      const isInsideDesktopDropdown = dropdownRef.current?.contains(target);
      const isInsideMobileDropdown = mobileDropdownRef.current?.contains(target);
      const isInsideModal = (target as Element).closest?.('[data-network-modal="true"]');

      if (
        dropdownRef.current &&
        !isInsideDesktopDropdown &&
        !isInsideMobileDropdown &&
        !isInsideModal
      ) {
        setShowDropdown(false);
        if (viewMode !== "create-backup") {
          setViewMode("main");
          setPassword("");
          setConfirmPassword("");
          clearError();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, viewMode, clearError]);

  // Handlers
  const handleCreate = useCallback(async () => {
    if (password.length < 8) return;
    if (password !== confirmPassword) return;

    try {
      await createWalletWithBackup(password);
      resetSettings();
      useChainStore.getState().resetToDefault();
      setPassword("");
      setConfirmPassword("");
      setViewMode("main");
      setShowDropdown(false);
    } catch {
      // Error is stored in state
    }
  }, [password, confirmPassword, createWalletWithBackup, resetSettings]);

  const handleBackupConfirmed = useCallback(() => {
    try {
      localStorage.removeItem("nasun_wallet_backup_pending");
      sessionStorage.removeItem("nasun_wallet_pending_mnemonic");
    } catch {
      // Ignore localStorage errors
    }
    setMnemonic(null);
    setViewMode("main");
    setShowDropdown(false);
  }, []);

  const handleUnlock = useCallback(async () => {
    try {
      await unlockWallet(password);
      setPassword("");
      setViewMode("main");
      setShowDropdown(false);
    } catch {
      // Error is stored in state
    }
  }, [password, unlockWallet]);

  const handleImportMnemonic = useCallback(
    async (mnemonicPhrase: string, pwd: string) => {
      await importFromMnemonic(mnemonicPhrase, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromMnemonic, resetSettings],
  );

  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromPrivateKey, resetSettings],
  );

  const handleExportPrivateKey = useCallback(
    async (pwd: string) => {
      return await exportPrivateKey(pwd);
    },
    [exportPrivateKey],
  );

  const resetView = useCallback(() => {
    setViewMode("main");
    setPassword("");
    setConfirmPassword("");
    setMnemonic(null);
    clearError();
  }, [clearError]);

  const handleDelete = useCallback(() => {
    if (confirm("Remove this wallet from your browser?\nYour assets are safe on-chain, but you will need your recovery phrase (mnemonic) or private key to restore access.\nMake sure you have a backup before proceeding.")) {
      deleteWallet();
      resetSettings();
      setShowDropdown(false);
    }
  }, [deleteWallet, resetSettings]);

  // Button text based on status
  const getButtonText = () => {
    if (isZkLoggedIn && zkState?.address) {
      if (zkUserInfo?.name) return isMobile ? truncateText(zkUserInfo.name, 12) : zkUserInfo.name;
      if (zkUserInfo?.email) return truncateEmail(zkUserInfo.email, isMobile);
      return shortenAddressResponsive(zkState.address, isMobile);
    }
    if (isLedgerConnected && ledgerAddress) {
      return shortenAddressResponsive(ledgerAddress, isMobile);
    }
    if (status === "disconnected") return "Get Started";
    if (status === "locked") return "Locked";
    if (status === "unlocked" && account) {
      if (walletLabel) return isMobile ? truncateText(walletLabel, 10) : walletLabel;
      return shortenAddressResponsive(account.address, isMobile);
    }
    return "Wallet";
  };

  // Status indicator color
  const getStatusColor = () => {
    if (isZkLoggedIn) return "bg-green-500";
    if (isLedgerConnected) return "bg-amber-500";
    if (status === "unlocked") return "bg-green-500";
    if (status === "locked") return "bg-yellow-500";
    return "bg-zinc-500";
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

    // UI state
    viewMode,
    setViewMode,
    selectedProposalId,
    setSelectedProposalId,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showDropdown,
    setShowDropdown,
    mnemonic,
    setMnemonic,
    activeTab,
    setActiveTab,
    selectedNFT,
    setSelectedNFT,
    viewport,
    isMobile,
    sendRecipient,
    setSendRecipient,
    proposalBannerDismissed,
    setProposalBannerDismissed,
    isNetworkModalOpen,
    setIsNetworkModalOpen,
    showMoreMenu,
    setShowMoreMenu,
    dropdownRef,
    mobileDropdownRef,

    // Data
    accumulatedNfts,
    nftsLoading,
    balances,
    balancesLoading,
    networkType,
    isEVM,
    chain,
    storedEVMAddress,
    evmBalance,
    evmBalanceLoading,
    getAllTokens,

    // Handlers
    handleCreate,
    handleBackupConfirmed,
    handleUnlock,
    handleImportMnemonic,
    handleImportPrivateKey,
    handleExportPrivateKey,
    resetView,
    handleDelete,

    // Display helpers
    getButtonText,
    getStatusColor,
  };
}

export type WalletConnectStateReturn = ReturnType<typeof useWalletConnectState>;
