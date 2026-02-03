/**
 * Nasun Link Cryptography
 *
 * Encryption utilities for secure link generation.
 * Uses AES-256-GCM with PBKDF2 key derivation.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

/** Salt for key derivation */
const DERIVATION_SALT = 'nasun-link-v2';

/** PBKDF2 iterations */
const PBKDF2_ITERATIONS = 100000;

/** AES-GCM IV length */
const IV_LENGTH = 12;

/**
 * Generate ephemeral keypair for link
 *
 * Creates a new Ed25519 keypair that will hold the link funds.
 * The private key is encrypted and embedded in the link URL.
 */
export function generateEphemeralKeypair(): Ed25519Keypair {
  return Ed25519Keypair.generate();
}

/**
 * Derive encryption key from secret
 *
 * Uses PBKDF2 with SHA-256 to derive a 256-bit AES key.
 *
 * @param secret - Secret string from URL hash
 * @returns CryptoKey for AES-GCM encryption/decryption
 */
export async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import secret as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256 key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(DERIVATION_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt ephemeral private key
 *
 * Encrypts the private key (Bech32 string) using AES-256-GCM.
 * The result includes the IV prepended to the ciphertext.
 *
 * @param privateKey - Ephemeral private key (Bech32 encoded string)
 * @param secret - Secret for encryption
 * @returns Base64-encoded encrypted payload
 */
export async function encryptPayload(
  privateKey: string,
  secret: string
): Promise<string> {
  const key = await deriveKey(secret);
  const encoder = new TextEncoder();
  const data = encoder.encode(privateKey);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Base64 encode
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ephemeral private key
 *
 * Decrypts the payload using AES-256-GCM.
 * Extracts the IV from the beginning of the payload.
 *
 * @param encryptedPayload - Base64-encoded encrypted payload
 * @param secret - Secret for decryption
 * @returns Decrypted private key (Bech32 encoded string)
 */
export async function decryptPayload(
  encryptedPayload: string,
  secret: string
): Promise<string> {
  const key = await deriveKey(secret);

  // Base64 decode
  const combined = Uint8Array.from(atob(encryptedPayload), (c) =>
    c.charCodeAt(0)
  );

  // Split IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  // Decode bytes to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Generate secure random secret
 *
 * Creates a URL-safe base64-encoded random string.
 * Used as the hash fragment in link URLs.
 *
 * @param length - Number of random bytes (default: 32)
 * @returns URL-safe secret string
 */
export function generateSecret(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  // Base64 encode with URL-safe characters
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate link ID from ephemeral address
 *
 * Creates a short, unique identifier from the ephemeral address.
 *
 * @param ephemeralAddress - Ephemeral Sui address
 * @returns Link ID (16 characters)
 */
export function generateLinkId(ephemeralAddress: string): string {
  // Use first 16 hex characters after '0x'
  return ephemeralAddress.slice(2, 18);
}

/**
 * Recover keypair from encrypted payload
 *
 * Decrypts the payload and reconstructs the Ed25519 keypair.
 *
 * @param encryptedPayload - Encrypted private key payload
 * @param secret - Decryption secret
 * @returns Reconstructed Ed25519 keypair
 */
export async function recoverKeypair(
  encryptedPayload: string,
  secret: string
): Promise<Ed25519Keypair> {
  const privateKey = await decryptPayload(encryptedPayload, secret);
  return Ed25519Keypair.fromSecretKey(privateKey);
}

/** Salt length for password hashing */
const PASSWORD_SALT_LENGTH = 16;

/** PBKDF2 iterations for password hashing */
const PASSWORD_HASH_ITERATIONS = 100000;

/**
 * Hash password for condition
 *
 * Uses PBKDF2 with random salt for brute-force resistance.
 * Returns base64(salt + derived_key) so salt is embedded in the hash.
 *
 * @param password - Plain text password
 * @returns Base64-encoded salt+hash
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Combine salt + derived key
  const combined = new Uint8Array(salt.length + derived.byteLength);
  combined.set(salt);
  combined.set(new Uint8Array(derived), salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify password against hash
 *
 * Extracts salt from stored hash, re-derives, and compares.
 *
 * @param password - Plain text password
 * @param hash - Stored base64(salt+hash)
 * @returns true if password matches
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const combined = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));

  // Extract salt and stored derived key
  const salt = combined.slice(0, PASSWORD_SALT_LENGTH);
  const storedDerived = combined.slice(PASSWORD_SALT_LENGTH);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Constant-time comparison
  const derivedArray = new Uint8Array(derived);
  if (derivedArray.length !== storedDerived.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedArray.length; i++) {
    diff |= derivedArray[i] ^ storedDerived[i];
  }
  return diff === 0;
}
