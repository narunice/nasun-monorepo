/**
 * Nasun Wallet Crypto Utilities
 * Web Crypto API based AES-256-GCM encryption
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// PBKDF2 settings
const PBKDF2_ITERATIONS = 100000;
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

/**
 * Get address from keypair
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
 * Derive encryption key from password (PBKDF2)
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
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
  const key = await deriveKey(password, salt);

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

  const key = await deriveKey(password, new Uint8Array(salt));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted
  );

  // Convert UTF-8 bytes to Bech32 string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
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

// ============================================
// Utility functions
// ============================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
