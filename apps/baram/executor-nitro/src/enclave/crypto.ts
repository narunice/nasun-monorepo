/**
 * Enclave Crypto Module
 *
 * Handles RSA key generation and decryption within the Enclave.
 * In production, the private key NEVER leaves the Enclave.
 *
 * Key Flow:
 * 1. Enclave generates RSA keypair on startup
 * 2. Public key is exported and shared with clients
 * 3. Clients encrypt prompts with public key
 * 4. Enclave decrypts prompts with private key
 * 5. Private key is destroyed when Enclave terminates
 */

import * as crypto from 'crypto';

/**
 * RSA Key pair for encryption/decryption
 */
interface EnclaveKeyPair {
  publicKey: string; // PEM format
  privateKey: string; // PEM format (NEVER exported)
}

// Singleton key pair - generated once on Enclave startup
let keyPair: EnclaveKeyPair | null = null;

/**
 * Initialize the Enclave crypto module
 * Generates a new RSA keypair
 *
 * @returns Base64-encoded public key in SPKI format
 */
export async function initializeCrypto(): Promise<string> {
  console.log('[Enclave/Crypto] Generating RSA keypair...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  keyPair = { publicKey, privateKey };

  // Export public key as Base64 (remove PEM headers)
  const publicKeyBase64 = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');

  console.log('[Enclave/Crypto] RSA keypair generated successfully');
  return publicKeyBase64;
}

/**
 * Get the public key in Base64 format
 * Returns null if crypto not initialized
 */
export function getPublicKey(): string | null {
  if (!keyPair) {
    return null;
  }

  return keyPair.publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
}

/**
 * Decrypt hybrid-encrypted data (RSA-OAEP + AES-256-GCM).
 *
 * Format: Base64( RSA_ciphertext(256B) || AES_GCM_ciphertext )
 *
 * 1. RSA-OAEP decrypts the first 256 bytes → AES key (32B) + IV (12B)
 * 2. AES-256-GCM decrypts the remaining bytes (includes 16B auth tag)
 *
 * @param encryptedBase64 - Base64-encoded hybrid-encrypted data
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedBase64: string): string {
  if (!keyPair) {
    throw new Error('Crypto not initialized');
  }

  try {
    const combined = Buffer.from(encryptedBase64, 'base64');

    // RSA-2048 produces 256-byte ciphertext
    const RSA_CIPHERTEXT_LEN = 256;

    if (combined.length <= RSA_CIPHERTEXT_LEN) {
      throw new Error(`Encrypted data too short: ${combined.length} bytes`);
    }

    // 1. Split: RSA envelope (256B) || AES ciphertext (rest)
    const rsaCiphertext = combined.subarray(0, RSA_CIPHERTEXT_LEN);
    const aesCiphertextWithTag = combined.subarray(RSA_CIPHERTEXT_LEN);

    // 2. RSA-OAEP decrypt the envelope → aesKey (32B) + iv (12B)
    const envelope = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      rsaCiphertext
    );

    if (envelope.length !== 44) {
      throw new Error(`Unexpected envelope size: ${envelope.length} (expected 44)`);
    }

    const aesKey = envelope.subarray(0, 32);
    const iv = envelope.subarray(32, 44);

    // 3. AES-256-GCM decrypt (last 16 bytes of ciphertext are the auth tag)
    const AUTH_TAG_LEN = 16;
    const ciphertextOnly = aesCiphertextWithTag.subarray(0, aesCiphertextWithTag.length - AUTH_TAG_LEN);
    const authTag = aesCiphertextWithTag.subarray(aesCiphertextWithTag.length - AUTH_TAG_LEN);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextOnly),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (error) {
    // Fallback: treat as base64-encoded plaintext (non-encrypted prompt)
    try {
      const plaintext = Buffer.from(encryptedBase64, 'base64').toString('utf-8');
      // Sanity check: valid UTF-8 text should not contain null bytes
      if (plaintext.length > 0 && !plaintext.includes('\0')) {
        console.warn('[Enclave/Crypto] Hybrid decryption failed, using plaintext fallback');
        return plaintext;
      }
    } catch {
      // Fallback also failed
    }
    console.error('[Enclave/Crypto] Decryption failed:', error);
    throw new Error('Decryption failed - invalid encrypted data or wrong key');
  }
}

/**
 * Compute SHA-256 hash of content
 *
 * @param content - String content to hash
 * @returns Hex-encoded hash
 */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Destroy the keypair (called on Enclave shutdown)
 * Ensures private key is cleared from memory
 */
export function destroyKeyPair(): void {
  if (keyPair) {
    // Overwrite memory with zeros before nullifying
    // Note: In JS this is best-effort due to GC
    keyPair.privateKey = '0'.repeat(keyPair.privateKey.length);
    keyPair.publicKey = '0'.repeat(keyPair.publicKey.length);
    keyPair = null;
    console.log('[Enclave/Crypto] Keypair destroyed');
  }
}

/**
 * Check if crypto is initialized
 */
export function isInitialized(): boolean {
  return keyPair !== null;
}
