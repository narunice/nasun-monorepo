/**
 * Transparency endpoints — Tier 0 §0.1.2 (whale transparency, RTP proof, VRF count).
 *
 *   GET /api/gostop/transparency           — per-game RTP + house PnL + VRF proof count (30s cache)
 *   GET /api/gostop/lottery/draws?limit=N  — recent settled lottery rounds (60s cache, limit ≤ 100)
 *
 * Aggregate-only data, no per-player identification. No visibility mask needed.
 */

import { Hono } from 'hono';
import { reader } from '../../db/client.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { GAMES, type GameKey } from '../../config/contracts.js';

const TRANSPARENCY_TTL_SECONDS = 30;
const DRAWS_TTL_SECONDS = 60;
const DRAWS_DEFAULT_LIMIT = 20;
const DRAWS_MAX_LIMIT = 100;

export const transparencyRoutes = new Hono();

type GameAggRow = {
  game_id: number;
  total_bet: string;
  total_payout: string;
};

type GameTransparency = {
  game_id: number;
  key: GameKey;
  rtp_bps: number;          // realized RTP in basis points (10_000 = 100%)
  total_bet_raw: string;    // SUM(bet), bigint string (NUSDC base units)
  total_payout_raw: string; // SUM(payout), bigint string
  house_pnl_raw: string;    // SUM(bet) - SUM(payout), bigint string
  commit_proof_count: number;
};

transparencyRoutes.get('/transparency', async (c) => {
  const cacheKey = `transparency:summary`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', `public, max-age=${TRANSPARENCY_TTL_SECONDS}`);
    return c.json(cached.value);
  }

  const sql = reader();

  // Per-game RTP + house PnL. Pull from game_daily matview to avoid full
  // game_round scan; matview already enforces status IN ('final','unclaimed_expired').
  const aggRows = await sql<GameAggRow[]>`
    SELECT
      game_id,
      SUM(total_bet)::text     AS total_bet,
      SUM(total_payout)::text  AS total_payout
    FROM gostop.game_daily
    GROUP BY game_id
  `;

  // VRF/commit proof count — currently only crash records commit hashes.
  // L1 placeholder filter: length(commit_hash) > 0 (genesis rounds had empty bytea).
  const crashCommitRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM gostop.crash_round
    WHERE commit_verified = true AND length(commit_hash) > 0
  `;
  const crashCommitCount = Number(crashCommitRows[0]?.count ?? 0);

  const aggByGameId = new Map<number, GameAggRow>();
  for (const r of aggRows) aggByGameId.set(Number(r.game_id), r);

  const games: GameTransparency[] = [];
  for (const cfg of Object.values(GAMES)) {
    const agg = aggByGameId.get(cfg.gameId);
    const totalBet = BigInt(agg?.total_bet ?? '0');
    const totalPayout = BigInt(agg?.total_payout ?? '0');
    const rtpBps = totalBet > 0n
      ? Number((totalPayout * 10_000n) / totalBet)
      : 0;
    const housePnl = totalBet - totalPayout;
    games.push({
      game_id: cfg.gameId,
      key: cfg.key,
      rtp_bps: rtpBps,
      total_bet_raw: totalBet.toString(),
      total_payout_raw: totalPayout.toString(),
      house_pnl_raw: housePnl.toString(),
      commit_proof_count: cfg.key === 'crash' ? crashCommitCount : 0,
    });
  }
  games.sort((a, b) => a.game_id - b.game_id);

  const payload = { games, generated_at: Date.now() };
  const etag = cacheSet(cacheKey, payload, TRANSPARENCY_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${TRANSPARENCY_TTL_SECONDS}`);
  return c.json(payload);
});

type LotteryDrawRow = {
  round_number: string;
  draw_time_ms: string;
  drawn_numbers: number[] | null;
  drawn_at_ms: string | null;
  tier1_winners: number | null;
  tier2_winners: number | null;
  tier3_winners: number | null;
  tier1_payout: string | null;
  tier2_payout: string | null;
  tier3_payout: string | null;
  treasury_amount: string | null;
  claim_deadline_ms: string | null;
  fully_claimed_at_ms: string | null;
  draw_tx_digest: string | null;
};

transparencyRoutes.get('/lottery/draws', async (c) => {
  const limitParam = c.req.query('limit');
  let limit = DRAWS_DEFAULT_LIMIT;
  if (limitParam !== undefined) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1) {
      return c.json({ error: 'bad_request', reason: 'invalid_limit' }, 400);
    }
    limit = Math.min(n, DRAWS_MAX_LIMIT);
  }

  const cacheKey = `transparency:lottery-draws:${limit}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', `public, max-age=${DRAWS_TTL_SECONDS}`);
    return c.json(cached.value);
  }

  const sql = reader();
  const rows = await sql<LotteryDrawRow[]>`
    SELECT
      round_number::text,
      draw_time_ms::text,
      drawn_numbers,
      drawn_at_ms::text,
      tier1_winners,
      tier2_winners,
      tier3_winners,
      tier1_payout::text,
      tier2_payout::text,
      tier3_payout::text,
      treasury_amount::text,
      claim_deadline_ms::text,
      fully_claimed_at_ms::text,
      draw_tx_digest
    FROM gostop.lottery_round
    WHERE settled = true
    ORDER BY round_number DESC
    LIMIT ${limit}
  `;

  const draws = rows.map((r) => ({
    round_number: Number(r.round_number),
    draw_time_ms: r.draw_time_ms ? Number(r.draw_time_ms) : null,
    drawn_numbers: r.drawn_numbers ?? [],
    drawn_at_ms: r.drawn_at_ms ? Number(r.drawn_at_ms) : null,
    tier1_winners: r.tier1_winners ?? 0,
    tier2_winners: r.tier2_winners ?? 0,
    tier3_winners: r.tier3_winners ?? 0,
    tier1_payout: r.tier1_payout ?? '0',
    tier2_payout: r.tier2_payout ?? '0',
    tier3_payout: r.tier3_payout ?? '0',
    treasury_amount: r.treasury_amount ?? '0',
    claim_deadline_ms: r.claim_deadline_ms ? Number(r.claim_deadline_ms) : null,
    fully_claimed_at_ms: r.fully_claimed_at_ms ? Number(r.fully_claimed_at_ms) : null,
    draw_tx_digest: r.draw_tx_digest,
  }));

  const payload = { draws, limit, generated_at: Date.now() };
  const etag = cacheSet(cacheKey, payload, DRAWS_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${DRAWS_TTL_SECONDS}`);
  return c.json(payload);
});

export type { GameTransparency };
