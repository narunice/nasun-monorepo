import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

// Active challenges: challenge string -> { address (claimed), expiresAt }
const pendingChallenges = new Map<string, { expiresAt: number }>();

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
 * the provided public key. The claimed zkLogin address is accepted without
 * cryptographic binding — acceptable for non-financial chat auth on devnet.
 *
 * TODO(production): Before mainnet launch, add cryptographic binding between
 * ephemeralPubKey and zkLogin address. Current implementation allows address
 * spoofing — an attacker can sign with their own ephemeral key while claiming
 * another user's zkLogin address. Options:
 * 1. Require ZK proof submission and verify via zkLogin salt API + Prover
 * 2. Server-side ephemeralPubKey -> zkLogin address mapping verification
 * See: security-assessment-2026-02-22 [HIGH-2]
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

  try {
    const messageBytes = new TextEncoder().encode(challenge);
    // verifyPersonalMessageSignature recovers the public key from the signature
    const recoveredKey = await verifyPersonalMessageSignature(messageBytes, signature);

    // Verify the recovered key matches the claimed ephemeral public key
    const claimedKey = new Ed25519PublicKey(keyBytes);
    if (recoveredKey.toBase64() !== claimedKey.toBase64()) {
      return null;
    }

    // Accept the claimed address (see doc comment for security implications)
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
