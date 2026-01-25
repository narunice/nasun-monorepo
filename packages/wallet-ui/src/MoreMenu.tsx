/**
 * MoreMenu Component
 *
 * Dropdown menu for additional wallet actions.
 * Grouped into PORTFOLIO and SECURITY sections.
 */

interface MoreMenuProps {
  /** Whether this is a zkLogin wallet (hides export/security settings) */
  isZkLogin: boolean;
  /** Whether NSA is initialized */
  nsaIsInitialized: boolean;
  /** NSA recovery completed count (0-3) */
  nsaRecoveryCompleted: number;
  /** Number of pending proposals for current user */
  pendingForMe: number;
  /** Callbacks for menu actions */
  onStaking: () => void;
  onPortfolio: () => void;
  onCreateLink: () => void;
  onSmartAccount: () => void;
  onExportKey: () => void;
  onSecuritySettings: () => void;
  onAddressBook: () => void;
  onLock: () => void;
  onDelete?: () => void;
  onDisconnect?: () => void;
  /** Whether to show delete option (software wallet only) */
  showDelete?: boolean;
}

export function MoreMenu({
  isZkLogin,
  nsaIsInitialized,
  nsaRecoveryCompleted,
  pendingForMe,
  onStaking,
  onPortfolio,
  onCreateLink,
  onSmartAccount,
  onExportKey,
  onSecuritySettings,
  onAddressBook,
  onLock,
  onDelete,
  onDisconnect,
  showDelete = false,
}: MoreMenuProps) {
  return (
    <div className="py-1 border-t border-gray-200 dark:border-zinc-700">
      {/* PORTFOLIO Section */}
      <div className="px-3 py-1.5">
        <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium">
          Portfolio
        </p>
      </div>

      <button
        onClick={onStaking}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
        onClick={onPortfolio}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
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

      {/* SECURITY Section */}
      <div className="px-3 py-1.5 mt-1 border-t border-gray-200 dark:border-zinc-700">
        <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium">
          Security
        </p>
      </div>

      {/* Smart Account - shown for all users when initialized */}
      {nsaIsInitialized && (
        <button
          onClick={onSmartAccount}
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
          <span className="flex-1">Smart Account</span>
          {/* Recovery Readiness badge */}
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
              nsaRecoveryCompleted === 3
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400"
            }`}
          >
            {nsaRecoveryCompleted}/3 {nsaRecoveryCompleted === 3 && "✓"}
          </span>
          {pendingForMe > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded-full">
              {pendingForMe}
            </span>
          )}
        </button>
      )}

      {/* Export Private Key - software wallet only */}
      {!isZkLogin && (
        <button
          onClick={onExportKey}
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
      )}

      {/* Security Settings - software wallet only */}
      {!isZkLogin && (
        <button
          onClick={onSecuritySettings}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      )}

      {/* Address Book - shown for all */}
      <button
        onClick={onAddressBook}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Address Book
      </button>

      {/* Divider */}
      <div className="my-1 border-t border-gray-200 dark:border-zinc-700" />

      {/* Lock/Disconnect */}
      {isZkLogin ? (
        <button
          onClick={onDisconnect}
          className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
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
      ) : (
        <>
          <button
            onClick={onLock}
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
            Lock Wallet
          </button>
          {showDelete && onDelete && (
            <button
              onClick={onDelete}
              className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
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
          )}
        </>
      )}
    </div>
  );
}
