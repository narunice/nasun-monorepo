// #2b get-user-profile root PATCH update -- pure validation, a byte-faithful port of the
// get-user-profile lambda's PATCH validators (cdk/lambda-src/get-user-profile/index.ts). The lambda is
// the SoT for the exact regexes / codepoint ranges / length bounds / error strings; this module mirrors
// them so the box-direct PATCH returns the identical 400 messages.
//
// The control/zero-width codepoint classes are built from NUMERIC ranges (not literal characters) so the
// source stays pure ASCII -- a literal control/zero-width char in a regex is a homograph footgun (a
// reviewer cannot see it). Each range below is annotated with the lambda line it mirrors.

// Build a regex character-class body ("\uXXXX-\uYYYY...") from [lo, hi] codepoint ranges.
function classFromRanges(ranges: ReadonlyArray<readonly [number, number]>): string {
  const hx = (n: number) => '\\u' + n.toString(16).padStart(4, '0');
  return ranges.map(([a, b]) => (a === b ? hx(a) : `${hx(a)}-${hx(b)}`)).join('');
}

// index.ts:343 DISPLAY_NAME_BLOCKLIST -- reject on PRESENCE: C0 controls, DEL+C1, zero-width/directional,
// bidi-override, isolates, BOM.
const BLOCKLIST_RANGES = [
  [0x0000, 0x001f], [0x007f, 0x009f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff],
] as const;
const DISPLAY_NAME_BLOCKLIST = new RegExp(`[${classFromRanges(BLOCKLIST_RANGES)}]`);

// index.ts:63-64 canonicalizeDisplayName strip ranges -- WIDER than the blocklist (adds U+00AD and
// U+2060-2064 / U+206A-206F) because its job is to detect "only invisible characters".
const CANON_STRIP1_RANGES = [
  [0x00ad, 0x00ad], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff],
] as const;
const CANON_STRIP2_RANGES = [[0x0000, 0x001f], [0x007f, 0x009f]] as const;
const CANON_STRIP1 = new RegExp(`[${classFromRanges(CANON_STRIP1_RANGES)}]`, 'g');
const CANON_STRIP2 = new RegExp(`[${classFromRanges(CANON_STRIP2_RANGES)}]`, 'g');

// index.ts:344-345 -- a 0x-hex or @ prefix is a wallet/mention spoof.
const WALLET_SPOOFING = /^0x[0-9a-f]/i;
const MENTION_SPOOFING = /^@/;

// index.ts:354-358 -- linked external-wallet address formats.
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type LinkChain = 'sui' | 'solana';
export const LINK_FIELD: Record<LinkChain, string> = {
  sui: 'linkedSuiAddress',
  solana: 'linkedSolanaAddress',
};

// index.ts:58-67 -- mirror of @nasun/profile-core canonicalizeDisplayName: NFKC + lowercase, strip the
// invisible/format codepoints, collapse whitespace. Used solely for the zero-width-only guard.
export function canonicalizeDisplayName(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(CANON_STRIP1, '')
    .replace(CANON_STRIP2, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// index.ts:43-51 -- avatarKey must be the caller's own profile-images/<identityId>/<uuid-v4>.<ext> path.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function buildAvatarKeyRegex(identityId: string): RegExp {
  const id = escapeRegExp(identityId);
  return new RegExp(
    `^profile-images/${id}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|jpeg|webp)$`,
  );
}

export type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

// index.ts:964-997 -- trim -> collapse 2+ spaces -> length 2-30 -> blocklist -> spoofing -> canonicalize
// non-empty. Returns the COLLAPSED string the lambda writes (validatedDisplayName === normalized).
export function validateDisplayName(raw: string): Validated<string> {
  const normalized = raw.trim().replace(/\s{2,}/g, ' ');
  if (normalized.length < 2 || normalized.length > 30) {
    return { ok: false, message: 'Display name must be 2-30 characters' };
  }
  if (DISPLAY_NAME_BLOCKLIST.test(normalized)) {
    return { ok: false, message: 'Display name contains invalid characters' };
  }
  if (WALLET_SPOOFING.test(normalized) || MENTION_SPOOFING.test(normalized)) {
    return { ok: false, message: 'Display name cannot start with @ or 0x' };
  }
  if (canonicalizeDisplayName(normalized).length === 0) {
    return { ok: false, message: 'Display name cannot be only invisible characters' };
  }
  return { ok: true, value: normalized };
}

// index.ts:354-367 -- sui: 0x+64hex -> lowercase; solana: base58 32-44 -> case-preserved. null on bad format.
export function normalizeLinkedAddress(chain: LinkChain, raw: string): string | null {
  const trimmed = raw.trim();
  if (chain === 'sui') return SUI_ADDRESS_RE.test(trimmed) ? trimmed.toLowerCase() : null;
  return SOL_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

// index.ts:1002-1017 -- a non-null linked input must normalize, else 400 (the caller handles null/'' = clear).
export function validateLinkedAddress(chain: LinkChain, raw: string): Validated<string> {
  const normalized = normalizeLinkedAddress(chain, raw);
  if (!normalized) return { ok: false, message: `Invalid ${chain} address format` };
  return { ok: true, value: normalized };
}

// index.ts:1020-1033 -- a non-empty avatarKey must match the caller's own path (the caller handles null/'' = clear).
export function validateAvatarKey(identityId: string, input: string): Validated<string> {
  if (buildAvatarKeyRegex(identityId).test(input)) return { ok: true, value: input };
  return {
    ok: false,
    message: 'Invalid avatarKey: must match profile-images/<your-id>/<uuid>.{png|jpg|jpeg|webp}',
  };
}
