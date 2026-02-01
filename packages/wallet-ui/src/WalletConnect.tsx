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
  useChainStore,
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
  useWalletLabel,
  type NFTInfo,
  type NFTSortBy,
  type ZkLoginProvider,
  type LedgerErrorCode,
} from "@nasun/wallet";
import { NetworkSelectorModal } from "./NetworkSelectorModal";
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
import { MoreMenu } from "./MoreMenu";
import { LedgerConnect, LedgerBrowserWarning, LedgerErrorDisplay } from "./ledger";
import {
  NsaSetupWizard,
  NsaAccountInfo,
  NsaAddSigner,
  NsaAcceptProposal,
  NsaBackupPanel,
  NsaGuardianSetup,
  NsaRecoveryPanel,
} from "./nsa";
import { useAdvancedMode, useUISettingsStore } from "./stores";

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

/** Inline editable wallet nickname with always-visible edit icon */
function WalletLabelEditor({ address, fallbackLabel }: { address: string; fallbackLabel: string }) {
  const { label, setLabel, removeLabel } = useWalletLabel(address);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(label || "");
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      removeLabel();
    } else if (trimmed.length <= 20) {
      setLabel(trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => setIsEditing(false);

  return (
    <div>
      {/* Static label - not editable */}
      <p className="text-[10px] text-gray-500 dark:text-zinc-400 mb-0.5 text-left">
        {fallbackLabel}
      </p>
      {/* Editable nickname */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 20))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          onBlur={save}
          className="text-xs text-gray-900 dark:text-white bg-transparent border-b border-gray-400 dark:border-zinc-500 outline-none w-full py-0.5"
          placeholder="Wallet name..."
          maxLength={20}
        />
      ) : (
        <span className="inline-flex items-center text-xs text-gray-700 dark:text-zinc-300">
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Click to edit wallet nickname"
          >
            <span className="font-medium">{label || "Set nickname"}</span>
            <svg
              className="w-2.5 h-2.5 text-gray-400 dark:text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          {label && (
            <button
              onClick={() => removeLabel()}
              className="inline-flex p-0.5 ml-1 text-gray-400 dark:text-zinc-500 hover:text-red-400 dark:hover:text-red-400 transition-colors"
              title="Remove nickname"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </span>
      )}
    </div>
  );
}

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

type TabMode = "assets" | "history" | "account";

const TAB_CONFIG: Record<TabMode, { path: string; label: string }> = {
  assets: {
    path: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    label: "Assets",
  },
  history: { path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "History" },
  account: {
    path: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    label: "Account",
  },
};

const CUSTOM_SCROLLBAR_ID = 'nasun-wallet-scrollbar';

function injectScrollbarStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CUSTOM_SCROLLBAR_ID)) return;
  const style = document.createElement('style');
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

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
}) {
  return (
    <div className="flex gap-1 px-2 pt-2">
      {(Object.keys(TAB_CONFIG) as TabMode[]).map((tab) => {
        const isActive = tab === activeTab;
        const { path, label } = TAB_CONFIG[tab];
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${
              isActive
                ? "bg-white dark:bg-zinc-800 rounded-t-lg text-blue-600 dark:text-blue-400"
                : "text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 rounded-t-lg"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
            </svg>
            {label}
          </button>
        );
      })}
    </div>
  );
}

