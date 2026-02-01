/**
 * Hybrid RSA-OAEP + AES-256-GCM encryption for TEE communication
 *
 * Prompt encryption format:
 *   Base64( RSA_OAEP(aesKey || iv) || AES_GCM_ciphertext || authTag )
 *
 * Response encryption format (E2E):
 *   Base64( IV(12B) || AES_GCM_ciphertext || AuthTag(16B) )
 *
 * - RSA-OAEP encrypts only the 44-byte envelope (32B AES key + 12B IV)
 * - AES-256-GCM encrypts the actual prompt (no size limit)
 * - Auth tag (16B) is appended by GCM automatically
 * - The same AES key is reused by the Enclave to encrypt the response
 */

/**
 * Convert PEM public key to ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Import RSA public key from PEM format
 */
export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

/**
 * Result of hybrid encryption, including the AES key for response decryption.
 */
export interface EncryptResult {
  encrypted: string;       // Base64-encoded ciphertext
  aesKeyBytes: Uint8Array; // AES-256 key for response decryption
}

/**
 * Hybrid encrypt: RSA-OAEP wraps AES-256-GCM key, AES encrypts the payload.
 * Returns Base64-encoded result and the AES key for response decryption.
 */
export async function encryptWithRSA(
  publicKey: CryptoKey,
  plaintext: string
): Promise<EncryptResult> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // 1. Generate random AES-256 key and IV
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  // 2. Import AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // 3. AES-GCM encrypt the plaintext
  const aesCiphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  );

  // 4. RSA-OAEP encrypt the envelope: aesKey (32B) + iv (12B) = 44B
  const envelope = new Uint8Array(44);
  envelope.set(aesKeyBytes, 0);
  envelope.set(iv, 32);

  const rsaCiphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    envelope
  );

  // 5. Concatenate: RSA_ciphertext (256B) || AES_ciphertext (includes GCM auth tag)
  const rsaBytes = new Uint8Array(rsaCiphertext);
  const aesBytes = new Uint8Array(aesCiphertext);
  const combined = new Uint8Array(rsaBytes.length + aesBytes.length);
  combined.set(rsaBytes, 0);
  combined.set(aesBytes, rsaBytes.length);

  // 6. Base64 encode
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return { encrypted: btoa(binary), aesKeyBytes };
}

/**
 * Decrypt AES-256-GCM encrypted response from Enclave.
 *
 * Format: Base64( IV(12B) || AES_GCM_ciphertext || AuthTag(16B) )
 *
 * Uses the same AES key that was generated during prompt encryption.
 * Web Crypto API expects ciphertext + authTag concatenated together.
 *
 * @param encryptedBase64 - Base64-encoded encrypted response from Enclave
 * @param aesKeyBytes - AES-256 key from prompt encryption (32 bytes)
 * @returns Decrypted plaintext response
 */
export async function decryptResponse(
  encryptedBase64: string,
  aesKeyBytes: Uint8Array
): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and ciphertext+authTag (rest)
  const iv = combined.slice(0, 12);
  const ciphertextWithTag = combined.slice(12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Web Crypto API handles ciphertext+authTag as a single buffer
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertextWithTag
  );

  return new TextDecoder().decode(decrypted);
}
