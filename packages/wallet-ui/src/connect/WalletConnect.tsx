/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 * All forms are displayed as dropdowns to maintain consistent header height
 */

import { useEffect, useCallback, useRef } from "react";
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
  variant?: "filledOutlineC7" | "default";
  /** Button size variant */
  size?: "default" | "sm";
  /** Override button text when status is 'disconnected' */
  triggerText?: string;
  /** Called when wallet status transitions to 'unlocked' */
  onWalletUnlocked?: () => void;
  /** Additional CSS classes for the trigger button */
  buttonClassName?: string;
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
  triggerText,
  onWalletUnlocked,
  buttonClassName,
}: WalletConnectProps) {
  const s = useWalletConnectState();

  // Fire onWalletUnlocked once when any wallet type transitions to connected.
  // Only fires on the false→true transition to avoid re-firing while connected.
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    const anyConnected = s.status === 'unlocked' || s.isZkLoggedIn || s.isPasskeyUnlocked || s.isLedgerConnected;
    if (anyConnected && !prevConnectedRef.current) {
      onWalletUnlocked?.();
    }
    prevConnectedRef.current = anyConnected;
  }, [s.status, s.isZkLoggedIn, s.isPasskeyUnlocked, s.isLedgerConnected, onWalletUnlocked]);

  // Lock body scroll when mobile modal is open to prevent background page from scrolling.
  // iOS Safari propagates touch scroll events from position:fixed elements to document.body,
  // so setting overflow:hidden on body is the most reliable cross-browser fix.
  useEffect(() => {
    if (s.showDropdown && s.isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [s.showDropdown, s.isMobile]);

  // Close dropdown on Escape key
  const handleEscapeKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && s.showDropdown) {
      if (s.viewMode === "create-backup" || s.viewMode === "create-auto-lock") return;
      s.setShowDropdown(false);
    }
  }, [s.showDropdown, s.viewMode, s.setShowDropdown]);

  useEffect(() => {
    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [handleEscapeKey]);

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
    erc20Balances: s.erc20Balances,
    erc20Loading: s.erc20Loading,
    onAddToken: s.isEVM ? () => s.setViewMode("add-token") : undefined,
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

  // True when any wallet type is actively connected — s.status alone is not enough
  // because zkLogin/passkey leave s.status as 'disconnected' (no self-custody keystore)
  const isAnyWalletConnected =
    s.isZkLoggedIn || s.isPasskeyUnlocked || s.isLedgerConnected || s.status === 'unlocked';

  const closeDropdown = () => {
    if (s.viewMode === "create-backup" || s.viewMode === "create-auto-lock") return;
    s.setShowDropdown(false);
  };

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
            : `bg-white hover:bg-gray-50 border border-gray-300 rounded ${
                size === "sm" ? "text-xs lg:text-sm px-4 py-1" : "text-sm md:text-base px-3 py-2"
              }`
        } ${buttonClassName ?? ""}`}
      >
        {/* Status color indicator — only when a wallet is connected */}
        {isAnyWalletConnected && (
          <span className={`text-xs leading-none ${s.getStatusColor()} flex-shrink-0`}>&#9660;</span>
        )}
        <span
          className={`font-mono truncate ${
            variant === "filledOutlineC7" ? "" : "text-gray-900"
          }`}
        >
          {triggerText && !isAnyWalletConnected ? triggerText : s.getButtonText()}
        </span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${s.showDropdown ? "rotate-180" : ""} ${
            variant === "filledOutlineC7" ? "text-nasun-c7" : "text-gray-500"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Connected on desktop: dropdown below button */}
      {s.showDropdown && isAnyWalletConnected && !s.isMobile && (
        <div
          className={`bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[9999] absolute ${s.status === "locked" ? WALLET_STYLES.dropdownCompact : WALLET_STYLES.dropdownDesktop} max-h-[85vh] overflow-y-auto overflow-x-hidden ${
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

      {/* Disconnected (any device) or connected on mobile: centered modal via portal */}
      {s.showDropdown && (!isAnyWalletConnected || s.isMobile) &&
        createPortal(
          <>
            <div className="fixed inset-0 bg-black/50 z-[99998]" onClick={closeDropdown} />
            <div
              ref={s.mobileDropdownRef}
              className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${s.isMobile ? WALLET_STYLES.dropdownMobile : (s.status === "locked" ? WALLET_STYLES.dropdownCompact : WALLET_STYLES.dropdownDesktop)} overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg z-[99999]`}
            >
              {dropdownContent}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
