/**
 * zkLogin Core Utilities
 *
 * Provides functions for Sui zkLogin authentication:
 * - Ephemeral keypair generation
 * - Nonce generation for OAuth
 * - Salt fetching from backend
 * - ZK proof generation
 * - Address derivation
 * - Transaction signing
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
  getZkLoginSignature,
  genAddressSeed,
} from '@mysten/sui/zklogin';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyResult } from 'jose';
import { getSuiClient } from '../sui/client';
import type {
  ZkLoginProvider,
  ZkLoginSession,
  ZkLoginState,
  ZkLoginProof,
  SaltResponse,
  ProverResponse,
  ZkLoginConfig,
} from '../types/zklogin';
import { ZkLoginError } from '../types/zklogin';

// ============================================
// Configuration
// ============================================

/** Default prover URL (Mysten Labs development prover) */
const DEFAULT_PROVER_URL = 'https://prover-dev.mystenlabs.com/v1';

/** Session storage key for zkLogin session */
const ZKLOGIN_SESSION_KEY = 'nasun:zklogin:session';

/** Session storage key for zkLogin state */
const ZKLOGIN_STATE_KEY = 'nasun:zklogin:state';

/** Session storage key for OAuth CSRF state */
const OAUTH_CSRF_STATE_KEY = 'nasun:zklogin:oauth_csrf_state';

/** zkLogin configuration (set via configureZkLogin) */
let zkLoginConfig: ZkLoginConfig | null = null;

/**
 * Configure zkLogin with salt API and OAuth providers
 */
export function configureZkLogin(config: ZkLoginConfig): void {
  zkLoginConfig = config;
}

/**
 * Get current zkLogin configuration
 */
export function getZkLoginConfig(): ZkLoginConfig | null {
  return zkLoginConfig;
}

// ============================================
// Session Management
// ============================================

/**
 * Create a new zkLogin session (Step 1)
 * Generates ephemeral keypair and nonce for OAuth
 */
export async function createZkLoginSession(): Promise<ZkLoginSession> {
  console.log('[zkLogin] Creating session...');
  const client = getSuiClient();

  // 1. Get current epoch
  const { epoch } = await client.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 10; // Valid for ~10 epochs (~1-2 days)
  console.log('[zkLogin] Current epoch:', epoch, 'Max epoch:', maxEpoch);

  // 2. Generate ephemeral keypair
  const ephemeralKeyPair = new Ed25519Keypair();

  // 3. Generate randomness and nonce
  const randomness = generateRandomness();
  const nonce = generateNonce(
    ephemeralKeyPair.getPublicKey(),
    maxEpoch,
    randomness
  );
  console.log('[zkLogin] Nonce generated:', nonce.substring(0, 20) + '...');

  // 4. Create session object
  const session: ZkLoginSession = {
    ephemeralPrivateKey: ephemeralKeyPair.getSecretKey(),
    randomness,
    maxEpoch,
    nonce,
    createdAt: Date.now(),
  };

  // 5. Save to sessionStorage (survives OAuth redirect)
  sessionStorage.setItem(ZKLOGIN_SESSION_KEY, JSON.stringify(session));
  console.log('[zkLogin] Session saved to sessionStorage');

  // Verify it was saved
  const saved = sessionStorage.getItem(ZKLOGIN_SESSION_KEY);
  console.log('[zkLogin] Session verification:', saved ? 'OK' : 'FAILED');

  return session;
}

/**
 * Get saved zkLogin session from sessionStorage
 */
export function getZkLoginSession(): ZkLoginSession | null {
  const stored = sessionStorage.getItem(ZKLOGIN_SESSION_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as ZkLoginSession;
  } catch {
    return null;
  }
}

/**
 * Clear zkLogin session from sessionStorage
 */
export function clearZkLoginSession(): void {
  sessionStorage.removeItem(ZKLOGIN_SESSION_KEY);
}

/**
 * Get saved zkLogin state from sessionStorage
 */
