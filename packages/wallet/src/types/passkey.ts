/**
 * Passkey Types for WebAuthn Authentication
 *
 * Passkeys enable passwordless authentication using biometrics
 * (Face ID, Touch ID, Windows Hello) based on FIDO2/WebAuthn standard.
 */

/**
 * Passkey credential stored after registration
 */
export interface PasskeyCredential {
  /** Credential ID (base64url encoded) */
  id: string;
  /** Raw credential ID bytes */
  rawId: Uint8Array;
  /** Public key (base64url encoded) */
  publicKey: string;
  /** Signature algorithm used (-7 for ES256, -257 for RS256) */
  algorithm: number;
  /** Authenticator type */
  authenticatorType: 'platform' | 'cross-platform';
  /** Whether the credential is discoverable (resident key) */
  discoverable: boolean;
  /** User verification requirement */
  userVerification: 'required' | 'preferred' | 'discouraged';
  /** Timestamp when created */
  createdAt: number;
  /** Human-readable name for the credential */
  name: string;
  /** Last used timestamp */
  lastUsedAt?: number;
}

/**
 * Passkey registration options
 */
export interface PasskeyRegistrationOptions {
  /** User ID (for WebAuthn user.id) */
  userId: string;
  /** User display name */
  userName: string;
  /** Optional credential name */
  credentialName?: string;
  /** Relying Party ID (domain) */
  rpId?: string;
  /** Relying Party name */
  rpName?: string;
  /** Challenge from server (base64url) or auto-generated */
  challenge?: string;
  /** Authenticator attachment preference */
  authenticatorAttachment?: 'platform' | 'cross-platform';
  /** Resident key requirement */
  residentKey?: 'required' | 'preferred' | 'discouraged';
  /** User verification requirement */
  userVerification?: 'required' | 'preferred' | 'discouraged';
  /** Timeout in milliseconds */
  timeout?: number;
  /** Exclude existing credentials */
  excludeCredentials?: string[];
}

/**
 * Passkey authentication options
 */
export interface PasskeyAuthenticationOptions {
  /** Challenge from server (base64url) or auto-generated */
  challenge?: string;
  /** Allowed credential IDs (empty for discoverable credentials) */
  allowCredentials?: string[];
  /** User verification requirement */
  userVerification?: 'required' | 'preferred' | 'discouraged';
  /** Relying Party ID (domain) */
  rpId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Result from passkey registration
 */
export interface PasskeyRegistrationResult {
  /** The created credential */
  credential: PasskeyCredential;
  /** Attestation object (for server verification if needed) */
  attestationObject?: string;
  /** Client data JSON (for server verification if needed) */
  clientDataJSON?: string;
}

/**
 * Result from passkey authentication
 */
export interface PasskeyAuthenticationResult {
  /** Credential ID used */
  credentialId: string;
  /** Signature (base64url) */
  signature: string;
  /** Authenticator data (base64url) */
  authenticatorData: string;
  /** Client data JSON (base64url) */
  clientDataJSON: string;
  /** User handle (base64url, if available) */
  userHandle?: string;
}

/**
 * Passkey wallet state
 */
export interface PasskeyWalletState {
  /** Associated Sui address */
  address: string;
  /** Primary credential used */
  primaryCredentialId: string;
  /** All registered credentials for this wallet */
  credentials: PasskeyCredential[];
  /** Encrypted private key (AES-GCM, key derived from credential) */
  encryptedPrivateKey: string;
  /** Initialization vector for encryption */
  iv: string;
  /** Salt for key derivation */
  salt: string;
  /** Timestamp when created */
  createdAt: number;
}

/**
 * Error types specific to Passkey operations
 */
export type PasskeyErrorType =
  | 'NOT_SUPPORTED'
  | 'REGISTRATION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'INVALID_STATE'
  | 'SECURITY_ERROR'
  | 'CREDENTIAL_NOT_FOUND'
  | 'DECRYPTION_FAILED';

/**
 * Passkey specific error
 */
export class PasskeyError extends Error {
  type: PasskeyErrorType;

  constructor(type: PasskeyErrorType, message: string) {
    super(message);
    this.type = type;
    this.name = 'PasskeyError';
  }
}

/**
 * Check if WebAuthn is supported in the current environment
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

/**
 * Check if platform authenticator (Face ID, Touch ID, etc.) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
