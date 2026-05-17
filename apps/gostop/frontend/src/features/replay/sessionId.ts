/**
 * Lottery session_id decoder.
 *
 * On chain the lottery session_id is the BCS little-endian byte concatenation
 * of two u64 values:
 *   - bytes  0..8  : round_number (u64, little-endian)
 *   - bytes  8..16 : ticket_id    (u64, little-endian)
 *
 * The backend round route accepts the raw hex form ([round.ts:91](apps/gostop/backend/src/api/routes/round.ts#L91)).
 * This helper is shared so future game decoders (Tier 1) can live alongside.
 */

const SESSION_HEX_RE = /^(0x)?[0-9a-fA-F]+$/;
const LOTTERY_SESSION_BYTES = 16;

export interface LotterySessionParts {
  roundNumber: bigint;
  ticketId: bigint;
}

/**
 * Normalize a user-supplied hex string. Lowercases and strips a leading `0x`.
 * Returns null if the input is not a valid hex string (catches URL typos and
 * adversarial input before it touches the bigint reader).
 */
export function normalizeSessionHex(input: string | undefined | null): string | null {
  if (!input) return null;
  if (!SESSION_HEX_RE.test(input)) return null;
  const lower = input.toLowerCase();
  const stripped = lower.startsWith('0x') ? lower.slice(2) : lower;
  if (stripped.length === 0 || stripped.length % 2 !== 0) return null;
  return stripped;
}

/**
 * Decode a lottery session_id hex into `(round_number, ticket_id)`. Returns
 * null when the input is malformed or not the expected 16-byte length.
 */
export function decodeLotterySessionId(input: string | undefined | null): LotterySessionParts | null {
  const hex = normalizeSessionHex(input);
  if (!hex || hex.length !== LOTTERY_SESSION_BYTES * 2) return null;
  try {
    const roundNumber = readU64LE(hex, 0);
    const ticketId = readU64LE(hex, 8);
    return { roundNumber, ticketId };
  } catch {
    return null;
  }
}

function readU64LE(hex: string, byteOffset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    const byteHex = hex.slice((byteOffset + i) * 2, (byteOffset + i + 1) * 2);
    value = (value << 8n) | BigInt(parseInt(byteHex, 16));
  }
  return value;
}
