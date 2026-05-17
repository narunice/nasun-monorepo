/**
 * Lottery event synthesis (Tier 0.0 spike B-plan).
 *
 * Six streams cooperate to maintain `gostop.lottery_round` /
 * `gostop.lottery_ticket` plus a `gostop.game_round` row per ticket. The
 * canonical row's lifecycle:
 *
 *   TicketPurchased  -> game_round (status='pending_resolve', payout=0)
 *   NumbersDrawn     -> ticket.match_count/tier set; losers -> game_round.status='final'
 *   RoundSettled     -> winning tickets get expected_payout
 *   PrizeClaimed     -> game_round payout/multiplier set; status='final'
 *   UnclaimedSwept   -> stuck pending_claim tickets -> status='unclaimed_expired'
 *
 * Each stream is fully idempotent via UNIQUE/PK + WHERE-status guards.
 *
 * Cross-stream ordering hazard: NumbersDrawn may arrive (by cursor position)
 * before TicketPurchased catches up for that round, leaving freshly-inserted
 * tickets with NULL match_count. `reconcileLottery()` runs at the end of each
 * indexer tick to backfill any missed work without depending on stream order.
 *
 * Spec: apps/gostop/docs/game-result-schema.md §4
 */

import { GAMES, STREAMS } from '../../config/contracts.js';
import { writer } from '../../db/client.js';
import { runStream, normalizeAddr } from './_runner.js';
import {
  notifyFeed,
  payloadFromGameRound,
  isWhalePayload,
} from '../notify-feed.js';

// Mirror of lottery::CLAIM_WINDOW_MS / SWEEP_GRACE_MS (devnet-ids.json) so the
// indexer doesn't have to fetch the constant from chain. Keep in sync at
// contract-upgrade time.
const CLAIM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30d
// Sourced from contracts config (devnet-ids.json) rather than literal so that
// a registry re-installation with a different id doesn't silently mis-attribute
// rows. See M3 fix in 2026-05-17 review.
const LOTTERY_GAME_ID = GAMES.lottery.gameId;

// ---- Stream definitions ----------------------------------------------------

const S = (key: string) => STREAMS.find((s) => s.key === key)!;

const STREAM_ROUND_CREATED    = S('lottery::RoundCreated');
const STREAM_TICKET_PURCHASED = S('lottery::TicketPurchased');
const STREAM_NUMBERS_DRAWN    = S('lottery::NumbersDrawn');
const STREAM_ROUND_SETTLED    = S('lottery::RoundSettled');
const STREAM_PRIZE_CLAIMED    = S('lottery::PrizeClaimed');
const STREAM_UNCLAIMED_SWEPT  = S('lottery::UnclaimedSwept');

// ---- Event JSON shapes -----------------------------------------------------

interface RoundCreatedJson {
  round_id: string;
  round_number: string;
  close_time: string;
  draw_time: string;
  rollover_in: string;
}

interface TicketPurchasedJson {
  round_id: string;
  round_number: string;
  ticket_id: string;
  buyer: string;
  numbers: number[];
  amount: string;
}

interface NumbersDrawnJson {
  round_id: string;
  round_number: string;
  drawn_numbers: number[];
}

interface RoundSettledJson {
  round_id: string;
  round_number: string;
  tier1_winners: string;
  tier2_winners: string;
  tier3_winners: string;
  tier1_payout: string; // per-winner
  tier2_payout: string;
  tier3_payout: string;
  base_rollover: string;
  obligated_amount: string;
  tier1_rollover: string;
  tier2_rollover: string;
  tier3_rollover: string;
  treasury_amount: string;
}

interface PrizeClaimedJson {
  round_id: string;
  round_number: string;
  ticket_id: string;
  winner: string;
  tier: number;
  match_count: string;
  amount: string;
}

interface UnclaimedSweptJson {
  round_id: string;
  round_number: string;
  amount: string;
  swept_at: string;
}

// ---- Stream handlers -------------------------------------------------------

