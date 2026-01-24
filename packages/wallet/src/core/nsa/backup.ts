/**
 * NSA Backup - Tier 2 Encrypted Cloud Backup
 *
 * PBKDF2 (600K iterations) + AES-256-GCM encryption for
 * signer private key backup. Users can restore access to
 * their SmartAccount using a PIN + backup file.
 */

import { NsaError } from '../../types/nsa';
import type { NsaBackupPackage } from '../../types/nsa';

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const KEY_LENGTH = 256; // bits

/** Payload structure for backup encryption */
interface BackupPayload {
  signerPrivateKey: string;
  accountObjectId: string;
  signerAddress: string;
  createdAt: number;
}

/**
 * Create an encrypted backup package
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

  const payload: BackupPayload = {
    signerPrivateKey,
    accountObjectId,
    signerAddress,
    createdAt: Date.now(),
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

  return {
    version: 1,
    accountObjectId,
    encryptedPayload: arrayBufferToBase64(ciphertext),
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    createdAt: Date.now(),
  };
}

/**
 * Restore signer from encrypted backup
 *
 * @param backup - Encrypted backup package
 * @param pin - User-provided PIN
 * @returns Decrypted payload with private key and account info
 */
export async function restoreFromBackup(
  backup: NsaBackupPackage,
  pin: string,
): Promise<{ signerPrivateKey: string; accountObjectId: string; signerAddress: string }> {
  if (backup.version !== 1) {
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

  const payloadStr = new TextDecoder().decode(plaintext);
  let payload: BackupPayload;
  try {
    payload = JSON.parse(payloadStr) as BackupPayload;
  } catch {
    throw new NsaError('BACKUP_INVALID_FORMAT', 'Corrupted backup payload');
  }

  if (!payload.signerPrivateKey || !payload.accountObjectId) {
    throw new NsaError('BACKUP_INVALID_FORMAT', 'Missing required fields in backup');
  }

  return {
    signerPrivateKey: payload.signerPrivateKey,
    accountObjectId: payload.accountObjectId,
    signerAddress: payload.signerAddress,
  };
}

/**
 * Validate backup package structure without decrypting
 */
export function validateBackupFormat(data: unknown): data is NsaBackupPackage {
  if (!data || typeof data !== 'object') return false;
  const pkg = data as Record<string, unknown>;
  return (
    pkg.version === 1 &&
    typeof pkg.accountObjectId === 'string' &&
    typeof pkg.encryptedPayload === 'string' &&
    typeof pkg.salt === 'string' &&
    typeof pkg.iv === 'string' &&
    typeof pkg.createdAt === 'number'
  );
}

// === Internal Helpers ===

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const pinBytes = new TextEncoder().encode(pin);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const arr = base64ToUint8Array(base64);
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}
