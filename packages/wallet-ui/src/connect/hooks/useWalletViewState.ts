/**
 * UI view state management for the WalletConnect component.
 * Handles viewMode, dropdown, viewport detection, and form fields.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet, getPendingBackupMnemonic, secureZeroString, usePasskeyStore } from "@nasun/wallet";
import { useUISettingsStore } from "../../stores";
import type { ViewMode } from "../types";
import type { TabMode } from "../TabBar";
import type { NFTInfo } from "@nasun/wallet";

export type ViewportTier = "mobile" | "tablet" | "desktop";

// Pending passkey backup mnemonic — module-level to survive component unmount/remount
let pendingPasskeyMnemonic: string | null = null;
let mnemonicClearTimer: ReturnType<typeof setTimeout> | null = null;
const MNEMONIC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Get the pending passkey mnemonic (non-destructive read). */
export function getPendingPasskeyMnemonic(): string | null {
  return pendingPasskeyMnemonic;
}

/** Set or clear the pending passkey mnemonic. Auto-clears after 5 minutes. */
export function setPendingPasskeyMnemonic(mnemonic: string | null): void {
  if (mnemonicClearTimer) {
    clearTimeout(mnemonicClearTimer);
    mnemonicClearTimer = null;
  }
  pendingPasskeyMnemonic = mnemonic;
  if (mnemonic !== null) {
    mnemonicClearTimer = setTimeout(() => {
      if (pendingPasskeyMnemonic) secureZeroString(pendingPasskeyMnemonic);
      pendingPasskeyMnemonic = null;
      mnemonicClearTimer = null;
    }, MNEMONIC_TIMEOUT_MS);
  }
}

// Pending restore key — bridging NsaRestorePanel -> ImportWallet
let pendingRestoreKey: string | null = null;
let restoreKeyClearTimer: ReturnType<typeof setTimeout> | null = null;
const RESTORE_KEY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/** Set or clear the pending restore key. Auto-clears after 2 minutes. */
export function setPendingRestoreKey(key: string | null): void {
  if (restoreKeyClearTimer) {
    clearTimeout(restoreKeyClearTimer);
    restoreKeyClearTimer = null;
  }
  pendingRestoreKey = key;
  if (key !== null) {
    restoreKeyClearTimer = setTimeout(() => {
      if (pendingRestoreKey) secureZeroString(pendingRestoreKey);
      pendingRestoreKey = null;
      restoreKeyClearTimer = null;
    }, RESTORE_KEY_TIMEOUT_MS);
  }
}

/** Read-once: returns the pending restore key and immediately clears it. */
export function consumePendingRestoreKey(): string | null {
  const key = pendingRestoreKey;
  pendingRestoreKey = null;
  if (restoreKeyClearTimer) {
    clearTimeout(restoreKeyClearTimer);
    restoreKeyClearTimer = null;
  }
  return key;
}

export function useWalletViewState() {
  const { clearError } = useWallet();

  // Check for pending mnemonic backup on mount — uses initial state so the
  // backup view shows from the very first render (no effect delay).
  // This handles WalletConnect unmount/remount mid-backup (e.g., Pado homepage).
  // Priority: Zustand store (set before setUnlocked) > module-level var > null
  const pendingBackup = getPendingBackupMnemonic();
  const pendingPasskey = getPendingPasskeyMnemonic()
    ?? usePasskeyStore.getState().pendingMnemonic;

  // View & form state
  const [viewMode, setViewMode] = useState<ViewMode>(
    pendingBackup ? "create-backup"
    : pendingPasskey ? "passkey-backup"
    : "main"
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDropdown, setShowDropdown] = useState(!!pendingBackup || !!pendingPasskey);
  const [mnemonic, setMnemonic] = useState<string | null>(pendingBackup ?? pendingPasskey);
  // Personalize initial tab based on userPurpose (set during onboarding).
  // 'invest' → Account tab (Staking is there); everything else → Assets tab.
  const [activeTab, setActiveTab] = useState<TabMode>(() => {
    const purpose = useUISettingsStore.getState().userPurpose;
    return purpose === 'invest' ? 'account' : 'assets';
  });
  const [selectedNFT, setSelectedNFT] = useState<NFTInfo | null>(null);
  const [sendRecipient, setSendRecipient] = useState<string | undefined>(undefined);
  const [proposalBannerDismissed, setProposalBannerDismissed] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Viewport detection
  const [viewport, setViewport] = useState<ViewportTier>("tablet");

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
    if ((viewMode === "create-backup" || viewMode === "passkey-backup") && mnemonic) {
      try {
        localStorage.setItem("nasun_wallet_backup_pending", "true");
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [viewMode, mnemonic]);

  // Reset proposal banner dismiss when dropdown reopens
  useEffect(() => {
    if (showDropdown) setProposalBannerDismissed(false);
  }, [showDropdown]);

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
        // Keep dropdown open during wallet creation/backup flow — user must complete before closing
        if (
          viewMode === "create-backup" ||
          viewMode === "create-auto-lock" ||
          viewMode === "passkey-backup"
        ) return;

        setShowDropdown(false);
        setViewMode("main");
        setPassword("");
        setConfirmPassword("");
        clearError();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown, viewMode, clearError]);

  const resetView = useCallback(() => {
    setViewMode("main");
    setPassword("");
    setConfirmPassword("");
    setMnemonic(null);
    clearError();
  }, [clearError]);

  return {
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
    resetView,
  };
}

export type WalletViewStateReturn = ReturnType<typeof useWalletViewState>;
