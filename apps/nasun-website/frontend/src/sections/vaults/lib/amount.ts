/**
 * Safe user-input parsing for vault amounts. These return null on any invalid
 * input instead of throwing, so event handlers never throw synchronously while
 * evaluating a call argument (which would escape useVaultActions.execute's
 * try/catch and surface as an uncaught exception in an async handler).
 */

// On-chain NAV fixed-point scale (vault.move NAV_SCALE = 1e9). nav fields from
// the API are integers in these units; divide by NAV_SCALE for nav-per-share.
export const NAV_SCALE = 1e9;

// Parse a human decimal string into raw base units (10^decimals). Returns null
// for empty/non-numeric/negative/zero input. Uses string math to avoid the
// float precision loss of Number(x) * 10^decimals for large amounts.
export function parseUnits(human: string, decimals: number): bigint | null {
  const s = human.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [intPart, fracPartRaw = ""] = s.split(".");
  if (fracPartRaw.length > decimals) return null; // more precision than the token supports
  const frac = fracPartRaw.padEnd(decimals, "0");
  const raw = BigInt(intPart || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return raw > 0n ? raw : null;
}

// Parse a positive integer share count. Returns null for non-integer / <= 0.
export function parseShares(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const v = BigInt(t);
  return v > 0n ? v : null;
}

// Parse a percentage (e.g. "10", "12.5") into basis points, bounded [0, maxBps].
export function parseFeeBps(s: string, maxBps: number): bigint | null {
  const t = s.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const pct = Number(t);
  if (!Number.isFinite(pct) || pct < 0) return null;
  const bps = Math.round(pct * 100);
  if (bps > maxBps) return null;
  return BigInt(bps);
}
