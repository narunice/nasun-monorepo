/**
 * TEE E2E encryption utilities.
 *
 * Caches the executor's RSA-OAEP public key by URL and retains the per-request
 * AES key in memory for response decryption (cleared once decrypted).
 */

import { importPublicKey, encryptWithRSA, decryptResponse } from './crypto';

interface CachedPublicKey {
  url: string;
  key: CryptoKey;
}

let cachedPublicKey: CachedPublicKey | null = null;
const pendingAesKeys = new Map<number, Uint8Array>();

export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}

export async function encryptPromptForTEE(
  prompt: string,
  executorUrl: string,
  requestId: number,
): Promise<string> {
  if (!cachedPublicKey || cachedPublicKey.url !== executorUrl) {
    const response = await fetch(`${executorUrl}/public-key`);
    if (!response.ok) throw new Error('Failed to fetch TEE public key');
    const data = await response.json();
    if (!data.publicKey) throw new Error('TEE public key not found in response');
    const key = await importPublicKey(data.publicKey);
    cachedPublicKey = { url: executorUrl, key };
  }

  const { encrypted, aesKeyBytes } = await encryptWithRSA(cachedPublicKey.key, prompt);
  pendingAesKeys.set(requestId, aesKeyBytes);

  if (import.meta.env.DEV) {
    try {
      sessionStorage.setItem(
        `nasun_ai_aes_${requestId}`,
        btoa(String.fromCharCode(...aesKeyBytes)),
      );
    } catch {
      // sessionStorage unavailable.
    }
  }

  return encrypted;
}

export async function decryptResponseFromTEE(
  encryptedResult: string,
  requestId: number,
): Promise<string> {
  let keyToUse = pendingAesKeys.get(requestId) ?? null;

  if (!keyToUse && import.meta.env.DEV) {
    try {
      const stored = sessionStorage.getItem(`nasun_ai_aes_${requestId}`);
      if (stored) keyToUse = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    } catch {
      // ignore
    }
  }

  if (!keyToUse) throw new Error('No AES key available for response decryption');

  const result = await decryptResponse(encryptedResult, keyToUse);

  const storedKey = pendingAesKeys.get(requestId);
  if (storedKey) {
    storedKey.fill(0);
    pendingAesKeys.delete(requestId);
  }
  try {
    sessionStorage.removeItem(`nasun_ai_aes_${requestId}`);
  } catch {
    // ignore
  }

  return result;
}
