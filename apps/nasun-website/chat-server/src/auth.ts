import { randomBytes, createHash } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

export type AuthFailReason =
  | 'challenge_unknown'
  | 'challenge_expired'
  | 'bad_address_format'
  | 'key_length_invalid'
  | 'binding_collision'
  | 'key_mismatch'
  | 'profile_not_found'
  | 'verify_throw'
  | 'personal_addr_mismatch'
  | 'personal_throw';

export type VerifyResult =
  | { ok: true; address: string }
  | { ok: false; reason: AuthFailReason; claimedKeyPrefix?: string; recoveredKeyPrefix?: string };

/** Stable, non-reversible identifier for grouping logs by address without exposing the address. */
export function addrTag(address: string): string {
  return createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 8);
}

// Active challenges: challenge string -> expiresAt timestamp
const pendingChallenges = new Map<string, { expiresAt: number }>();
const MAX_PENDING_CHALLENGES = 10_000;

// Ephemeral key bindings: ephemeralPubKey (base64) -> { address, createdAt }
// Prevents address spoofing: once an ephemeral key is bound to an address,
// it cannot be used to claim a different address.
const ephemeralBindings = new Map<string, { address: string; createdAt: number }>();
const MAX_BINDINGS = 10_000;
const BINDING_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function registerEphemeralBinding(ephemeralPubKey: string, walletAddress: string): void {
  if (ephemeralBindings.size >= MAX_BINDINGS) {
    const now = Date.now();
    for (const [key, val] of ephemeralBindings) {
      if (now - val.createdAt > BINDING_TTL_MS) {
        ephemeralBindings.delete(key);
      }
    }
  }
  if (ephemeralBindings.size >= MAX_BINDINGS) {
    const firstKey = ephemeralBindings.keys().next().value;
    if (firstKey) ephemeralBindings.delete(firstKey);
  }
  ephemeralBindings.set(ephemeralPubKey, { address: walletAddress, createdAt: Date.now() });
}

function getEphemeralBinding(ephemeralPubKey: string): string | undefined {
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
 * Generate a random challenge for wallet signature verification.
 * Includes origin to prevent cross-site relay attacks.
 */
export function generateChallenge(): string | null {
  if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    return null;
  }

  const nonce = randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const challenge = `Nasun Chat Authentication\nOrigin: nasun.io\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

  pendingChallenges.set(challenge, {
    expiresAt: timestamp + 30_000, // 30 second expiry
  });

  return challenge;
}

/**
 * Verify a wallet signature against a challenge.
 * Supports both personal_sign (local/passkey wallets) and ephemeral key auth (zkLogin).
 * Returns the verified wallet address or null if invalid.
 */
export async function verifySignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
  authMethod?: 'personal_sign' | 'ephemeral',
  ephemeralPubKey?: string,
): Promise<VerifyResult> {
  const challengeData = pendingChallenges.get(challenge);
  if (!challengeData) return { ok: false, reason: 'challenge_unknown' };

  if (Date.now() > challengeData.expiresAt) {
    pendingChallenges.delete(challenge);
    return { ok: false, reason: 'challenge_expired' };
  }

  // One-time use
  pendingChallenges.delete(challenge);

  if (authMethod === 'ephemeral') {
    return verifyEphemeralSignature(challenge, signature, claimedAddress, ephemeralPubKey);
  }

  try {
    const messageBytes = new TextEncoder().encode(challenge);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
    const recoveredAddress = publicKey.toSuiAddress();

    if (normalizeAddress(recoveredAddress) !== normalizeAddress(claimedAddress)) {
      return { ok: false, reason: 'personal_addr_mismatch' };
    }

    return { ok: true, address: recoveredAddress };
  } catch {
    return { ok: false, reason: 'personal_throw' };
  }
}

// Profile API URL injected from config at startup
let profileApiUrl = '';
export function setProfileApiUrl(url: string): void {
  profileApiUrl = url;
}

/**
 * Verify that a wallet address exists as a registered user in the nasun profile system.
 * This prevents attackers from claiming arbitrary addresses during ephemeral auth,
 * since only addresses with existing profiles (created during the real auth flow) are accepted.
 */
async function verifyAddressExists(address: string): Promise<boolean> {
  if (!profileApiUrl) return false;
  try {
    const res = await fetch(`${profileApiUrl}/v3/user-profile?walletAddress=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { walletAddress?: string };
    return !!data.walletAddress;
  } catch {
    return false;
  }
}

/**
 * Verify an ephemeral Ed25519 signature for zkLogin users.
 *
 * Security: new ephemeral key bindings require the claimed address to exist
 * in the nasun profile database (populated during the real zkLogin auth flow).
 * This prevents address spoofing where an attacker generates a random keypair
 * and claims an arbitrary victim address.
 */
async function verifyEphemeralSignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
  ephemeralPubKey?: string,
): Promise<VerifyResult> {
  if (!ephemeralPubKey || typeof ephemeralPubKey !== 'string') {
    return { ok: false, reason: 'key_length_invalid' };
  }
  if (!isValidSuiAddress(claimedAddress)) {
    return { ok: false, reason: 'bad_address_format' };
  }

  const keyBytes = Buffer.from(ephemeralPubKey, 'base64');
  if (keyBytes.length !== 32) {
    return { ok: false, reason: 'key_length_invalid' };
  }

  const claimedKeyB64 = ephemeralPubKey;

  const boundAddress = getEphemeralBinding(ephemeralPubKey);
  if (boundAddress && normalizeAddress(boundAddress) !== normalizeAddress(claimedAddress)) {
    return { ok: false, reason: 'binding_collision', claimedKeyPrefix: claimedKeyB64.slice(0, 8) };
  }

  let recoveredKeyB64: string;
  let claimedKeyExpectedB64: string;
  try {
    const messageBytes = new TextEncoder().encode(challenge);
    const recoveredKey = await verifyPersonalMessageSignature(messageBytes, signature);
    recoveredKeyB64 = recoveredKey.toBase64();
    // Ed25519PublicKey constructor validates internally — wrap it so any future
    // SDK tightening (extra format check, etc.) returns a structured fail
    // instead of throwing past verifySignature into the connection handler.
    claimedKeyExpectedB64 = new Ed25519PublicKey(keyBytes).toBase64();
  } catch {
    return { ok: false, reason: 'verify_throw', claimedKeyPrefix: claimedKeyB64.slice(0, 8) };
  }

  if (recoveredKeyB64 !== claimedKeyExpectedB64) {
    return {
      ok: false,
      reason: 'key_mismatch',
      claimedKeyPrefix: claimedKeyB64.slice(0, 8),
      recoveredKeyPrefix: recoveredKeyB64.slice(0, 8),
    };
  }

  if (!boundAddress) {
    const exists = await verifyAddressExists(claimedAddress);
    if (!exists) {
      return { ok: false, reason: 'profile_not_found', claimedKeyPrefix: claimedKeyB64.slice(0, 8) };
    }
    registerEphemeralBinding(ephemeralPubKey, claimedAddress);
  }

  return { ok: true, address: claimedAddress };
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '');
}

export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}
