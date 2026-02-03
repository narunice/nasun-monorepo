/**
 * UI view state management for the WalletConnect component.
 * Handles viewMode, dropdown, viewport detection, and form fields.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@nasun/wallet";
import type { ViewMode } from "../types";
import type { TabMode } from "../TabBar";
import type { NFTInfo } from "@nasun/wallet";

export type ViewportTier = "mobile" | "tablet" | "desktop";

export function useWalletViewState() {
  const { clearError } = useWallet();

  // View & form state
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("assets");
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
    if (viewMode === "create-backup" && mnemonic) {
      try {
        localStorage.setItem("nasun_wallet_backup_pending", "true");
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [viewMode, mnemonic]);

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