export function getZkLoginState(): ZkLoginState | null {
  const stored = sessionStorage.getItem(ZKLOGIN_STATE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as ZkLoginState;
  } catch {
    return null;
  }
}

/**
 * Save zkLogin state to sessionStorage
 */
export function saveZkLoginState(state: ZkLoginState): void {
  sessionStorage.setItem(ZKLOGIN_STATE_KEY, JSON.stringify(state));
}

/**
 * Clear zkLogin state from sessionStorage
 */
export function clearZkLoginState(): void {
  sessionStorage.removeItem(ZKLOGIN_STATE_KEY);
}

// ============================================
// OAuth CSRF State Management
// ============================================

/**
 * Generate and save OAuth CSRF state
 */
export function generateOAuthCsrfState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(OAUTH_CSRF_STATE_KEY, state);
  return state;
}

/**
 * Validate OAuth CSRF state from callback
 */
export function validateOAuthCsrfState(receivedState: string): boolean {
  const savedState = sessionStorage.getItem(OAUTH_CSRF_STATE_KEY);
  if (!savedState) {
    throw new ZkLoginError('CSRF_STATE_MISSING', 'OAuth state not found - session may have expired');
  }
  if (savedState !== receivedState) {
    throw new ZkLoginError('CSRF_STATE_MISMATCH', 'OAuth state mismatch - possible CSRF attack');
  }
  // Note: Do NOT remove state here - this runs in render phase and React StrictMode
  // causes double-render which would fail on second call. State is cleared in completeZkLogin.
  return true;
}

/**
 * Clear OAuth CSRF state
 */
export function clearOAuthCsrfState(): void {
  sessionStorage.removeItem(OAUTH_CSRF_STATE_KEY);
}

// ============================================
// OAuth URL Generation
// ============================================

/**
 * Build OAuth URL for a provider (Step 2)
 * Includes CSRF protection via state parameter
 */
export function buildOAuthUrl(provider: ZkLoginProvider, nonce: string): string {
  if (!zkLoginConfig) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', 'zkLogin not configured');
  }

  const config = zkLoginConfig.providers[provider];
  if (!config) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `Provider ${provider} not configured`);
  }

  // Generate CSRF state for this OAuth request
  const csrfState = generateOAuthCsrfState();

  switch (provider) {
    case 'google':
      return buildGoogleOAuthUrl(config.clientId, config.redirectUri, nonce, csrfState);
    case 'apple':
      return buildAppleOAuthUrl(config.clientId, config.redirectUri, nonce, csrfState);
    case 'twitch':
      return buildTwitchOAuthUrl(config.clientId, config.redirectUri, nonce, csrfState);
    default:
      throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `Provider ${provider} not supported yet`);
  }
}

function buildGoogleOAuthUrl(clientId: string, redirectUri: string, nonce: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: nonce,
    state: state, // CSRF protection
    prompt: 'select_account', // Always show account selection screen
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function buildAppleOAuthUrl(clientId: string, redirectUri: string, nonce: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email name',
    response_mode: 'fragment',
    nonce: nonce,
    state: state, // CSRF protection
  });
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

function buildTwitchOAuthUrl(clientId: string, redirectUri: string, nonce: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid',
    nonce: nonce,
    state: state, // CSRF protection
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

// ============================================
// JWT Verification (JWKS)
// ============================================

/** JWKS URLs for supported OAuth providers */
const JWKS_URLS: Record<string, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
  twitch: 'https://id.twitch.tv/oauth2/keys',
};

/** Expected issuers for each provider */
const EXPECTED_ISSUERS: Record<string, string[]> = {
  google: ['https://accounts.google.com', 'accounts.google.com'],
  apple: ['https://appleid.apple.com'],
  twitch: ['https://id.twitch.tv/oauth2'],
};

/** Cache for JWKS to avoid repeated fetches */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Get or create cached JWKS for a provider
 */
function getJwks(provider: ZkLoginProvider): ReturnType<typeof createRemoteJWKSet> {
  const url = JWKS_URLS[provider];
  if (!url) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `No JWKS URL for provider: ${provider}`);
  }

  let jwks = jwksCache.get(provider);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(provider, jwks);
  }
  return jwks;
}

