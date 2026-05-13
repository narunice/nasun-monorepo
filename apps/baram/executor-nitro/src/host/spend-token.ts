/**
 * HMAC-bound inference token (Plan C C3-v2 DV8).
 *
 * The /infer ↔ /execute-capability split creates a trader-side window
 * where a compromised runner could substitute (result, resultHash) pairs
 * between calls. mintToken/verifyToken closes that window by binding
 * the inference identity (requestId + resultHash + walletAddress) to a
 * host-secret HMAC, plus a single-use nonce and a 30-second expiry.
 *
 * Token does NOT bind envelope semantics. A compromised runner can still
 * claim a different BUY/SELL/HOLD interpretation than what the LLM
 * produced; envelope-hash binding on chain is Plan F / phase 2.
 *
 * HMAC key resolution:
 *   process.env.HOST_HMAC_KEY (hex, 32 bytes) → use it
 *   else                                       → random-at-boot, warn once
 *
 * Random-at-boot is acceptable for v1: tokens expire in 30s, restart only
 * invalidates inflight tokens, and the trader retries automatically.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const HMAC_ALGO = 'sha256';
const HMAC_KEY_BYTES = 32;
const NONCE_BYTES = 16;
const DEFAULT_TTL_MS = 30_000;
const NONCE_LRU_CAP = 10_000;
const WALLET_ADDRESS_BYTES = 32;

interface NonceEntry {
  expiresAt: number;
}

let hmacKey: Buffer | null = null;
const usedNonces = new Map<string, NonceEntry>();

function getHmacKey(): Buffer {
  if (hmacKey) return hmacKey;
  const envKey = process.env.HOST_HMAC_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    hmacKey = Buffer.from(envKey, 'hex');
  } else {
    if (envKey) {
      console.warn('[spend-token] HOST_HMAC_KEY set but not 32-byte hex; ignoring.');
    }
    console.warn(
      '[spend-token] HOST_HMAC_KEY unset; generating random-at-boot key. ' +
        'Restart invalidates inflight tokens.',
    );
    hmacKey = randomBytes(HMAC_KEY_BYTES);
  }
  return hmacKey;
}

/** Test seam: reset module state. NOT exported in production callers. */
export function _resetSpendTokenStateForTests(): void {
  hmacKey = null;
  usedNonces.clear();
}

function encodeCanonical(
  requestId: number,
  resultHashHex: string,
  walletAddress: string,
  nonceHex: string,
  expiresAt: number,
): Buffer {
  const buf = Buffer.alloc(8 + 32 + WALLET_ADDRESS_BYTES + NONCE_BYTES + 8);
  let off = 0;
  // requestId u64 LE — Node's Buffer.writeBigUInt64LE expects bigint
  buf.writeBigUInt64LE(BigInt(requestId), off);
  off += 8;
  const resultHash = Buffer.from(resultHashHex, 'hex');
  if (resultHash.length !== 32) {
    throw new Error('resultHash must be 32 bytes (hex)');
  }
  resultHash.copy(buf, off);
  off += 32;
  // walletAddress: strip 0x, decode hex; pad/truncate to 32 bytes
  const walletStripped = walletAddress.startsWith('0x')
    ? walletAddress.slice(2)
    : walletAddress;
  if (!/^[0-9a-fA-F]+$/.test(walletStripped) || walletStripped.length > 64) {
    throw new Error('walletAddress must be 0x<hex> up to 64 chars');
  }
  const padded = walletStripped.padStart(64, '0');
  Buffer.from(padded, 'hex').copy(buf, off);
  off += WALLET_ADDRESS_BYTES;
  const nonce = Buffer.from(nonceHex, 'hex');
  if (nonce.length !== NONCE_BYTES) {
    throw new Error('nonce must be 16 bytes (hex)');
  }
  nonce.copy(buf, off);
  off += NONCE_BYTES;
  buf.writeBigUInt64LE(BigInt(expiresAt), off);
  return buf;
}

function computeMac(canonical: Buffer): Buffer {
  return createHmac(HMAC_ALGO, getHmacKey()).update(canonical).digest();
}

export interface MintArgs {
  requestId: number;
  resultHash: string;
  walletAddress: string;
  ttlMs?: number;
  /** Test seam. Production callers do not pass this. */
  now?: number;
}

export interface MintedToken {
  spendToken: string;
  nonce: string;
  expiresAt: number;
}

export function mintToken(args: MintArgs): MintedToken {
  const now = args.now ?? Date.now();
  const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
  if (ttlMs <= 0 || ttlMs > 5 * 60 * 1000) {
    throw new Error('ttlMs must be in (0, 300_000]');
  }
  const expiresAt = now + ttlMs;
  const nonceHex = randomBytes(NONCE_BYTES).toString('hex');
  const canonical = encodeCanonical(
    args.requestId,
    args.resultHash,
    args.walletAddress,
    nonceHex,
    expiresAt,
  );
  const mac = computeMac(canonical);
  return {
    spendToken: mac.toString('base64'),
    nonce: nonceHex,
    expiresAt,
  };
}

export interface VerifyArgs extends MintArgs {
  spendToken: string;
  nonce: string;
  expiresAt: number;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'replay' | 'invalid' };

export function verifyToken(args: VerifyArgs): VerifyResult {
  const now = args.now ?? Date.now();
  if (!Number.isFinite(args.expiresAt) || args.expiresAt <= now) {
    return { ok: false, reason: 'expired' };
  }

  let canonical: Buffer;
  try {
    canonical = encodeCanonical(
      args.requestId,
      args.resultHash,
      args.walletAddress,
      args.nonce,
      args.expiresAt,
    );
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  let provided: Buffer;
  try {
    provided = Buffer.from(args.spendToken, 'base64');
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const expected = computeMac(canonical);
  if (provided.length !== expected.length) {
    return { ok: false, reason: 'invalid' };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  // Single-use nonce. Replay if already seen and not yet expired.
  pruneExpiredNonces(now);
  if (usedNonces.has(args.nonce)) {
    return { ok: false, reason: 'replay' };
  }
  // LRU eviction. JS Map iterates in insertion order; drop oldest.
  if (usedNonces.size >= NONCE_LRU_CAP) {
    const oldest = usedNonces.keys().next().value;
    if (oldest !== undefined) usedNonces.delete(oldest);
  }
  usedNonces.set(args.nonce, { expiresAt: args.expiresAt });
  return { ok: true };
}

function pruneExpiredNonces(now: number): void {
  // Walk insertion order; stop at first non-expired entry. This is
  // correct because production callers always mint with the default
  // TTL (30s) — insertion order == expiry order. The custom-ttl path
  // exists only for tests. If we ever expose variable TTLs to
  // production callers, switch to a full scan or a min-heap.
  for (const [n, entry] of usedNonces) {
    if (entry.expiresAt > now) break;
    usedNonces.delete(n);
  }
}
