/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 * All forms are displayed as dropdowns to maintain consistent header height
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useWallet,
  useNFTs,
  useZkLogin,
  useMultiBalance,
  useNetwork,
  useLedger,
  useChain,
  useEVMBalance,
  getStoredEVMAddress,
  shortenAddressResponsive,
  isLockedOut,
  getLockoutRemainingMs,
  getUnlockAttemptState,
  getAllTokens,
  LOCKOUT_TIERS,
  useNsaStore,
  useNasunSmartAccount,
  type NFTInfo,
  type NFTSortBy,
  type ZkLoginProvider,
  type LedgerErrorCode,
} from "@nasun/wallet";
import { NetworkSelector } from "./NetworkSelector";
import { CopyableAddress } from "./CopyableAddress";
import { MnemonicBackup } from "./MnemonicBackup";
import { ImportWallet } from "./ImportWallet";
import { ExportPrivateKey } from "./ExportPrivateKey";
import { SendTransaction } from "./SendTransaction";
import { NFTCard } from "./NFTCard";
import { NFTDetail } from "./NFTDetail";
import { StakingPanel } from "./StakingPanel";
import { SecuritySettings } from "./SecuritySettings";
import { SocialLoginButtons } from "./SocialLoginButtons";
import { TokenFaucetButton } from "./TokenFaucetButton";
import { AddressBookPanel } from "./AddressBookPanel";
import { ReceivePanel } from "./ReceivePanel";
import { TransactionHistoryPanel } from "./TransactionHistoryPanel";
import { PortfolioPanel } from "./PortfolioPanel";
import { NasunLinkWizard } from "./NasunLinkWizard";
import { AdvancedToggle } from "./AdvancedToggle";
import { LedgerConnect, LedgerBrowserWarning, LedgerErrorDisplay } from "./ledger";
import { NsaSetupWizard, NsaAccountInfo, NsaAddSigner, NsaAcceptProposal, NsaBackupPanel, NsaGuardianSetup, NsaRecoveryPanel } from "./nsa";
import { useAdvancedMode, useUISettingsStore } from "./stores";
import { BalanceCard } from "./BalanceCard";
import { MoreMenu } from "./MoreMenu";
import { AssetsTab } from "./AssetsTab";
import { ActivityTab } from "./ActivityTab";

type ViewMode =
  | "main"
  | "create"
  | "create-backup" // Mnemonic backup screen
  | "unlock"
  | "import" // Recovery screen
  | "export" // Export private key
  | "send" // Token transfer
  | "receive" // Receive tokens (QR/Link)
  | "nfts" // NFT gallery
  | "staking" // Staking panel
  | "settings" // Security settings
  | "ledger-connect" // Ledger connection flow
  | "ledger-select" // Ledger address selection
  | "address-book" // Address book management
  | "portfolio" // Portfolio dashboard
  | "nasun-link" // Nasun Link creation
  | "nsa-setup" // Smart Account creation
  | "nsa-info" // Smart Account overview
  | "nsa-add-signer" // Propose signer
  | "nsa-accept-proposal" // Accept signer proposal
  | "nsa-backup" // Backup management
  | "nsa-guardians" // Guardian setup
  | "nsa-recovery"; // Recovery flow

/**
 * Locked state UI with rate limiting countdown
 */
