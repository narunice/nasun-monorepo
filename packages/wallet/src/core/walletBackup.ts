/**
 * Wallet Backup - PIN-encrypted backup for signing keys
 *
 * Allows self-custody and passkey users to create an encrypted
 * backup without requiring a Smart Account. Uses PBKDF2 600K
 * iterations + AES-256-GCM, same as NSA backup.
 *
 * Not available for zkLogin users (ephemeral keys regenerated
 * on re-authentication).
 */

import type { WalletBackupPackage } from '../types/backup';
import { validateWalletBackupFormat } from '../types/backup';
import {
  deriveKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './crypto/primitives';

const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const MIN_PIN_LENGTH = 6;

/** Internal payload structure for wallet backup */
interface WalletBackupPayload {
  signerPrivateKey: string;
  signerAddress: string;
  signerType: 'passkey' | 'local';
  createdAt: number;
}

/** Restored wallet backup data */
export interface WalletBackupRestoreResult {
  signerPrivateKey: string;
  signerAddress: string;
  signerType: 'passkey' | 'local';
}

/**
 * Create an encrypted wallet backup.
 *
 * @param signerPrivateKey - Bech32-encoded private key
 * @param signerAddress - Wallet address
 * @param signerType - Signer type ('passkey' or 'local')
 * @param pin - User-provided PIN (minimum 6 characters)
 * @returns Encrypted wallet backup package
 */
export async function createWalletBackup(
  signerPrivateKey: string,
  signerAddress: string,
  signerType: 'passkey' | 'local',
  pin: string,
): Promise<WalletBackupPackage> {
  if (pin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
  }

  const payload: WalletBackupPayload = {
    signerPrivateKey,
    signerAddress,
    signerType,
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

  // Zero the plaintext buffer to minimize key exposure in memory
  plaintext.fill(0);

  return {
    type: 'wallet',
    version: 1,
    encryptedPayload: arrayBufferToBase64(ciphertext),
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    createdAt: Date.now(),
  };
}

/**
 * Restore wallet from encrypted backup.
 *
 * @param backup - Encrypted wallet backup package
 * @param pin - User-provided PIN
 * @returns Decrypted wallet data (private key, address, signer type)
 */
export async function restoreWalletBackup(
  backup: WalletBackupPackage,
  pin: string,
): Promise<WalletBackupRestoreResult> {
  if (!validateWalletBackupFormat(backup)) {
    throw new Error('Invalid wallet backup format');
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
    throw new Error('Invalid PIN or corrupted backup');
  }

  const payloadStr = new TextDecoder().decode(plaintext);
  // Zero the decrypted plaintext buffer to minimize key exposure in memory
  new Uint8Array(plaintext).fill(0);

  let payload: WalletBackupPayload;
  try {
    payload = JSON.parse(payloadStr) as WalletBackupPayload;
  } catch {
    throw new Error('Corrupted backup payload');
  }

  if (!payload.signerPrivateKey || !payload.signerAddress || !payload.signerType) {
    throw new Error('Missing required fields in backup');
  }

  return {
    signerPrivateKey: payload.signerPrivateKey,
    signerAddress: payload.signerAddress,
    signerType: payload.signerType,
  };
}

export { validateWalletBackupFormat };
