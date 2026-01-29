/**
 * Hybrid RSA-OAEP + AES-256-GCM encryption for TEE communication
 *
 * Format: Base64( RSA_OAEP(aesKey || iv) || AES_GCM_ciphertext || authTag )
 *
 * - RSA-OAEP encrypts only the 44-byte envelope (32B AES key + 12B IV)
 * - AES-256-GCM encrypts the actual prompt (no size limit)
 * - Auth tag (16B) is appended by GCM automatically
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
 * Hybrid encrypt: RSA-OAEP wraps AES-256-GCM key, AES encrypts the payload.
 * Returns Base64-encoded result.
 */
export async function encryptWithRSA(
  publicKey: CryptoKey,
  plaintext: string
): Promise<string> {
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
  return btoa(binary);
}
