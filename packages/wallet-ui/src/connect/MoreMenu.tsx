/**
 * MoreMenu Component
 *
 * Simplified dropdown menu for Quick Actions "More" button.
 * Only shows Portfolio features and Smart Account access.
 * Other settings are accessible from the Account tab.
 */

import { useUISettingsStore } from '../stores/uiSettingsStore';

interface MoreMenuProps {
  /** Whether NSA is initialized */
  nsaIsInitialized: boolean;
  /** NSA recovery completed count (0-3) */
  nsaRecoveryCompleted: number;
  /** Number of pending proposals for current user */
  pendingForMe: number;
  /** Number of active WalletConnect sessions */
  wcSessionCount?: number;
  /** Number of pending WC proposals + requests */
  wcPendingCount?: number;
  /** Callbacks for menu actions */
  onPortfolio: () => void;
  onCreateLink: () => void;
  onSmartAccount: () => void;
  onWalletConnect?: () => void;
  /** External "Recover funds" navigation. When provided, a menu item is shown. */
  onRecoverFunds?: () => void;
}

export function MoreMenu({
  nsaIsInitialized,
  nsaRecoveryCompleted,
  pendingForMe,
  wcSessionCount = 0,
  wcPendingCount = 0,
  onPortfolio,
  onCreateLink,
  onSmartAccount,
  onWalletConnect,
  onRecoverFunds,
}: MoreMenuProps) {
  const { isAdvancedMode } = useUISettingsStore();

  return (
    <div className="py-1">
      <button
        onClick={onPortfolio}
        className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        onClick={onCreateLink}
        className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        Send via Link
      </button>

      {/* WalletConnect - Only visible in Pro mode */}
      {isAdvancedMode && onWalletConnect && (
        <button
          onClick={onWalletConnect}
          className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.09 9.6c3.26-3.2 8.56-3.2 11.82 0l.39.39c.16.16.16.42 0 .58l-1.34 1.31a.2.2 0 01-.3 0l-.54-.53c-2.28-2.23-5.97-2.23-8.24 0l-.58.56a.2.2 0 01-.3 0L5.66 10.6a.41.41 0 010-.58l.43-.42zm14.6 2.72l1.2 1.17c.16.16.16.42 0 .58l-5.38 5.27a.41.41 0 01-.58 0l-3.82-3.74a.1.1 0 00-.15 0l-3.82 3.74a.41.41 0 01-.58 0L2.18 14.07a.41.41 0 010-.58l1.19-1.17a.41.41 0 01.58 0l3.82 3.74a.1.1 0 00.15 0l3.82-3.74a.41.41 0 01.58 0l3.82 3.74a.1.1 0 00.15 0l3.82-3.74a.41.41 0 01.58 0z" />
          </svg>
          <span className="flex-1">WalletConnect</span>
          {wcSessionCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
              {wcSessionCount}
            </span>
          )}
          {wcPendingCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-blue-600 text-white rounded-full">
              {wcPendingCount}
            </span>
          )}
        </button>
      )}

      {/* Smart Account - Only visible in Pro mode when initialized */}
      {isAdvancedMode && nsaIsInitialized && (
        <button
          onClick={onSmartAccount}
          className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="flex-1">Smart Account</span>
          {/* Recovery Readiness badge */}
          <span
            className={`px-1.5 py-0.5 text-[10px] xl:text-xs font-medium rounded ${
              nsaRecoveryCompleted === 3
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400"
            }`}
          >
            {nsaRecoveryCompleted}/3 {nsaRecoveryCompleted === 3 && "✓"}
          </span>
          {pendingForMe > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] xl:text-xs font-medium bg-blue-600 text-white rounded-full">
              {pendingForMe}
            </span>
          )}
        </button>
      )}

      {onRecoverFunds && (
        <button
          onClick={onRecoverFunds}
          className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m0 0v2m0-2h2m-2 0h-2m9-7a9 9 0 11-18 0 9 9 0 0118 0zm-9-4v4l2 2"
            />
          </svg>
          Recover funds
        </button>
      )}
    </div>
  );
}
