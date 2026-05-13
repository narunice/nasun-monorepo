/**
 * Intent ID generator — ULID (time-sortable, 26-char base32).
 *
 * Used for `intent_id`, `parent_intent_id`, `job_id`, `proposal_id` across
 * Baram chat-server, agent-runner, and indexer.
 *
 * Design (Plan D v3 §A4):
 * - ULID over UUIDv4 for time-sortable ordering. Indexer can BFS lineage
 *   trees without join on timestamp.
 * - Dot-notation hierarchy (`I1.1`) is forbidden in storage. Trees are
 *   reconstructed from `parent_intent_id` pointers only.
 * - Encoding: on-chain AER stores the ULID as 16-byte binary via
 *   `intent_id_from_ulid()`. Off-chain stores as 26-char string.
 */

import { ulid, decodeTime } from 'ulid';

const ULID_LENGTH = 26;
const ULID_BYTES = 16;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Generate a fresh ULID. Optionally seed with a specific timestamp
 * (milliseconds) for testing or backfill.
 */
export function newIntentId(seedMs?: number): string {
  return ulid(seedMs);
}

/**
 * Validate ULID format (Crockford base32, 26 chars).
 */
export function isValidIntentId(id: string): boolean {
  return ULID_PATTERN.test(id);
}

/**
 * Extract embedded timestamp (ms since epoch).
 */
export function intentIdTimestamp(id: string): number {
  return decodeTime(id);
}

/**
 * ULID string ↔ 16-byte binary representation used by Move contracts.
 *
 * The on-chain AER stores `intent_id: vector<u8>` (16 bytes). ULID's
 * canonical text form decodes to exactly 16 bytes via Crockford base32.
 *
 * This is a manual conversion (the `ulid` npm package does not expose
 * a bytes API). Algorithm: Crockford base32 decode.
 */

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHAR_TO_VALUE = new Map<string, number>();
for (let i = 0; i < CROCKFORD_ALPHABET.length; i++) {
  CHAR_TO_VALUE.set(CROCKFORD_ALPHABET[i]!, i);
}

export function intentIdToBytes(id: string): Uint8Array {
  if (!isValidIntentId(id)) {
    throw new Error(`Invalid ULID: ${id}`);
  }
  // ULID layout: 48-bit timestamp (10 chars) + 80-bit randomness (16 chars).
  // Total 130 bits packed in 16 bytes. Decode as base32 to 16 bytes.
  const bytes = new Uint8Array(ULID_BYTES);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIdx = 0;
  for (let i = 0; i < ULID_LENGTH; i++) {
    const ch = id[i]!.toUpperCase();
    const value = CHAR_TO_VALUE.get(ch);
    if (value === undefined) {
      throw new Error(`Invalid ULID char at index ${i}: ${ch}`);
    }
    // First char of ULID uses only 3 bits (timestamp top 48 bits = 10 base32
    // chars * 5 = 50 bits, top 2 bits always 0). Subsequent chars use 5 bits.
    const bitsToTake = i === 0 ? 3 : 5;
    if (i === 0 && value > 7) {
      throw new Error(`ULID timestamp overflow: leading char ${ch}`);
    }
    bitBuffer = (bitBuffer << bitsToTake) | value;
    bitCount += bitsToTake;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIdx++] = (bitBuffer >>> bitCount) & 0xff;
    }
  }
  if (bitCount !== 0 || byteIdx !== ULID_BYTES) {
    throw new Error(`ULID decode misalignment: bitCount=${bitCount}, byteIdx=${byteIdx}`);
  }
  return bytes;
}

export function intentIdFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== ULID_BYTES) {
    throw new Error(`Expected ${ULID_BYTES} bytes, got ${bytes.length}`);
  }
  let bitBuffer = 0;
  let bitCount = 0;
  const chars: string[] = [];
  // First char: top 3 bits (always 0 since 48-bit timestamp fits in 48 bits
  // and we encode 50 bits total, leaving 2 leading zero bits).
  // We process bytes MSB-first and accumulate into base32 chunks (5 bits).
  for (let i = 0; i < bytes.length; i++) {
    bitBuffer = (bitBuffer << 8) | bytes[i]!;
    bitCount += 8;
    while (bitCount >= 5) {
      // First emitted char must use 3 bits to align to 130-bit ULID width.
      const bitsToEmit = chars.length === 0 ? 3 : 5;
      if (bitCount < bitsToEmit) break;
      bitCount -= bitsToEmit;
      const value = (bitBuffer >>> bitCount) & ((1 << bitsToEmit) - 1);
      chars.push(CROCKFORD_ALPHABET[value]!);
    }
  }
  // Drain remaining bits as final char.
  if (bitCount > 0) {
    const value = (bitBuffer & ((1 << bitCount) - 1)) << (5 - bitCount);
    chars.push(CROCKFORD_ALPHABET[value]!);
  }
  if (chars.length !== ULID_LENGTH) {
    throw new Error(`ULID encode produced ${chars.length} chars, expected ${ULID_LENGTH}`);
  }
  return chars.join('');
}
