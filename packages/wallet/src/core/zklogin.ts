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
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
  getZkLoginSignature,
  genAddressSeed,
} from '@mysten/sui/zklogin';
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

/** Default prover URL (Mysten Labs) */
const DEFAULT_PROVER_URL = 'https://prover.mystenlabs.com/v1';

/** Session storage key for zkLogin session */
const ZKLOGIN_SESSION_KEY = 'nasun:zklogin:session';

/** Session storage key for zkLogin state */
const ZKLOGIN_STATE_KEY = 'nasun:zklogin:state';

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
  const client = getSuiClient();

  // 1. Get current epoch
  const { epoch } = await client.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 10; // Valid for ~10 epochs (~1-2 days)

  // 2. Generate ephemeral keypair
  const ephemeralKeyPair = new Ed25519Keypair();

  // 3. Generate randomness and nonce
  const randomness = generateRandomness();
  const nonce = generateNonce(
    ephemeralKeyPair.getPublicKey(),
    maxEpoch,
    randomness
  );

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
// OAuth URL Generation
// ============================================

/**
 * Build OAuth URL for a provider (Step 2)
 */
export function buildOAuthUrl(provider: ZkLoginProvider, nonce: string): string {
  if (!zkLoginConfig) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', 'zkLogin not configured');
  }

  const config = zkLoginConfig.providers[provider];
  if (!config) {
    throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `Provider ${provider} not configured`);
  }

  switch (provider) {
    case 'google':
      return buildGoogleOAuthUrl(config.clientId, config.redirectUri, nonce);
    case 'apple':
      return buildAppleOAuthUrl(config.clientId, config.redirectUri, nonce);
    case 'twitch':
      return buildTwitchOAuthUrl(config.clientId, config.redirectUri, nonce);
    default:
      throw new ZkLoginError('PROVIDER_NOT_CONFIGURED', `Provider ${provider} not supported yet`);
  }
}

function buildGoogleOAuthUrl(clientId: string, redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function buildAppleOAuthUrl(clientId: string, redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email name',
    response_mode: 'fragment',
    nonce: nonce,
  });
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

function buildTwitchOAuthUrl(clientId: string, redirectUri: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid',
    nonce: nonce,
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
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

  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  return { header, payload };
}

/**
 * Validate JWT and check if it matches the session nonce
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
  return genAddressSeed(
    BigInt(salt),
    'sub',
    payload.sub,
    payload.aud as string
  ).toString();
}

// ============================================
// ZK Proof Generation
// ============================================

/**
 * Fetch ZK proof from prover service (Step 4b)
 */
export async function fetchZkProof(params: {
  jwt: string;
  salt: string;
  ephemeralPrivateKey: string;
  maxEpoch: number;
  randomness: string;
}): Promise<ProverResponse> {
  const proverUrl = zkLoginConfig?.proverUrl || DEFAULT_PROVER_URL;

  // Reconstruct keypair from private key
  const keypair = Ed25519Keypair.fromSecretKey(params.ephemeralPrivateKey);
  const publicKey = keypair.getPublicKey();

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

  return response.json();
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

  // Reconstruct keypair
  const keypair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKey);

  // Sign with ephemeral key (sync method)
  const userSignature = await keypair.sign(txBytes);

  // Generate zkLogin signature
  const zkLoginSignature = getZkLoginSignature({
    inputs: {
      ...proof,
      addressSeed,
    },
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
    throw new ZkLoginError('SESSION_EXPIRED', 'No zkLogin session found');
  }

  // 2. Validate JWT
  validateJwt(jwt, session.nonce);

  // 3. Detect provider
  const provider = detectProvider(jwt);

  // 4. Fetch salt from backend
  const saltResponse = await fetchSalt(jwt);

  // 5. Compute address seed
  const addressSeed = computeAddressSeed(jwt, saltResponse.salt);

  // 6. Fetch ZK proof
  const proofResponse = await fetchZkProof({
    jwt,
    salt: saltResponse.salt,
    ephemeralPrivateKey: session.ephemeralPrivateKey,
    maxEpoch: session.maxEpoch,
    randomness: session.randomness,
  });

  // 7. Parse JWT for user info
  const { payload } = parseJwt(jwt);

  // 8. Build complete state
  const state: ZkLoginState = {
    provider,
    jwt,
    salt: saltResponse.salt,
    address: saltResponse.address,
    ephemeralPrivateKey: session.ephemeralPrivateKey,
    maxEpoch: session.maxEpoch,
    randomness: session.randomness,
    proof: {
      proofPoints: proofResponse.proofPoints,
      issBase64Details: proofResponse.issBase64Details,
      headerBase64: proofResponse.headerBase64,
    },
    addressSeed,
    expiresAt: session.maxEpoch * 24 * 60 * 60 * 1000, // Rough estimate
    email: payload.email || saltResponse.email,
    name: payload.name || saltResponse.name,
    picture: payload.picture || saltResponse.picture,
  };

  // 9. Save state and clear session
  saveZkLoginState(state);
  clearZkLoginSession();

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
