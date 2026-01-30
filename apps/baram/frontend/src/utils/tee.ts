/**
 * TEE (Trusted Execution Environment) encryption utilities
 *
 * Handles E2E encryption for both prompts (outbound) and responses (inbound).
 * The AES key generated during prompt encryption is retained in memory
 * for decrypting the Enclave's encrypted response.
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
 * Retains the AES key in memory for decrypting the response.
 *
 * @param prompt - The plaintext prompt to encrypt
 * @param executorUrl - The executor's base URL
 * @returns Base64-encoded encrypted prompt
 */
export async function encryptPromptForTEE(
  prompt: string,
  executorUrl: string
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

  return encrypted;
}

/**
 * Decrypt E2E-encrypted response from TEE executor.
 * Uses the AES key retained during prompt encryption, then clears it.
 *
 * @param encryptedResult - Base64-encoded encrypted response
 * @returns Decrypted plaintext response
 */
export async function decryptResponseFromTEE(encryptedResult: string): Promise<string> {
  if (!pendingAesKey) {
    throw new Error('No AES key available for response decryption');
  }

  const result = await decryptResponse(encryptedResult, pendingAesKey);

  // Clear key from memory immediately after use
  pendingAesKey.fill(0);
  pendingAesKey = null;

  return result;
}
