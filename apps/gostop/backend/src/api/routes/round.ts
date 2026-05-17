/**
 * Round replay endpoint — Tier 0 §0.1.3.
 *
 *   GET /api/gostop/round/:game/:session_id
 *
 * Returns the canonical game_round row plus game-specific JOINs:
 *   - lottery: matched lottery_ticket + lottery_round draw info
 *   - crash:   matched crash_round + all crash_cashout rows (multiplier curve)
 *   - others:  bare game_round (Tier 0 has no per-game synthesized table)
 *
 * Visibility:
 *   - opt-out player → 404 (do not reveal existence)
 *   - anonymous player → player field replaced by stable anon_id
 *   - delayed player + round < 24h old → 404 until window passes
 */

import { Hono } from 'hono';
import { reader } from '../../db/client.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { applyMask, type FeedVisibility } from '../lib/visibility-mask.js';
import { getVisibility } from '../lib/visibility-lookup.js';
import { GAMES, type GameKey } from '../../config/contracts.js';
import { env } from '../../env.js';

const CACHE_TTL_SECONDS = 60;
const SESSION_HEX_RE = /^[0-9a-f]+$/i;
const SESSION_MAX_BYTES = 32;
const SESSION_MIN_BYTES = 4;

const GAME_KEYS: GameKey[] = ['lottery', 'scratchcard', 'numbermatch', 'crash', 'mines', 'wheel'];
const GAME_KEY_SET = new Set<string>(GAME_KEYS);

export const roundRoutes = new Hono();

type GameRoundRow = {
  id: string;
  tx_digest: string;
  event_seq: number;
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  timestamp_ms: string;
  status: string;
};

type LotteryTicketRow = {
  round_number: string;
  ticket_id: string;
  numbers: number[];
  match_count: number | null;
  tier: number | null;
  expected_payout: string | null;
  claim_tx: string | null;
  claim_ts_ms: string | null;
  claimed_payout: string | null;
  status: string;
};

type LotteryRoundRow = {
  round_number: string;
  drawn_numbers: number[] | null;
  drawn_at_ms: string | null;
  claim_deadline_ms: string | null;
  tier1_payout: string | null;
  tier2_payout: string | null;
  tier3_payout: string | null;
};

type CrashRoundRow = {
  round_id: string;
  commit_hash: Buffer | null;
  salt: Buffer | null;
  resolved: boolean;
  resolve_ts_ms: string | null;
  crash_point_bps: string | null;
  crash_time_ms: string | null;
  total_bet: string | null;
  total_payout: string | null;
  cashout_count: number | null;
  commit_verified: boolean | null;
};

type CrashCashoutRow = {
  player: string;
  cashout_mul_bps: string;
  cashout_ts_ms: string;
};

