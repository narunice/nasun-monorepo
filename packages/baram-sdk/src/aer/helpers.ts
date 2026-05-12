import { createHash, randomBytes } from 'node:crypto';

/**
 * Byte-wise UTF-8 comparison.
 *
 * `localeCompare` and JS `<` are locale-sensitive and unsuitable for the
 * canonical key ordering that AER v2 `replay_extras` requires. Always use
 * this helper.
 */
export function compareKeysCanonical(a: string, b: string): number {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.min(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    if (ab[i] !== bb[i]) return ab[i] - bb[i];
  }
  return ab.length - bb.length;
}

/**
 * Returns true if `keys` is in strict-ascending canonical (UTF-8 byte) order
 * with no duplicates.
 */
export function isCanonicalKeySequence(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    if (compareKeysCanonical(keys[i - 1], keys[i]) >= 0) return false;
  }
  return true;
}

/**
 * Generate a UUIDv7 as 16 raw bytes per RFC 9562 §5.7.
 *
 * Layout: 48-bit big-endian unix_ts_ms || 4-bit version (7) || 12-bit rand_a
 * || 2-bit variant (10) || 62-bit rand_b.
 *
 * The 74-bit random suffix (12 + 62) makes intra-ms collisions astronomically
 * unlikely; no per-host seeding is required. Hosts MUST use this generator
 * (or an equivalent RFC 9562 §5.7 implementation) so that decoders can rely
 * on monotonic timestamp prefixes.
 */
export function generateIntentId(): Uint8Array {
  const buf = randomBytes(16);
  const ts = BigInt(Date.now());
  // Big-endian 48-bit timestamp into bytes 0..5
  buf[0] = Number((ts >> 40n) & 0xffn);
  buf[1] = Number((ts >> 32n) & 0xffn);
  buf[2] = Number((ts >> 24n) & 0xffn);
  buf[3] = Number((ts >> 16n) & 0xffn);
  buf[4] = Number((ts >> 8n) & 0xffn);
  buf[5] = Number(ts & 0xffn);
  // Version 7 in upper nibble of byte 6
  buf[6] = (buf[6] & 0x0f) | 0x70;
  // Variant 10 in upper bits of byte 8
  buf[8] = (buf[8] & 0x3f) | 0x80;
  return new Uint8Array(buf);
}

/**
 * Returns the UUIDv7 timestamp (ms since epoch) embedded in the first 48 bits.
 */
export function intentIdTimestampMs(intentId: Uint8Array): bigint {
  if (intentId.length !== 16) throw new Error('intent_id must be 16 bytes');
  return (
    (BigInt(intentId[0]) << 40n) |
    (BigInt(intentId[1]) << 32n) |
    (BigInt(intentId[2]) << 24n) |
    (BigInt(intentId[3]) << 16n) |
    (BigInt(intentId[4]) << 8n) |
    BigInt(intentId[5])
  );
}

/**
 * Returns true if the byte sequence has the UUIDv7 version + variant bits set
 * correctly (length 16, version nibble = 7, variant bits = 10).
 */
export function isUuidV7(intentId: Uint8Array): boolean {
  if (intentId.length !== 16) return false;
  if ((intentId[6] & 0xf0) !== 0x70) return false;
  if ((intentId[8] & 0xc0) !== 0x80) return false;
  return true;
}

/**
 * SHA-256 over the concatenation `action_type_bytes || payload_bytes`.
 *
 * This is the canonical `payload_hash` for AER v2 envelopes (see
 * `apps/baram/docs/AER_V2_CODEC.md` §4). Use this when constructing
 * envelopes off-chain; the decoder recomputes and verifies.
 */
export function computePayloadHash(actionType: string, payloadBytes: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const at = enc.encode(actionType);
  const buf = new Uint8Array(at.length + payloadBytes.length);
  buf.set(at, 0);
  buf.set(payloadBytes, at.length);
  return new Uint8Array(createHash('sha256').update(buf).digest());
}
