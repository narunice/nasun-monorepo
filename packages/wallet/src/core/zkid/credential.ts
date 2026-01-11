/**
 * ZK-ID Credential Management
 *
 * Handles encrypted credential storage and lifecycle.
 * Credentials are encrypted using AES-256-GCM before storage.
 *
 * SECURITY:
 * - Credentials never stored in plaintext
 * - Encryption key derived from user password/session
 * - Automatic expiration checking
 */

import {
  type CredentialSource,
  type ZKClaimType,
  ZKIDError,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Raw credential data before encryption
 */
export interface RawCredential {
  /** Credential type */
  type: ZKClaimType;
  /** Data source */
  source: CredentialSource;
  /** Credential secret (for nullifier derivation) */
  secret: string;
  /** Source-specific data */
  data: CredentialData;
  /** Issuance timestamp */
  issuedAt: number;
  /** Expiration timestamp */
  expiresAt: number;
}

/** Source-specific credential data */
export type CredentialData =
  | { source: 'government-id'; birthDate: string; country: string }
  | { source: 'oauth'; provider: string; sub: string; email?: string }
  | { source: 'kyc-provider'; providerId: string; level: string; verifiedAt: number }
  | { source: 'self-attested'; attestation: string };

/**
 * Encrypted credential for storage
 */
export interface EncryptedCredential {
  /** Credential type */
  type: ZKClaimType;
  /** Encrypted payload (base64) */
  encryptedPayload: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Salt for key derivation (base64) */
  salt: string;
  /** Encryption timestamp */
  encryptedAt: number;
  /** Original expiration (for quick check without decryption) */
  expiresAt: number;
}

/**
 * Credential storage entry
 */
export interface CredentialEntry {
  id: string;
  credential: EncryptedCredential;
  createdAt: number;
  lastUsedAt: number;
}

// ============================================
// Encryption Utilities
// ============================================

/** Key derivation parameters */
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derive encryption key from password
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt credential data
 */
export async function encryptCredential(
  credential: RawCredential,
  password: string
): Promise<EncryptedCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(credential));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    type: credential.type,
    encryptedPayload: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
    encryptedAt: Date.now(),
    expiresAt: credential.expiresAt,
  };
}

/**
 * Decrypt credential data
 */
export async function decryptCredential(
  encrypted: EncryptedCredential,
  password: string
): Promise<RawCredential> {
  try {
    const salt = Uint8Array.from(atob(encrypted.salt), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encrypted.encryptedPayload), (c) =>
      c.charCodeAt(0)
    );

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted)) as RawCredential;
  } catch {
    throw new ZKIDError(
      'CREDENTIAL_INVALID',
      'Failed to decrypt credential. Wrong password or corrupted data.'
    );
  }
}

// ============================================
// Credential Validation
// ============================================

/**
 * Check if credential is expired
 */
export function isCredentialExpired(credential: EncryptedCredential): boolean {
  return credential.expiresAt < Date.now();
}

/**
 * Get credential remaining validity in milliseconds
 */
export function getCredentialRemainingTime(
  credential: EncryptedCredential
): number {
  return Math.max(0, credential.expiresAt - Date.now());
}

/**
 * Validate raw credential structure
 */
export function validateRawCredential(credential: RawCredential): boolean {
  if (!credential.type || !credential.source || !credential.secret) {
    return false;
  }

  if (typeof credential.issuedAt !== 'number' || credential.issuedAt <= 0) {
    return false;
  }

  if (
    typeof credential.expiresAt !== 'number' ||
    credential.expiresAt <= credential.issuedAt
  ) {
    return false;
  }

  return true;
}

// ============================================
// Credential Storage (localStorage)
// ============================================

const CREDENTIAL_STORAGE_KEY = 'nasun:zkid:credentials';

/**
 * Get all stored credentials
 */
export function getStoredCredentials(): CredentialEntry[] {
  try {
    const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as CredentialEntry[];
  } catch {
    return [];
  }
}

/**
 * Store a credential
 */
export function storeCredential(
  id: string,
  credential: EncryptedCredential
): void {
  const entries = getStoredCredentials();
  const now = Date.now();

  // Remove existing entry with same ID
  const filtered = entries.filter((e) => e.id !== id);

  // Add new entry
  filtered.push({
    id,
    credential,
    createdAt: now,
    lastUsedAt: now,
  });

  localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Get a specific credential by ID
 */
export function getCredentialById(id: string): CredentialEntry | null {
  const entries = getStoredCredentials();
  return entries.find((e) => e.id === id) || null;
}

/**
 * Get credentials by type
 */
export function getCredentialsByType(type: ZKClaimType): CredentialEntry[] {
  return getStoredCredentials().filter((e) => e.credential.type === type);
}

/**
 * Update last used timestamp
 */
export function updateCredentialLastUsed(id: string): void {
  const entries = getStoredCredentials();
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.lastUsedAt = Date.now();
    localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(entries));
  }
}

/**
 * Remove a credential
 */
export function removeCredential(id: string): void {
  const entries = getStoredCredentials().filter((e) => e.id !== id);
  localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Remove expired credentials
 */
export function removeExpiredCredentials(): number {
  const entries = getStoredCredentials();
  const valid = entries.filter((e) => !isCredentialExpired(e.credential));
  const removed = entries.length - valid.length;

  if (removed > 0) {
    localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(valid));
  }

  return removed;
}

/**
 * Clear all credentials
 */
export function clearAllCredentials(): void {
  localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
}

// ============================================
// Credential ID Generation
// ============================================

/**
 * Generate unique credential ID
 */
export function generateCredentialId(
  type: ZKClaimType,
  source: CredentialSource
): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}_${source}_${timestamp}_${random}`;
}
