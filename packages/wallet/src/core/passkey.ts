/**
 * Passkey Core Utilities
 *
 * Provides WebAuthn-based passkey authentication for wallet access.
 * Uses biometrics (Face ID, Touch ID, Windows Hello) for secure authentication.
 *
 * Security model:
 * - When PRF extension is available: authenticator-derived secret is used as
 *   key material, providing true cryptographic protection via biometrics.
 * - When PRF is unavailable: credential ID (public value) is used as fallback.
 *   In this mode, biometric auth is a convenience gate, not a security boundary.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type {
  PasskeyCredential,
  PasskeyRegistrationOptions,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResult,
  PasskeyAuthenticationResult,
  PasskeyWalletState,
} from '../types/passkey';
import { PasskeyError, isWebAuthnSupported } from '../types/passkey';
import { generateMnemonicPhrase, keypairFromMnemonic, secureZero, secureZeroString } from './crypto';

// ============================================
// Configuration
// ============================================

/** Storage key for passkey wallet state */
const PASSKEY_WALLET_KEY = 'nasun:passkey:wallet';

/** Default Relying Party ID (domain) */
const DEFAULT_RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

/** Default Relying Party name */
const DEFAULT_RP_NAME = 'Nasun Wallet';

/** Stable salt for PRF extension evaluation (not a secret — used as PRF input) */
const PRF_EVAL_SALT = new TextEncoder().encode('nasun-wallet-prf-v1');

// ============================================
// Base64URL Utilities
// ============================================

export function base64urlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to ArrayBuffer for WebAuthn API compatibility
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

// ============================================
// Random Generation
// ============================================

function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ============================================
// Passkey Registration
// ============================================

/**
 * Register a new passkey credential.
 * Attempts to use PRF extension for secure key derivation.
 */
export async function registerPasskey(
  options: PasskeyRegistrationOptions
): Promise<PasskeyRegistrationResult> {
  if (!isWebAuthnSupported()) {
    throw new PasskeyError('NOT_SUPPORTED', 'WebAuthn is not supported in this browser');
  }

  const {
    userId,
    userName,
    credentialName = `Passkey ${new Date().toLocaleDateString()}`,
    rpId = DEFAULT_RP_ID,
    rpName = DEFAULT_RP_NAME,
    challenge,
    authenticatorAttachment = 'platform',
    residentKey = 'preferred',
    userVerification = 'required',
    timeout = 60000,
    excludeCredentials = [],
  } = options;

  // Prepare challenge
  const challengeBuffer = challenge ? base64urlDecode(challenge) : generateChallenge();

  // Prepare user ID
  const userIdBuffer = base64urlDecode(userId);

  // Prepare exclude list
  const excludeList: PublicKeyCredentialDescriptor[] = excludeCredentials.map((id) => ({
    type: 'public-key',
    id: toArrayBuffer(base64urlDecode(id)),
  }));

  // Create credential options with PRF extension
  const createOptions: CredentialCreationOptions = {
    publicKey: {
      rp: {
        id: rpId,
        name: rpName,
      },
      user: {
        id: toArrayBuffer(userIdBuffer),
        name: userName,
        displayName: userName,
      },
      challenge: toArrayBuffer(challengeBuffer),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256 (ECDSA with P-256)
        { type: 'public-key', alg: -257 }, // RS256 (RSA with SHA-256)
      ],
      authenticatorSelection: {
        authenticatorAttachment,
        residentKey,
        userVerification,
        requireResidentKey: residentKey === 'required',
      },
      timeout,
      excludeCredentials: excludeList,
      attestation: 'none', // No attestation needed for client-side wallet
      extensions: {
        prf: {},
      },
    },
  };

  try {
    const credential = (await navigator.credentials.create(
      createOptions
    )) as PublicKeyCredential | null;

    if (!credential) {
      throw new PasskeyError('REGISTRATION_FAILED', 'Failed to create credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Extract public key from attestation
    const publicKeyBuffer = response.getPublicKey?.();
    if (!publicKeyBuffer) {
      throw new PasskeyError('REGISTRATION_FAILED', 'Failed to get public key');
    }

    // Determine algorithm from COSE key
    const algorithm = response.getPublicKeyAlgorithm?.() ?? -7;

    // Check PRF extension support from registration response
    const clientExtensions = credential.getClientExtensionResults() as Record<string, unknown>;
    const prfExtension = clientExtensions?.prf as { enabled?: boolean } | undefined;
    const prfSupported = prfExtension?.enabled === true;

    // Build credential object (rawId omitted — use base64url `id` instead)
    const passkeyCredential: PasskeyCredential = {
      id: base64urlEncode(credential.rawId),
      publicKey: base64urlEncode(publicKeyBuffer),
      algorithm,
      authenticatorType: authenticatorAttachment,
      discoverable: residentKey !== 'discouraged',
      userVerification,
      createdAt: Date.now(),
      name: credentialName,
    };

    return {
      credential: passkeyCredential,
      attestationObject: base64urlEncode(response.attestationObject),
      clientDataJSON: base64urlEncode(response.clientDataJSON),
      prfSupported,
    };
  } catch (error) {
    if (error instanceof PasskeyError) throw error;

    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new PasskeyError('CANCELLED', 'User cancelled passkey registration');
      }
      if (error.name === 'SecurityError') {
        throw new PasskeyError('SECURITY_ERROR', 'Security error during registration');
      }
      if (error.name === 'InvalidStateError') {
        throw new PasskeyError('INVALID_STATE', 'Credential already exists');
      }
    }

    throw new PasskeyError(
      'REGISTRATION_FAILED',
      error instanceof Error ? error.message : 'Unknown error during registration'
    );
  }
}

