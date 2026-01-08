/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 * All forms are displayed as dropdowns to maintain consistent header height
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useWallet,
  useNFTs,
  useZkLogin,
  useMultiBalance,
  useNetwork,
  requestFaucet,
  shortenAddress,
  isLockedOut,
  getLockoutRemainingMs,
  getUnlockAttemptState,
  LOCKOUT_TIERS,
  type NFTInfo,
  type ZkLoginProvider,
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

type ViewMode =
  | "main"
  | "create"
  | "create-backup" // Mnemonic backup screen
  | "unlock"
  | "import" // Recovery screen
  | "export" // Export private key
  | "send" // Token transfer
  | "nfts" // NFT gallery
  | "staking" // Staking panel
  | "settings"; // Security settings

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
    <div className="p-4 w-full sm:w-[280px]">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Unlock Wallet</h3>

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
          className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoading}
            title="Import a different wallet"
          >
            Import
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Delete
          </button>
          <button
            onClick={handleUnlock}
            disabled={isLoading || !password || isLocked}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded text-sm transition-colors"
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

type TabMode = "tokens" | "nfts";

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
  addressStartChars,
  addressEndChars,
  addressLength = 6,
}: WalletConnectProps) {
  // Use new props if provided, otherwise fall back to deprecated addressLength
  const startChars = addressStartChars ?? addressLength;
  const endChars = addressEndChars ?? addressStartChars ?? addressLength;
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
    [zkLogin]
  );

  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("tokens");
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch NFTs when unlocked (only active tab uses the data)
  // Auto-refresh every 15 seconds to catch new NFTs (e.g., after voting)
  const { data: nfts = [], isLoading: nftsLoading } = useNFTs({
    limit: 20,
    refetchInterval: 15000,
  });

  // Fetch token balances (NASUN, NBTC, NUSDC)
  const { data: balances, isLoading: balancesLoading, refetch: refetchBalances } = useMultiBalance({
    pollingInterval: 15000,
  });

  // Network info
  const { networkType, isDevnet, hasFaucet } = useNetwork();

  // Faucet state
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Handle faucet request
  const handleFaucet = useCallback(async () => {
    const address = account?.address || zkState?.address;
    if (!address || isFaucetLoading) return;

    setIsFaucetLoading(true);
    setFaucetMessage(null);

    try {
      const success = await requestFaucet(address);
      if (success) {
        setFaucetMessage({ type: 'success', text: 'NASUN received!' });
        // Refresh balance after 2 seconds
        setTimeout(() => {
          refetchBalances();
          setFaucetMessage(null);
        }, 2000);
      } else {
        setFaucetMessage({ type: 'error', text: 'Faucet request failed' });
        setTimeout(() => setFaucetMessage(null), 3000);
      }
    } catch (err) {
      setFaucetMessage({ type: 'error', text: 'Faucet error' });
      setTimeout(() => setFaucetMessage(null), 3000);
    } finally {
      setIsFaucetLoading(false);
    }
  }, [account?.address, zkState?.address, isFaucetLoading, refetchBalances]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
    [importFromMnemonic]
  );

  // Import from private key
  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      setViewMode("main");
      setShowDropdown(false);
    },
    [importFromPrivateKey]
  );

  // Export private key
  const handleExportPrivateKey = useCallback(
    async (pwd: string) => {
      return await exportPrivateKey(pwd);
    },
    [exportPrivateKey]
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
      setShowDropdown(false);
    }
  }, [deleteWallet]);

  // Get button text based on status
  const getButtonText = () => {
    // zkLogin takes priority if connected
    if (isZkLoggedIn && zkState?.address) {
      return shortenAddress(zkState.address, startChars, endChars);
    }
    if (status === "disconnected") return "Get Started";
    if (status === "locked") return "Locked";
    if (status === "unlocked" && account)
      return shortenAddress(account.address, startChars, endChars);
    return "Wallet";
  };

  // Get status indicator color
  const getStatusColor = () => {
    // zkLogin takes priority
    if (isZkLoggedIn) return "bg-green-500";
    if (status === "unlocked") return "bg-green-500";
    if (status === "locked") return "bg-yellow-500";
    return "bg-zinc-500";
  };

  // Render dropdown content based on status and viewMode
  const renderDropdownContent = () => {
    // Mnemonic backup screen (full-size, important)
    if (viewMode === "create-backup" && mnemonic) {
      return (
        <div className="p-2 w-full sm:w-[400px]">
          <MnemonicBackup mnemonic={mnemonic} onConfirm={handleBackupConfirmed} />
        </div>
      );
    }

    // Create wallet form
    if (viewMode === "create") {
      return (
        <div className="p-4 w-full sm:w-[280px]">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Create New Wallet
          </h3>

          <div className="flex flex-col gap-2">
            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              autoFocus
            />

            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex-1 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isLoading || password.length < 8 || password !== confirmPassword}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm transition-colors"
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
        <div className="p-2 w-full sm:w-[320px]">
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
        <div className="p-2 w-full sm:w-[320px]">
          <ExportPrivateKey onExport={handleExportPrivateKey} onClose={() => setViewMode("main")} />
        </div>
      );
    }

    // Send transaction view
    if (viewMode === "send") {
      return (
        <div className="p-2 w-full sm:w-[320px]">
          <SendTransaction
            onClose={() => setViewMode("main")}
            onSuccess={() => {
              // Optionally return to main view on success
            }}
          />
        </div>
      );
    }

    // Staking panel view
    if (viewMode === "staking") {
      return (
        <div className="w-full sm:w-[360px]">
          <StakingPanel onClose={() => setViewMode("main")} compact />
        </div>
      );
    }

    // Security settings view
    if (viewMode === "settings") {
      return <SecuritySettings onClose={() => setViewMode("main")} />;
    }

    // Disconnected state - show social login and create/import options
    if (status === "disconnected" && !isZkLoggedIn) {
      return (
        <div className="py-3 px-4 w-full sm:w-[280px]">
          {/* Social Login Section */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3 text-center">
              Quick start with social login
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

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
            <span className="text-xs text-gray-400 dark:text-zinc-500">or</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
          </div>

          {/* Password Wallet Options */}
          <div className="space-y-1">
            <button
              onClick={() => setViewMode("create")}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
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
              className="w-full px-3 py-2 text-left text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
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
        <div className="w-full sm:w-[280px]">
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

          {/* Tab navigation for zkLogin */}
          <div className="flex border-b border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => setActiveTab("tokens")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "tokens"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Tokens
            </button>
            <button
              onClick={() => setActiveTab("nfts")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "nfts"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              NFTs {nfts.length > 0 && <span className="text-xs ml-1">({nfts.length})</span>}
            </button>
          </div>

          {/* Tokens tab content */}
          {activeTab === "tokens" && (
            <div className="py-1">
              {/* Token Balances Section */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Token Balances
                </p>
                {balancesLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Native token (NASUN) */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-zinc-300">NASUN</span>
                      <span className="font-mono text-gray-900 dark:text-white">
                        {balances?.native?.formatted || "0"}
                      </span>
                    </div>
                    {/* Additional tokens */}
                    {Object.entries(balances?.tokens || {}).map(([symbol, token]) => (
                      <div key={symbol} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">{symbol}</span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {token.formatted}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Faucet Button (Devnet only) */}
                {isDevnet && hasFaucet && (
                  <button
                    onClick={handleFaucet}
                    disabled={isFaucetLoading}
                    className="w-full mt-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                      bg-orange-500/10 text-orange-600 dark:text-orange-400
                      hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center gap-2"
                  >
                    {isFaucetLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Requesting...
                      </>
                    ) : faucetMessage ? (
                      <span className={faucetMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {faucetMessage.text}
                      </span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Get NASUN from Faucet
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                onClick={() => setViewMode("send")}
                className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Send Token
              </button>

              <button
                onClick={() => setViewMode("staking")}
                className="w-full px-3 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onClick={() => {
                  zkLogout();
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
          )}

          {/* NFTs tab content */}
          {activeTab === "nfts" && (
            <div className="p-3">
              {nftsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                    />
                  ))}
                </div>
              ) : nfts.length === 0 ? (
                <div className="text-center py-6">
                  <svg
                    className="w-10 h-10 text-gray-400 dark:text-zinc-600 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">No NFTs found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-[200px] overflow-y-auto p-0.5">
                  {nfts.map((nft) => (
                    <NFTCard key={nft.objectId} nft={nft} compact onClick={setSelectedNFT} />
                  ))}
                </div>
              )}
            </div>
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

          {/* Network Selector */}
          <div className="border-t border-gray-200 dark:border-zinc-700">
            <NetworkSelector currentNetwork={networkType} />
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
        <div className="w-full sm:w-[280px]">
          {/* Address header */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
            <span className="text-xs text-gray-500 dark:text-zinc-400 block mb-1">Connected Address</span>
            <CopyableAddress
              value={account.address}
              shorten={8}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
          </div>

          {/* Tab navigation */}
          <div className="flex border-b border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => setActiveTab("tokens")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "tokens"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Tokens
            </button>
            <button
              onClick={() => setActiveTab("nfts")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "nfts"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              NFTs {nfts.length > 0 && <span className="text-xs ml-1">({nfts.length})</span>}
            </button>
          </div>

          {/* Tokens tab content */}
          {activeTab === "tokens" && (
            <div className="py-1">
              {/* Token Balances Section */}
              <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">
                  Token Balances
                </p>
                {balancesLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-5 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Native token (NASUN) */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-zinc-300">NASUN</span>
                      <span className="font-mono text-gray-900 dark:text-white">
                        {balances?.native?.formatted || "0"}
                      </span>
                    </div>
                    {/* Additional tokens */}
                    {Object.entries(balances?.tokens || {}).map(([symbol, token]) => (
                      <div key={symbol} className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-zinc-300">{symbol}</span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {token.formatted}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Faucet Button (Devnet only) */}
                {isDevnet && hasFaucet && (
                  <button
                    onClick={handleFaucet}
                    disabled={isFaucetLoading}
                    className="w-full mt-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                      bg-orange-500/10 text-orange-600 dark:text-orange-400
                      hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center gap-2"
                  >
                    {isFaucetLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Requesting...
                      </>
                    ) : faucetMessage ? (
                      <span className={faucetMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {faucetMessage.text}
                      </span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Get NASUN from Faucet
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                onClick={() => setViewMode("send")}
                className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Send Token
              </button>

              <button
                onClick={() => setViewMode("staking")}
                className="w-full px-3 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onClick={() => setViewMode("export")}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                Export Private Key
              </button>

              <button
                onClick={() => setViewMode("settings")}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                Security Settings
              </button>

              <button
                onClick={() => {
                  lockWallet();
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete Wallet
              </button>
            </div>
          )}

          {/* NFTs tab content */}
          {activeTab === "nfts" && (
            <div className="p-3">
              {nftsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded animate-pulse"
                    />
                  ))}
                </div>
              ) : nfts.length === 0 ? (
                <div className="text-center py-6">
                  <svg
                    className="w-10 h-10 text-gray-400 dark:text-zinc-600 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">No NFTs found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-[200px] overflow-y-auto p-0.5">
                  {nfts.map((nft) => (
                    <NFTCard key={nft.objectId} nft={nft} compact onClick={setSelectedNFT} />
                  ))}
                </div>
              )}
            </div>
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

          {/* Network Selector */}
          <div className="border-t border-gray-200 dark:border-zinc-700">
            <NetworkSelector currentNetwork={networkType} />
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
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm transition-colors"
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

      {/* Dropdown */}
      {showDropdown && (
        <div
          className={`bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg overflow-hidden z-[9999] absolute ${
            dropdownAlign === "left"
              ? "left-0"
              : dropdownAlign === "center"
                ? "left-1/2 -translate-x-1/2"
                : "right-0 max-sm:right-auto max-sm:left-0"
          } ${
            dropdownPosition === "top"
              ? "bottom-full mb-2"
              : "top-full mt-2"
          }`}
        >
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );
}