export async function tickLotteryRoundCreated(): Promise<number> {
  return runStream<RoundCreatedJson>(STREAM_ROUND_CREATED, async (envs) => {
    const sql = writer();
    const rows = envs.map((evt) => ({
      round_number:        evt.parsedJson.round_number,
      round_id:            evt.parsedJson.round_id,
      draw_time_ms:        evt.parsedJson.draw_time,
      close_time_ms:       evt.parsedJson.close_time,
      claim_deadline_ms:   String(BigInt(evt.parsedJson.draw_time) + BigInt(CLAIM_WINDOW_MS)),
    }));
    // RoundCreated is the authoritative source for draw_time/close_time/
    // claim_deadline. If NumbersDrawn landed first (cold catch-up cursor
    // ordering), it wrote a placeholder with both times == drawn_at. Overwrite
    // those fields here so the dashboard shows the real schedule.
    const result = await sql`
      INSERT INTO gostop.lottery_round ${sql(
        rows,
        'round_number', 'round_id',
        'draw_time_ms', 'close_time_ms', 'claim_deadline_ms'
      )}
      ON CONFLICT (round_number) DO UPDATE SET
        round_id          = EXCLUDED.round_id,
        draw_time_ms      = EXCLUDED.draw_time_ms,
        close_time_ms     = EXCLUDED.close_time_ms,
        claim_deadline_ms = EXCLUDED.claim_deadline_ms
    `;
    return result.count;
  });
}

export async function tickLotteryTicketPurchased(): Promise<number> {
  return runStream<TicketPurchasedJson>(STREAM_TICKET_PURCHASED, async (envs) => {
    const sql = writer();
    let inserted = 0;

    // FK safety net: if RoundCreated stream is lagging this tick (independent
    // cursor + RPC retry), the lottery_round parent may not exist yet. Insert
    // placeholders so the ticket FK holds; RoundCreated will OVERWRITE the
    // schedule fields when it catches up.
    const parentRounds = Array.from(new Set(envs.map((e) => e.parsedJson.round_number)));
    if (parentRounds.length > 0) {
      const placeholderTs = envs[0].timestampMs ?? '0';
      const placeholders = parentRounds.map((rn) => ({
        round_number:      rn,
        round_id:          envs.find((e) => e.parsedJson.round_number === rn)!.parsedJson.round_id,
        draw_time_ms:      placeholderTs,
        close_time_ms:     placeholderTs,
        claim_deadline_ms: String(BigInt(placeholderTs) + BigInt(CLAIM_WINDOW_MS)),
      }));
      await sql`
        INSERT INTO gostop.lottery_round ${sql(
          placeholders, 'round_number', 'round_id', 'draw_time_ms',
          'close_time_ms', 'claim_deadline_ms'
        )}
        ON CONFLICT (round_number) DO NOTHING
      `;
    }

    // Two writes per event (lottery_ticket + game_round). We batch each side
    // separately so postgres-js can use the multi-row VALUES helper.
    const ticketRows = envs.map((evt) => ({
      round_number:    evt.parsedJson.round_number,
      ticket_id:       evt.parsedJson.ticket_id,
      buyer:           normalizeAddr(evt.parsedJson.buyer),
      numbers:         evt.parsedJson.numbers,
      bet_amount:      evt.parsedJson.amount,
      purchase_tx:     evt.id.txDigest,
      purchase_seq:    Number(evt.id.eventSeq),
      purchase_ts_ms:  evt.timestampMs ?? '0',
    }));

    const tRes = await sql`
      INSERT INTO gostop.lottery_ticket ${sql(
        ticketRows,
        'round_number', 'ticket_id', 'buyer', 'numbers',
        'bet_amount', 'purchase_tx', 'purchase_seq', 'purchase_ts_ms'
      )}
      ON CONFLICT (round_number, ticket_id) DO NOTHING
    `;
    inserted += tRes.count;

    // game_round row per ticket. session_id = bcs(round_number) ‖ bcs(ticket_id)
    // — synthesized in the indexer (lottery contract does not call
    // emit_game_result). See schema doc §1 (lottery row).
    const grRows = envs.map((evt) => {
      const sessionId = Buffer.alloc(16);
      sessionId.writeBigUInt64LE(BigInt(evt.parsedJson.round_number), 0);
      sessionId.writeBigUInt64LE(BigInt(evt.parsedJson.ticket_id), 8);
      return {
        tx_digest:       evt.id.txDigest,
        event_seq:       Number(evt.id.eventSeq),
        game_id:         LOTTERY_GAME_ID,
        player:          normalizeAddr(evt.parsedJson.buyer),
        bet_amount:      evt.parsedJson.amount,
        payout:          '0',
        multiplier_bps:  '0',
        session_id:      sessionId,
        timestamp_ms:    evt.timestampMs ?? '0',
        status:          'pending_resolve',
      };
    });

    // Cast result type after the helper-driven INSERT — postgres.js Helper
    // typing fights with the generic form when both sql<T>` and sql(rows,...)
    // are combined.
    const grRes = (await sql`
      INSERT INTO gostop.game_round ${sql(
        grRows,
        'tx_digest', 'event_seq', 'game_id', 'player',
        'bet_amount', 'payout', 'multiplier_bps',
        'session_id', 'timestamp_ms', 'status'
      )}
      ON CONFLICT (tx_digest, event_seq) DO NOTHING
      RETURNING tx_digest, event_seq, game_id, player,
                bet_amount::text AS bet_amount,
                timestamp_ms::text AS timestamp_ms
    `) as unknown as Array<{
      tx_digest: string;
      event_seq: number;
      game_id: number;
      player: string;
      bet_amount: string;
      timestamp_ms: string;
    }>;
    inserted += grRes.length;

    // Live feed: ticket_bought NOTIFY for newly-inserted rows only. RETURNING
    // ensures cursor replay (same INSERT re-runs) emits zero broadcasts.
    // Aggregation invariant: this row is status='pending_resolve', not
    // 'final', so leaderboard SUM(bet_amount) WHERE status='final' is
    // unaffected — the round only contributes to aggregates when
    // PrizeClaimed / reconciler flips it to terminal status.
    for (const row of grRes) {
      await notifyFeed(sql, {
        kind: 'ticket_bought',
        game_id: Number(row.game_id),
        player: row.player.toLowerCase(),
        bet_amount: String(row.bet_amount),
        payout: null,
        multiplier_bps: null,
        tx_digest: row.tx_digest,
        event_seq: Number(row.event_seq),
        ts: Number(row.timestamp_ms),
      });
    }
    return inserted;
  });
}