// ============================================
// Passkey Authentication
// ============================================

/**
 * Authenticate with a passkey.
 * Requests PRF extension output for secure key derivation when available.
 */
export async function authenticateWithPasskey(
  options: PasskeyAuthenticationOptions = {}
): Promise<PasskeyAuthenticationResult> {
  if (!isWebAuthnSupported()) {
    throw new PasskeyError('NOT_SUPPORTED', 'WebAuthn is not supported in this browser');
  }

  const {
    challenge,
    allowCredentials = [],
    userVerification = 'required',
    rpId = DEFAULT_RP_ID,
    timeout = 60000,
  } = options;

  // Prepare challenge
  const challengeBuffer = challenge ? base64urlDecode(challenge) : generateChallenge();

  // Prepare allow list
  const allowList: PublicKeyCredentialDescriptor[] = allowCredentials.map((id) => ({
    type: 'public-key',
    id: toArrayBuffer(base64urlDecode(id)),
  }));

  // Create get options with PRF extension
  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: toArrayBuffer(challengeBuffer),
      rpId,
      userVerification,
      timeout,
      allowCredentials: allowList.length > 0 ? allowList : undefined,
      extensions: {
        prf: {
          eval: {
            first: toArrayBuffer(PRF_EVAL_SALT),
          },
        },
      },
    },
  };

  try {
    const credential = (await navigator.credentials.get(getOptions)) as PublicKeyCredential | null;

    if (!credential) {
      throw new PasskeyError('AUTHENTICATION_FAILED', 'Failed to get credential');
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    // Extract PRF output if available
    const clientExtensions = credential.getClientExtensionResults() as Record<string, unknown>;
    const prfExtension = clientExtensions?.prf as {
      results?: { first?: ArrayBuffer };
    } | undefined;
    const prfOutput = prfExtension?.results?.first ?? undefined;

    return {
      credentialId: base64urlEncode(credential.rawId),
      signature: base64urlEncode(response.signature),
      authenticatorData: base64urlEncode(response.authenticatorData),
      clientDataJSON: base64urlEncode(response.clientDataJSON),
      userHandle: response.userHandle ? base64urlEncode(response.userHandle) : undefined,
      prfOutput,
    };
  } catch (error) {
    if (error instanceof PasskeyError) throw error;

    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new PasskeyError('CANCELLED', 'User cancelled passkey authentication');
      }
      if (error.name === 'SecurityError') {
        throw new PasskeyError('SECURITY_ERROR', 'Security error during authentication');
      }
    }

    throw new PasskeyError(
      'AUTHENTICATION_FAILED',
      error instanceof Error ? error.message : 'Unknown error during authentication'
    );
  }
}

