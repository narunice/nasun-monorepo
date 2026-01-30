/**
 * Chat Crypto - AES-256-GCM encryption for chat history
 *
 * Uses the same pattern as packages/wallet/src/core/crypto.ts:
 * - PBKDF2 key derivation (100,000 iterations)
 * - AES-256-GCM for encryption
 *
 * Key derivation uses wallet address + wallet password.
 * Password is required — prevents disk-level attacks where
 * an attacker knows the wallet address (public info).
 */

// PBKDF2 settings (matching monorepo pattern)
const PBKDF2_ITERATIONS = 100000;
const SALT_PREFIX = 'baram:chat:';
const IV_LENGTH = 12;

// Cached encryption key (fingerprint = hash of address+password)
let cachedKey: { fingerprint: string; key: CryptoKey } | null = null;

/**
 * Derive encryption key from wallet address + password
 * Uses PBKDF2 with combined material for key derivation
 */
export async function deriveStorageKey(walletAddress: string, password: string): Promise<CryptoKey> {
  if (!password) {
    throw new Error('Password required for chat encryption key derivation');
  }

  // Use hash as cache fingerprint (avoid storing password in memory for comparison)
  const fingerprint = await sha256Text(`${walletAddress}:${password}`);
  if (cachedKey && cachedKey.fingerprint === fingerprint) {
    return cachedKey.key;
  }

  const encoder = new TextEncoder();
  const salt = encoder.encode(`${SALT_PREFIX}${walletAddress}`);

  // Import wallet address + password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${walletAddress}:${password}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256-GCM key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Cache the key
  cachedKey = { fingerprint, key };

  return key;
}

/**
 * Encrypt data with AES-256-GCM
 * @returns Object with encrypted data and IV (both base64 encoded)
 */
export async function encryptData(
  key: CryptoKey,
  data: string
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt data with AES-256-GCM
 * @returns Decrypted string
 */
export async function decryptData(
  key: CryptoKey,
  encryptedBase64: string,
  ivBase64: string
): Promise<string> {
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt an object (JSON serializable)
 */
export async function encryptObject<T>(
  key: CryptoKey,
  obj: T
): Promise<{ encrypted: string; iv: string }> {
  const json = JSON.stringify(obj);
  return encryptData(key, json);
}

/**
 * Decrypt an object
 */
export async function decryptObject<T>(
  key: CryptoKey,
  encryptedBase64: string,
  ivBase64: string
): Promise<T> {
  const json = await decryptData(key, encryptedBase64, ivBase64);
  return JSON.parse(json) as T;
}

/**
 * Clear cached encryption key (call on wallet disconnect)
 */
export function clearCachedKey(): void {
  cachedKey = null;
}

// ============================================
// Utility Functions
// ============================================

/**
 * SHA-256 hash of a string (hex output) — used for cache fingerprinting
 */
async function sha256Text(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
