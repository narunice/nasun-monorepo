/**
 * TEE encryption service for @nasun/baram-sdk
 *
 * Ported from apps/baram/frontend/src/utils/crypto.ts + tee.ts.
 * Provides RSA-OAEP + AES-256-GCM hybrid encryption for TEE executor communication.
 *
 * Prompt encryption format:
 *   Base64( RSA_OAEP(aesKey(32B) || iv(12B)) || AES_GCM_ciphertext || authTag(16B) )
 *
 * Response decryption format:
 *   Base64( IV(12B) || AES_GCM_ciphertext || AuthTag(16B) )
 *
 * Security: AES keys are returned as values (not stored in module state),
 * so lifetime is scoped to the caller's function. No concurrent-request issues.
 */

// --- Low-level crypto primitives ---

/**
 * Import RSA public key from PEM format
 */
export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');
  const keyData = new Uint8Array(Buffer.from(b64, 'base64'));

  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

export interface EncryptResult {
  encrypted: string;       // Base64-encoded ciphertext
  aesKeyBytes: Uint8Array; // AES-256 key for response decryption
}

/**
 * Hybrid encrypt: RSA-OAEP wraps AES-256-GCM key, AES encrypts the payload.
 */
export async function encryptPrompt(
  publicKey: CryptoKey,
  plaintext: string,
): Promise<EncryptResult> {
  const data = new TextEncoder().encode(plaintext);

  // 1. Generate random AES-256 key and IV
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 2. Import AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  // 3. AES-GCM encrypt the plaintext
  const aesCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data,
  );

  // 4. RSA-OAEP encrypt the envelope: aesKey(32B) + iv(12B) = 44B
  const envelope = new Uint8Array(44);
  envelope.set(aesKeyBytes, 0);
  envelope.set(iv, 32);

  const rsaCiphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    envelope,
  );

  // 5. Concatenate: RSA_ciphertext || AES_ciphertext (includes GCM auth tag)
  const rsaBytes = new Uint8Array(rsaCiphertext);
  const aesBytes = new Uint8Array(aesCiphertext);
  const combined = new Uint8Array(rsaBytes.length + aesBytes.length);
  combined.set(rsaBytes, 0);
  combined.set(aesBytes, rsaBytes.length);

  // 6. Base64 encode
  return {
    encrypted: Buffer.from(combined).toString('base64'),
    aesKeyBytes,
  };
}

/**
 * Decrypt AES-256-GCM encrypted response from Enclave.
 * Format: Base64( IV(12B) || AES_GCM_ciphertext || AuthTag(16B) )
 */
export async function decryptResponse(
  encryptedBase64: string,
  aesKeyBytes: Uint8Array,
): Promise<string> {
  const combined = new Uint8Array(Buffer.from(encryptedBase64, 'base64'));

  const iv = combined.slice(0, 12);
  const ciphertextWithTag = combined.slice(12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertextWithTag,
  );

  return new TextDecoder().decode(decrypted);
}

// --- High-level TEE helpers ---

/** Public key cache TTL: 5 minutes */
const PUBLIC_KEY_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedPublicKey {
  url: string;
  key: CryptoKey;
  cachedAt: number;
}

let cachedPublicKey: CachedPublicKey | null = null;

/**
 * Clear the cached public key (useful when executor changes)
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
}

/**
 * Fetch executor's RSA public key with in-memory caching and TTL.
 * Enforces HTTPS and blocks redirects to prevent SSRF attacks.
 */
export async function fetchAndCachePublicKey(executorUrl: string): Promise<CryptoKey> {
  if (cachedPublicKey && cachedPublicKey.url === executorUrl) {
    // Check TTL
    if (Date.now() - cachedPublicKey.cachedAt < PUBLIC_KEY_CACHE_TTL_MS) {
      return cachedPublicKey.key;
    }
    // Cache expired — re-fetch
    cachedPublicKey = null;
  }

  // SSRF defense: validate URL protocol
  const parsed = new URL(`${executorUrl}/public-key`);
  if (parsed.protocol !== 'https:') {
    throw new Error(`TEE public key fetch requires HTTPS (got ${parsed.protocol})`);
  }

  const response = await fetch(parsed.href, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Failed to fetch TEE public key (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { publicKey?: string };
  if (!data.publicKey) {
    throw new Error('TEE public key not found in response');
  }

  const key = await importPublicKey(data.publicKey);
  cachedPublicKey = { url: executorUrl, key, cachedAt: Date.now() };
  return key;
}

/**
 * High-level: fetch public key + encrypt prompt for TEE executor.
 * Returns the encrypted payload and the AES key needed to decrypt the response.
 */
export async function encryptForTee(
  prompt: string,
  executorUrl: string,
): Promise<EncryptResult> {
  const publicKey = await fetchAndCachePublicKey(executorUrl);
  return encryptPrompt(publicKey, prompt);
}
