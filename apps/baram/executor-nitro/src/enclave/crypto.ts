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
 * Decrypt data encrypted with our public key
 *
 * @param encryptedBase64 - Base64-encoded RSA-OAEP encrypted data
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedBase64: string): string {
  if (!keyPair) {
    throw new Error('Crypto not initialized');
  }

  try {
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

    const decrypted = crypto.privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedBuffer
    );

    return decrypted.toString('utf-8');
  } catch (error) {
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