// ============================================
// Wallet Key Encryption with Passkey
// ============================================

/** PBKDF2 iterations for key derivation */
const PASSKEY_PBKDF2_ITERATIONS = 100000;

/**
 * Derive encryption key from PRF extension output (authenticator secret).
 *
 * PRF output is a 32-byte secret derived by the authenticator from its
 * internal key material. This provides true cryptographic protection —
 * the secret never leaves the authenticator and cannot be extracted from
 * localStorage.
 */
async function deriveKeyFromPRF(
  prfOutput: ArrayBuffer,
  storedSalt: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(storedSalt),
      iterations: PASSKEY_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive encryption key from credential ID and stored salt (fallback).
 *
 * WARNING: The credential ID is a public value stored in localStorage.
 * This method is a convenience fallback when the PRF extension is not
 * supported. Biometric authentication in this mode is a UI-level gate,
 * not a cryptographic protection boundary.
 */
async function deriveKeyFromCredential(
  credentialId: string,
  storedSalt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = new TextEncoder().encode(credentialId);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(storedSalt),
      iterations: PASSKEY_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Create a new wallet protected by passkey.
 * Generates a BIP39 mnemonic and derives the keypair from it.
 * The mnemonic is returned once for backup — it is NOT stored.
 *
 * @param credential - The registered passkey credential
 * @param prfOutput - PRF extension output (if authenticator supports it)
 */
export async function createPasskeyWallet(
  credential: PasskeyCredential,
  prfOutput?: ArrayBuffer
): Promise<{ wallet: PasskeyWalletState; keypair: Ed25519Keypair; mnemonic: string }> {
  // Generate mnemonic and derive keypair
  const mnemonic = generateMnemonicPhrase();
  const keypair = keypairFromMnemonic(mnemonic);
  let secretKey: string | null = null;

  try {
    secretKey = keypair.getSecretKey();
    const address = keypair.toSuiAddress();

    // Generate salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive encryption key — PRF (authenticator secret) or credential ID (fallback)
    const keyDerivationMethod = prfOutput ? 'prf' : 'credential-id' as const;
    const encryptionKey = prfOutput
      ? await deriveKeyFromPRF(prfOutput, salt)
      : await deriveKeyFromCredential(credential.id, salt);

    // Encrypt private key
    const privateKeyBytes = new TextEncoder().encode(secretKey);
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      encryptionKey,
      toArrayBuffer(privateKeyBytes)
    );

    // Zero intermediate buffer immediately after encryption
    secureZero(privateKeyBytes);

    const walletState: PasskeyWalletState = {
      address,
      primaryCredentialId: credential.id,
      credentials: [credential],
      encryptedPrivateKey: base64urlEncode(encryptedData),
      iv: base64urlEncode(iv),
      salt: base64urlEncode(salt),
      keyDerivationMethod,
      createdAt: Date.now(),
    };

    // Save to storage
    savePasskeyWallet(walletState);

    return { wallet: walletState, keypair, mnemonic };
  } finally {
    // Clear sensitive data from memory (best effort — JS strings are immutable)
    if (secretKey) secureZeroString(secretKey);
    if (prfOutput) secureZero(new Uint8Array(prfOutput));
  }
}

/**
 * Unlock wallet using passkey credential.
 * Passkey authentication (biometric check) must be performed before calling this.
 *
 * @param wallet - The stored wallet state
 * @param prfOutput - PRF extension output from authentication (required for PRF wallets)
 */
export async function unlockPasskeyWallet(
  wallet: PasskeyWalletState,
  prfOutput?: ArrayBuffer
): Promise<Ed25519Keypair> {
  let secretKey: string | null = null;
  let decryptedBuffer: Uint8Array | null = null;

  try {
    const salt = base64urlDecode(wallet.salt);

    // Derive decryption key based on wallet's key derivation method
    let decryptionKey: CryptoKey;
    if (wallet.keyDerivationMethod === 'prf') {
      if (!prfOutput) {
        throw new PasskeyError(
          'DECRYPTION_FAILED',
          'PRF output required for this wallet but authenticator did not provide it'
        );
      }
      decryptionKey = await deriveKeyFromPRF(prfOutput, salt);
    } else {
      decryptionKey = await deriveKeyFromCredential(wallet.primaryCredentialId, salt);
    }

    const iv = base64urlDecode(wallet.iv);
    const encryptedData = base64urlDecode(wallet.encryptedPrivateKey);

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      decryptionKey,
      toArrayBuffer(encryptedData)
    );

    decryptedBuffer = new Uint8Array(decryptedData);
    secretKey = new TextDecoder().decode(decryptedData);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);

    return keypair;
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw new PasskeyError(
      'DECRYPTION_FAILED',
      `Failed to decrypt wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    // Clear sensitive data from memory
    if (decryptedBuffer) secureZero(decryptedBuffer);
    if (secretKey) secureZeroString(secretKey);
    if (prfOutput) secureZero(new Uint8Array(prfOutput));
  }
}

// ============================================
// Storage Management
// ============================================

/**
 * Get saved passkey wallet from localStorage
 */
export function getPasskeyWallet(): PasskeyWalletState | null {
  const stored = localStorage.getItem(PASSKEY_WALLET_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as PasskeyWalletState;
    // Migrate legacy wallets without keyDerivationMethod
    if (!parsed.keyDerivationMethod) {
      parsed.keyDerivationMethod = 'credential-id';
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save passkey wallet to localStorage
 */
export function savePasskeyWallet(wallet: PasskeyWalletState): void {
  localStorage.setItem(PASSKEY_WALLET_KEY, JSON.stringify(wallet));
}

/**
 * Clear passkey wallet from localStorage
 */
export function clearPasskeyWallet(): void {
  localStorage.removeItem(PASSKEY_WALLET_KEY);
}

/**
 * Add a new credential to an existing wallet
 */
export function addCredentialToWallet(
  wallet: PasskeyWalletState,
  credential: PasskeyCredential
): PasskeyWalletState {
  const updated = {
    ...wallet,
    credentials: [...wallet.credentials, credential],
  };
  savePasskeyWallet(updated);
  return updated;
}

/**
 * Remove a credential from wallet.
 * Cannot remove the primary credential (it is used for key derivation).
 * Cannot remove the last credential.
 */
export function removeCredentialFromWallet(
  wallet: PasskeyWalletState,
  credentialId: string
): PasskeyWalletState {
  if (wallet.credentials.length <= 1) {
    throw new PasskeyError('INVALID_STATE', 'Cannot remove the last credential');
  }

  if (wallet.primaryCredentialId === credentialId) {
    throw new PasskeyError(
      'INVALID_STATE',
      'Cannot remove primary credential. Delete the wallet instead.'
    );
  }

  const updated = {
    ...wallet,
    credentials: wallet.credentials.filter((c) => c.id !== credentialId),
  };

  savePasskeyWallet(updated);
  return updated;
}

/**
 * Update credential's last used timestamp
 */
export function updateCredentialLastUsed(
  wallet: PasskeyWalletState,
  credentialId: string
): PasskeyWalletState {
  const updated = {
    ...wallet,
    credentials: wallet.credentials.map((c) =>
      c.id === credentialId ? { ...c, lastUsedAt: Date.now() } : c
    ),
  };
  savePasskeyWallet(updated);
  return updated;
}
