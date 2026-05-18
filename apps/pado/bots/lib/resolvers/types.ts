/**
 * Resolver dispatch types for prediction-keeper.
 *
 * New categories (space, music, sports, weather) each export a resolve()
 * function returning ResolveResult. The keeper picks the resolver via
 * detectKind() on the criteria text, then acts on the result:
 *
 *   resolved -> submit resolve_market(outcome)
 *   pending  -> retry next tick; if past resolve_deadline + EXPIRE_GRACE_MS,
 *               submit permissionless cancel_expired_market
 *
 * Existing crypto/stock paths are adapted at the dispatch boundary
 * (boolean -> ResolveResult). The legacy parser stays in prediction-criteria.ts.
 */

export type ResolveResult =
  | { state: 'resolved'; outcome: boolean; evidence: string }
  | { state: 'pending'; reason: string };

/**
 * Keeper-side margin past `resolve_deadline` before calling
 * `cancel_expired_market`. Move asserts `now > resolve_deadline` strictly;
 * the buffer absorbs RPC clock skew so the permissionless cancel does not
 * abort the first attempt.
 */
export const EXPIRE_GRACE_MS = 5 * 60_000;

/** Identifier returned by `detectKind()` for dispatch. */
export type ResolverKind = 'crypto' | 'stock' | 'space' | 'music' | 'sports' | 'weather';

/**
 * Detect resolver kind from a `Kind:` line in the resolution criteria.
 * Falls back to `null` so the caller can route to the legacy parser
 * (crypto/stock by Source URL host) for backwards compatibility.
 */
export function detectKind(text: string): ResolverKind | null {
  const m = /^Kind:\s*([a-z]+)\s*$/im.exec(text);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (kind === 'crypto' || kind === 'stock' || kind === 'space' || kind === 'music' || kind === 'sports' || kind === 'weather') {
    return kind;
  }
  return null;
}
