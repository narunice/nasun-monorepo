/**
 * Shared Cryptographic Primitives
 *
 * Low-level utilities used by keystore encryption, NSA backup,
 * and wallet backup modules. Centralizes PBKDF2 key derivation
 * and base64 encoding to avoid duplication.
 */

export interface DeriveKeyOptions {
  iterations?: number;
  hash?: string;
  keyLength?: number;
}

const DEFAULT_OPTIONS: Required<DeriveKeyOptions> = {
  iterations: 600_000,
  hash: 'SHA-256',
  keyLength: 256,
};

/**
 * Derive an AES-256-GCM CryptoKey from a secret using PBKDF2.
 *
 * @param secret - User-provided secret (password, PIN, etc.)
 * @param salt - Random salt bytes
 * @param options - Override iterations, hash, or key length
 */
export async function deriveKey(
  secret: string,
  salt: Uint8Array,
  options?: DeriveKeyOptions,
): Promise<CryptoKey> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const secretBytes = new TextEncoder().encode(secret);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: opts.iterations,
      hash: opts.hash,
    },
    baseKey,
    { name: 'AES-GCM', length: opts.keyLength },
    false,
    ['encrypt', 'decrypt'],
  );
}

// === Base64 Encoding/Decoding ===

export function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Invalid base64 encoding in backup data');
  }
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const arr = base64ToUint8Array(base64);
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}
