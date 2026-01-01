/**
 * Passkey Core Utilities
 *
 * Provides WebAuthn-based passkey authentication for wallet access.
 * Uses biometrics (Face ID, Touch ID, Windows Hello) for secure authentication.
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

// ============================================
// Configuration
// ============================================

/** Storage key for passkey wallet state */
const PASSKEY_WALLET_KEY = 'nasun:passkey:wallet';

/** Default Relying Party ID (domain) */
const DEFAULT_RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

/** Default Relying Party name */
const DEFAULT_RP_NAME = 'Nasun Wallet';

// ============================================
// Base64URL Utilities
// ============================================

function base64urlEncode(buffer: ArrayBuffer | Uint8Array): string {
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
  // Create a new ArrayBuffer and copy the data to ensure correct type
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

function generateUserId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ============================================
// Passkey Registration
// ============================================

/**
 * Register a new passkey credential
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
  const userIdBuffer = base64urlDecode(userId) ?? generateUserId();

  // Prepare exclude list
  const excludeList: PublicKeyCredentialDescriptor[] = excludeCredentials.map((id) => ({
    type: 'public-key',
    id: toArrayBuffer(base64urlDecode(id)),
  }));

  // Create credential options
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

    // Build credential object
    const passkeyCredential: PasskeyCredential = {
      id: base64urlEncode(credential.rawId),
      rawId: new Uint8Array(credential.rawId),
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
 * Authenticate with a passkey
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

  // Create get options
  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: toArrayBuffer(challengeBuffer),
      rpId,
      userVerification,
      timeout,
      allowCredentials: allowList.length > 0 ? allowList : undefined,
    },
  };

  try {
    const credential = (await navigator.credentials.get(getOptions)) as PublicKeyCredential | null;

    if (!credential) {
      throw new PasskeyError('AUTHENTICATION_FAILED', 'Failed to get credential');
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      credentialId: base64urlEncode(credential.rawId),
      signature: base64urlEncode(response.signature),
      authenticatorData: base64urlEncode(response.authenticatorData),
      clientDataJSON: base64urlEncode(response.clientDataJSON),
      userHandle: response.userHandle ? base64urlEncode(response.userHandle) : undefined,
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

/**
 * Derive encryption key from passkey authentication
 * Uses the authenticator data and signature as key material
 */
async function deriveKeyFromPasskey(authResult: PasskeyAuthenticationResult): Promise<CryptoKey> {
  // Combine authenticator data and signature as key material
  const authData = base64urlDecode(authResult.authenticatorData);
  const signature = base64urlDecode(authResult.signature);

  const keyMaterial = new Uint8Array(authData.length + signature.length);
  keyMaterial.set(authData);
  keyMaterial.set(signature, authData.length);

  // Import as raw key material
  const baseKey = await crypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveKey']);

  // Derive AES-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // Will be overridden with stored salt
      info: new TextEncoder().encode('nasun-passkey-wallet'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Create a new wallet protected by passkey
 */
export async function createPasskeyWallet(
  credential: PasskeyCredential,
  authResult: PasskeyAuthenticationResult
): Promise<{ wallet: PasskeyWalletState; keypair: Ed25519Keypair }> {
  // Generate new Sui keypair
  const keypair = new Ed25519Keypair();
  const secretKey = keypair.getSecretKey(); // Bech32 encoded string
  const address = keypair.toSuiAddress();

  // Generate salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from passkey authentication
  const encryptionKey = await deriveKeyFromPasskey(authResult);

  // Encrypt private key (encode string to bytes)
  const privateKeyBytes = new TextEncoder().encode(secretKey);
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    encryptionKey,
    toArrayBuffer(privateKeyBytes)
  );

  const walletState: PasskeyWalletState = {
    address,
    primaryCredentialId: credential.id,
    credentials: [credential],
    encryptedPrivateKey: base64urlEncode(encryptedData),
    iv: base64urlEncode(iv),
    salt: base64urlEncode(salt),
    createdAt: Date.now(),
  };

  // Save to storage
  savePasskeyWallet(walletState);

  return { wallet: walletState, keypair };
}

/**
 * Unlock wallet with passkey authentication
 */
export async function unlockPasskeyWallet(
  wallet: PasskeyWalletState,
  authResult: PasskeyAuthenticationResult
): Promise<Ed25519Keypair> {
  try {
    // Derive decryption key
    const decryptionKey = await deriveKeyFromPasskey(authResult);

    // Decrypt private key
    const iv = base64urlDecode(wallet.iv);
    const encryptedData = base64urlDecode(wallet.encryptedPrivateKey);

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      decryptionKey,
      toArrayBuffer(encryptedData)
    );

    // Reconstruct keypair from decrypted secret key string
    const secretKey = new TextDecoder().decode(decryptedData);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new PasskeyError(
      'DECRYPTION_FAILED',
      'Failed to decrypt wallet. Please try authenticating again.'
    );
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
    return JSON.parse(stored) as PasskeyWalletState;
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
 * Remove a credential from wallet
 */
export function removeCredentialFromWallet(
  wallet: PasskeyWalletState,
  credentialId: string
): PasskeyWalletState {
  if (wallet.credentials.length <= 1) {
    throw new PasskeyError('INVALID_STATE', 'Cannot remove the last credential');
  }

  const updated = {
    ...wallet,
    credentials: wallet.credentials.filter((c) => c.id !== credentialId),
  };

  // Update primary if removed
  if (wallet.primaryCredentialId === credentialId) {
    updated.primaryCredentialId = updated.credentials[0].id;
  }

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
