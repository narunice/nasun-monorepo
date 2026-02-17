/**
 * useWalletBackup Hook
 *
 * Manages wallet-level backup operations (no Smart Account required).
 * Available for self-custody and passkey users.
 */

import { useCallback, useState } from 'react';
import {
  createWalletBackup,
  restoreWalletBackup,
  validateWalletBackupFormat,
} from '../core/walletBackup';
import { downloadBackupFile, parseBackupJson } from '../core/backup-utils';
import type { WalletBackupPackage } from '../types/backup';
import type { WalletBackupRestoreResult } from '../core/walletBackup';

export interface UseWalletBackupResult {
  /** Whether a backup operation is in progress */
  isProcessing: boolean;
  /** Error from last operation */
  error: string | null;
  /** Create an encrypted wallet backup */
  createBackup: (
    signerPrivateKey: string,
    signerAddress: string,
    signerType: 'passkey' | 'local',
    pin: string,
  ) => Promise<WalletBackupPackage>;
  /** Restore from an encrypted wallet backup */
  restoreBackup: (backup: WalletBackupPackage, pin: string) => Promise<WalletBackupRestoreResult>;
  /** Validate backup file format */
  validateBackup: (data: unknown) => boolean;
  /** Download backup as JSON file */
  downloadBackup: (backup: WalletBackupPackage) => void;
  /** Parse backup from uploaded file */
  parseBackupFile: (file: File) => Promise<WalletBackupPackage>;
  /** Clear error */
  clearError: () => void;
}

export function useWalletBackup(): UseWalletBackupResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBackup = useCallback(async (
    signerPrivateKey: string,
    signerAddress: string,
    signerType: 'passkey' | 'local',
    pin: string,
  ): Promise<WalletBackupPackage> => {
    setIsProcessing(true);
    setError(null);
    try {
      return await createWalletBackup(signerPrivateKey, signerAddress, signerType, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup creation failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const restoreBackup = useCallback(async (
    backup: WalletBackupPackage,
    pin: string,
  ): Promise<WalletBackupRestoreResult> => {
    setIsProcessing(true);
    setError(null);
    try {
      return await restoreWalletBackup(backup, pin);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup restoration failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const validateBackup = useCallback((data: unknown): boolean => {
    return validateWalletBackupFormat(data);
  }, []);

  const downloadBackup = useCallback((backup: WalletBackupPackage): void => {
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBackupFile(backup, `nasun-wallet-backup-${timestamp}.json`);
  }, []);

  const parseBackupFile = useCallback(async (file: File): Promise<WalletBackupPackage> => {
    return parseBackupJson(file, validateWalletBackupFormat);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isProcessing,
    error,
    createBackup,
    restoreBackup,
    validateBackup,
    downloadBackup,
    parseBackupFile,
    clearError,
  };
}
