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
export type ResolverKind = 'crypto' | 'stock' | 'space' | 'music' | 'sports' | 'weather' | 'ufc' | 'esports';

/**
 * Detect resolver kind from a `Kind:` line in the resolution criteria.
 * Falls back to `null` so the caller can route to the legacy parser
 * (crypto/stock by Source URL host) for backwards compatibility.
 *
 * Provider fallback: some music markets were created without the `Kind: music`
 * header (the dated create-full-batch-2026-06-06 / -06-22 scripts start the
 * criteria at `Provider: itunes_rss`). On-chain criteria is immutable, so
 * without this fallback those markets hang `pending` forever and get wrongly
 * cancel-refunded at their deadline instead of resolving. The `itunes_rss`
 * provider tag is music-specific, so this is an unambiguous route; crypto/stock
 * carry no Provider line and still fall through to the legacy Source-host parser.
 */
export function detectKind(text: string): ResolverKind | null {
  const m = /^Kind:\s*([a-z]+)\s*$/im.exec(text);
  if (m) {
    const kind = m[1].toLowerCase();
    if (kind === 'crypto' || kind === 'stock' || kind === 'space' || kind === 'music' || kind === 'sports' || kind === 'weather' || kind === 'ufc' || kind === 'esports') {
      return kind;
    }
    return null;
  }
  if (/^Provider:\s*itunes_rss\s*$/im.test(text)) return 'music';
  return null;
}
