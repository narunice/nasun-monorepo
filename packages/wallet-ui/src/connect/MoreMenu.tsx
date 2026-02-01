/**
 * MoreMenu Component
 *
 * Simplified dropdown menu for Quick Actions "More" button.
 * Only shows Portfolio features and Smart Account access.
 * Other settings are accessible from the Account tab.
 */

interface MoreMenuProps {
  /** Whether NSA is initialized */
  nsaIsInitialized: boolean;
  /** NSA recovery completed count (0-3) */
  nsaRecoveryCompleted: number;
  /** Number of pending proposals for current user */
  pendingForMe: number;
  /** Callbacks for menu actions */
  onPortfolio: () => void;
  onCreateLink: () => void;
  onSmartAccount: () => void;
}

export function MoreMenu({
  nsaIsInitialized,
  nsaRecoveryCompleted,
  pendingForMe,
  onPortfolio,
  onCreateLink,
  onSmartAccount,
}: MoreMenuProps) {
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
        Portfolio Dashboard
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
        Create Nasun Link
      </button>

      {/* Smart Account - shown when initialized */}
      {nsaIsInitialized && (
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
    </div>
  );
}
