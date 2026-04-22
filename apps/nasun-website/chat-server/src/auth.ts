import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

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
): Promise<string | null> {
  // Check challenge exists and is not expired
  const challengeData = pendingChallenges.get(challenge);
  if (!challengeData) return null;

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

    // Default: personal_sign verification (local wallets, passkey)
    const messageBytes = new TextEncoder().encode(challenge);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature);
    const recoveredAddress = publicKey.toSuiAddress();

    if (normalizeAddress(recoveredAddress) !== normalizeAddress(claimedAddress)) {
      return null;
    }

    return recoveredAddress;
  } catch {
    return null;
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
): Promise<string | null> {
  if (!ephemeralPubKey || typeof ephemeralPubKey !== 'string') return null;
  if (!isValidSuiAddress(claimedAddress)) return null;

  const keyBytes = Buffer.from(ephemeralPubKey, 'base64');
  if (keyBytes.length !== 32) return null;

  // Binding check: reject if key is bound to a different address
  const boundAddress = getEphemeralBinding(ephemeralPubKey);
  if (boundAddress && normalizeAddress(boundAddress) !== normalizeAddress(claimedAddress)) {
    return null;
  }

  try {
    const messageBytes = new TextEncoder().encode(challenge);
    const recoveredKey = await verifyPersonalMessageSignature(messageBytes, signature);

    const claimedKey = new Ed25519PublicKey(keyBytes);
    if (recoveredKey.toBase64() !== claimedKey.toBase64()) {
      return null;
    }

    // New binding: verify address exists in profile system before accepting
    if (!boundAddress) {
      const exists = await verifyAddressExists(claimedAddress);
      if (!exists) {
        return null;
      }
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

export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}
