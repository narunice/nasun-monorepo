/**
 * TEE (Trusted Execution Environment) encryption utilities
 *
 * Handles E2E encryption for both prompts (outbound) and responses (inbound).
 * The AES key generated during prompt encryption is retained in memory
 * for decrypting the Enclave's encrypted response.
 *
 * In development, AES keys are backed up to sessionStorage for HMR resilience.
 * In production, keys exist only in memory to minimize XSS exposure surface.
 */

import { importPublicKey, encryptWithRSA, decryptResponse } from './crypto';

interface CachedPublicKey {
  url: string;
  key: CryptoKey;
}

let cachedPublicKey: CachedPublicKey | null = null;

// AES keys retained for response decryption, keyed by requestId.
// Supports concurrent requests safely (previous single variable caused overwrites).
const pendingAesKeys = new Map<number, Uint8Array>();

/**
 * Clear the cached public key (useful for testing or when executor changes)
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}

/**
 * Encrypt prompt with RSA-OAEP for TEE executor.
 * Retains the AES key in memory + sessionStorage for decrypting the response.
 *
 * @param prompt - The plaintext prompt to encrypt
 * @param executorUrl - The executor's base URL
 * @param requestId - On-chain request ID (for sessionStorage backup key)
 * @returns Base64-encoded encrypted prompt
 */
export async function encryptPromptForTEE(
  prompt: string,
  executorUrl: string,
  requestId: number,
): Promise<string> {
  // Fetch and cache public key
  if (!cachedPublicKey || cachedPublicKey.url !== executorUrl) {
    const response = await fetch(`${executorUrl}/public-key`);
    if (!response.ok) {
      throw new Error('Failed to fetch TEE public key');
    }
    const data = await response.json();
    if (!data.publicKey) {
      throw new Error('TEE public key not found in response');
    }
    const key = await importPublicKey(data.publicKey);
    cachedPublicKey = { url: executorUrl, key };
  }

  const { encrypted, aesKeyBytes } = await encryptWithRSA(cachedPublicKey.key, prompt);

  // Retain AES key by requestId for concurrent-safe response decryption
  pendingAesKeys.set(requestId, aesKeyBytes);

  // Backup to sessionStorage only in development (HMR resilience).
  // In production, the key exists only in memory to minimize XSS exposure.
  if (import.meta.env.DEV) {
    try {
      sessionStorage.setItem(
        `baram_aes_${requestId}`,
        btoa(String.fromCharCode(...aesKeyBytes)),
      );
    } catch { /* sessionStorage unavailable */ }
  }

  return encrypted;
}

/**
 * Decrypt E2E-encrypted response from TEE executor.
 * Uses the AES key retained during prompt encryption (memory or sessionStorage),
 * then clears it from all locations.
 *
 * @param encryptedResult - Base64-encoded encrypted response
 * @param requestId - On-chain request ID (for sessionStorage recovery)
 * @returns Decrypted plaintext response
 */
export async function decryptResponseFromTEE(
  encryptedResult: string,
  requestId: number,
): Promise<string> {
  let keyToUse = pendingAesKeys.get(requestId) ?? null;

  // Recover from sessionStorage if in-memory key was lost (DEV only: HMR)
  if (!keyToUse && import.meta.env.DEV) {
    try {
      const stored = sessionStorage.getItem(`baram_aes_${requestId}`);
      if (stored) {
        keyToUse = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      }
    } catch { /* ignore */ }
  }

  if (!keyToUse) {
    throw new Error('No AES key available for response decryption');
  }

  const result = await decryptResponse(encryptedResult, keyToUse);

  // Clear key from all locations immediately after use
  const storedKey = pendingAesKeys.get(requestId);
  if (storedKey) {
    storedKey.fill(0);
    pendingAesKeys.delete(requestId);
  }
  try { sessionStorage.removeItem(`baram_aes_${requestId}`); } catch { /* ignore */ }

  return result;
}
