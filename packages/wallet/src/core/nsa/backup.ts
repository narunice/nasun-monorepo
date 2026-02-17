/**
 * NSA Backup - Tier 2 Encrypted Cloud Backup
 *
 * PBKDF2 (600K iterations) + AES-256-GCM encryption for
 * signer private key backup. Users can restore access to
 * their SmartAccount using a PIN + backup file.
 *
 * v1: Signer key + account ID only
 * v2: Adds on-chain account state snapshot (signers, guardians, threshold)
 */

import { NsaError } from '../../types/nsa';
import type { NsaBackupPackage, NsaSignerInfo, NsaAccountState } from '../../types/nsa';
import {
  deriveKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '../crypto/primitives';
import { fetchAccountState } from './client';

const SALT_LENGTH = 32;
const IV_LENGTH = 12;

/** On-chain state snapshot included in v2 backups */
export interface BackupAccountState {
  signers: NsaSignerInfo[];
  threshold: number;
  guardians: string[];
  guardianThreshold: number;
  recoveryOwner: string;
  nonce: number;
}

/** Payload structure for backup encryption */
interface BackupPayload {
  signerPrivateKey: string;
  accountObjectId: string;
  signerAddress: string;
  createdAt: number;
  accountState?: BackupAccountState;
}

/** Result of restoring from an NSA backup */
export interface NsaBackupRestoreResult {
  signerPrivateKey: string;
  accountObjectId: string;
  signerAddress: string;
  accountState?: BackupAccountState;
  /** Warning if backup nonce differs from current on-chain nonce */
  nonceWarning?: string;
}

/**
 * Create an encrypted backup package.
 *
 * Attempts to fetch on-chain account state for a v2 backup.
 * Falls back to v1 if the RPC call fails (offline, RPC down, etc.).
 *
 * @param signerPrivateKey - Base64-encoded private key of the signer
 * @param accountObjectId - SmartAccount object ID
 * @param signerAddress - Address derived from the signer key
 * @param pin - User-provided PIN (minimum 6 characters)
 * @returns Encrypted backup package
 */
export async function createBackup(
  signerPrivateKey: string,
  accountObjectId: string,
  signerAddress: string,
  pin: string,
): Promise<NsaBackupPackage> {
  if (pin.length < 6) {
    throw new NsaError('BACKUP_INVALID_FORMAT', 'PIN must be at least 6 characters');
  }

  // Try to fetch on-chain state for v2 backup
  let accountState: NsaAccountState | null = null;
  try {
    accountState = await fetchAccountState(accountObjectId);
  } catch {
    // RPC failure: fall back to v1 backup (key-only)
  }

  const now = Date.now();
  const payload: BackupPayload = {
    signerPrivateKey,
    accountObjectId,
    signerAddress,
    createdAt: now,
    ...(accountState && {
      accountState: {
        signers: accountState.signers,
        threshold: accountState.threshold,
        guardians: accountState.guardians,
        guardianThreshold: accountState.guardianThreshold,
        recoveryOwner: accountState.recoveryOwner,
        nonce: accountState.nonce,
      },
    }),
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(pin, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  );

  // Zero plaintext buffer to minimize key exposure in memory
  plaintext.fill(0);

  return {
    type: 'nsa',
    version: accountState ? 2 : 1,
    accountObjectId,
    encryptedPayload: arrayBufferToBase64(ciphertext),
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    createdAt: now,
  };
}

/**
 * Restore signer from encrypted backup.
 *
 * Supports both v1 and v2 backups. For v2, compares backup nonce
 * with current on-chain nonce and returns a warning if they differ.
 *
 * @param backup - Encrypted backup package
 * @param pin - User-provided PIN
 * @returns Decrypted payload with private key, account info, and optional state
 */
export async function restoreFromBackup(
  backup: NsaBackupPackage,
  pin: string,
): Promise<NsaBackupRestoreResult> {
  if (backup.version !== 1 && backup.version !== 2) {
    throw new NsaError('BACKUP_INVALID_FORMAT', `Unsupported backup version: ${backup.version}`);
  }

  const salt = base64ToUint8Array(backup.salt);
  const iv = base64ToUint8Array(backup.iv);
  const ciphertext = base64ToArrayBuffer(backup.encryptedPayload);

  const key = await deriveKey(pin, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new NsaError('BACKUP_DECRYPT_FAILED', 'Invalid PIN or corrupted backup');
  }

  let payloadStr: string | null = new TextDecoder().decode(plaintext);
  // Zero decrypted plaintext buffer
  new Uint8Array(plaintext).fill(0);

  let payload: BackupPayload;
  try {
    payload = JSON.parse(payloadStr) as BackupPayload;
  } catch {
    payloadStr = null;
    throw new NsaError('BACKUP_INVALID_FORMAT', 'Corrupted backup payload');
  }
  // Null reference after successful parse to allow earlier GC.
  // JS strings are immutable — this does not zero memory, only drops the reference.
  payloadStr = null;

  if (!payload.signerPrivateKey || !payload.accountObjectId) {
    throw new NsaError('BACKUP_INVALID_FORMAT', 'Missing required fields in backup');
  }

  const result: NsaBackupRestoreResult = {
    signerPrivateKey: payload.signerPrivateKey,
    accountObjectId: payload.accountObjectId,
    signerAddress: payload.signerAddress,
  };

  // v2: include account state and check for nonce drift
  if (payload.accountState) {
    result.accountState = payload.accountState;

    try {
      const onchainState = await fetchAccountState(payload.accountObjectId);
      if (onchainState.nonce !== payload.accountState.nonce) {
        result.nonceWarning =
          `Backup was created at nonce ${payload.accountState.nonce}, ` +
          `but current on-chain nonce is ${onchainState.nonce}. ` +
          `Account settings may have changed since this backup was created.`;
      }
    } catch {
      // Cannot verify nonce — non-critical, proceed without warning
    }
  }

  return result;
}

/**
 * Validate backup package structure without decrypting.
 * Accepts both v1 (no type field) and v2 (type: 'nsa') formats.
 */
export function validateBackupFormat(data: unknown): data is NsaBackupPackage {
  if (!data || typeof data !== 'object') return false;
  const pkg = data as Record<string, unknown>;
  return (
    (pkg.version === 1 || pkg.version === 2) &&
    typeof pkg.accountObjectId === 'string' && pkg.accountObjectId.length > 0 &&
    typeof pkg.encryptedPayload === 'string' && pkg.encryptedPayload.length > 0 &&
    typeof pkg.salt === 'string' && pkg.salt.length > 0 &&
    typeof pkg.iv === 'string' && pkg.iv.length > 0 &&
    typeof pkg.createdAt === 'number'
  );
}