export async function tickLotteryNumbersDrawn(): Promise<number> {
  return runStream<NumbersDrawnJson>(STREAM_NUMBERS_DRAWN, async (envs) => {
    const sql = writer();
    // RoundCreated arrives before NumbersDrawn in tx order; if not, the
    // lottery_round UPSERT here ensures a placeholder so the FK from
    // lottery_ticket holds. Reconciler will fix the rest.
    for (const evt of envs) {
      const drawnTs = evt.timestampMs ?? '0';
      const drawTx = evt.id.txDigest;
      await sql`
        INSERT INTO gostop.lottery_round (round_number, round_id, draw_time_ms, close_time_ms,
                                          drawn_numbers, drawn_at_ms, claim_deadline_ms,
                                          draw_tx_digest)
        VALUES (${evt.parsedJson.round_number}, ${evt.parsedJson.round_id},
                ${drawnTs}, ${drawnTs},
                ${evt.parsedJson.drawn_numbers}, ${drawnTs},
                ${String(BigInt(drawnTs) + BigInt(CLAIM_WINDOW_MS))},
                ${drawTx})
        ON CONFLICT (round_number) DO UPDATE
          SET drawn_numbers  = EXCLUDED.drawn_numbers,
              drawn_at_ms    = EXCLUDED.drawn_at_ms,
              draw_tx_digest = EXCLUDED.draw_tx_digest
      `;
    }
    return envs.length;
  });
}

export async function tickLotteryRoundSettled(): Promise<number> {
  return runStream<RoundSettledJson>(STREAM_ROUND_SETTLED, async (envs) => {
    const sql = writer();
    for (const evt of envs) {
      const p = evt.parsedJson;
      await sql`
        UPDATE gostop.lottery_round
        SET settled = true,
            tier1_payout = ${p.tier1_payout}::numeric,
            tier2_payout = ${p.tier2_payout}::numeric,
            tier3_payout = ${p.tier3_payout}::numeric,
            tier1_winners = ${p.tier1_winners}::int,
            tier2_winners = ${p.tier2_winners}::int,
            tier3_winners = ${p.tier3_winners}::int,
            treasury_amount = ${p.treasury_amount}::numeric
        WHERE round_number = ${p.round_number}
      `;
    }
    return envs.length;
  });
}

