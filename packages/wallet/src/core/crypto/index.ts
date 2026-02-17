/**
 * Nasun Wallet Crypto Utilities
 * Web Crypto API based AES-256-GCM encryption
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { blake2b } from '@noble/hashes/blake2.js';
import {
  deriveKey as deriveKeyPrimitive,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './primitives';

// Keystore encryption uses 100K iterations (interactive unlock)
const KEYSTORE_PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Generate new Ed25519 keypair
 */
export function generateKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

/**
 * Generate BIP39 mnemonic (12 words)
 * @returns 12-word English mnemonic phrase
 */
export function generateMnemonicPhrase(): string {
  return generateMnemonic(wordlist, 128); // 128 bits = 12 words
}

/**
 * Validate mnemonic
 * @param mnemonic BIP39 mnemonic phrase
 * @returns true if valid mnemonic
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/**
 * Recover keypair from mnemonic
 * @param mnemonic BIP39 mnemonic (12/24 words)
 * @param path Optional - defaults to "m/44'/784'/0'/0'/0'" (SUI standard)
 */
export function keypairFromMnemonic(mnemonic: string, path?: string): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(mnemonic.trim().toLowerCase(), path);
}

/** Address derivation scheme type */
export type AddressScheme = 'sui' | 'iota';

/**
 * Derive a Move chain address from an Ed25519 keypair.
 *
 * Sui/Nasun: BLAKE2b-256(flag_byte || pubkey)  — flag byte always included
 * IOTA Rebased: BLAKE2b-256(pubkey)            — flag byte omitted for Ed25519
 */
export function deriveChainAddress(
  keypair: Ed25519Keypair,
  scheme: AddressScheme = 'sui'
): string {
  if (scheme === 'sui') {
    return keypair.getPublicKey().toSuiAddress();
  }

  // IOTA: BLAKE2b-256(raw pubkey only) — no flag byte for Ed25519
  const pubkeyBytes = keypair.getPublicKey().toRawBytes();
  const hash = blake2b(pubkeyBytes, { dkLen: 32 });
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

/**
 * Get address from keypair (Sui/Nasun format only — used by keystore)
 */
export function getAddressFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toSuiAddress();
}

/**
 * Get public key from keypair (base64)
 */
export function getPublicKeyFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toBase64();
}

/**
 * Encrypt private key
 * @param privateKey Bech32 encoded private key string (suiprivkey1...)
 */
export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKeyPrimitive(password, salt, { iterations: KEYSTORE_PBKDF2_ITERATIONS });

  // Convert Bech32 string to UTF-8 bytes
  const encoder = new TextEncoder();
  const privateKeyBytes = encoder.encode(privateKey);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key,
    privateKeyBytes.buffer.slice(privateKeyBytes.byteOffset, privateKeyBytes.byteOffset + privateKeyBytes.byteLength) as ArrayBuffer
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer),
  };
}

/**
 * Decrypt private key
 * @returns Bech32 encoded private key string (suiprivkey1...)
 */
export async function decryptPrivateKey(
  encryptedBase64: string,
  ivBase64: string,
  saltBase64: string,
  password: string
): Promise<string> {
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);
  const salt = base64ToArrayBuffer(saltBase64);

  const key = await deriveKeyPrimitive(password, new Uint8Array(salt), { iterations: KEYSTORE_PBKDF2_ITERATIONS });

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encrypted
    );

    // Convert UTF-8 bytes to Bech32 string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    // crypto.subtle.decrypt throws OperationError on invalid password
    // Rethrow with a message that keystore.ts can detect
    throw new Error('Failed to decrypt: invalid password or corrupted data');
  }
}

/**
 * Restore keypair from Bech32 private key
 * @param secretKey Bech32 encoded private key string (suiprivkey1...)
 */
export function keypairFromSecretKey(secretKey: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/**
 * Get Bech32 private key from keypair
 * @returns Bech32 encoded private key string (suiprivkey1...)
 */
export function getSecretKeyFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getSecretKey();
}

// ============================================
// Memory Security
// ============================================

/**
 * Securely zero out a buffer to prevent memory extraction attacks.
 * First fills with random data, then zeros, to prevent optimization skip.
 * @param buffer - The buffer to clear
 */
export function secureZero(buffer: Uint8Array): void {
  if (buffer.length === 0) return;
  // First overwrite with random data (prevents compiler optimization from skipping)
  crypto.getRandomValues(buffer);
  // Then fill with zeros
  buffer.fill(0);
}

/**
 * Securely zero out a string by converting to buffer and clearing.
 * Note: JavaScript strings are immutable, so this only clears the buffer copy.
 * The original string may still exist in memory until garbage collected.
 * @param str - The string to attempt to clear
 * @returns An empty buffer (for assignment to clear reference)
 */
export function secureZeroString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(str);
  secureZero(buffer);
  return buffer;
}
