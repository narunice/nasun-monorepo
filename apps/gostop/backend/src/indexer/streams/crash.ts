/**
 * Crash auxiliary streams. The canonical bet ledger row for crash is already
 * written by the bankroll_pool::GameResult subscriber (one row per (round,
 * player) at resolve time). These streams populate the transparency-only
 * `gostop.crash_round` / `gostop.crash_cashout` tables so the Replay page can
 * reconstruct multiplier curves and surface commit-reveal proofs.
 *
 * commit_verified: the Move VM asserts blake2b256(bcs(crash_point_bps) ‖ salt)
 * == commit_hash inside resolve_round. If RoundResolved is emitted, the
 * commit is verified on-chain. The indexer therefore marks
 * commit_verified=true unconditionally when reveal arrives. (Salt itself is a
 * tx argument, not in the event payload; backfilling salt for the dashboard
 * is a follow-up that requires sui_getTransactionBlock.)
 *
 * Spec: apps/gostop/docs/game-result-schema.md §5
 */

import { STREAMS } from '../../config/contracts.js';
import { writer } from '../../db/client.js';
import { runStream, normalizeAddr } from './_runner.js';

const S = (key: string) => STREAMS.find((s) => s.key === key)!;

const STREAM_ROUND_STARTED   = S('crash::RoundStarted');
const STREAM_CASH_OUT        = S('crash::CashOutRecorded');
const STREAM_ROUND_RESOLVED  = S('crash::RoundResolved');
const STREAM_ROUND_REFUNDED  = S('crash::RoundRefunded');

// ---- Event JSON shapes -----------------------------------------------------

interface RoundStartedJson {
  round_id: string;
  round_object_id: string;
  commit_hash: number[];
  betting_ends_at: string;
  timestamp_ms: string;
}

interface CashOutRecordedJson {
  round_id: string;
  player: string;
  multiplier_bps: string;
  recorded_at: string;
}

interface RoundResolvedJson {
  round_id: string;
  crash_point_bps: string;
  crash_time_ms: string;
  total_bet: string;
  total_payout: string;
  cashout_count: string;
  timestamp_ms: string;
}

interface RoundRefundedJson {
  round_id: string;
  refunded_count: string;
  total_refunded: string;
  stall_state: number;
  timestamp_ms: string;
}

// ---- Handlers -------------------------------------------------------------

export async function tickCrashRoundStarted(): Promise<number> {
  return runStream<RoundStartedJson>(STREAM_ROUND_STARTED, async (envs) => {
    const sql = writer();
    let touched = 0;
    for (const evt of envs) {
      const p = evt.parsedJson;
      // ON CONFLICT DO UPDATE because a placeholder may have been written by
      // CashOutRecorded or RoundResolved arriving first (out-of-order during
      // catch-up). We only overwrite start fields if they're still empty so
      // re-runs of the same event are no-ops.
      const r = await sql`
        INSERT INTO gostop.crash_round (round_id, start_tx, start_ts_ms, commit_hash)
        VALUES (${p.round_id}, ${evt.id.txDigest}, ${p.timestamp_ms}::bigint,
                ${Buffer.from(p.commit_hash)})
        ON CONFLICT (round_id) DO UPDATE SET
          start_tx    = CASE WHEN crash_round.start_tx = '' THEN EXCLUDED.start_tx
                             ELSE crash_round.start_tx END,
          start_ts_ms = CASE WHEN crash_round.start_ts_ms = 0 THEN EXCLUDED.start_ts_ms
                             ELSE crash_round.start_ts_ms END,
          commit_hash = CASE WHEN length(crash_round.commit_hash) = 0 THEN EXCLUDED.commit_hash
                             ELSE crash_round.commit_hash END
      `;
      touched += r.count;
    }
    return touched;
  });
}