/**
 * Verify JWT signature using provider's JWKS (Step 3a)
 * This ensures the JWT was actually issued by the OAuth provider
 * and has not been tampered with
 */
export async function verifyJwtSignature(
  jwt: string,
  provider: ZkLoginProvider
): Promise<JWTVerifyResult['payload']> {
  const jwks = getJwks(provider);
  const expectedIssuers = EXPECTED_ISSUERS[provider];

  if (!expectedIssuers) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `No expected issuers for provider: ${provider}`);
  }

  try {
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: expectedIssuers,
    });
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('signature')) {
      throw new ZkLoginError('JWT_INVALID', 'JWT signature verification failed - token may be forged');
    }
    if (message.includes('expired')) {
      throw new ZkLoginError('JWT_EXPIRED', 'JWT has expired');
    }
    if (message.includes('issuer')) {
      throw new ZkLoginError('JWT_INVALID', 'JWT issuer verification failed');
    }
    throw new ZkLoginError('JWT_INVALID', `JWT verification failed: ${message}`);
  }
}

// ============================================
// JWT Parsing
// ============================================

/**
 * Parse JWT and extract claims
 */
export function parseJwt(jwt: string): {
  header: { alg: string; kid: string };
  payload: {
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    nonce?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
} {
  const [headerB64, payloadB64] = jwt.split('.');

  // Helper to decode base64 with proper UTF-8 support
  // atob() alone doesn't handle UTF-8 - it treats each byte as Latin-1
  const decodeBase64Utf8 = (base64: string): string => {
    const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const header = JSON.parse(decodeBase64Utf8(headerB64));
  const payload = JSON.parse(decodeBase64Utf8(payloadB64));

  return { header, payload };
}

/**
 * Validate JWT claims (expiration, nonce)
 * Note: For full security, use verifyJwtWithSignature() which also validates the signature
 */
export function validateJwt(jwt: string, expectedNonce: string): boolean {
  try {
    const { payload } = parseJwt(jwt);

    // Check expiration
    if (payload.exp * 1000 < Date.now()) {
      throw new ZkLoginError('JWT_EXPIRED', 'JWT has expired');
    }

    // Check nonce
    if (payload.nonce !== expectedNonce) {
      throw new ZkLoginError('NONCE_MISMATCH', 'JWT nonce does not match session nonce');
    }

    return true;
  } catch (error) {
    if (error instanceof ZkLoginError) throw error;
    throw new ZkLoginError('JWT_INVALID', 'Failed to parse JWT');
  }
}

/**
 * Verify JWT signature AND validate claims (recommended)
 * This is the secure way to validate JWTs from OAuth providers
 */
export async function verifyJwtWithSignature(
  jwt: string,
  expectedNonce: string,
  provider?: ZkLoginProvider
): Promise<boolean> {
  // If provider not specified, detect from JWT
  const actualProvider = provider || detectProvider(jwt);

  // 1. Verify signature using JWKS
  const verifiedPayload = await verifyJwtSignature(jwt, actualProvider);

  // 2. Check nonce from verified payload
  if (verifiedPayload.nonce !== expectedNonce) {
    throw new ZkLoginError('NONCE_MISMATCH', 'JWT nonce does not match session nonce');
  }

  return true;
}

/**
 * Detect OAuth provider from JWT issuer
 */
export function detectProvider(jwt: string): ZkLoginProvider {
  const { payload } = parseJwt(jwt);
  const iss = payload.iss;

  if (iss.includes('google') || iss === 'https://accounts.google.com') {
    return 'google';
  }
  if (iss.includes('apple')) {
    return 'apple';
  }
  if (iss.includes('twitch')) {
    return 'twitch';
  }
  if (iss.includes('facebook')) {
    return 'facebook';
  }
  if (iss.includes('kakao')) {
    return 'kakao';
  }

  throw new ZkLoginError('JWT_INVALID', `Unknown issuer: ${iss}`);
}

// ============================================
// Salt Fetching
// ============================================

/**
 * Fetch salt from backend API (Step 4a)
 */
export async function fetchSalt(jwt: string): Promise<SaltResponse> {
  if (!zkLoginConfig) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', 'zkLogin not configured');
  }

  const response = await fetch(zkLoginConfig.saltApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ZkLoginError('SALT_FETCH_FAILED', error.error || 'Failed to fetch salt');
  }

  return response.json();
}

// ============================================
// Address Derivation
// ============================================

/**
 * Derive Sui address from JWT and salt (Step 5)
 */
export function deriveAddress(jwt: string, salt: string): string {
  return jwtToAddress(jwt, salt);
}

/**
 * Compute address seed for zkLogin signature
 */
export function computeAddressSeed(jwt: string, salt: string): string {
  const { payload } = parseJwt(jwt);
  // Convert salt string to BigInt
  // Salt can be decimal string (e.g., "123456789") or hex string (e.g., "0xa1b2c3")
  const isDecimal = /^[0-9]+$/.test(salt);
  const saltBigInt = isDecimal
    ? BigInt(salt)
    : BigInt(salt.startsWith('0x') ? salt : '0x' + salt);
  return genAddressSeed(
    saltBigInt,
    'sub',
    payload.sub,
    payload.aud as string
  ).toString();
}

// ============================================
// ZK Proof Generation
// ============================================

/**
 * Extended prover response with ephemeral public key
 */
export interface FetchZkProofResult {
  proof: ProverResponse;
  ephemeralPublicKey: string; // base64 encoded
}

/**
 * Fetch ZK proof from prover service (Step 4b)
 */
export async function fetchZkProof(params: {
  jwt: string;
  salt: string;
  ephemeralPrivateKey: string;
  maxEpoch: number;
  randomness: string;
}): Promise<FetchZkProofResult> {
  const proverUrl = zkLoginConfig?.proverUrl || DEFAULT_PROVER_URL;

  // Reconstruct keypair from private key (decode bech32 format)
  const { secretKey } = decodeSuiPrivateKey(params.ephemeralPrivateKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.getPublicKey();
  const publicKeyBase64 = publicKey.toBase64();

  // Get extended ephemeral public key
  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(publicKey);

  const response = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt: params.jwt,
      extendedEphemeralPublicKey: extendedEphemeralPublicKey.toString(),
      maxEpoch: params.maxEpoch,
      jwtRandomness: params.randomness,
      salt: params.salt,
      keyClaimName: 'sub',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ZkLoginError('PROVER_FAILED', `Prover error: ${error}`);
  }

  const proof = await response.json() as ProverResponse;

  return { proof, ephemeralPublicKey: publicKeyBase64 };
}

// ============================================
// Transaction Signing
// ============================================

/**
 * Sign transaction bytes with zkLogin (Step 6)
 */
export async function signWithZkLogin(params: {
  txBytes: Uint8Array;
  ephemeralPrivateKey: string;
  proof: ZkLoginProof;
  maxEpoch: number;
  addressSeed: string;
}): Promise<string> {
  const { txBytes, ephemeralPrivateKey, proof, maxEpoch, addressSeed } = params;

  // Verify epoch is still valid
  try {
    const client = getSuiClient();
    const { epoch } = await client.getLatestSuiSystemState();
    const currentEpoch = Number(epoch);
    if (currentEpoch >= maxEpoch) {
      throw new ZkLoginError('SESSION_EXPIRED', `zkLogin session expired. Current epoch ${currentEpoch} >= max epoch ${maxEpoch}`);
    }
  } catch (err) {
    if (err instanceof ZkLoginError) throw err;
    // Continue even if epoch check fails (network issue)
  }

  // Reconstruct keypair from bech32-encoded private key
  const { secretKey } = decodeSuiPrivateKey(ephemeralPrivateKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  // Sign with ephemeral key using signTransaction() which properly applies:
  // 1. Intent prefix (TransactionData)
  // 2. Blake2b hash of intent message
  // 3. Ed25519 signature on the digest
  // 4. Serialized signature format (flag + sig + pubkey = 97 bytes)
  const { signature: userSignature } = await keypair.signTransaction(txBytes);

  // Generate zkLogin signature
  const inputs = {
    ...proof,
    addressSeed,
  };

  const zkLoginSignature = getZkLoginSignature({
    inputs,
    maxEpoch,
    userSignature,
  });

  return zkLoginSignature;
}

// ============================================
// Full Flow Helpers
// ============================================

/**
 * Start zkLogin flow - create session and redirect to OAuth
 */
export async function startZkLogin(provider: ZkLoginProvider): Promise<void> {
  // 1. Create session
  const session = await createZkLoginSession();

  // 2. Build OAuth URL
  const oauthUrl = buildOAuthUrl(provider, session.nonce);

  // 3. Redirect to OAuth provider
  window.location.href = oauthUrl;
}

/**
 * Complete zkLogin flow after OAuth callback
 * Returns the complete zkLogin state
 */
export async function completeZkLogin(jwt: string): Promise<ZkLoginState> {
  // 1. Get saved session
  const session = getZkLoginSession();
  if (!session) {
    throw new ZkLoginError('SESSION_EXPIRED', 'No zkLogin session found. Please try logging in again.');
  }

  // 2. Detect provider first (needed for signature verification)
  const provider = detectProvider(jwt);

  // 3. Verify JWT signature AND validate claims (secure verification)
  await verifyJwtWithSignature(jwt, session.nonce, provider);

  // 4. Fetch salt from backend
  const saltResponse = await fetchSalt(jwt);

  // 5. Compute address seed locally
  const localAddressSeed = computeAddressSeed(jwt, saltResponse.salt);

  // 6. Fetch ZK proof
  const proofResult = await fetchZkProof({
    jwt,
    salt: saltResponse.salt,
    ephemeralPrivateKey: session.ephemeralPrivateKey,
    maxEpoch: session.maxEpoch,
    randomness: session.randomness,
  });

  // Use prover's addressSeed if available, otherwise use locally computed
  const proverSeed = proofResult.proof.addressSeed;
  const finalAddressSeed = proverSeed || localAddressSeed;

  // 7. Parse JWT for user info
  const { payload } = parseJwt(jwt);

  // 8. Build complete state
  const state: ZkLoginState = {
    provider,
    jwt,
    salt: saltResponse.salt,
    address: saltResponse.address,
    ephemeralPrivateKey: session.ephemeralPrivateKey,
    ephemeralPublicKey: proofResult.ephemeralPublicKey, // Save for validation during signing
    maxEpoch: session.maxEpoch,
    randomness: session.randomness,
    proof: {
      proofPoints: proofResult.proof.proofPoints,
      issBase64Details: proofResult.proof.issBase64Details,
      headerBase64: proofResult.proof.headerBase64,
    },
    addressSeed: finalAddressSeed, // Use prover's addressSeed if available, else local
    expiresAt: session.maxEpoch * 24 * 60 * 60 * 1000, // Rough estimate
    email: payload.email || saltResponse.email,
    name: payload.name || saltResponse.name,
    picture: payload.picture || saltResponse.picture,
  };

  // 9. Save state and clear session
  saveZkLoginState(state);
  clearZkLoginSession();
  clearOAuthCsrfState(); // Clean up CSRF state after successful completion

  return state;
}

/**
 * Check if current zkLogin session is still valid
 */
export async function isZkLoginSessionValid(): Promise<boolean> {
  const state = getZkLoginState();
  if (!state) return false;

  // Check if proof exists
  if (!state.proof) return false;

  // Check epoch expiration
  try {
    const client = getSuiClient();
    const { epoch } = await client.getLatestSuiSystemState();
    if (Number(epoch) >= state.maxEpoch) {
      return false;
    }
  } catch {
    // If we can't check, assume it's still valid
    return true;
  }

  return true;
}

/**
 * Disconnect zkLogin (clear all state)
 */
export function disconnectZkLogin(): void {
  clearZkLoginSession();
  clearZkLoginState();
}