export async function tickLotteryPrizeClaimed(): Promise<number> {
  return runStream<PrizeClaimedJson>(STREAM_PRIZE_CLAIMED, async (envs) => {
    const sql = writer();
    let touched = 0;
    for (const evt of envs) {
      const p = evt.parsedJson;
      const claimTs = evt.timestampMs ?? '0';

      // 1. Ticket -> final + claimed payout
      await sql`
        UPDATE gostop.lottery_ticket
        SET status = 'final',
            claim_tx = ${evt.id.txDigest},
            claim_ts_ms = ${claimTs}::bigint,
            claimed_payout = ${p.amount}::numeric,
            tier = ${p.tier},
            match_count = ${Number(p.match_count)}
        WHERE round_number = ${p.round_number} AND ticket_id = ${p.ticket_id}
      `;

      // 2. game_round payout + multiplier finalize. Match by session_id
      //    instead of tx_digest because the bet/claim are in different txs.
      const sessionId = Buffer.alloc(16);
      sessionId.writeBigUInt64LE(BigInt(p.round_number), 0);
      sessionId.writeBigUInt64LE(BigInt(p.ticket_id), 8);
      const betAmountRows = await sql<{ bet_amount: string }[]>`
        SELECT bet_amount::text FROM gostop.game_round
        WHERE game_id = ${LOTTERY_GAME_ID} AND session_id = ${sessionId}
        LIMIT 1
      `;
      if (betAmountRows.length === 0) {
        // TicketPurchased not yet ingested; reconciler will sweep.
        continue;
      }
      const bet = BigInt(betAmountRows[0].bet_amount);
      const payout = BigInt(p.amount);
      const mulBps = bet > 0n ? Number((payout * 10000n) / bet) : 0;

      const finalized = await sql<Array<{
        tx_digest: string;
        event_seq: number;
        game_id: number;
        player: string;
        bet_amount: string;
        payout: string;
        multiplier_bps: string;
        timestamp_ms: string;
      }>>`
        UPDATE gostop.game_round
        SET payout = ${p.amount}::numeric,
            multiplier_bps = ${mulBps},
            status = 'final',
            updated_at = now()
        WHERE game_id = ${LOTTERY_GAME_ID}
          AND session_id = ${sessionId}
          AND status IN ('pending_resolve', 'pending_claim')
        RETURNING tx_digest, event_seq, game_id, player,
                  bet_amount::text AS bet_amount,
                  payout::text AS payout,
                  multiplier_bps::text AS multiplier_bps,
                  timestamp_ms::text AS timestamp_ms
      `;
      touched += finalized.length;
      // Feed events: only emit for rows the UPDATE actually transitioned this
      // call. Status guard above means a replay of the same PrizeClaimed
      // returns 0 rows and produces no NOTIFY (idempotent fan-out).
      for (const row of finalized) {
        const payload = payloadFromGameRound(row, 'round');
        await notifyFeed(sql, payload);
        if (isWhalePayload(payload)) {
          await notifyFeed(sql, { ...payload, kind: 'whale' });
        }
      }
    }
    return touched;
  });
}

export async function tickLotteryUnclaimedSwept(): Promise<number> {
  return runStream<UnclaimedSweptJson>(STREAM_UNCLAIMED_SWEPT, async (envs) => {
    const sql = writer();
    let touched = 0;
    for (const evt of envs) {
      const p = evt.parsedJson;
      const sweptAt = evt.timestampMs ?? p.swept_at;

      // Flip remaining pending_claim tickets to unclaimed_expired.
      const tRes = await sql`
        UPDATE gostop.lottery_ticket
        SET status = 'unclaimed_expired'
        WHERE round_number = ${p.round_number} AND status = 'pending_claim'
      `;
      touched += tRes.count;

      // Mirror to game_round rows that synthesized from those tickets.
      // Match by session_id range (round_number prefix) is awkward; use the
      // ticket table as the source of truth.
      const gRes = await sql`
        UPDATE gostop.game_round gr
        SET status = 'unclaimed_expired', updated_at = now()
        FROM gostop.lottery_ticket lt
        WHERE lt.round_number = ${p.round_number}
          AND lt.status = 'unclaimed_expired'
          AND gr.game_id = ${LOTTERY_GAME_ID}
          AND gr.player = lt.buyer
          AND gr.bet_amount = lt.bet_amount
          AND gr.status IN ('pending_resolve', 'pending_claim')
          AND gr.tx_digest = lt.purchase_tx
          AND gr.event_seq = lt.purchase_seq
      `;
      touched += gRes.count;

      await sql`
        UPDATE gostop.lottery_round
        SET fully_claimed_at_ms = ${sweptAt}::bigint
        WHERE round_number = ${p.round_number}
          AND fully_claimed_at_ms IS NULL
      `;
    }
    return touched;
  });
}

// ---- Reconciler -----------------------------------------------------------

/**
 * Order-independent backfill. Runs at the end of every indexer tick.
 *
 *   (a) Tickets in a drawn round with NULL match_count -> compute from
 *       round.drawn_numbers vs ticket.numbers.
 *   (b) Tickets with tier ∈ {1,2,3} but expected_payout NULL after settled ->
 *       copy per-winner payout from the round.
 *   (c) Loser tickets (tier=0) still in pending_resolve -> game_round.status
 *       flips to 'final' (payout 0, loss).
 *
 * Idempotent: every UPDATE has a precondition guarding against double-work.
 */
