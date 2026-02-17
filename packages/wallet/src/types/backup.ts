/**
 * Backup Types
 *
 * Shared type definitions for Wallet Backup and NSA Backup.
 * Uses a `type` discriminator field for reliable auto-detection
 * when restoring from uploaded files.
 */

/** Common encrypted backup envelope */
export interface EncryptedBackupEnvelope {
  encryptedPayload: string;
  salt: string;
  iv: string;
  createdAt: number;
}

/** Wallet-only backup (no Smart Account required) */
export interface WalletBackupPackage extends EncryptedBackupEnvelope {
  type: 'wallet';
  version: 1;
}

/** Discriminated union for all backup types */
export type BackupPackage = WalletBackupPackage;
// NSA backup uses existing NsaBackupPackage from types/nsa.ts (no type field in v1)
// Phase 2 will add NsaBackupPackageV2 with type: 'nsa'

/**
 * Detect backup type from uploaded file.
 *
 * Detection logic:
 * 1. `type: 'wallet'` → wallet backup
 * 2. `type: 'nsa'` → NSA backup (v2+)
 * 3. `accountObjectId` exists (no type field) → legacy NSA backup (v1)
 * 4. Otherwise → null (unrecognized format)
 */
export function detectBackupType(data: unknown): 'wallet' | 'nsa' | null {
  if (!data || typeof data !== 'object') return null;
  const pkg = data as Record<string, unknown>;

  // Explicit type discriminator (new format)
  if (pkg.type === 'wallet') return 'wallet';
  if (pkg.type === 'nsa') return 'nsa';

  // Legacy NSA backup v1 fallback (no type field, but has accountObjectId)
  if (
    typeof pkg.accountObjectId === 'string' &&
    typeof pkg.encryptedPayload === 'string' &&
    typeof pkg.salt === 'string' &&
    typeof pkg.iv === 'string'
  ) {
    return 'nsa';
  }

  return null;
}

/**
 * Validate wallet backup package structure without decrypting.
 */
export function validateWalletBackupFormat(data: unknown): data is WalletBackupPackage {
  if (!data || typeof data !== 'object') return false;
  const pkg = data as Record<string, unknown>;
  return (
    pkg.type === 'wallet' &&
    pkg.version === 1 &&
    typeof pkg.encryptedPayload === 'string' &&
    typeof pkg.salt === 'string' &&
    typeof pkg.iv === 'string' &&
    typeof pkg.createdAt === 'number'
  );
}
