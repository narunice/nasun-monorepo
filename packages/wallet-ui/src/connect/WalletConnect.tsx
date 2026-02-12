/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 * All forms are displayed as dropdowns to maintain consistent header height
 */

import { createPortal } from "react-dom";
import { useWalletConnectState } from "./hooks/useWalletConnectState";
import { WALLET_STYLES } from "../shared/styles";
import { renderViewContent } from "./viewModeRouter";

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
  const s = useWalletConnectState();

  // Shared props for ConnectedView (passed to status-based views)
  const connectedViewSharedProps = {
    isMobile: s.isMobile,
    isAdvancedMode: s.isAdvancedMode,
    chain: s.chain,
    isNetworkModalOpen: s.isNetworkModalOpen,
    setIsNetworkModalOpen: s.setIsNetworkModalOpen,
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    isEVM: s.isEVM,
    isExternalMove: s.isExternalMove,
    storedEVMAddress: s.storedEVMAddress,
    evmBalance: s.evmBalance,
    evmBalanceLoading: s.evmBalanceLoading,
    moveNativeBalance: s.moveNativeBalance,
    moveNativeLoading: s.moveNativeLoading,
    balances: s.balances,
    balancesLoading: s.balancesLoading,
    networkType: s.networkType,
    getAllTokens: s.getAllTokens,
    accumulatedNfts: s.accumulatedNfts,
    nftsLoading: s.nftsLoading,
    selectedNFT: s.selectedNFT,
    setSelectedNFT: s.setSelectedNFT,
    nsaIsInitialized: s.nsaIsInitialized,
    nsaRecoveryCompleted: s.nsaRecoveryCompleted,
    wcSessionCount: s.wcSessionCount,
    wcPendingCount: s.wcPendingCount,
    showMoreMenu: s.showMoreMenu,
    setShowMoreMenu: s.setShowMoreMenu,
    pendingForMe: s.pendingForMe,
    setViewMode: s.setViewMode,
    setSendRecipient: s.setSendRecipient,
    proposalBannerDismissed: s.proposalBannerDismissed,
    setProposalBannerDismissed: s.setProposalBannerDismissed,
    nsaIncomingInvitations: s.nsaIncomingInvitations,
    setSelectedProposalId: s.setSelectedProposalId,
  } as const;

  const dropdownContent = renderViewContent(s, connectedViewSharedProps);

  return (
    <div ref={s.dropdownRef} className="relative">
      {/* Main button - consistent across all states */}
      <button
        onClick={() => s.setShowDropdown(!s.showDropdown)}
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
        <span className={`w-2 h-2 ${s.getStatusColor()} rounded-full flex-shrink-0`} />
        <span
          className={`font-mono truncate ${
            variant === "filledOutlineC7" ? "" : "text-gray-900 dark:text-white"
          }`}
        >
          {s.getButtonText()}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${s.showDropdown ? "rotate-180" : ""} ${
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
      {s.showDropdown && !s.isMobile && (
        <div
          className={`bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[9999] absolute ${s.status === "locked" ? WALLET_STYLES.dropdownCompact : WALLET_STYLES.dropdownDesktop} overflow-hidden ${
            dropdownAlign === "left"
              ? "left-0"
              : dropdownAlign === "center"
                ? "left-1/2 -translate-x-1/2"
                : "right-0"
          } ${dropdownPosition === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {dropdownContent}
        </div>
      )}

      {/* Mobile dropdown - rendered via portal to escape stacking context issues */}
      {s.showDropdown &&
        s.isMobile &&
        createPortal(
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-[99998]"
              onClick={() => {
                if (s.viewMode === "create-backup" || s.viewMode === "create-auto-lock") return;
                s.setShowDropdown(false);
              }}
            />
            <div
              ref={s.mobileDropdownRef}
              className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${WALLET_STYLES.dropdownMobile} overflow-hidden bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[99999]`}
            >
              {dropdownContent}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