export async function tickCrashCashOut(): Promise<number> {
  return runStream<CashOutRecordedJson>(STREAM_CASH_OUT, async (envs) => {
    const sql = writer();
    const rows = envs.map((evt) => ({
      round_id:        evt.parsedJson.round_id,
      player:          normalizeAddr(evt.parsedJson.player),
      cashout_mul_bps: evt.parsedJson.multiplier_bps,
      cashout_ts_ms:   evt.parsedJson.recorded_at,
    }));
    // FK to crash_round requires the parent row to exist. RoundStarted lands
    // first by tx order, but a fresh deploy may catch up out-of-order. We
    // insert a placeholder parent row to satisfy FK; tickCrashRoundStarted
    // will fill the rest via ON CONFLICT DO NOTHING (no overwrite).
    const parents = Array.from(new Set(rows.map((r) => r.round_id)));
    if (parents.length > 0) {
      const placeholders = parents.map((rid) => ({
        round_id:    rid,
        start_tx:    '',
        start_ts_ms: '0',
        commit_hash: Buffer.alloc(0),
      }));
      await sql`
        INSERT INTO gostop.crash_round ${sql(
          placeholders, 'round_id', 'start_tx', 'start_ts_ms', 'commit_hash'
        )}
        ON CONFLICT (round_id) DO NOTHING
      `;
    }
    const r = await sql`
      INSERT INTO gostop.crash_cashout ${sql(
        rows, 'round_id', 'player', 'cashout_mul_bps', 'cashout_ts_ms'
      )}
      ON CONFLICT (round_id, player) DO NOTHING
    `;
    return r.count;
  });
}

export async function tickCrashRoundResolved(): Promise<number> {
  return runStream<RoundResolvedJson>(STREAM_ROUND_RESOLVED, async (envs) => {
    const sql = writer();
    let touched = 0;
    for (const evt of envs) {
      const p = evt.parsedJson;
      // UPSERT pattern: if RoundStarted is lagging, write a placeholder so
      // the resolve data is captured. RoundStarted will not overwrite later
      // (its handler uses DO NOTHING).
      const r = await sql`
        INSERT INTO gostop.crash_round (
          round_id, start_tx, start_ts_ms, commit_hash,
          resolved, resolve_tx, resolve_ts_ms,
          crash_point_bps, crash_time_ms,
          total_bet, total_payout, cashout_count, commit_verified
        )
        VALUES (
          ${p.round_id}, '', 0, ${Buffer.alloc(0)},
          true, ${evt.id.txDigest}, ${p.timestamp_ms}::bigint,
          ${p.crash_point_bps}::bigint, ${p.crash_time_ms}::bigint,
          ${p.total_bet}::numeric, ${p.total_payout}::numeric, ${p.cashout_count}::int,
          true
        )
        ON CONFLICT (round_id) DO UPDATE SET
          resolved         = true,
          resolve_tx       = EXCLUDED.resolve_tx,
          resolve_ts_ms    = EXCLUDED.resolve_ts_ms,
          crash_point_bps  = EXCLUDED.crash_point_bps,
          crash_time_ms    = EXCLUDED.crash_time_ms,
          total_bet        = EXCLUDED.total_bet,
          total_payout     = EXCLUDED.total_payout,
          cashout_count    = EXCLUDED.cashout_count,
          commit_verified  = true
      `;
      touched += r.count;
    }
    return touched;
  });
}

export async function tickCrashRoundRefunded(): Promise<number> {
  return runStream<RoundRefundedJson>(STREAM_ROUND_REFUNDED, async (envs) => {
    const sql = writer();
    let touched = 0;
    for (const evt of envs) {
      const p = evt.parsedJson;
      const r = await sql`
        INSERT INTO gostop.crash_round (
          round_id, start_tx, start_ts_ms, commit_hash, refunded
        )
        VALUES (${p.round_id}, '', 0, ${Buffer.alloc(0)}, true)
        ON CONFLICT (round_id) DO UPDATE SET refunded = true
      `;
      touched += r.count;
    }
    return touched;
  });
}
