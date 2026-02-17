/**
 * Shared account tab content for connected wallet views.
 * Shows common menu items (Staking, Portfolio, Link, Address Book, Smart Account)
 * plus variant-specific items for self-custody wallets.
 */

import { useState } from "react";
import type { ViewMode } from "../types";
import { WALLET_STYLES } from "../../shared";
import { useUISettingsStore } from "../../stores/uiSettingsStore";

// SVG path constants for menu icons
const ICON_PATHS = {
  staking:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  portfolio:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  addressBook:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  shield:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  settingsCircle: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  exportKey:
    "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  backup:
    "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
} as const;

const MENU_ITEM_CLASS = WALLET_STYLES.menuItem;
const ICON_CLASS = WALLET_STYLES.menuIcon;

function MenuIcon({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {paths.map((path, i) => (
        <path
          key={i}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={path}
        />
      ))}
    </svg>
  );
}

export function AccountTabContent({
  variant,
  nsaIsInitialized,
  nsaRecoveryCompleted,
  onNavigate,
}: {
  variant: "zkLogin" | "self-custody" | "passkey";
  nsaIsInitialized: boolean;
  nsaRecoveryCompleted: number;
  onNavigate: (mode: ViewMode) => void;
}) {
  const [showBackupGuide, setShowBackupGuide] = useState(false);
  const { isAdvancedMode } = useUISettingsStore();

  return (
    <div className="py-1 mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-tl-lg">
      {/* Asset Management */}
      <button onClick={() => onNavigate("staking")} className={MENU_ITEM_CLASS}>
        <MenuIcon d={ICON_PATHS.staking} />
        Staking
      </button>

      <button onClick={() => onNavigate("portfolio")} className={MENU_ITEM_CLASS}>
        <MenuIcon d={ICON_PATHS.portfolio} />
        Portfolio
      </button>

      <button onClick={() => onNavigate("nasun-link")} className={MENU_ITEM_CLASS}>
        <MenuIcon d={ICON_PATHS.link} />
        Create Link
      </button>

      <div className={WALLET_STYLES.divider} />

      {/* Contacts & Security */}
      <button onClick={() => onNavigate("address-book")} className={MENU_ITEM_CLASS}>
        <MenuIcon d={ICON_PATHS.addressBook} />
        Address Book
      </button>

      {/* Pro mode info banner - Only show in Simple mode when NSA not initialized */}
      {!isAdvancedMode && !nsaIsInitialized && (
        <div className="mx-3 my-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Pro mode</strong> unlocks advanced features like Smart Account, multi-chain support, and WalletConnect.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Smart Account - Only visible in Pro mode or if already initialized */}
      {(isAdvancedMode || nsaIsInitialized) && (
        <>
          {nsaIsInitialized ? (
            <button onClick={() => onNavigate("nsa-info")} className={MENU_ITEM_CLASS}>
              <MenuIcon d={ICON_PATHS.shield} />
              <span className="flex-1">Smart Account</span>
              <span
                className={`px-1.5 py-0.5 text-[10px] xl:text-xs font-medium rounded ${
                  nsaRecoveryCompleted === 3
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400"
                }`}
              >
                {nsaRecoveryCompleted}/3
              </span>
            </button>
          ) : (
            <button onClick={() => onNavigate("nsa-setup")} className={MENU_ITEM_CLASS}>
              <MenuIcon d={ICON_PATHS.shield} />
              <span className="flex-1">Smart Account</span>
              <span className="text-xs xl:text-sm text-blue-500 dark:text-blue-400">Setup</span>
            </button>
          )}
        </>
      )}

      {/* Self-custody only: Security Settings */}
      {variant === "self-custody" && (
        <button onClick={() => onNavigate("settings")} className={MENU_ITEM_CLASS}>
          <MenuIcon d={[ICON_PATHS.settings, ICON_PATHS.settingsCircle]} />
          Security Settings
        </button>
      )}

      {/* Backup & Recovery (self-custody + passkey) */}
      {(variant === "self-custody" || variant === "passkey") && (
        <>
          <div className={WALLET_STYLES.divider} />

          <div className="flex items-center justify-between px-3 pt-1 pb-0.5">
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              Backup & Recovery
            </p>
            <button
              onClick={() => setShowBackupGuide((v) => !v)}
              className="p-0.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
              aria-label="Backup options guide"
              title="Compare backup options"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>

          {showBackupGuide && (
            <div className="mx-3 mb-1 p-2.5 bg-gray-50 dark:bg-zinc-700/50 rounded text-[10px] xl:text-xs space-y-1.5">
              <p className="text-gray-700 dark:text-zinc-300">
                <span className="font-medium">Wallet Backup</span>
                <span className="text-gray-500 dark:text-zinc-400"> — Encrypted file with PIN. Quick wallet recovery.</span>
              </p>
              <p className="text-gray-700 dark:text-zinc-300">
                <span className="font-medium">Export Private Key</span>
                <span className="text-gray-500 dark:text-zinc-400"> — Raw key for importing into other wallets.</span>
              </p>
              <p className="text-gray-700 dark:text-zinc-300">
                <span className="font-medium">Full Backup</span>
                <span className="text-gray-500 dark:text-zinc-400"> — Smart Account menu. Includes guardians and settings.</span>
              </p>
            </div>
          )}

          <button onClick={() => onNavigate("wallet-backup")} className={MENU_ITEM_CLASS}>
            <MenuIcon d={ICON_PATHS.backup} />
            Wallet Backup
          </button>

          <button onClick={() => onNavigate("export")} className={MENU_ITEM_CLASS}>
            <MenuIcon d={ICON_PATHS.exportKey} />
            Export Private Key
          </button>
        </>
      )}
    </div>
  );
}