function LockedStateUI({
  password,
  setPassword,
  isLoading,
  error,
  handleUnlock,
  handleDelete,
  setViewMode,
}: {
  password: string;
  setPassword: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  handleUnlock: () => void;
  handleDelete: () => void;
  setViewMode: (mode: ViewMode) => void;
}) {
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Check lockout status and countdown
  useEffect(() => {
    const checkStatus = () => {
      const state = getUnlockAttemptState();
      setFailedAttempts(state.failedAttempts);

      if (isLockedOut()) {
        setLockoutRemaining(Math.ceil(getLockoutRemainingMs() / 1000));
      } else {
        setLockoutRemaining(0);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = lockoutRemaining > 0;

  // Calculate remaining attempts until first lockout
  const firstLockoutThreshold = LOCKOUT_TIERS[0]?.attempts ?? 8;
  const attemptsRemaining = Math.max(0, firstLockoutThreshold - failedAttempts);

  // Format remaining time for display
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="p-4 w-full ">
      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-3">
        Unlock Wallet
      </h3>

      {isLocked && (
        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/50 rounded text-sm text-red-400">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Too many failed attempts</span>
          </div>
          <div className="text-center mt-1 font-mono">
            Try again in {formatTime(lockoutRemaining)}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLocked && handleUnlock()}
          className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || isLocked}
          autoFocus={!isLocked}
        />

        {/* Error message with remaining attempts */}
        {error && !isLocked && (
          <div className="text-xs">
            <p className="text-red-400">{error}</p>
            {failedAttempts > 0 && attemptsRemaining > 0 && (
              <p className="text-yellow-500 mt-1">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before
                lockout
              </p>
            )}
          </div>
        )}

        {/* Warning when approaching lockout */}
        {!error && !isLocked && failedAttempts > 0 && failedAttempts < firstLockoutThreshold && (
          <p className="text-xs text-yellow-500">
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before lockout
          </p>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setViewMode("import")}
            className="px-3 py-2 text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Import a different wallet"
          >
            Import
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm md:text-base text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Delete
          </button>
          <button
            onClick={handleUnlock}
            disabled={isLoading || !password || isLocked}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded text-sm md:text-base transition-colors"
          >
            {isLocked
              ? `Locked (${formatTime(lockoutRemaining)})`
              : isLoading
                ? "Unlocking..."
                : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}

type TabMode = "assets" | "activity";

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
}

export function WalletConnect({
  dropdownPosition = "bottom",
  dropdownAlign = "right",
  // Reserved for future customization
  addressStartChars: _addressStartChars,
  addressEndChars: _addressEndChars,
  addressLength: _addressLength = 6,
}: WalletConnectProps) {
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
  const nsaActiveRecoveryId = useNsaStore((s) => s.activeRecoveryId);
  const nsaPendingProposals = useNsaStore((s) => s.pendingProposals);
  const nsaIncomingInvitations = useNsaStore((s) => s.incomingInvitations);
  const nsaAccountState = useNsaStore((s) => s.accountState);
  const nsaBannerDismissed = useUISettingsStore((s) => s.nsaBannerDismissed);
  const dismissNsaBanner = useUISettingsStore((s) => s.dismissNsaBanner);
  const { refreshIncomingInvitations } = useNasunSmartAccount();

  // Recovery Readiness calculation
  const nsaHasMultipath = (nsaAccountState?.signers?.length ?? 0) >= 2;
  const nsaHasBackup = typeof window !== 'undefined' && localStorage.getItem('nasun:nsa-backup-created') === 'true';
  const nsaHasGuardian = (nsaAccountState?.guardians?.length ?? 0) > 0;
  const nsaRecoveryCompleted = [nsaHasMultipath, nsaHasBackup, nsaHasGuardian].filter(Boolean).length;

  // Auto-refresh incoming invitations when wallet connects
  useEffect(() => {
    if (account?.address) {
      refreshIncomingInvitations(account.address);
    }
  }, [account?.address, refreshIncomingInvitations]);

  // Count pending proposals where current user is the acceptor (from existing Smart Account)
  const pendingForMeFromAccount = nsaPendingProposals.filter(
    (p) => account?.address && p.pendingSigner.toLowerCase() === account.address.toLowerCase()
  ).length;

  // Total pending for me = from existing account + incoming invitations (discovered automatically)
  const pendingForMe = pendingForMeFromAccount + nsaIncomingInvitations.length;

  // Track which provider is loading
  const [loadingProvider, setLoadingProvider] = useState<ZkLoginProvider | null>(null);

  // Handle social login
  const handleSocialLogin = useCallback(
    async (provider: ZkLoginProvider) => {
      setLoadingProvider(provider);
      try {
        await zkLogin(provider);
        // OAuth redirect will happen, so we don't need to do anything here
      } catch {
        // Error is handled by the hook
      }
      setLoadingProvider(null);
    },
    [zkLogin],
  );

  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("assets");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [nftSortBy, setNftSortBy] = useState<NFTSortBy>("newest");
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [nftCursor, setNftCursor] = useState<string | undefined>(undefined);
  const [accumulatedNfts, setAccumulatedNfts] = useState<NFTInfo[]>([]);
  const [sendRecipient, setSendRecipient] = useState<string | undefined>(undefined);
  const [proposalBannerDismissed, setProposalBannerDismissed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Detect mobile viewport for centered dropdown positioning
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Save backup pending state to localStorage when entering backup mode
  // This allows parent components (like HomePage) to keep the modal mounted
  useEffect(() => {
    if (viewMode === "create-backup" && mnemonic) {
      try {
        localStorage.setItem("nasun_wallet_backup_pending", "true");
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [viewMode, mnemonic]);

  // Fetch NFTs when unlocked (only active tab uses the data)
  // Auto-refresh every 15 seconds to catch new NFTs (e.g., after voting)
  const {
    data: nfts = [],
    isLoading: nftsLoading,
    hasNextPage: nftsHasNextPage,
    nextCursor: nftsNextCursor,
  } = useNFTs({
    limit: 50,
    cursor: nftCursor,
    refetchInterval: nftCursor ? undefined : 15000, // Disable auto-refresh when loading more
    sortBy: nftSortBy,
  });

  // Accumulate NFTs when loading more pages
  useEffect(() => {
    if (nftCursor === undefined) {
      // First load or sort changed - replace all
      setAccumulatedNfts(nfts);
    } else if (nfts.length > 0) {
      // Loading more - append to existing
      setAccumulatedNfts((prev) => {
        const existingIds = new Set(prev.map((n) => n.objectId));
        const newNfts = nfts.filter((n) => !existingIds.has(n.objectId));
        return [...prev, ...newNfts];
      });
    }
  }, [nfts, nftCursor]);

  // Reset cursor when sort changes (Effect 1 handles data replacement when cursor is undefined)
  useEffect(() => {
    setNftCursor(undefined);
  }, [nftSortBy]);

  const handleLoadMoreNfts = () => {
    if (nftsNextCursor) {
      setNftCursor(nftsNextCursor);
    }
  };

  // Fetch token balances (NSN, NBTC, NUSDC)
  const { data: balances, isLoading: balancesLoading } = useMultiBalance({
    pollingInterval: 15000,
  });

  // Network info
  const { networkType } = useNetwork();

  // Chain selection (for multi-chain support)
  const { isEVM, chain } = useChain();
  const storedEVMAddress = isEVM ? getStoredEVMAddress() : null;
  const evmAddressForHook: string | undefined = storedEVMAddress ?? undefined;
  const { balance: evmBalance, isLoading: evmBalanceLoading } = useEVMBalance(evmAddressForHook);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideDesktopDropdown = dropdownRef.current?.contains(target);
      const isInsideMobileDropdown = mobileDropdownRef.current?.contains(target);

      // Check if click is inside the network selector modal (rendered via portal)
      const isInsideModal = (target as Element).closest?.('[data-network-modal="true"]');

      // Only close if click is outside desktop dropdown, mobile dropdown, AND modal
      if (
        dropdownRef.current &&
        !isInsideDesktopDropdown &&
        !isInsideMobileDropdown &&
        !isInsideModal
      ) {
        setShowDropdown(false);
        // Reset view when closing dropdown
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
  }, [viewMode, clearError]);

  // Create wallet with mnemonic backup
  const handleCreate = useCallback(async () => {
    if (password.length < 8) return;
    if (password !== confirmPassword) return;

    try {
      const result = await createWalletWithBackup(password);
      setMnemonic(result.mnemonic);
      setPassword("");
      setConfirmPassword("");
      setViewMode("create-backup");
    } catch {
      // Error is stored in state
    }
  }, [password, confirmPassword, createWalletWithBackup]);

  // After mnemonic backup confirmed
  const handleBackupConfirmed = useCallback(() => {
    // Clear backup pending flag
    try {
      localStorage.removeItem("nasun_wallet_backup_pending");
    } catch {
      // Ignore localStorage errors
    }
    setMnemonic(null);
    setViewMode("main");
    setShowDropdown(false);
  }, []);

  // Unlock wallet
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

  // Import from mnemonic
  const handleImportMnemonic = useCallback(
    async (mnemonicPhrase: string, pwd: string) => {
      await importFromMnemonic(mnemonicPhrase, pwd);
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromMnemonic],
  );

  // Import from private key
  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromPrivateKey],
  );

  // Export private key
  const handleExportPrivateKey = useCallback(
    async (pwd: string) => {
      return await exportPrivateKey(pwd);
    },
    [exportPrivateKey],
  );

  // Reset view
  const resetView = useCallback(() => {
    setViewMode("main");
    setPassword("");
    setConfirmPassword("");
    setMnemonic(null);
    clearError();
  }, [clearError]);

  // Delete wallet confirmation
  const handleDelete = useCallback(() => {
    if (confirm("Are you sure you want to delete your wallet? This action cannot be undone.")) {
      deleteWallet();
      resetSettings(); // Reset Advanced Mode and UI settings
      setShowDropdown(false);
    }
  }, [deleteWallet, resetSettings]);

  // Get button text based on status
  // Uses responsive address display: full format on desktop, short on mobile
  const getButtonText = () => {
    // zkLogin takes priority if connected
    if (isZkLoggedIn && zkState?.address) {
      return shortenAddressResponsive(zkState.address, isMobile);
    }
    // Ledger connected
    if (isLedgerConnected && ledgerAddress) {
      return shortenAddressResponsive(ledgerAddress, isMobile);
    }
    if (status === "disconnected") return "Get Started";
    if (status === "locked") return "Locked";
    if (status === "unlocked" && account)
      return shortenAddressResponsive(account.address, isMobile);
    return "Wallet";
  };

  // Get status indicator color
  const getStatusColor = () => {
    // zkLogin takes priority
    if (isZkLoggedIn) return "bg-green-500";
    // Ledger connected
    if (isLedgerConnected) return "bg-amber-500";
    if (status === "unlocked") return "bg-green-500";
    if (status === "locked") return "bg-yellow-500";
    return "bg-zinc-500";
  };

  // Render dropdown content based on status and viewMode
  const renderDropdownContent = () => {
    // Mnemonic backup screen (full-size, important)
    if (viewMode === "create-backup" && mnemonic) {
      return (
        <div className="p-2 w-full">
          <MnemonicBackup mnemonic={mnemonic} onConfirm={handleBackupConfirmed} />
        </div>
      );
    }

    // Create wallet form
    if (viewMode === "create") {
      return (
        <div className="p-4 w-full ">
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-3">
            Create New Wallet
          </h3>

          <div className="flex flex-col gap-2">
            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              autoFocus
            />

            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                password.length >= 8 &&
                password === confirmPassword &&
                handleCreate()
              }
              className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />

            {password.length > 0 && password.length < 8 && (
              <p className="text-xs text-red-400">Password must be at least 8 characters</p>
            )}

            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 mt-2">
              <button
                onClick={resetView}
                className="flex-1 px-3 py-2 text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isLoading || password.length < 8 || password !== confirmPassword}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm md:text-base transition-colors"
              >
                {isLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Import wallet screen
    if (viewMode === "import") {
      return (
        <div className="p-2 w-full">
          <ImportWallet
            onImportMnemonic={handleImportMnemonic}
            onImportPrivateKey={handleImportPrivateKey}
            onCancel={resetView}
            isLoading={isLoading}
          />
        </div>
      );
    }

    // Export private key view
    if (viewMode === "export") {
      return (
        <div className="p-2 w-full">
          <ExportPrivateKey onExport={handleExportPrivateKey} onClose={() => setViewMode("main")} />
        </div>
      );
    }

    // Send transaction view
    if (viewMode === "send") {
      return (
        <div className="p-2 w-full">
          <SendTransaction
            onClose={() => {
              setViewMode("main");
              setSendRecipient(undefined);
            }}
            onSuccess={() => {
              setSendRecipient(undefined);
            }}
            initialRecipient={sendRecipient}
          />
        </div>
      );
    }

    // Staking panel view
    if (viewMode === "staking") {
      return (
        <div className="w-full">
          <StakingPanel onClose={() => setViewMode("main")} compact />
        </div>
      );
    }

    // Portfolio view
    if (viewMode === "portfolio") {
      return (
        <div className="py-3 px-4 w-full">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setViewMode("main")}
              className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h3 className="font-medium text-gray-900 dark:text-white md:text-base">Portfolio</h3>
          </div>
          <PortfolioPanel />
        </div>
      );
    }

    // Nasun Link view
    if (viewMode === "nasun-link") {
      return (
        <div className="py-3 px-4 w-full">
          <NasunLinkWizard
            onCancel={() => setViewMode("main")}
            onSuccess={() => {
              // Stay on success screen, user can click Done to go back
            }}
          />
        </div>
      );
    }

    // Security settings view
    if (viewMode === "settings") {
      return <SecuritySettings onClose={() => setViewMode("main")} />;
    }

    // Address book view
    if (viewMode === "address-book") {
      return (
        <AddressBookPanel
          onClose={() => setViewMode("main")}
          onSend={(address) => {
            setSendRecipient(address);
            setViewMode("send");
          }}
        />
      );
    }

    // Receive view
    if (viewMode === "receive") {
      return <ReceivePanel onClose={() => setViewMode("main")} />;
    }

    // Ledger connect view
    if (viewMode === "ledger-connect") {
      const handleLedgerConnect = async () => {
        try {
          await ledgerConnect();
          // Connection successful - return to main view
          setViewMode("main");
        } catch {
          // Error is handled by useLedger hook
        }
      };

      return (
        <div className="py-3 px-4 w-full ">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setViewMode("main")}
              className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              Add Hardware Key
            </h3>
          </div>

          <LedgerBrowserWarning />

          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🔐</div>
              <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400 mb-1">
                Connect your Ledger device
              </p>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-500">
                Make sure the Sui/Nasun app is open on your device
              </p>
            </div>

            <LedgerConnect status={ledgerStatus} onConnect={handleLedgerConnect} variant="button" />

            {ledgerError && (
              <LedgerErrorDisplay
                code={ledgerError.code as LedgerErrorCode}
                rawMessage={ledgerError.message}
                onRetry={handleLedgerConnect}
              />
            )}
          </div>
        </div>
      );
    }

    // Ledger address select view (account index selector)
    if (viewMode === "ledger-select") {
      return (
        <div className="py-3 px-4 w-full ">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setViewMode("main")}
              className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              Select Account
            </h3>
          </div>

          <div className="space-y-2">
            <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 mb-3">
              Choose which account index to use
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLedgerAccountIndex(Math.max(0, ledgerAccountIndex - 1))}
                disabled={ledgerAccountIndex === 0}
                className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                -
              </button>
              <div className="flex-1 text-center">
                <span className="text-lg font-medium text-gray-900 dark:text-white">
                  Account {ledgerAccountIndex}
                </span>
              </div>
              <button
                onClick={() => setLedgerAccountIndex(ledgerAccountIndex + 1)}
                className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 rounded hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
              >
                +
              </button>
            </div>
            {ledgerAddress && (
              <div className="mt-3 p-2 bg-gray-50 dark:bg-zinc-800 rounded text-xs text-gray-600 dark:text-zinc-400 break-all">
                {ledgerAddress}
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={() => setViewMode("main")}
              className="w-full px-3 py-2 text-sm md:text-base bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      );
    }

    // NSA Smart Account views
    if (viewMode === "nsa-setup") {
      return (
        <NsaSetupWizard onClose={() => setViewMode("main")} onSuccess={() => setViewMode("nsa-info")} />
      );
    }
    if (viewMode === "nsa-info") {
      return (
        <NsaAccountInfo
          onClose={() => setViewMode("main")}
          onNavigate={(mode) => setViewMode(mode as ViewMode)}
          onAcceptProposal={(proposalId) => {
            setSelectedProposalId(proposalId);
            setViewMode("nsa-accept-proposal");
          }}
        />
      );
    }
    if (viewMode === "nsa-add-signer") {
      return <NsaAddSigner onClose={() => setViewMode("nsa-info")} />;
    }
    if (viewMode === "nsa-accept-proposal") {
      return (
        <NsaAcceptProposal
          onClose={() => {
            setSelectedProposalId("");
            setViewMode("nsa-info");
          }}
          initialProposalId={selectedProposalId}
        />
      );
    }
    if (viewMode === "nsa-backup") {
      return <NsaBackupPanel onClose={() => setViewMode("nsa-info")} />;
    }
    if (viewMode === "nsa-guardians") {
      return <NsaGuardianSetup onClose={() => setViewMode("nsa-info")} />;
    }
    if (viewMode === "nsa-recovery") {
      return <NsaRecoveryPanel onClose={() => setViewMode("nsa-info")} />;
    }

    // Ledger connected state (no software wallet)
    if (isLedgerConnected && ledgerAddress && status === "disconnected" && !isZkLoggedIn) {
      return (
        <div className="w-full ">
          {/* Ledger Address header */}
          <div className="px-3 py-3 border-b border-gray-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-500">🔐</span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Hardware Secured
              </span>
            </div>
            <CopyableAddress
              value={ledgerAddress}
              shorten={8}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
          </div>

          {/* Actions */}
          <div className="py-2 px-3 space-y-1">
            <button
              onClick={() => setViewMode("send")}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              Send
            </button>
            <button
              onClick={() => setViewMode("ledger-select")}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
              Change Account
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-zinc-700" />

          {/* Disconnect */}
          <div className="py-2 px-3">
            <button
              onClick={async () => {
                await ledgerDisconnect();
              }}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Disconnect Hardware Key
            </button>
          </div>
        </div>
      );
    }

    // Disconnected state - show social login and create/import options
    if (status === "disconnected" && !isZkLoggedIn && !isLedgerConnected) {
      return (
        <div className="py-3 px-4 w-full ">
          {/* Quick Start Section - Social Login (Recommended) */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Quick Start
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded">
                Recommended
              </span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 text-center mb-3">
              No seed phrase needed
            </p>
            <SocialLoginButtons
              onLogin={handleSocialLogin}
              isLoading={isZkLoading}
              loadingProvider={loadingProvider}
              providers={["google"]}
              size="md"
            />
            {zkError && <p className="text-xs text-red-400 mt-2 text-center">{zkError.message}</p>}
          </div>

          {/* Traditional Wallet Options */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider text-center mb-2">
              Or use traditional wallet
            </p>
            <button
              onClick={() => setViewMode("create")}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create Password Wallet
            </button>
            <button
              onClick={() => setViewMode("import")}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import Existing Wallet
            </button>
          </div>
        </div>
      );
    }

    // zkLogin connected state
    if (isZkLoggedIn && zkState) {
      return (
        <div className="w-full ">
          {/* User info header */}
          <div className="px-3 py-3 border-b border-gray-200 dark:border-zinc-700">
            <div className="flex items-center gap-3 mb-2">
              {zkUserInfo?.picture ? (
                <img
                  src={zkUserInfo.picture}
                  alt={zkUserInfo.name || "User"}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                  {zkUserInfo?.name?.[0] || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white font-medium truncate">
                  {zkUserInfo?.name || "Social Login"}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {zkUserInfo?.email || zkUserInfo?.provider || "Connected"}
                </p>
              </div>
            </div>
            <CopyableAddress
              value={zkState.address}
              shorten={8}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
          </div>

          {/* Balance Card with Quick Actions */}
          <BalanceCard
            address={zkState.address}
            onSend={() => setViewMode("send")}
            onReceive={() => setViewMode("receive")}
            onMore={() => setShowMoreMenu(!showMoreMenu)}
            moreMenuOpen={showMoreMenu}
          />

          {/* More Menu (conditional) */}
          {showMoreMenu && (
            <MoreMenu
              isZkLogin={true}
              nsaIsInitialized={nsaIsInitialized}
              nsaRecoveryCompleted={nsaRecoveryCompleted}
              pendingForMe={pendingForMe}
              onStaking={() => { setShowMoreMenu(false); setViewMode("staking"); }}
              onPortfolio={() => { setShowMoreMenu(false); setViewMode("portfolio"); }}
              onCreateLink={() => { setShowMoreMenu(false); setViewMode("nasun-link"); }}
              onSmartAccount={() => { setShowMoreMenu(false); setViewMode("nsa-info"); }}
              onExportKey={() => {}}
              onSecuritySettings={() => {}}
              onAddressBook={() => { setShowMoreMenu(false); setViewMode("address-book"); }}
              onLock={() => {}}
              onDisconnect={() => { setShowMoreMenu(false); zkLogout(); }}
            />
          )}

          {/* NSA Recovery Warning Banner */}
          {nsaIsInitialized && nsaActiveRecoveryId && !showMoreMenu && (
            <div className="mx-3 mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-xs text-red-700 dark:text-red-300 font-medium">Recovery in progress</span>
              </div>
              <button
                onClick={() => setViewMode("nsa-recovery")}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
              >
                View
              </button>
            </div>
          )}

          {/* NSA Setup Banner */}
          {!nsaIsInitialized && !nsaBannerDismissed && !showMoreMenu && (
            <div className="mx-3 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-xs text-blue-700 dark:text-blue-300">Secure your account with Smart Account</span>
                </div>
                <button
                  onClick={dismissNsaBanner}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setViewMode("nsa-setup")}
                className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Set Up Smart Account →
              </button>
            </div>
          )}

          {/* Tab navigation for zkLogin */}
          {!showMoreMenu && (
            <div className="flex border-b border-gray-200 dark:border-zinc-700">
              <button
                onClick={() => setActiveTab("assets")}
                className={`flex-1 px-4 py-2 text-sm md:text-base font-medium transition-colors ${
                  activeTab === "assets"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Assets
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={`flex-1 px-4 py-2 text-sm md:text-base font-medium transition-colors ${
                  activeTab === "activity"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Activity
              </button>
            </div>
          )}

          {/* Assets tab content */}
          {activeTab === "assets" && !showMoreMenu && (
            <AssetsTab
              address={zkState.address}
              nfts={accumulatedNfts}
              nftsLoading={nftsLoading}
              nftsHasNextPage={nftsHasNextPage}
              onLoadMoreNfts={handleLoadMoreNfts}
              onNftClick={setSelectedNFT}
              nftSortBy={nftSortBy}
              onNftSortChange={setNftSortBy}
            />
          )}

          {/* Activity tab content */}
          {activeTab === "activity" && !showMoreMenu && (
            <ActivityTab
              pendingProposals={nsaPendingProposals}
              currentAddress={zkState.address}
              nsaIsInitialized={nsaIsInitialized}
              onProposalClick={(proposal) => {
                setSelectedProposalId(proposal.objectId);
                setViewMode("nsa-accept-proposal");
              }}
            />
          )}

          {/* NFT Detail Modal for zkLogin */}
          {selectedNFT && (
            <NFTDetail
              nft={selectedNFT}
              onClose={() => setSelectedNFT(null)}
              onTransferSuccess={() => {
                setSelectedNFT(null);
              }}
            />
          )}

          {/* Advanced Mode Toggle for zkLogin */}
          <div className="px-3 py-2 border-t border-gray-200 dark:border-zinc-700">
            <AdvancedToggle compact showDescription={false} />
          </div>

          {/* Disconnect Button */}
          <div className="border-t border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => {
                zkLogout();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm md:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Disconnect
            </button>
          </div>

          {/* Network Selector */}
          <div className="border-t border-gray-200 dark:border-zinc-700">
            <NetworkSelector />
          </div>
        </div>
      );
    }

    // Locked state - show unlock form
    if (status === "locked") {
      return (
        <LockedStateUI
          password={password}
          setPassword={setPassword}
          isLoading={isLoading}
          error={error}
          handleUnlock={handleUnlock}
          handleDelete={handleDelete}
          setViewMode={setViewMode}
        />
      );
    }

    // Unlocked state - show wallet menu with tabs
    if (status === "unlocked" && account) {
      return (
        <div className="w-full ">
          {/* Address header */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
            <span className="text-xs text-gray-500 dark:text-zinc-400 block mb-1">
              Connected Address
            </span>
            <CopyableAddress
              value={account.address}
              shorten={8}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
          </div>

          {/* Balance Card with Quick Actions */}
          <BalanceCard
            address={account.address}
            onSend={() => setViewMode("send")}
            onReceive={() => setViewMode("receive")}
            onMore={() => setShowMoreMenu(!showMoreMenu)}
            moreMenuOpen={showMoreMenu}
          />

          {/* More Menu (conditional) */}
          {showMoreMenu && (
            <MoreMenu
              isZkLogin={false}
              nsaIsInitialized={nsaIsInitialized}
              nsaRecoveryCompleted={nsaRecoveryCompleted}
              pendingForMe={pendingForMe}
              onStaking={() => { setShowMoreMenu(false); setViewMode("staking"); }}
              onPortfolio={() => { setShowMoreMenu(false); setViewMode("portfolio"); }}
              onCreateLink={() => { setShowMoreMenu(false); setViewMode("nasun-link"); }}
              onSmartAccount={() => { setShowMoreMenu(false); setViewMode("nsa-info"); }}
              onExportKey={() => { setShowMoreMenu(false); setViewMode("export"); }}
              onSecuritySettings={() => { setShowMoreMenu(false); setViewMode("settings"); }}
              onAddressBook={() => { setShowMoreMenu(false); setViewMode("address-book"); }}
              onLock={() => { setShowMoreMenu(false); lockWallet(); setShowDropdown(false); }}
              onDelete={handleDelete}
              showDelete={true}
            />
          )}

          {/* NSA Recovery Warning Banner */}
          {nsaIsInitialized && nsaActiveRecoveryId && !showMoreMenu && (
            <div className="mx-3 mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-xs text-red-700 dark:text-red-300 font-medium">Recovery in progress</span>
              </div>
              <button
                onClick={() => setViewMode("nsa-recovery")}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
              >
                View
              </button>
            </div>
          )}

          {/* NSA Setup Banner */}
          {!nsaIsInitialized && !nsaBannerDismissed && !showMoreMenu && (
            <div className="mx-3 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-xs text-blue-700 dark:text-blue-300">Secure your account with Smart Account</span>
                </div>
                <button
                  onClick={dismissNsaBanner}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setViewMode("nsa-setup")}
                className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Set Up Smart Account →
              </button>
            </div>
          )}

          {/* Tab navigation */}
          {!showMoreMenu && (
            <div className="flex border-b border-gray-200 dark:border-zinc-700">
              <button
                onClick={() => setActiveTab("assets")}
                className={`flex-1 px-4 py-2 text-sm md:text-base font-medium transition-colors ${
                  activeTab === "assets"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Assets
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={`flex-1 px-4 py-2 text-sm md:text-base font-medium transition-colors ${
                  activeTab === "activity"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Activity
              </button>
            </div>
          )}

          {/* Assets tab content */}
          {activeTab === "assets" && !showMoreMenu && (
            <AssetsTab
              address={account.address}
              nfts={accumulatedNfts}
              nftsLoading={nftsLoading}
              nftsHasNextPage={nftsHasNextPage}
              onLoadMoreNfts={handleLoadMoreNfts}
              onNftClick={setSelectedNFT}
              nftSortBy={nftSortBy}
              onNftSortChange={setNftSortBy}
            />
          )}

          {/* Activity tab content */}
          {activeTab === "activity" && !showMoreMenu && (
            <ActivityTab
              pendingProposals={nsaPendingProposals}
              currentAddress={account.address}
              nsaIsInitialized={nsaIsInitialized}
              onProposalClick={(proposal) => {
                setSelectedProposalId(proposal.objectId);
                setViewMode("nsa-accept-proposal");
              }}
            />
          )}

          {/* NFT Detail Modal */}
          {selectedNFT && (
            <NFTDetail
              nft={selectedNFT}
              onClose={() => setSelectedNFT(null)}
              onTransferSuccess={() => {
                setSelectedNFT(null);
              }}
            />
          )}

          {/* Advanced Mode Toggle */}
          <div className="px-3 py-2 border-t border-gray-200 dark:border-zinc-700">
            <AdvancedToggle compact showDescription={false} />
          </div>

          {/* Network Selector */}
          <div className="border-t border-gray-200 dark:border-zinc-700">
            <NetworkSelector />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Main button - consistent across all states */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm md:text-base transition-colors"
      >
        <span className={`w-2 h-2 ${getStatusColor()} rounded-full`} />
        <span className="text-gray-900 dark:text-white font-mono">{getButtonText()}</span>
        <svg
          className={`w-4 h-4 text-gray-500 dark:text-zinc-400 transition-transform ${showDropdown ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - Desktop: relative to button, Mobile: portal to body for proper stacking */}
      {showDropdown && !isMobile && (
        <div
          className={`bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[9999] absolute w-[320px] sm:w-[380px] md:w-[420px] overflow-hidden ${
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
      {showDropdown &&
        isMobile &&
        createPortal(
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-[99998]"
              onClick={() => setShowDropdown(false)}
            />
            <div
              ref={mobileDropdownRef}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[420px] max-h-[85vh] overflow-hidden bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[99999]"
            >
              {renderDropdownContent()}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
