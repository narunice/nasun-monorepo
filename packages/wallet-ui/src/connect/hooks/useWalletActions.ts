/**
 * Wallet action handlers: create, unlock, import, export, delete.
 */

import { useCallback } from "react";
import { useWallet, useChainStore, clearPendingBackupMnemonic, resetUnlockAttempts } from "@nasun/wallet";
import { useUISettingsStore } from "../../stores";
import type { WalletViewStateReturn } from "./useWalletViewState";

export function useWalletActions(viewState: WalletViewStateReturn) {
  const {
    createWalletWithBackup,
    unlockWallet,
    deleteWallet,
    importFromMnemonic,
    importFromPrivateKey,
    exportPrivateKey,
    exportMnemonic,
  } = useWallet();

  const resetSettings = useUISettingsStore((state) => state.resetSettings);
  // Read current value at callback time via getState() — avoids stale closure issues
  // after resetSettings() is called (which resets hasCompletedOnboarding to false)

  const handleCreate = useCallback(async () => {
    if (viewState.password.length < 8) return;
    if (viewState.password !== viewState.confirmPassword) return;

    try {
      const { mnemonic } = await createWalletWithBackup(viewState.password);
      resetSettings();
      useChainStore.getState().resetToDefault();
      viewState.setPassword("");
      viewState.setConfirmPassword("");
      viewState.setMnemonic(mnemonic);
      viewState.setViewMode("create-backup");
    } catch {
      // Error is stored in state
    }
  }, [viewState.password, viewState.confirmPassword, createWalletWithBackup, resetSettings, viewState.setPassword, viewState.setConfirmPassword, viewState.setMnemonic, viewState.setViewMode]);

  const handleBackupConfirmed = useCallback(() => {
    clearPendingBackupMnemonic();
    try {
      localStorage.removeItem("nasun_wallet_backup_pending");
    } catch {
      // Ignore localStorage errors
    }
    viewState.setMnemonic(null);
    viewState.setViewMode("create-auto-lock");
  }, [viewState.setMnemonic, viewState.setViewMode]);

  const handleAutoLockComplete = useCallback(() => {
    viewState.closeDropdown();
  }, [viewState.closeDropdown]);

  const handleUnlock = useCallback(async () => {
    try {
      await unlockWallet(viewState.password);
      viewState.closeDropdown();
    } catch {
      // Error is stored in state
    }
  }, [viewState.password, unlockWallet, viewState.closeDropdown]);

  const handleImportMnemonic = useCallback(
    async (mnemonicPhrase: string, pwd: string) => {
      await importFromMnemonic(mnemonicPhrase, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      viewState.closeDropdown();
    },
    [importFromMnemonic, resetSettings, viewState.closeDropdown],
  );

  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      viewState.closeDropdown();
    },
    [importFromPrivateKey, resetSettings, viewState.closeDropdown],
  );

  const handleExportPrivateKey = useCallback(
    async (pwd: string) => {
      return await exportPrivateKey(pwd);
    },
    [exportPrivateKey],
  );

  const handleExportMnemonic = useCallback(
    async (pwd: string) => {
      return await exportMnemonic(pwd);
    },
    [exportMnemonic],
  );

  const handleDelete = useCallback(() => {
    viewState.setViewMode("delete-confirm");
  }, [viewState.setViewMode]);

  const confirmDelete = useCallback(() => {
    deleteWallet();
    resetSettings();
    resetUnlockAttempts();
    viewState.closeDropdown();
  }, [deleteWallet, resetSettings, viewState.closeDropdown]);

  return {
    handleCreate,
    handleBackupConfirmed,
    handleAutoLockComplete,
    handleUnlock,
    handleImportMnemonic,
    handleImportPrivateKey,
    handleExportPrivateKey,
    handleExportMnemonic,
    handleDelete,
    confirmDelete,
  };
}

export type WalletActionsReturn = ReturnType<typeof useWalletActions>;
