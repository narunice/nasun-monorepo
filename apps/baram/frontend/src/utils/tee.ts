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

// AES key retained for response decryption (one pending request at a time)
let pendingAesKey: Uint8Array | null = null;

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
  requestId?: number,
): Promise<string> {
  // Fetch and cache public key
  if (!cachedPublicKey || cachedPublicKey.url !== executorUrl) {
    console.log('[TEE] Fetching public key from', executorUrl);
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
    console.log('[TEE] Public key cached');
  }

  const { encrypted, aesKeyBytes } = await encryptWithRSA(cachedPublicKey.key, prompt);

  // Retain AES key for response decryption
  pendingAesKey = aesKeyBytes;

  // Backup to sessionStorage only in development (HMR resilience).
  // In production, the key exists only in memory to minimize XSS exposure.
  if (import.meta.env.DEV && requestId !== undefined) {
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
  requestId?: number,
): Promise<string> {
  let keyToUse = pendingAesKey;

  // Recover from sessionStorage if module-level key was lost (DEV only: HMR)
  if (!keyToUse && import.meta.env.DEV && requestId !== undefined) {
    try {
      const stored = sessionStorage.getItem(`baram_aes_${requestId}`);
      if (stored) {
        keyToUse = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
        console.log('[TEE] AES key recovered from sessionStorage');
      }
    } catch { /* ignore */ }
  }

  if (!keyToUse) {
    throw new Error('No AES key available for response decryption');
  }

  const result = await decryptResponse(encryptedResult, keyToUse);

  // Clear key from all locations immediately after use
  if (pendingAesKey) {
    pendingAesKey.fill(0);
    pendingAesKey = null;
  }
  if (requestId !== undefined) {
    try { sessionStorage.removeItem(`baram_aes_${requestId}`); } catch { /* ignore */ }
  }

  return result;
}
