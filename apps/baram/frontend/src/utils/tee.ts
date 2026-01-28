/**
 * TEE (Trusted Execution Environment) encryption utilities
 */

import { importPublicKey, encryptWithRSA } from './crypto';

interface CachedPublicKey {
  url: string;
  key: CryptoKey;
}

let cachedPublicKey: CachedPublicKey | null = null;

/**
 * Clear the cached public key (useful for testing or when executor changes)
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}

/**
 * Encrypt prompt with RSA-OAEP for TEE executor
 * Fetches and caches the executor's public key
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

  return encryptWithRSA(cachedPublicKey.key, prompt);
}
