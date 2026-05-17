/**
 * Whale transparency masking. 4 tiers from user_settings.feed_visibility:
 *   public    — full address, full stats
 *   anonymous — address masked to prefix...suffix; stable anon_id for grouping
 *   delayed   — only rows older than 24h are exposed
 *   opt-out   — fully excluded from feed/leaderboard
 *
 * Masking is applied at the API layer (not the indexer). The indexer always
 * stores raw data so policy changes don't require reindex.
 */

import { createHash } from 'node:crypto';

export type FeedVisibility = 'public' | 'anonymous' | 'delayed' | 'opt-out';

export type MaskedRow = {
  player: string;          // masked player id (anon_id or address)
  anonymous: boolean;
};

const DELAY_MS = 24 * 60 * 60 * 1000;

export function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Stable anonymous identifier for a player. Same wallet always maps to same
 * anon_id so cumulative stats remain groupable without revealing the address.
 * Salted hash; not reversible.
 */
export function anonId(player: string, salt: string): string {
  return 'anon_' + createHash('sha256')
    .update(salt + ':' + player.toLowerCase())
    .digest('hex')
    .slice(0, 10);
}

/**
 * Apply visibility policy to a single row. Caller must pre-filter `opt-out`
 * via SQL (we can't represent removal here). Returns null if `delayed` and
 * the row is younger than 24h, so caller should drop it.
 */
export function applyMask(
  player: string,
  visibility: FeedVisibility,
  timestampMs: number,
  salt: string,
): MaskedRow | null {
  if (visibility === 'opt-out') return null;
  if (visibility === 'delayed' && Date.now() - timestampMs < DELAY_MS) return null;
  if (visibility === 'anonymous') {
    return { player: anonId(player, salt), anonymous: true };
  }
  return { player, anonymous: false };
}
