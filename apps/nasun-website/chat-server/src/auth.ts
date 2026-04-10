import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

// Active challenges: challenge string -> expiresAt timestamp
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
 * Generate a random challenge for wallet signature verification.
 * Includes origin to prevent cross-site relay attacks.
 */
export function generateChallenge(): string {
  const nonce = randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const challenge = `Nasun Chat Authentication\nOrigin: nasun.io\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

  pendingChallenges.set(challenge, {
    expiresAt: timestamp + 30_000, // 30 second expiry
  });

  return challenge;
}

/**
 * Verify a wallet signature (personal_sign) against a challenge.
 * Returns the verified wallet address or null if invalid.
 */
export async function verifySignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
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

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '');
}

export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}
