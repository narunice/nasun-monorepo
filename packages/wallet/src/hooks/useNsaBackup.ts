/**
 * useNsaBackup Hook
 *
 * Manages Tier 2 Encrypted Cloud Backup operations.
 * Handles backup creation, restoration, and format validation.
 */

import { useCallback, useState } from 'react';
import { useNsaStore } from '../stores/nsaStore';
import {
  createBackup,
  restoreFromBackup,
  validateBackupFormat,
} from '../core/nsa/backup';
import { fetchAccountState } from '../core/nsa/client';
import type { NsaBackupPackage } from '../types/nsa';

export interface UseNsaBackupResult {
  /** Whether a backup operation is in progress */
  isProcessing: boolean;
  /** Error from last operation */
  error: string | null;
  /** Create an encrypted backup */
  createNsaBackup: (signerPrivateKey: string, signerAddress: string, pin: string) => Promise<NsaBackupPackage>;
  /** Restore from an encrypted backup */
  restoreNsaBackup: (backup: NsaBackupPackage, pin: string) => Promise<{
    signerPrivateKey: string;
    accountObjectId: string;
    signerAddress: string;
  }>;
  /** Validate backup file format */
  validateBackup: (data: unknown) => boolean;
  /** Download backup as JSON file */
  downloadBackup: (backup: NsaBackupPackage) => void;
  /** Parse backup from uploaded file */
  parseBackupFile: (file: File) => Promise<NsaBackupPackage>;
  /** Clear error */
  clearError: () => void;
}

export function useNsaBackup(): UseNsaBackupResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createNsaBackup = useCallback(async (
    signerPrivateKey: string,
    signerAddress: string,
    pin: string,
  ): Promise<NsaBackupPackage> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) {
      throw new Error('No SmartAccount configured');
    }

    setIsProcessing(true);
    setError(null);
    try {
      const backup = await createBackup(
        signerPrivateKey,
        accountObjectId,
        signerAddress,
        pin,
      );
      return backup;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup creation failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const restoreNsaBackup = useCallback(async (
    backup: NsaBackupPackage,
    pin: string,
  ) => {
    setIsProcessing(true);
    setError(null);
    try {
      const restored = await restoreFromBackup(backup, pin);

      // Verify the account still exists on chain
      const accountState = await fetchAccountState(restored.accountObjectId);
      useNsaStore.getState().initialize(restored.accountObjectId, accountState);

      return restored;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup restoration failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const validateBackup = useCallback((data: unknown): boolean => {
    return validateBackupFormat(data);
  }, []);

  const downloadBackup = useCallback((backup: NsaBackupPackage): void => {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nasun-backup-${backup.accountObjectId.slice(0, 8)}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, []);

  const parseBackupFile = useCallback(async (file: File): Promise<NsaBackupPackage> => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file');
    }

    if (!validateBackupFormat(parsed)) {
      throw new Error('Invalid backup file format');
    }

    return parsed as NsaBackupPackage;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isProcessing,
    error,
    createNsaBackup,
    restoreNsaBackup,
    validateBackup,
    downloadBackup,
    parseBackupFile,
    clearError,
  };
}
