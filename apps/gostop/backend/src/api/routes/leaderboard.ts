/**
 * Leaderboard route — Tier 0 §0.1.1.
 *
 *   GET /api/gostop/leaderboard?period=24h|7d|30d|all&game=all|1..6&metric=net_pnl|volume|rounds&limit=N
 *   GET /api/gostop/leaderboard/me  (auth required)
 *
 * Caching: 10s in-memory TTL keyed on (period, game, metric, limit) + ETag.
 * Excludes wallets with feed_visibility='opt-out' (Tier 0.1 whale transparency).
 */

import { Hono } from 'hono';
import { reader } from '../../db/client.js';
import { env } from '../../env.js';
import {
  queryLeaderboard,
  queryLeaderboardForPlayer,
  type GameFilter,
  type LeaderboardRow,
  type Metric,
  type Period,
} from '../lib/leaderboard-query.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import {
  loadVisibilityClassification,
  type VisibilityClassification,
} from '../lib/visibility-lookup.js';
import { anonId } from '../lib/visibility-mask.js';
import { requireAuth, type AuthVars } from '../auth/middleware.js';

const PERIODS = new Set<Period>(['24h', '7d', '30d', 'all']);
const METRICS = new Set<Metric>(['net_pnl', 'volume', 'rounds']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CACHE_TTL_SECONDS = 10;

function parsePeriod(s: string | undefined): Period | null {
  return s && PERIODS.has(s as Period) ? (s as Period) : null;
}

function parseGame(s: string | undefined): GameFilter | null {
  if (!s || s === 'all') return 'all';
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 6) return null;
  return n as GameFilter;
}

function parseMetric(s: string | undefined): Metric | null {
  return s && METRICS.has(s as Metric) ? (s as Metric) : null;
}

function parseLimit(s: string | undefined): number {
  if (!s) return DEFAULT_LIMIT;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function applyAnonymousMask(
  rows: LeaderboardRow[],
  anonymous: Set<string>,
): LeaderboardRow[] {
  if (anonymous.size === 0) return rows;
  const salt = env.feed.anonSalt;
  return rows.map((row) => {
    if (!anonymous.has(row.player.toLowerCase())) return row;
    return { ...row, player: anonId(row.player, salt) };
  });
}

/**
 * Players the public leaderboard must hide via SQL exclusion: opt-out (full
 * removal) and delayed (24h-rolling activity is treated as not-yet-public, so
 * the safe Tier 0 default is to exclude from leaderboard entirely rather than
 * leak a "row exists but is delayed" signal).
 */
function buildExcludeList(
  vis: VisibilityClassification,
  keepPlayer?: string,
): string[] {
  const set = new Set<string>(vis.optOut);
  for (const p of vis.delayed) set.add(p);
  if (keepPlayer) set.delete(keepPlayer.toLowerCase());
  return Array.from(set);
}

export const leaderboardRoutes = new Hono<{ Variables: AuthVars }>();

leaderboardRoutes.get('/', async (c) => {
  const period = parsePeriod(c.req.query('period') ?? 'all');
  const game = parseGame(c.req.query('game'));
  const metric = parseMetric(c.req.query('metric') ?? 'net_pnl');
  const limit = parseLimit(c.req.query('limit'));

  if (!period) return c.json({ error: 'bad_request', reason: 'invalid_period' }, 400);
  if (game === null) return c.json({ error: 'bad_request', reason: 'invalid_game' }, 400);
  if (!metric) return c.json({ error: 'bad_request', reason: 'invalid_metric' }, 400);

  const cacheKey = `leaderboard:${period}:${game}:${metric}:${limit}`;
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

  const visibility = await loadVisibilityClassification();
  const rawRows = await queryLeaderboard(reader(), {
    period,
    game,
    metric,
    limit,
    excludePlayers: buildExcludeList(visibility),
  });
  const rows = applyAnonymousMask(rawRows, visibility.anonymous);

  const payload = {
    period,
    game,
    metric,
    limit,
    rows,
    generated_at: Date.now(),
  };
  const etag = cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  return c.json(payload);
});

leaderboardRoutes.get('/me', requireAuth, async (c) => {
  const period = parsePeriod(c.req.query('period') ?? 'all');
  const game = parseGame(c.req.query('game'));
  const metric = parseMetric(c.req.query('metric') ?? 'net_pnl');
  if (!period) return c.json({ error: 'bad_request', reason: 'invalid_period' }, 400);
  if (game === null) return c.json({ error: 'bad_request', reason: 'invalid_game' }, 400);
  if (!metric) return c.json({ error: 'bad_request', reason: 'invalid_metric' }, 400);

  // DB stores `player` lowercased; normalize at the route boundary so a
  // mixed-case JWT claim doesn't silently miss self-row + exclude matching.
  const wallet = c.get('wallet').toLowerCase();
  const visibility = await loadVisibilityClassification();
  // The caller's /me view always returns their own stats even if they are
  // delayed/anonymous — visibility is about how OTHERS see them, not self.
  const row = await queryLeaderboardForPlayer(reader(), {
    player: wallet,
    period,
    game,
    metric,
    excludePlayers: buildExcludeList(visibility, wallet),
  });
  c.header('Cache-Control', 'no-store');
  return c.json({ period, game, metric, row });
});
