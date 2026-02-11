/**
 * Wallet action handlers: create, unlock, import, export, delete.
 */

import { useCallback } from "react";
import { useWallet, useChainStore } from "@nasun/wallet";
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
    try {
      localStorage.removeItem("nasun_wallet_backup_pending");
    } catch {
      // Ignore localStorage errors
    }
    viewState.setMnemonic(null);
    viewState.setViewMode("main");
    viewState.setShowDropdown(false);
  }, [viewState.setMnemonic, viewState.setViewMode, viewState.setShowDropdown]);

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
    if (confirm("Remove this wallet from your browser?\nYour assets are safe on-chain, but you will need your recovery phrase (mnemonic) or private key to restore access.\nMake sure you have a backup before proceeding.")) {
      deleteWallet();
      resetSettings();
      viewState.setShowDropdown(false);
    }
  }, [deleteWallet, resetSettings, viewState.setShowDropdown]);

  return {
    handleCreate,
    handleBackupConfirmed,
    handleUnlock,
    handleImportMnemonic,
    handleImportPrivateKey,
    handleExportPrivateKey,
    handleDelete,
  };
}

export type WalletActionsReturn = ReturnType<typeof useWalletActions>;
