/**
 * Streak endpoint — Tier 0 §0.1.4.
 *
 *   GET /api/gostop/streak/:player                (cross-game streak)
 *   GET /api/gostop/streak/:player?game=N         (per-game streak)
 *
 * Returns the player's current win or loss streak based on the most recent
 * 200 final rounds. When `game` is provided (a valid game_id 1..6) the SQL
 * filters to that game alone, so a per-game page (e.g. Wheel) can show a
 * streak that reflects only the rounds the player sees in their filtered
 * history. Without `game`, the streak aggregates across all gostop games.
 *
 * Per-game variant was added 2026-05-20 after user feedback that a
 * cross-game badge surfaced on a single-game page reads as game-specific.
 *
 * Cache TTL 5s (keyed per (player, game)); short to keep the post-bet UX
 * responsive while still absorbing burst polling.
 *
 * Visibility:
 *   - opt-out   → 404 (player has chosen full exclusion)
 *   - anonymous → 404 (keyed lookup by raw address would defeat anonymity)
 *   - delayed   → 404 (matches the leaderboard's full-exclusion policy and
 *                 honors the user-facing "rounds appear after 24h" promise.
 *                 The endpoint would otherwise leak kind / length /
 *                 started_ts_ms in real time, which lets any observer
 *                 reconstruct the wallet's activity rhythm — the exact
 *                 concern raised in Tier 0 plan v2 §3. Self-view stays
 *                 available via the JWT-bound /me/streak route.)
 */

import { Hono } from 'hono';
import { reader } from '../../db/client.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { getVisibility } from '../lib/visibility-lookup.js';
import { reduceStreak, type StreakRoundInput } from '../lib/streak.js';

const PLAYER_RE = /^0x[0-9a-f]{64}$/i;
const ROUND_LOOKBACK = 200;
const CACHE_TTL_SECONDS = 5;
// Valid gostop game_ids. Kept in sync with devnet-ids.json (per-game block
// `gameId` field). Update when a new game is published.
const VALID_GAME_IDS = new Set([1, 2, 3, 4, 5, 6]);

export const streakRoutes = new Hono();

type StreakSqlRow = { payout: string; bet_amount: string; timestamp_ms: string };

streakRoutes.get('/:player', async (c) => {
  const playerRaw = c.req.param('player');
  if (!playerRaw || !PLAYER_RE.test(playerRaw)) {
    return c.json({ error: 'bad_request', reason: 'invalid_player' }, 400);
  }
  const player = playerRaw.toLowerCase();

  // Optional per-game filter. Strict parse: only emit a SQL filter when the
  // value is one of the known game_ids; any other input (out-of-range,
  // non-numeric, empty) is treated as no-filter (cross-game) rather than 400
  // so an outdated frontend cannot break the badge entirely.
  const gameRaw = c.req.query('game');
  const gameId = gameRaw !== undefined ? Number(gameRaw) : null;
  const game = gameId !== null && Number.isInteger(gameId) && VALID_GAME_IDS.has(gameId) ? gameId : null;

  const cacheKey = game === null ? `streak:${player}:all` : `streak:${player}:g${game}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
    return c.json(cached.value);
  }

  const sql = reader();

  const visibility = await getVisibility(sql, player);
  if (visibility !== 'public') {
    // opt-out / anonymous / delayed all 404 here. Self-view is /me/streak.
    return c.json({ error: 'not_found' }, 404);
  }

  const rows = game === null
    ? await sql<StreakSqlRow[]>`
        SELECT payout::text, bet_amount::text, timestamp_ms::text
        FROM gostop.game_round
        WHERE player = ${player} AND status = 'final'
        ORDER BY timestamp_ms DESC
        LIMIT ${ROUND_LOOKBACK}
      `
    : await sql<StreakSqlRow[]>`
        SELECT payout::text, bet_amount::text, timestamp_ms::text
        FROM gostop.game_round
        WHERE player = ${player} AND status = 'final' AND game_id = ${game}
        ORDER BY timestamp_ms DESC
        LIMIT ${ROUND_LOOKBACK}
      `;
  const inputs: StreakRoundInput[] = rows.map((r) => ({
    payout: BigInt(r.payout),
    bet_amount: BigInt(r.bet_amount),
    timestamp_ms: Number(r.timestamp_ms),
  }));
  const streak = reduceStreak(inputs);

  const payload = {
    player,
    game,
    kind: streak.kind,
    length: streak.length,
    started_ts_ms: streak.started_ts_ms,
    generated_at: Date.now(),
  };
  const etag = cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  return c.json(payload);
});