const QUICK_ACTIONS = [
  { key: "send", label: "Send", path: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
  {
    key: "receive",
    label: "Recv",
    path: "M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z",
  },
  {
    key: "staking",
    label: "Stake",
    path: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
] as const;

function QuickActionsBar({
  onAction,
  showMoreMenu,
  onToggleMore,
  moreMenuContent,
}: {
  onAction: (action: string) => void;
  showMoreMenu: boolean;
  onToggleMore: () => void;
  moreMenuContent: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1 flex gap-2 bg-gray-100 dark:bg-zinc-700/50">
      {QUICK_ACTIONS.map(({ key, label, path }) => (
        <button
          key={key}
          onClick={() => onAction(key)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
          </svg>
          {label}
        </button>
      ))}
      <div className="relative flex-1">
        <button
          onClick={onToggleMore}
          className={`w-full flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
            showMoreMenu
              ? "bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
          More
        </button>
        {showMoreMenu && (
          <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-50">
            {moreMenuContent}
          </div>
        )}
      </div>
    </div>
  );
}

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
  useEffect(() => { injectScrollbarStyles(); }, []);

  // Auto-refresh incoming invitations when wallet connects
  useEffect(() => {
    if (account?.address) {
      refreshIncomingInvitations(account.address);
    }
  }, [account?.address, refreshIncomingInvitations]);

  // Count pending proposals where current user is the acceptor (from existing Smart Account)
  const pendingForMeFromAccount = nsaPendingProposals.filter(
    (p) => account?.address && p.pendingSigner.toLowerCase() === account.address.toLowerCase(),
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
  const [nftSortBy, _setNftSortBy] = useState<NFTSortBy>("newest");
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [nftCursor, setNftCursor] = useState<string | undefined>(undefined);
  const [accumulatedNfts, setAccumulatedNfts] = useState<NFTInfo[]>([]);
  const [sendRecipient, setSendRecipient] = useState<string | undefined>(undefined);
  const [proposalBannerDismissed, setProposalBannerDismissed] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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
    hasNextPage: _nftsHasNextPage,
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
  // IMPORTANT: Only register listener when dropdown is open to prevent
  // multiple WalletConnect instances from interfering with each other
  useEffect(() => {
    if (!showDropdown) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!target) return;

      // Fix: Check if target is still connected to the DOM
      // If target was unmounted by React, ignore the click
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

  // Create wallet — backup modal is handled at the App level (MnemonicBackupModal)
  // via localStorage/sessionStorage set by the wallet store's createWalletWithBackup.
  const handleCreate = useCallback(async () => {
    if (password.length < 8) return;
    if (password !== confirmPassword) return;

    try {
      await createWalletWithBackup(password);
      // Reset UI settings and chain to defaults
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

  // After mnemonic backup confirmed
  const handleBackupConfirmed = useCallback(() => {
    // Clear all backup state
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
      // Reset UI settings and chain to defaults
      resetSettings();
      useChainStore.getState().resetToDefault();
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromMnemonic, resetSettings],
  );

  // Import from private key
  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      // Reset UI settings and chain to defaults
      resetSettings();
      useChainStore.getState().resetToDefault();
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromPrivateKey, resetSettings],
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
      resetSettings(); // Reset Pro Mode and UI settings
      setShowDropdown(false);
    }
  }, [deleteWallet, resetSettings]);

  // Get button text based on status
  // zkLogin: show name, self-custody: show label, fallback: truncated address
  const getButtonText = () => {
    // zkLogin takes priority if connected
    if (isZkLoggedIn && zkState?.address) {
      if (zkUserInfo?.name) return isMobile ? truncateText(zkUserInfo.name, 12) : zkUserInfo.name;
      if (zkUserInfo?.email) return truncateEmail(zkUserInfo.email, isMobile);
      return shortenAddressResponsive(zkState.address, isMobile);
    }
    // Ledger connected
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 dark:text-white md:text-base">Portfolio</h3>
            <button
              onClick={() => setViewMode("main")}
              className="text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
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
          onClose={() => {
            setViewMode("main");
            setSendRecipient(undefined);
          }}
          onSend={(address) => {
            setSendRecipient(address);
            setViewMode("send");
          }}
          initialAddress={sendRecipient}
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
        <NsaSetupWizard
          onClose={() => setViewMode("main")}
          onSuccess={() => setViewMode("nsa-info")}
        />
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
              shorten={isMobile ? 4 : 6}
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
              className="w-full px-3 py-2 text-left text-sm md:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded transition-colors flex items-center gap-2"
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
          {/* User info header with network selector */}
          <div className="px-3 py-3 bg-gray-100 dark:bg-zinc-700/50">
            <div className="flex items-start justify-between gap-2 mb-2">
              {/* Left: User info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
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

              {/* Right: Network selector + Interface switch */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                {isAdvancedMode ? (
                  <button
                    onClick={() => setIsNetworkModalOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
                      bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700
                      text-gray-700 dark:text-zinc-300 transition-colors shadow-sm"
                  >
                    <span className="max-w-[100px] truncate">{chain.name}</span>
                    {chain.type === "evm" && (
                      <span className="text-[10px] text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1 rounded">
                        EVM
                      </span>
                    )}
                    <svg
                      className="w-3 h-3 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                ) : (
                  <div className="group relative">
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
                      bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 cursor-default shadow-sm"
                    >
                      <span className="max-w-[100px] truncate">{chain.name}</span>
                      <svg
                        className="w-3 h-3 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    {/* Tooltip */}
                    <div
                      className="absolute right-0 top-full mt-1 w-48 p-2 text-xs text-gray-600 dark:text-zinc-300
                      bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg
                      opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                    >
                      Enable Pro Mode in Settings to change network
                    </div>
                  </div>
                )}
                <AdvancedToggle compact showDescription={false} />
              </div>
            </div>
            <CopyableAddress
              value={zkState.address}
              shorten={isMobile ? 4 : 6}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
          </div>

          {/* Network selector modal */}
          {isNetworkModalOpen && (
            <NetworkSelectorModal onClose={() => setIsNetworkModalOpen(false)} />
          )}

          {/* Tab frame: gray background wraps tabs + content */}
          <div className="bg-gray-100 dark:bg-zinc-700/50 pb-1">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tokens tab content */}
          {activeTab === "assets" && (
            <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tr-lg">
              {/* Token Balances Section */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Token Balances {isEVM && `(${chain.name})`}
                </p>
                {isEVM ? (
                  // EVM chain balance display
                  <div className="space-y-1.5">
                    {!storedEVMAddress ? (
                      <p className="text-sm text-gray-500 dark:text-zinc-400">
                        EVM wallet not configured
                      </p>
                    ) : evmBalanceLoading ? (
                      <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">
                          {chain.nativeCurrency.symbol}
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {evmBalance?.display || "0"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : balancesLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Native token (NSN) */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-zinc-300">NSN</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-900 dark:text-white">
                          {balances?.native?.formatted || "0"}
                        </span>
                        <TokenFaucetButton symbol="NSN" compact />
                      </div>
                    </div>
                    {/* Additional tokens - show all registered on devnet/testnet, only with balance on mainnet */}
                    {(networkType === "mainnet"
                      ? Object.entries(balances?.tokens || {})
                      : getAllTokens()
                          .filter((t) => t.symbol !== "NSN")
                          .map(
                            (t) =>
                              [
                                t.symbol,
                                balances?.tokens?.[t.symbol] || { formatted: "0" },
                              ] as const,
                          )
                    ).map(([symbol, token]) => (
                      <div key={symbol} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">{symbol}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-900 dark:text-white">
                            {token.formatted}
                          </span>
                          <TokenFaucetButton symbol={symbol} compact />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* NFT Preview Section */}
              {!isEVM && (
                <div className="px-3 py-2">
                  <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
                    NFTs {accumulatedNfts.length > 0 && `(${accumulatedNfts.length})`}
                  </p>
                  {nftsLoading && accumulatedNfts.length === 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                        />
                      ))}
                    </div>
                  ) : accumulatedNfts.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 text-center py-4">
                      No NFTs found
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {accumulatedNfts.slice(0, 6).map((nft) => (
                        <NFTCard
                          key={nft.objectId}
                          nft={nft}
                          compact
                          onClick={(n) => setSelectedNFT(n)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Account tab content for zkLogin */}
          {activeTab === "account" && (
            <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tl-lg">
              {/* Asset Management */}
              <button
                onClick={() => setViewMode("staking")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Staking
              </button>

              <button
                onClick={() => setViewMode("portfolio")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Portfolio
              </button>

              <button
                onClick={() => setViewMode("nasun-link")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Create Link
              </button>

              <div className="border-t border-gray-200 dark:border-zinc-700 my-2" />

              {/* Contacts & Security */}
              <button
                onClick={() => setViewMode("address-book")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Address Book
              </button>

              {/* Smart Account */}
              {nsaIsInitialized ? (
                <button
                  onClick={() => setViewMode("nsa-info")}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span className="flex-1">Smart Account</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      nsaRecoveryCompleted === 3
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {nsaRecoveryCompleted}/3
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setViewMode("nsa-setup")}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span className="flex-1">Smart Account</span>
                  <span className="text-xs text-blue-500 dark:text-blue-400">Setup</span>
                </button>
              )}
            </div>
          )}

          {/* History tab content */}
          {activeTab === "history" && (
            <div className="max-h-[280px] overflow-y-auto overflow-x-hidden mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-t-lg nasun-thin-scroll">
              <TransactionHistoryPanel
                hideHeader
                limit={10}
                onSend={(address) => {
                  setSendRecipient(address);
                  setViewMode("send");
                }}
                onAddressBook={(address) => {
                  setSendRecipient(address);
                  setViewMode("address-book");
                }}
              />
            </div>
          )}
          </div>{/* end tab frame */}

          {/* Quick Actions Bar */}
          <QuickActionsBar
            onAction={(action) => setViewMode(action as ViewMode)}
            showMoreMenu={showMoreMenu}
            onToggleMore={() => setShowMoreMenu(!showMoreMenu)}
            moreMenuContent={
              <MoreMenu
                nsaIsInitialized={nsaIsInitialized}
                nsaRecoveryCompleted={nsaRecoveryCompleted}
                pendingForMe={pendingForMe}
                onPortfolio={() => {
                  setViewMode("portfolio");
                  setShowMoreMenu(false);
                }}
                onCreateLink={() => {
                  setViewMode("nasun-link");
                  setShowMoreMenu(false);
                }}
                onSmartAccount={() => {
                  setViewMode(nsaIsInitialized ? "nsa-info" : "nsa-setup");
                  setShowMoreMenu(false);
                }}
              />
            }
          />

          {/* Session Actions - Always visible */}
          <div className="px-2 pb-2 pt-1 bg-gray-100 dark:bg-zinc-700/50">
            <button
              onClick={() => {
                zkLogout();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign Out
            </button>
          </div>

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
      // Determine which address to display based on chain type
      const displayAddress = isEVM && storedEVMAddress ? storedEVMAddress : account.address;
      const addressLabel = isEVM
        ? storedEVMAddress
          ? `${chain.name} Address`
          : "EVM Wallet Not Configured"
        : "Connected Address";

      return (
        <div className="w-full ">
          {/* Address header with network selector */}
          <div className="px-3 py-2 bg-gray-100 dark:bg-zinc-700/50">
            <div className="flex items-start justify-between gap-2">
              {/* Left: Address info with editable label */}
              <div className="flex-1 min-w-0 text-left">
                <WalletLabelEditor address={account.address} fallbackLabel={addressLabel} />
                {isEVM && !storedEVMAddress ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Re-import with your mnemonic to enable EVM support
                  </p>
                ) : (
                  <CopyableAddress
                    value={displayAddress}
                    shorten={isMobile ? 4 : 6}
                    showCopy
                    showExplorer
                    explorerType="address"
                    size="xs"
                  />
                )}
              </div>

              {/* Right: Network selector + Interface switch */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                {isAdvancedMode ? (
                  <button
                    onClick={() => setIsNetworkModalOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
                      bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700
                      text-gray-700 dark:text-zinc-300 transition-colors shadow-sm"
                  >
                    <span className="max-w-[100px] truncate">{chain.name}</span>
                    {chain.type === "evm" && (
                      <span className="text-[10px] text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1 rounded">
                        EVM
                      </span>
                    )}
                    <svg
                      className="w-3 h-3 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                ) : (
                  <div className="group relative">
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
                      bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 cursor-default shadow-sm"
                    >
                      <span className="max-w-[100px] truncate">{chain.name}</span>
                      <svg
                        className="w-3 h-3 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    {/* Tooltip */}
                    <div
                      className="absolute right-0 top-full mt-1 w-48 p-2 text-xs text-gray-600 dark:text-zinc-300
                      bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg
                      opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                    >
                      Enable Pro Mode in Settings to change network
                    </div>
                  </div>
                )}
                <AdvancedToggle compact showDescription={false} />
              </div>
            </div>
          </div>

          {/* Network selector modal */}
          {isNetworkModalOpen && (
            <NetworkSelectorModal onClose={() => setIsNetworkModalOpen(false)} />
          )}

          {/* Pending proposal notification banner */}
          {pendingForMe > 0 && !proposalBannerDismissed && (
            <div className="mx-3 mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
              <svg
                className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <button
                onClick={() => {
                  setProposalBannerDismissed(true);
                  // If there are incoming invitations, go directly to accept flow
                  if (nsaIncomingInvitations.length > 0) {
                    setSelectedProposalId(nsaIncomingInvitations[0].objectId);
                    setViewMode("nsa-accept-proposal");
                  } else {
                    setViewMode("nsa-info");
                  }
                }}
                className="flex-1 text-left text-xs text-blue-800 dark:text-blue-300"
              >
                You have {pendingForMe} pending signer invitation{pendingForMe > 1 ? "s" : ""}. Tap
                to view.
              </button>
              <button
                onClick={() => setProposalBannerDismissed(true)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Tab frame: gray background wraps tabs + content */}
          <div className="bg-gray-100 dark:bg-zinc-700/50 pb-1">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tokens tab content */}
          {activeTab === "assets" && (
            <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tr-lg">
              {/* Token Balances Section */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
                <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Token Balances {isEVM && `(${chain.name})`}
                </p>
                {isEVM ? (
                  // EVM chain balance display
                  <div className="space-y-1.5">
                    {!storedEVMAddress ? (
                      <p className="text-sm text-gray-500 dark:text-zinc-400">
                        EVM wallet not configured
                      </p>
                    ) : evmBalanceLoading ? (
                      <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">
                          {chain.nativeCurrency.symbol}
                        </span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {evmBalance?.display || "0"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : balancesLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Native token (NSN) */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-zinc-300">NSN</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-900 dark:text-white">
                          {balances?.native?.formatted || "0"}
                        </span>
                        <TokenFaucetButton symbol="NSN" compact />
                      </div>
                    </div>
                    {/* Additional tokens - show all registered on devnet/testnet, only with balance on mainnet */}
                    {(networkType === "mainnet"
                      ? Object.entries(balances?.tokens || {})
                      : getAllTokens()
                          .filter((t) => t.symbol !== "NSN")
                          .map(
                            (t) =>
                              [
                                t.symbol,
                                balances?.tokens?.[t.symbol] || { formatted: "0" },
                              ] as const,
                          )
                    ).map(([symbol, token]) => (
                      <div key={symbol} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">{symbol}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-900 dark:text-white">
                            {token.formatted}
                          </span>
                          <TokenFaucetButton symbol={symbol} compact />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* NFT Preview Section */}
              {!isEVM && (
                <div className="px-3 py-2">
                  <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
                    NFTs {accumulatedNfts.length > 0 && `(${accumulatedNfts.length})`}
                  </p>
                  {nftsLoading && accumulatedNfts.length === 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                        />
                      ))}
                    </div>
                  ) : accumulatedNfts.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 text-center py-4">
                      No NFTs found
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {accumulatedNfts.slice(0, 6).map((nft) => (
                        <NFTCard
                          key={nft.objectId}
                          nft={nft}
                          compact
                          onClick={(n) => setSelectedNFT(n)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Account tab content for software wallet */}
          {activeTab === "account" && (
            <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tl-lg">
              {/* Asset Management */}
              <button
                onClick={() => setViewMode("staking")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Staking
              </button>

              <button
                onClick={() => setViewMode("portfolio")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Portfolio
              </button>

              <button
                onClick={() => setViewMode("nasun-link")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Create Link
              </button>

              <div className="border-t border-gray-200 dark:border-zinc-700 my-2" />

              {/* Contacts & Security */}
              <button
                onClick={() => setViewMode("address-book")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Address Book
              </button>

              {/* Smart Account */}
              {nsaIsInitialized ? (
                <button
                  onClick={() => setViewMode("nsa-info")}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span className="flex-1">Smart Account</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      nsaRecoveryCompleted === 3
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {nsaRecoveryCompleted}/3
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setViewMode("nsa-setup")}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span className="flex-1">Smart Account</span>
                  <span className="text-xs text-blue-500 dark:text-blue-400">Setup</span>
                </button>
              )}

              {/* Security Settings */}
              <button
                onClick={() => setViewMode("settings")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Security Settings
              </button>

              <div className="border-t border-gray-200 dark:border-zinc-700 my-2" />

              {/* Backup & Settings */}
              <button
                onClick={() => setViewMode("export")}
                className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-4 h-4 text-gray-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                Export Private Key
              </button>
            </div>
          )}

          {/* History tab content */}
          {activeTab === "history" && (
            <div className="max-h-[280px] overflow-y-auto overflow-x-hidden mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-t-lg nasun-thin-scroll">
              <TransactionHistoryPanel
                hideHeader
                limit={10}
                onSend={(address) => {
                  setSendRecipient(address);
                  setViewMode("send");
                }}
                onAddressBook={(address) => {
                  setSendRecipient(address);
                  setViewMode("address-book");
                }}
              />
            </div>
          )}
          </div>{/* end tab frame */}

          {/* Quick Actions Bar */}
          <QuickActionsBar
            onAction={(action) => setViewMode(action as ViewMode)}
            showMoreMenu={showMoreMenu}
            onToggleMore={() => setShowMoreMenu(!showMoreMenu)}
            moreMenuContent={
              <MoreMenu
                nsaIsInitialized={nsaIsInitialized}
                nsaRecoveryCompleted={nsaRecoveryCompleted}
                pendingForMe={pendingForMe}
                onPortfolio={() => {
                  setViewMode("portfolio");
                  setShowMoreMenu(false);
                }}
                onCreateLink={() => {
                  setViewMode("nasun-link");
                  setShowMoreMenu(false);
                }}
                onSmartAccount={() => {
                  setViewMode(nsaIsInitialized ? "nsa-info" : "nsa-setup");
                  setShowMoreMenu(false);
                }}
              />
            }
          />

          {/* Session Actions - Always visible */}
          <div className="px-2 pb-2 pt-1 bg-gray-100 dark:bg-zinc-700/50">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  lockWallet();
                  setShowDropdown(false);
                }}
                className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Lock
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Remove
              </button>
            </div>
          </div>

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
        <span className={`w-2 h-2 ${getStatusColor()} rounded-full flex-shrink-0`} />
        <span
          className={`font-mono truncate ${
            variant === "filledOutlineC7" ? "" : "text-gray-900 dark:text-white"
          }`}
        >
          {getButtonText()}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${showDropdown ? "rotate-180" : ""} ${
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
