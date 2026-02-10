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
 * RSA Key pair for encryption/decryption.
 * Private key is stored as a KeyObject (OpenSSL-managed, outside V8 heap)
 * for more reliable memory cleanup on destruction.
 */
interface EnclaveKeyPair {
  publicKey: string; // PEM format (shareable)
  privateKeyObj: crypto.KeyObject; // Opaque handle — not a JS string
}

// ========== Crypto Constants ==========
const AES_KEY_LEN = 32;   // AES-256 key size in bytes
const IV_LEN = 12;         // GCM initialization vector size in bytes
const ENVELOPE_LEN = AES_KEY_LEN + IV_LEN; // RSA-decrypted envelope: key + IV
const AUTH_TAG_LEN = 16;   // GCM authentication tag size in bytes

// Singleton key pair - generated once on Enclave startup
let keyPair: EnclaveKeyPair | null = null;

// When true, always require hybrid RSA+AES encryption (Nitro TEE mode).
// When false, fall back to Base64 plaintext if decryption fails (simulation/non-TEE mode).
let requireEncryption = true;

/**
 * Configure whether hybrid encryption is mandatory.
 * Set to false for non-TEE (simulation) mode to accept plaintext prompts from SDK.
 */
export function setRequireEncryption(required: boolean): void {
  requireEncryption = required;
  console.log(`[Enclave/Crypto] Encryption requirement: ${required ? 'mandatory (Nitro)' : 'optional (simulation)'}`);
}

/**
 * Initialize the Enclave crypto module
 * Generates a new RSA keypair
 *
 * @returns Base64-encoded public key in SPKI format
 */
export async function initializeCrypto(): Promise<string> {
  console.log('[Enclave/Crypto] Generating RSA keypair...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Store private key as KeyObject (OpenSSL-managed, outside V8 heap)
  const privateKeyObj = crypto.createPrivateKey(privateKey);
  keyPair = { publicKey, privateKeyObj };

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
 * Result of hybrid decryption, including the AES key for response encryption.
 */
export interface DecryptResult {
  plaintext: string;
  aesKey: Buffer; // AES-256 key extracted from envelope, for response encryption
}

/**
 * Decrypt hybrid-encrypted data (RSA-OAEP + AES-256-GCM).
 *
 * Format: Base64( RSA_ciphertext(256B) || AES_GCM_ciphertext )
 *
 * 1. RSA-OAEP decrypts the first 256 bytes → AES key (32B) + IV (12B)
 * 2. AES-256-GCM decrypts the remaining bytes (includes 16B auth tag)
 *
 * Returns both the plaintext and the AES key (for E2E response encryption).
 *
 * @param encryptedBase64 - Base64-encoded hybrid-encrypted data
 * @returns DecryptResult with plaintext and AES key
 */
export function decrypt(encryptedBase64: string): DecryptResult {
  if (!keyPair) {
    throw new Error('Crypto not initialized');
  }

  try {
    const combined = Buffer.from(encryptedBase64, 'base64');

    // RSA-3072 produces 384-byte ciphertext (3072 / 8)
    const RSA_CIPHERTEXT_LEN = 384;

    if (combined.length <= RSA_CIPHERTEXT_LEN) {
      throw new Error(`Encrypted data too short: ${combined.length} bytes`);
    }

    // 1. Split: RSA envelope || AES ciphertext (rest)
    const rsaCiphertext = combined.subarray(0, RSA_CIPHERTEXT_LEN);
    const aesCiphertextWithTag = combined.subarray(RSA_CIPHERTEXT_LEN);

    // 2. RSA-OAEP decrypt the envelope → aesKey + iv
    const envelope = crypto.privateDecrypt(
      {
        key: keyPair.privateKeyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      rsaCiphertext
    );

    if (envelope.length !== ENVELOPE_LEN) {
      throw new Error(`Unexpected envelope size: ${envelope.length} (expected ${ENVELOPE_LEN})`);
    }

    const aesKey = envelope.subarray(0, AES_KEY_LEN);
    const iv = envelope.subarray(AES_KEY_LEN, ENVELOPE_LEN);

    // 3. AES-256-GCM decrypt (last AUTH_TAG_LEN bytes are the auth tag)
    const ciphertextOnly = aesCiphertextWithTag.subarray(0, aesCiphertextWithTag.length - AUTH_TAG_LEN);
    const authTag = aesCiphertextWithTag.subarray(aesCiphertextWithTag.length - AUTH_TAG_LEN);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextOnly),
      decipher.final(),
    ]);

    return { plaintext: decrypted.toString('utf-8'), aesKey };
  } catch (error) {
    if (requireEncryption) {
      // Nitro TEE mode: always require hybrid encryption. No exceptions.
      console.error('[Enclave/Crypto] Decryption failed (encryption required)');
      throw new Error('Decryption failed - invalid encrypted data or wrong key');
    }

    // Simulation mode: fall back to Base64 plaintext for non-TEE executors.
    // This is safe because there is no TEE boundary to protect.
    try {
      const plaintext = Buffer.from(encryptedBase64, 'base64').toString('utf-8');
      console.warn('[Enclave/Crypto] Hybrid decryption failed, using Base64 plaintext fallback (non-TEE mode)');
      return { plaintext, aesKey: Buffer.alloc(0) };
    } catch {
      console.error('[Enclave/Crypto] Both hybrid decryption and Base64 fallback failed');
      throw new Error('Decryption failed - invalid encrypted data');
    }
  }
}

/**
 * Encrypt response using AES-256-GCM with the key extracted from prompt decryption.
 *
 * Format: Base64( IV(12B) || AES_GCM_ciphertext || AuthTag(16B) )
 *
 * No RSA envelope needed — both Frontend and Enclave already share the AES key.
 *
 * @param plaintext - Response text to encrypt
 * @param aesKey - AES-256 key from prompt decryption (32 bytes)
 * @returns Base64-encoded encrypted response
 */
export function encryptResponse(plaintext: string, aesKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN); // Fresh IV (never reuse)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16B

  // IV || ciphertext || authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
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
    // KeyObject stores key material in OpenSSL (outside V8 heap).
    // Dereferencing allows the C++ destructor to securely clear memory.
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