roundRoutes.get('/:game/:session_id', async (c) => {
  const game = c.req.param('game');
  const sessionHexRaw = c.req.param('session_id');

  if (!GAME_KEY_SET.has(game)) {
    return c.json({ error: 'bad_request', reason: 'invalid_game' }, 400);
  }
  if (!sessionHexRaw || !SESSION_HEX_RE.test(sessionHexRaw)
      || sessionHexRaw.length % 2 !== 0
      || sessionHexRaw.length / 2 < SESSION_MIN_BYTES
      || sessionHexRaw.length / 2 > SESSION_MAX_BYTES) {
    return c.json({ error: 'bad_request', reason: 'invalid_session_id' }, 400);
  }

  const gameKey = game as GameKey;
  const gameId = GAMES[gameKey].gameId;
  const sessionHex = sessionHexRaw.toLowerCase();
  const sessionBuf = Buffer.from(sessionHex, 'hex');

  const cacheKey = `round:${gameKey}:${sessionHex}`;
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
  const baseRows = await sql<GameRoundRow[]>`
    SELECT
      id::text,
      tx_digest,
      event_seq,
      game_id,
      player,
      bet_amount::text,
      payout::text,
      multiplier_bps::text,
      timestamp_ms::text,
      status
    FROM gostop.game_round
    WHERE game_id = ${gameId} AND session_id = ${sessionBuf}
    ORDER BY id ASC
    LIMIT 1
  `;
  if (baseRows.length === 0) {
    return c.json({ error: 'not_found' }, 404);
  }
  const base = baseRows[0]!;

  // Visibility gate. Note: opt-out + delayed-within-24h are equivalent to
  // not-exposing-this-round, so we return 404 (consistent with feed behavior).
  const visibility = await getVisibility(sql, base.player);
  const roundTs = Number(base.timestamp_ms);
  const masked = applyMask(base.player, visibility, roundTs, env.feed.anonSalt);
  if (!masked) {
    return c.json({ error: 'not_found' }, 404);
  }

  let extras:
    | { kind: 'lottery'; ticket: LotteryTicketRow | null; round: LotteryRoundRow | null }
    | { kind: 'crash'; round: CrashRoundRow | null; cashouts: CrashCashoutRow[] }
    | { kind: 'generic' };

  if (gameKey === 'lottery') {
    // session_id = bcs(round_number) ‖ bcs(ticket_id), 8 + 8 bytes (little-endian).
    let ticketRow: LotteryTicketRow | null = null;
    let lroundRow: LotteryRoundRow | null = null;
    if (sessionBuf.length >= 16) {
      const roundNumber = sessionBuf.readBigUInt64LE(0).toString();
      const ticketId = sessionBuf.readBigUInt64LE(8).toString();
      const tRows = await sql<LotteryTicketRow[]>`
        SELECT
          round_number::text, ticket_id::text, numbers, match_count, tier,
          expected_payout::text, claim_tx, claim_ts_ms::text,
          claimed_payout::text, status
        FROM gostop.lottery_ticket
        WHERE round_number = ${roundNumber} AND ticket_id = ${ticketId}
        LIMIT 1
      `;
      ticketRow = tRows[0] ?? null;
      const rRows = await sql<LotteryRoundRow[]>`
        SELECT
          round_number::text, drawn_numbers, drawn_at_ms::text,
          claim_deadline_ms::text,
          tier1_payout::text, tier2_payout::text, tier3_payout::text
        FROM gostop.lottery_round
        WHERE round_number = ${roundNumber}
        LIMIT 1
      `;
      lroundRow = rRows[0] ?? null;
    }
    extras = { kind: 'lottery', ticket: ticketRow, round: lroundRow };
  } else if (gameKey === 'crash') {
    // session_id for crash is the round_id (bcs u64). Resolve crash_round + cashouts.
    let crashRound: CrashRoundRow | null = null;
    let cashouts: CrashCashoutRow[] = [];
    if (sessionBuf.length >= 8) {
      const roundId = sessionBuf.readBigUInt64LE(0).toString();
      const cRows = await sql<CrashRoundRow[]>`
        SELECT
          round_id::text, commit_hash, salt, resolved,
          resolve_ts_ms::text, crash_point_bps::text, crash_time_ms::text,
          total_bet::text, total_payout::text, cashout_count, commit_verified
        FROM gostop.crash_round
        WHERE round_id = ${roundId}
        LIMIT 1
      `;
      crashRound = cRows[0] ?? null;
      cashouts = await sql<CrashCashoutRow[]>`
        SELECT player, cashout_mul_bps::text, cashout_ts_ms::text
        FROM gostop.crash_cashout
        WHERE round_id = ${roundId}
        ORDER BY cashout_ts_ms ASC
      `;
      // Mask each cashout participant. Single bulk query to user_settings.
      if (cashouts.length > 0) {
        const players = cashouts.map((c) => c.player.toLowerCase());
        const visRows = await sql<{ player: string; feed_visibility: FeedVisibility }[]>`
          SELECT player, feed_visibility
          FROM gostop.user_settings
          WHERE player = ANY(${players}) AND feed_visibility <> 'public'
        `;
        const visMap = new Map(visRows.map((r) => [r.player.toLowerCase(), r.feed_visibility]));
        cashouts = cashouts.flatMap((co) => {
          const v = visMap.get(co.player.toLowerCase()) ?? 'public';
          const m = applyMask(co.player, v, Number(co.cashout_ts_ms), env.feed.anonSalt);
          if (!m) return [];
          return [{ ...co, player: m.player }];
        });
      }
    }
    extras = { kind: 'crash', round: crashRound, cashouts };
  } else {
    extras = { kind: 'generic' };
  }

  const payload = {
    game: gameKey,
    session_id: sessionHex,
    round: {
      id: Number(base.id),
      tx_digest: base.tx_digest,
      event_seq: base.event_seq,
      game_id: base.game_id,
      player: masked.player,
      anonymous: masked.anonymous,
      bet_amount: base.bet_amount,
      payout: base.payout,
      multiplier_bps: base.multiplier_bps,
      timestamp_ms: roundTs,
      status: base.status,
    },
    extras: serializeExtras(extras),
    generated_at: Date.now(),
  };

  const etag = cacheSet(cacheKey, payload, CACHE_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
  return c.json(payload);
});

function serializeExtras(
  extras:
    | { kind: 'lottery'; ticket: LotteryTicketRow | null; round: LotteryRoundRow | null }
    | { kind: 'crash'; round: CrashRoundRow | null; cashouts: CrashCashoutRow[] }
    | { kind: 'generic' },
): unknown {
  if (extras.kind === 'lottery') {
    return {
      kind: 'lottery',
      ticket: extras.ticket
        ? {
            round_number: Number(extras.ticket.round_number),
            ticket_id: extras.ticket.ticket_id,
            numbers: extras.ticket.numbers,
            match_count: extras.ticket.match_count,
            tier: extras.ticket.tier,
            expected_payout: extras.ticket.expected_payout ?? '0',
            claim_tx: extras.ticket.claim_tx,
            claim_ts_ms: extras.ticket.claim_ts_ms ? Number(extras.ticket.claim_ts_ms) : null,
            claimed_payout: extras.ticket.claimed_payout ?? '0',
            status: extras.ticket.status,
          }
        : null,
      round: extras.round
        ? {
            round_number: Number(extras.round.round_number),
            drawn_numbers: extras.round.drawn_numbers ?? [],
            drawn_at_ms: extras.round.drawn_at_ms ? Number(extras.round.drawn_at_ms) : null,
            claim_deadline_ms: extras.round.claim_deadline_ms ? Number(extras.round.claim_deadline_ms) : null,
            tier1_payout: extras.round.tier1_payout ?? '0',
            tier2_payout: extras.round.tier2_payout ?? '0',
            tier3_payout: extras.round.tier3_payout ?? '0',
          }
        : null,
    };
  }
  if (extras.kind === 'crash') {
    return {
      kind: 'crash',
      round: extras.round
        ? {
            round_id: extras.round.round_id,
            commit_hash: extras.round.commit_hash ? '0x' + extras.round.commit_hash.toString('hex') : null,
            salt: extras.round.salt ? '0x' + extras.round.salt.toString('hex') : null,
            resolved: extras.round.resolved,
            resolve_ts_ms: extras.round.resolve_ts_ms ? Number(extras.round.resolve_ts_ms) : null,
            crash_point_bps: extras.round.crash_point_bps ?? '0',
            crash_time_ms: extras.round.crash_time_ms ? Number(extras.round.crash_time_ms) : null,
            total_bet: extras.round.total_bet ?? '0',
            total_payout: extras.round.total_payout ?? '0',
            cashout_count: extras.round.cashout_count ?? 0,
            commit_verified: extras.round.commit_verified,
          }
        : null,
      cashouts: extras.cashouts.map((co) => ({
        player: co.player,
        cashout_mul_bps: co.cashout_mul_bps,
        cashout_ts_ms: Number(co.cashout_ts_ms),
      })),
    };
  }
  return { kind: 'generic' };
}