export async function reconcileLottery(): Promise<number> {
  const sql = writer();
  let touched = 0;

  // (a) Match counting + tier assignment. NEVER demote tickets already in a
  //     terminal status (`unclaimed_expired`/`final`) — guards against the
  //     case where UnclaimedSwept arrived before reconciler ran (C2 fix).
  const matchRes = await sql`
    WITH calc AS (
      SELECT
        lt.round_number, lt.ticket_id,
        (SELECT count(*)::int FROM unnest(lt.numbers) n
         WHERE n = ANY(lr.drawn_numbers)) AS mc
      FROM gostop.lottery_ticket lt
      JOIN gostop.lottery_round lr USING (round_number)
      WHERE lt.match_count IS NULL
        AND lt.status NOT IN ('unclaimed_expired','final')
        AND lr.drawn_numbers IS NOT NULL
    )
    UPDATE gostop.lottery_ticket lt
    SET match_count = c.mc,
        tier = CASE c.mc
                 WHEN 5 THEN 1
                 WHEN 4 THEN 2
                 WHEN 3 THEN 3
                 ELSE 0
               END,
        status = CASE
                   WHEN c.mc >= 3 THEN 'pending_claim'
                   ELSE 'final'
                 END
    FROM calc c
    WHERE lt.round_number = c.round_number AND lt.ticket_id = c.ticket_id
  `;
  touched += matchRes.count;

  // (b) Expected payout backfill for winning tickets
  const epRes = await sql`
    UPDATE gostop.lottery_ticket lt
    SET expected_payout = CASE lt.tier
                            WHEN 1 THEN lr.tier1_payout
                            WHEN 2 THEN lr.tier2_payout
                            WHEN 3 THEN lr.tier3_payout
                          END
    FROM gostop.lottery_round lr
    WHERE lt.round_number = lr.round_number
      AND lr.settled = true
      AND lt.tier IN (1,2,3)
      AND lt.expected_payout IS NULL
  `;
  touched += epRes.count;

  // (c) Loser game_round rows: pending_resolve -> final (payout=0)
  const loserRes = await sql`
    UPDATE gostop.game_round gr
    SET status = 'final', updated_at = now()
    FROM gostop.lottery_ticket lt
    WHERE gr.game_id = ${LOTTERY_GAME_ID}
      AND gr.status = 'pending_resolve'
      AND lt.tier = 0
      AND gr.player = lt.buyer
      AND gr.tx_digest = lt.purchase_tx
      AND gr.event_seq = lt.purchase_seq
  `;
  touched += loserRes.count;

  // (d) Winning game_round rows that have not yet been claimed: pending_resolve
  //     -> pending_claim. Keeps the canonical status synchronized so the
  //     leaderboard / dashboard reflect "awaiting claim" correctly even before
  //     PrizeClaimed arrives.
  const winnerRes = await sql`
    UPDATE gostop.game_round gr
    SET status = 'pending_claim', updated_at = now()
    FROM gostop.lottery_ticket lt
    WHERE gr.game_id = ${LOTTERY_GAME_ID}
      AND gr.status = 'pending_resolve'
      AND lt.tier IN (1,2,3)
      AND lt.status = 'pending_claim'
      AND gr.player = lt.buyer
      AND gr.tx_digest = lt.purchase_tx
      AND gr.event_seq = lt.purchase_seq
  `;
  touched += winnerRes.count;

  // (e) Claimed-payout backfill for game_round rows where PrizeClaimed had
  //     already arrived but TicketPurchased was lagging at the time, leaving
  //     game_round.payout = 0 (H1 fix). The lottery_ticket has the final
  //     claimed_payout; mirror it to the canonical ledger so leaderboard /
  //     matview reflect the win. Idempotent via WHERE payout = 0.
  const claimedRes = await sql`
    UPDATE gostop.game_round gr
    SET payout = lt.claimed_payout,
        multiplier_bps = CASE
                           WHEN gr.bet_amount > 0
                             THEN (lt.claimed_payout * 10000 / gr.bet_amount)::bigint
                           ELSE 0
                         END,
        status = 'final',
        updated_at = now()
    FROM gostop.lottery_ticket lt
    WHERE gr.game_id = ${LOTTERY_GAME_ID}
      AND gr.status IN ('pending_resolve','pending_claim')
      AND lt.status = 'final'
      AND lt.claim_ts_ms IS NOT NULL
      AND lt.claimed_payout IS NOT NULL
      AND gr.player = lt.buyer
      AND gr.tx_digest = lt.purchase_tx
      AND gr.event_seq = lt.purchase_seq
      AND gr.payout = 0
  `;
  touched += claimedRes.count;

  return touched;
}
