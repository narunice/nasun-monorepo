/**
 * bankroll_pool::GameResult — single source for 5 of 6 games
 * (scratchcard / numbermatch / crash / mines / wheel). Lottery has its own
 * synthesis pipeline in ./lottery.ts.
 *
 * bankroll_pool::BetRefunded — currently only crash uses refund_bet, and
 * refunded crash bets never have a GameResult emit -> no game_round row
 * exists to flag. We only advance the cursor + log for future analytics.
 *
 * Idempotent via UNIQUE (tx_digest, event_seq) on gostop.game_round.
 */

import { STREAMS } from '../../config/contracts.js';
import { writer } from '../../db/client.js';
import { runStream, normalizeAddr } from './_runner.js';

const GAME_RESULT_STREAM = STREAMS.find((s) => s.key === 'bankroll_pool::GameResult')!;
const BET_REFUNDED_STREAM = STREAMS.find((s) => s.key === 'bankroll_pool::BetRefunded')!;

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

export async function tickGameResult(): Promise<number> {
  return runStream<GameResultJson>(GAME_RESULT_STREAM, async (envelopes) => {
    const sql = writer();
    const rows = envelopes.map((evt) => ({
      tx_digest: evt.id.txDigest,
      event_seq: Number(evt.id.eventSeq),
      game_id: evt.parsedJson.game_id,
      player: normalizeAddr(evt.parsedJson.player),
      bet_amount: evt.parsedJson.bet_amount,
      payout: evt.parsedJson.payout,
      multiplier_bps: evt.parsedJson.multiplier_bps,
      session_id: Buffer.from(evt.parsedJson.session_id),
      timestamp_ms: evt.parsedJson.timestamp_ms,
    }));
    const result = await sql`
      INSERT INTO gostop.game_round ${sql(
        rows,
        'tx_digest', 'event_seq', 'game_id', 'player',
        'bet_amount', 'payout', 'multiplier_bps',
        'session_id', 'timestamp_ms'
      )}
      ON CONFLICT (tx_digest, event_seq) DO NOTHING
    `;
    return result.count;
  });
}

export async function tickBetRefunded(): Promise<number> {
  return runStream<BetRefundedJson>(BET_REFUNDED_STREAM, async (envelopes) => {
    // Currently no game_round row to update (refunded crash bets never had a
    // GameResult emit). Logged as breadcrumb for future analytics; cursor is
    // still advanced by the runner.
    if (envelopes.length > 0) {
      console.log(`[bankroll-pool] BetRefunded observed=${envelopes.length}`);
    }
    return envelopes.length;
  });
}
