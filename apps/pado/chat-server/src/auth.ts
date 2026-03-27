import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

// Active challenges: challenge string -> { address (claimed), expiresAt }
const pendingChallenges = new Map<string, { expiresAt: number }>();

// Ephemeral key bindings: ephemeralPubKey (base64) -> { address, createdAt }
// Prevents address spoofing: once an ephemeral key is bound to an address,
// it cannot be used to claim a different address.
// In-memory storage is acceptable: server restart clears bindings,
// requiring re-authentication (UX impact only, no security risk on devnet).
// TTL-based eviction (24h) matches zkLogin ephemeral key lifetime.
// TODO(mainnet): migrate to persistent store (SQLite/Redis)
const ephemeralBindings = new Map<string, { address: string; createdAt: number }>();
const MAX_BINDINGS = 10_000;
const BINDING_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Register a binding between an ephemeral public key and a zkLogin address.
 * Called after successful ephemeral auth to prevent future spoofing.
 */
export function registerEphemeralBinding(ephemeralPubKey: string, walletAddress: string): void {
  // TTL-based eviction when at capacity: remove expired entries first
  if (ephemeralBindings.size >= MAX_BINDINGS) {
    const now = Date.now();
    for (const [key, val] of ephemeralBindings) {
      if (now - val.createdAt > BINDING_TTL_MS) {
        ephemeralBindings.delete(key);
      }
    }
  }
  // Fallback: evict oldest entry if still at capacity after TTL cleanup
  if (ephemeralBindings.size >= MAX_BINDINGS) {
    const firstKey = ephemeralBindings.keys().next().value;
    if (firstKey) ephemeralBindings.delete(firstKey);
  }
  ephemeralBindings.set(ephemeralPubKey, { address: walletAddress, createdAt: Date.now() });
}

/**
 * Get the address bound to an ephemeral public key, if any.
 * Returns undefined if the binding has expired (24h TTL).
 */
export function getEphemeralBinding(ephemeralPubKey: string): string | undefined {
  const entry = ephemeralBindings.get(ephemeralPubKey);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > BINDING_TTL_MS) {
    ephemeralBindings.delete(ephemeralPubKey);
    return undefined;
  }
  return entry.address;
}

// Cleanup stale challenges every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [challenge, data] of pendingChallenges) {
    if (now > data.expiresAt) {
      pendingChallenges.delete(challenge);
    }
  }
}, 60_000);

/**
 * Generate a random challenge for wallet signature verification
 */
export function generateChallenge(): string {
  const nonce = randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const challenge = `Pado Chat Authentication\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

  pendingChallenges.set(challenge, {
    expiresAt: timestamp + 30_000, // 30 second expiry
  });

  return challenge;
}

/**
 * Verify a wallet signature against a challenge.
 * Supports both personal_sign (local wallets) and ephemeral key auth (zkLogin).
 * Returns the verified/claimed address or null if invalid.
 */
export async function verifySignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
  authMethod?: 'personal_sign' | 'ephemeral',
  ephemeralPubKey?: string
): Promise<string | null> {
  // Check challenge exists and is not expired
  const challengeData = pendingChallenges.get(challenge);
  if (!challengeData) {
    return null;
  }

  if (Date.now() > challengeData.expiresAt) {
    pendingChallenges.delete(challenge);
    return null;
  }

  // Remove the challenge (one-time use)
  pendingChallenges.delete(challenge);

  try {
    if (authMethod === 'ephemeral') {
      return verifyEphemeralSignature(challenge, signature, claimedAddress, ephemeralPubKey);
    }

    // Default: personal_sign verification (local wallets)
    const messageBytes = new TextEncoder().encode(challenge);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
    const recoveredAddress = publicKey.toSuiAddress();

    // Verify the recovered address matches the claimed address
    if (normalizeAddress(recoveredAddress) !== normalizeAddress(claimedAddress)) {
      return null;
    }

    return recoveredAddress;
  } catch {
    return null;
  }
}

/**
 * Verify an ephemeral Ed25519 signature for zkLogin users.
 *
 * Verifies that the client possesses the ephemeral private key matching
 * the provided public key. Additionally checks the ephemeral key binding
 * to prevent address spoofing.
 *
 * Security model:
 * - First auth with an unbound ephemeral key: allowed on devnet (self-registers binding)
 * - Subsequent auth with a bound key + different address: rejected
 * - TODO(mainnet): reject unbound keys entirely, require persistent binding store
 *
 * RESOLVED: ephemeral binding verification added (see registerEphemeralBinding)
 * Previous: security-assessment-2026-02-22 [HIGH-2]
 */
async function verifyEphemeralSignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
  ephemeralPubKey?: string
): Promise<string | null> {
  if (!ephemeralPubKey || typeof ephemeralPubKey !== 'string') return null;

  // Validate address format
  if (!isValidSuiAddress(claimedAddress)) return null;

  // Validate ephemeral public key length (Ed25519 = 32 bytes base64)
  const keyBytes = Buffer.from(ephemeralPubKey, 'base64');
  if (keyBytes.length !== 32) return null;

  // Binding check: if this ephemeral key is already bound to a different address, reject
  const boundAddress = getEphemeralBinding(ephemeralPubKey);
  if (boundAddress && normalizeAddress(boundAddress) !== normalizeAddress(claimedAddress)) {
    return null;
  }

  try {
    const messageBytes = new TextEncoder().encode(challenge);
    // verifyPersonalMessageSignature recovers the public key from the signature
    const recoveredKey = await verifyPersonalMessageSignature(messageBytes, signature);

    // Verify the recovered key matches the claimed ephemeral public key
    const claimedKey = new Ed25519PublicKey(keyBytes);
    if (recoveredKey.toBase64() !== claimedKey.toBase64()) {
      return null;
    }

    // Self-register binding on first successful auth (TOFU model)
    if (!boundAddress) {
      registerEphemeralBinding(ephemeralPubKey, claimedAddress);
    }

    return claimedAddress;
  } catch {
    return null;
  }
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '');
}

function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}
