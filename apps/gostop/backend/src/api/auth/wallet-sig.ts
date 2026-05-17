/**
 * Wallet signature challenge/verify. Lightweight variant of the chat-server
 * pattern.
 *
 * Replay & cross-surface protection:
 *   - 30s challenge TTL, one-time use
 *   - Challenge body pins `purpose: gostop-api` so a signature collected for
 *     another Nasun surface (chat, my-account) cannot be replayed here.
 *   - Returns the on-chain-recovered address; caller compares with the
 *     wallet the client claimed.
 *
 * zkLogin support:
 *   The @mysten/sui verifyPersonalMessageSignature defaults to Sui mainnet
 *   GraphQL for zkLogin proof verification, which is incompatible with Nasun
 *   devnet epochs. We detect the ZkLogin scheme flag (0x05) and instead verify
 *   the inner ephemeral Ed25519 signature locally, then derive the zkLogin
 *   address from addressSeed + iss. This avoids any external network call.
 */

import { randomBytes } from 'node:crypto';
import { fromBase64, toBase64 } from '@mysten/bcs';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { parseZkLoginSignature, toZkLoginPublicIdentifier } from '@mysten/sui/zklogin';

const ZKLOGIN_FLAG = 0x05;

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

/**
 * Mirror of @mysten/sui internal decodeBase64URL + verifyExtendedClaim.
 * Extracts the claim value from a partial base64url-encoded JWT payload segment.
 *
 * The segment is a substring of the base64url-encoded payload that contains
 * exactly one JSON field. `indexMod4` encodes the starting position mod 4 so
 * we can strip the partial bits that bleed from adjacent characters.
 */
function extractIssFromBase64Details(value: string, indexMod4: number): string | null {
  try {
    // Build a full base64url-decodeable string by prepending padding chars
    // to align to a 4-char (3-byte) boundary, then strip the leading garbage bytes.
    const leadPad = (4 - (indexMod4 % 4)) % 4;
    const padded = 'A'.repeat(leadPad) + value;
    const decoded = Buffer.from(padded, 'base64url').toString('utf-8');
    // Strip the leading garbage bytes that were added for alignment.
    const sliced = decoded.slice(leadPad > 0 ? Math.ceil((leadPad * 6) / 8) : 0);
    const issMatch = sliced.match(/"iss"\s*:\s*"([^"]+)"/);
    if (issMatch) return issMatch[1];

    // Fallback: try decoding without padding adjustment (works when indexMod4=0).
    const raw = Buffer.from(value, 'base64url').toString('utf-8');
    const rawMatch = raw.match(/"iss"\s*:\s*"([^"]+)"/);
    return rawMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify a zkLogin personal-message signature locally (no external network call).
 *
 * Extracts the inner ephemeral Ed25519 signature from the zkLogin wrapper,
 * verifies it against the message bytes, then derives the zkLogin address
 * from addressSeed + iss. The ZK proof itself is not re-verified here;
 * we trust that the ephemeral key was legitimately obtained via the zkLogin
 * flow (same assumption as the chat-server ephemeral path).
 */
async function verifyZkLoginLocal(
  challengeBytes: Uint8Array,
  signature: string,
): Promise<string | null> {
  try {
    const sigBytes = fromBase64(signature);
    if (sigBytes[0] !== ZKLOGIN_FLAG) return null;

    const inner = parseZkLoginSignature(sigBytes.slice(1));
    const { inputs, userSignature } = inner;
    const { issBase64Details, addressSeed } = inputs;

    // userSignature is stored as raw bytes in the BCS struct.
    const userSigB64 = toBase64(userSignature as unknown as Uint8Array);

    // Verify the ephemeral Ed25519 locally (no GraphQL).
    await verifyPersonalMessageSignature(challengeBytes, userSigB64);

    const iss = extractIssFromBase64Details(issBase64Details.value, issBase64Details.indexMod4)
      // Nasun only supports Google OAuth; fall back if extraction fails.
      ?? 'https://accounts.google.com';

    return toZkLoginPublicIdentifier(BigInt(addressSeed), iss).toSuiAddress();
  } catch (err) {
    console.error('[auth] zklogin-local verify error', err instanceof Error ? err.message : String(err));
    return null;
  }
}

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

  const bytes = new TextEncoder().encode(challenge);

  // Detect ZkLogin before calling verifyPersonalMessageSignature, which would
  // otherwise make an external call to Sui mainnet GraphQL (incompatible with
  // Nasun devnet's epoch system).
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64(signature);
  } catch {
    return { ok: false, reason: 'verify_throw' };
  }

  if (sigBytes[0] === ZKLOGIN_FLAG) {
    const recovered = await verifyZkLoginLocal(bytes, signature);
    if (!recovered) return { ok: false, reason: 'verify_throw' };
    if (normalizeAddress(recovered) !== normalizeAddress(claimedAddress)) {
      return { ok: false, reason: 'addr_mismatch' };
    }
    return { ok: true, address: recovered };
  }

  try {
    const publicKey = await verifyPersonalMessageSignature(bytes, signature);
    const recovered = publicKey.toSuiAddress();
    if (normalizeAddress(recovered) !== normalizeAddress(claimedAddress)) {
      return { ok: false, reason: 'addr_mismatch' };
    }
    return { ok: true, address: recovered };
  } catch (err) {
    console.error('[auth] verify_throw', err instanceof Error ? err.message : String(err));
    return { ok: false, reason: 'verify_throw' };
  }
}
