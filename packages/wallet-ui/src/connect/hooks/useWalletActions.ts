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
  } = useWallet();

  const resetSettings = useUISettingsStore((state) => state.resetSettings);

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
    viewState.setViewMode("main");
    viewState.setShowDropdown(false);
  }, [viewState.setViewMode, viewState.setShowDropdown]);

  const handleUnlock = useCallback(async () => {
    try {
      await unlockWallet(viewState.password);
      viewState.setPassword("");
      viewState.setViewMode("main");
      viewState.setShowDropdown(false);
    } catch {
      // Error is stored in state
    }
  }, [viewState.password, unlockWallet, viewState.setPassword, viewState.setViewMode, viewState.setShowDropdown]);

  const handleImportMnemonic = useCallback(
    async (mnemonicPhrase: string, pwd: string) => {
      await importFromMnemonic(mnemonicPhrase, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      viewState.setViewMode("main");
      viewState.setShowDropdown(false);
    },
    [importFromMnemonic, resetSettings, viewState.setViewMode, viewState.setShowDropdown],
  );

  const handleImportPrivateKey = useCallback(
    async (privateKey: string, pwd: string) => {
      await importFromPrivateKey(privateKey, pwd);
      resetSettings();
      useChainStore.getState().resetToDefault();
      viewState.setViewMode("main");
      viewState.setShowDropdown(false);
    },
    [importFromPrivateKey, resetSettings, viewState.setViewMode, viewState.setShowDropdown],
  );

  const handleExportPrivateKey = useCallback(
    async (pwd: string) => {
      return await exportPrivateKey(pwd);
    },
    [exportPrivateKey],
  );

  const handleDelete = useCallback(() => {
    viewState.setViewMode("delete-confirm");
  }, [viewState.setViewMode]);

  const confirmDelete = useCallback(() => {
    deleteWallet();
    resetSettings();
    resetUnlockAttempts();
    viewState.setShowDropdown(false);
  }, [deleteWallet, resetSettings, viewState.setShowDropdown]);

  return {
    handleCreate,
    handleBackupConfirmed,
    handleAutoLockComplete,
    handleUnlock,
    handleImportMnemonic,
    handleImportPrivateKey,
    handleExportPrivateKey,
    handleDelete,
    confirmDelete,
  };
}

export type WalletActionsReturn = ReturnType<typeof useWalletActions>;
