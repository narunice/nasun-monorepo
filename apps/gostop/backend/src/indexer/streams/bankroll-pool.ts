/**
 * bankroll_pool::GameResult stream — single source for 5 of 6 games
 * (scratchcard / numbermatch / crash / mines / wheel). Lottery emits its
 * own events and is handled in a separate subscriber (Tier 0 follow-up).
 *
 * Pipeline:
 *   1. Read cursor from gostop.indexer_cursor.
 *   2. queryEvents page-by-page until empty.
 *   3. Map parsedJson -> gostop.game_round row.
 *   4. Bulk INSERT with ON CONFLICT (tx_digest, event_seq) DO NOTHING.
 *   5. Persist last (tx_digest, event_seq, timestamp_ms) as new cursor.
 *
 * Idempotent: replays and overlapping pages collapse via the UNIQUE
 * (tx_digest, event_seq) constraint.
 */

import { BANKROLL_POOL, eventType } from '../../config/contracts.js';
import { writer } from '../../db/client.js';
import { readCursor, writeCursor } from '../../db/cursor.js';
import { queryEventsByType, type EventCursor } from '../../rpc.js';

const PAGE_SIZE = 50;
const MAX_PAGES_PER_TICK = 20; // 1000 events / tick ceiling

// Shape of `parsedJson` for bankroll_pool::GameResult.
// Sui returns u64 as string, u8 as number, vector<u8> as number array.
interface GameResultJson {
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  timestamp_ms: string;
  session_id: number[];
}

interface BetRefundedJson {
  game_id: number;
  player: string;
  amount: string;
  reason_code: number;
  timestamp_ms: string;
}

interface RowInsert {
  tx_digest: string;
  event_seq: number;
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  session_id: Buffer;
  timestamp_ms: string;
}

function normalizeAddr(a: string): string {
  return a.toLowerCase();
}

function toRow(env: {
  id: { txDigest: string; eventSeq: string };
  parsedJson: GameResultJson;
}): RowInsert {
  const p = env.parsedJson;
  return {
    tx_digest: env.id.txDigest,
    event_seq: Number(env.id.eventSeq),
    game_id: p.game_id,
    player: normalizeAddr(p.player),
    bet_amount: p.bet_amount,
    payout: p.payout,
    multiplier_bps: p.multiplier_bps,
    session_id: Buffer.from(p.session_id),
    timestamp_ms: p.timestamp_ms,
  };
}

/**
 * Run one tick of the GameResult subscriber. Returns number of rows newly
 * inserted (after ON CONFLICT DO NOTHING).
 */
export async function tickGameResult(): Promise<number> {
  const cursor = await readCursor('bankroll_pool::GameResult');
  let rpcCursor: EventCursor | null =
    cursor.lastTx && cursor.lastSeq !== null
      ? { txDigest: cursor.lastTx, eventSeq: String(cursor.lastSeq) }
      : null;

  const eventTag = eventType(BANKROLL_POOL.originalPackageId, 'bankroll_pool', 'GameResult');
  const sql = writer();
  let inserted = 0;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const res = await queryEventsByType<GameResultJson>(eventTag, rpcCursor, PAGE_SIZE, false);
    if (res.data.length === 0) break;

    const rows = res.data.map(toRow);
    // postgres-js native batch insert: `sql(rows, ...cols)` expands to
    // INSERT ... VALUES (...), (...), ... with proper type coercion.
    // bet_amount/payout/multiplier_bps/timestamp_ms are strings here (u64 from
    // RPC); postgres-js casts to numeric/bigint via column type. session_id is
    // Buffer -> bytea. Default `status='final'` from the table definition.
    const result = await sql`
      INSERT INTO gostop.game_round ${sql(
        rows,
        'tx_digest', 'event_seq', 'game_id', 'player',
        'bet_amount', 'payout', 'multiplier_bps',
        'session_id', 'timestamp_ms'
      )}
      ON CONFLICT (tx_digest, event_seq) DO NOTHING
    `;
    inserted += result.count;

    // Advance cursor to last event of this page regardless of whether all rows
    // were newly inserted (idempotent re-process on next tick is harmless).
    const last = res.data[res.data.length - 1];
    rpcCursor = res.nextCursor ?? { txDigest: last.id.txDigest, eventSeq: last.id.eventSeq };
    await writeCursor(
      'bankroll_pool::GameResult',
      last.id.txDigest,
      Number(last.id.eventSeq),
      last.timestampMs ? Number(last.timestampMs) : Number(last.parsedJson.timestamp_ms)
    );

    if (!res.hasNextPage) break;
  }

  return inserted;
}

/**
 * BetRefunded subscriber. Currently only crash uses refund_bet, and refunded
 * crash bets never have a GameResult emit -> no game_round row to flag.
 * For now we just advance the cursor + log a warn at high refund rate
 * (analytics + alert hook for future use).
 */
export async function tickBetRefunded(): Promise<number> {
  const cursor = await readCursor('bankroll_pool::BetRefunded');
  let rpcCursor: EventCursor | null =
    cursor.lastTx && cursor.lastSeq !== null
      ? { txDigest: cursor.lastTx, eventSeq: String(cursor.lastSeq) }
      : null;

  const eventTag = eventType(BANKROLL_POOL.originalPackageId, 'bankroll_pool', 'BetRefunded');
  let observed = 0;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const res = await queryEventsByType<BetRefundedJson>(eventTag, rpcCursor, PAGE_SIZE, false);
    if (res.data.length === 0) break;
    observed += res.data.length;

    const last = res.data[res.data.length - 1];
    rpcCursor = res.nextCursor ?? { txDigest: last.id.txDigest, eventSeq: last.id.eventSeq };
    await writeCursor(
      'bankroll_pool::BetRefunded',
      last.id.txDigest,
      Number(last.id.eventSeq),
      last.timestampMs ? Number(last.timestampMs) : Number(last.parsedJson.timestamp_ms)
    );

    if (!res.hasNextPage) break;
  }

  if (observed > 0) {
    console.log(`[bankroll-pool] BetRefunded observed=${observed}`);
  }
  return observed;
}
