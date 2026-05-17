/**
 * Wallet signature challenge/verify. Lightweight variant of the chat-server
 * pattern — gostop API only needs personal_sign (zkLogin sessions can sign
 * personal messages too, so ephemeral key flow is not required here).
 *
 * Replay & cross-surface protection:
 *   - 30s challenge TTL, one-time use
 *   - Challenge body pins `purpose: gostop-api` so a signature collected for
 *     another Nasun surface (chat, my-account) cannot be replayed here.
 *   - Returns the on-chain-recovered address; caller compares with the
 *     wallet the client claimed.
 */

import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

const pending = new Map<string, { expiresAt: number }>();
const MAX_PENDING = 10_000;
const TTL_MS = 30_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (v.expiresAt <= now) pending.delete(k);
  }
}, 60_000).unref();

export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}

export function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

export function generateChallenge(): string | null {
  if (pending.size >= MAX_PENDING) return null;
  const nonce = randomBytes(32).toString('hex');
  const ts = Date.now();
  const challenge =
    `Gostop API Authentication\n` +
    `Purpose: gostop-api\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}`;
  pending.set(challenge, { expiresAt: ts + TTL_MS });
  return challenge;
}

export type VerifyResult =
  | { ok: true; address: string }
  | { ok: false; reason: 'challenge_unknown' | 'challenge_expired' | 'addr_mismatch' | 'verify_throw' };

export async function verifyChallengeSignature(
  challenge: string,
  signature: string,
  claimedAddress: string,
): Promise<VerifyResult> {
  const entry = pending.get(challenge);
  if (!entry) return { ok: false, reason: 'challenge_unknown' };
  if (Date.now() > entry.expiresAt) {
    pending.delete(challenge);
    return { ok: false, reason: 'challenge_expired' };
  }
  // One-time use: consume regardless of outcome to prevent oracle-style retry.
  pending.delete(challenge);

  if (!isValidSuiAddress(claimedAddress)) {
    return { ok: false, reason: 'addr_mismatch' };
  }

  try {
    const bytes = new TextEncoder().encode(challenge);
    const publicKey = await verifyPersonalMessageSignature(bytes, signature);
    const recovered = publicKey.toSuiAddress();
    if (normalizeAddress(recovered) !== normalizeAddress(claimedAddress)) {
      return { ok: false, reason: 'addr_mismatch' };
    }
    return { ok: true, address: recovered };
  } catch {
    return { ok: false, reason: 'verify_throw' };
  }
}
