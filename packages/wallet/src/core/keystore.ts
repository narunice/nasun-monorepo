/**
 * Nasun Wallet Keystore
 * localStorage based encrypted key storage
 */

import type { EncryptedKeystore } from '../types';
import {
  generateKeypair,
  generateMnemonicPhrase,
  isValidMnemonic,
  keypairFromMnemonic,
  getAddressFromKeypair,
  getSecretKeyFromKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
  keypairFromSecretKey,
  secureZeroString,
} from './crypto';
import {
  isLockedOut,
  getLockoutRemainingMs,
  recordFailedAttempt,
  resetUnlockAttempts,
} from './rate-limit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const KEYSTORE_KEY = 'nasun_wallet_keystore';

/**
 * Check if keystore exists
 */
export function hasKeystore(): boolean {
  return localStorage.getItem(KEYSTORE_KEY) !== null;
}

/**
 * Load keystore
 */
export function loadKeystore(): EncryptedKeystore | null {
  const data = localStorage.getItem(KEYSTORE_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data) as EncryptedKeystore;
  } catch {
    return null;
  }
}

/**
 * Save keystore
 */
export function saveKeystore(keystore: EncryptedKeystore): void {
  localStorage.setItem(KEYSTORE_KEY, JSON.stringify(keystore));
}

/**
 * Delete keystore
 */
export function deleteKeystore(): void {
  localStorage.removeItem(KEYSTORE_KEY);
}

/**
 * Create and save new wallet
 * @returns Created address
 */
export async function createAndSaveWallet(password: string): Promise<string> {
  const keypair = generateKeypair();
  const address = getAddressFromKeypair(keypair);
  let secretKey: string | null = null;

  try {
    secretKey = getSecretKeyFromKeypair(keypair);
    const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

    const keystore: EncryptedKeystore = {
      encryptedPrivateKey: encrypted,
      iv,
      salt,
      address,
      createdAt: Date.now(),
    };

    saveKeystore(keystore);
    return address;
  } finally {
    // Clear sensitive data from memory (best effort - JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
  }
}

/**
 * Decrypt keypair from keystore
 * Includes rate limiting to prevent brute force attacks.
 * @returns Decrypted keypair
 * @throws Error if locked out or invalid password
 */
export async function unlockKeystore(password: string): Promise<Ed25519Keypair> {
  // Check lockout before attempting
  if (isLockedOut()) {
    const remainingMs = getLockoutRemainingMs();
    const remainingSec = Math.ceil(remainingMs / 1000);
    throw new Error(`Too many failed attempts. Try again in ${remainingSec} seconds.`);
  }

  const keystore = loadKeystore();
  if (!keystore) {
    throw new Error('No wallet found');
  }

  let secretKey: string | null = null;

  try {
    secretKey = await decryptPrivateKey(
      keystore.encryptedPrivateKey,
      keystore.iv,
      keystore.salt,
      password
    );

    const keypair = keypairFromSecretKey(secretKey);

    // Verify address
    const address = getAddressFromKeypair(keypair);
    if (address !== keystore.address) {
      throw new Error('Address mismatch - keystore may be corrupted');
    }

    // Success - reset rate limiting counter
    resetUnlockAttempts();

    return keypair;
  } catch (error) {
    if (error instanceof Error && error.message.includes('decrypt')) {
      // Record failed attempt for rate limiting
      recordFailedAttempt();

      // Check if lockout was triggered
      if (isLockedOut()) {
        const remainingMs = getLockoutRemainingMs();
        const remainingSec = Math.ceil(remainingMs / 1000);
        throw new Error(`Invalid password. Too many attempts. Locked for ${remainingSec} seconds.`);
      }

      throw new Error('Invalid password');
    }
    throw error;
  } finally {
    // Clear sensitive data from memory (best effort - JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
  }
}

/**
 * Get stored address (available when locked)
 */
export function getStoredAddress(): string | null {
  const keystore = loadKeystore();
  return keystore?.address ?? null;
}

/**
 * Create new wallet with mnemonic
 * @param password Encryption password
 * @returns { address, mnemonic } - mnemonic is returned once only (not stored!)
 */
export async function createWalletWithMnemonic(
  password: string
): Promise<{ address: string; mnemonic: string }> {
  // 1. Generate mnemonic
  const mnemonic = generateMnemonicPhrase();

  // 2. Create keypair from mnemonic
  const keypair = keypairFromMnemonic(mnemonic);
  const address = getAddressFromKeypair(keypair);
  let secretKey: string | null = null;

  try {
    secretKey = getSecretKeyFromKeypair(keypair);

    // 3. Encrypt and save private key
    const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

    const keystore: EncryptedKeystore = {
      encryptedPrivateKey: encrypted,
      iv,
      salt,
      address,
      createdAt: Date.now(),
    };

    saveKeystore(keystore);

    // 4. Return mnemonic without storing (user must backup)
    return { address, mnemonic };
  } finally {
    // Clear sensitive data from memory (best effort - JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
  }
}

/**
 * Import wallet from mnemonic
 * @param mnemonic BIP39 mnemonic (12/24 words)
 * @param password New encryption password
 * @returns Recovered address
 */
export async function importWalletFromMnemonic(
  mnemonic: string,
  password: string
): Promise<string> {
  // 1. Validate mnemonic
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // 2. Recover keypair from mnemonic
  const keypair = keypairFromMnemonic(mnemonic);
  const address = getAddressFromKeypair(keypair);
  let secretKey: string | null = null;

  try {
    secretKey = getSecretKeyFromKeypair(keypair);

    // 3. Encrypt and save private key
    const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

    const keystore: EncryptedKeystore = {
      encryptedPrivateKey: encrypted,
      iv,
      salt,
      address,
      createdAt: Date.now(),
    };

    saveKeystore(keystore);

    return address;
  } finally {
    // Clear sensitive data from memory (best effort - JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
  }
}

/**
 * Import wallet from private key
 * @param privateKey Bech32 format private key (suiprivkey1...)
 * @param password New encryption password
 * @returns Recovered address
 */
export async function importWalletFromPrivateKey(
  privateKey: string,
  password: string
): Promise<string> {
  // 1. Recover keypair from private key
  let keypair: Ed25519Keypair;
  try {
    keypair = keypairFromSecretKey(privateKey.trim());
  } catch {
    throw new Error('Invalid private key format. Expected Bech32 format (suiprivkey1...)');
  }

  const address = getAddressFromKeypair(keypair);
  let secretKey: string | null = null;

  try {
    secretKey = getSecretKeyFromKeypair(keypair);

    // 2. Encrypt and save private key
    const { encrypted, iv, salt } = await encryptPrivateKey(secretKey, password);

    const keystore: EncryptedKeystore = {
      encryptedPrivateKey: encrypted,
      iv,
      salt,
      address,
      createdAt: Date.now(),
    };

    saveKeystore(keystore);

    return address;
  } finally {
    // Clear sensitive data from memory (best effort - JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
  }
}
