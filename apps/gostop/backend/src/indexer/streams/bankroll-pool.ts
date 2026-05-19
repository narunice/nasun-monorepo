/**
 * bankroll_pool event streams.
 *
 * Two SoTs share this module:
 *   - gostop.game_round  — single ledger for the 5 non-lottery games via
 *     `bankroll_pool::GameResult`. Powers leaderboard / per-game RTP.
 *   - gostop.bankroll_event — refund + treasury + LP-flow + admin events.
 *     Powers bankrollPnl() + LP UI. Bet/payout sides are NOT stored here;
 *     they are derived from game_round (game_id IN 2..6) per
 *     apps/gostop/docs/lp-gap-analysis.md §5.1 (1:1 byte-equivalence).
 *
 * Reconciler in ../bankroll-reconciler.ts fills `total_shares_after` after
 * the in-memory watermark (../bankroll-watermark.ts) confirms all PnL
 * streams have caught up past a given timestamp.
 *
 * Plan: ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3.
 *
 * All bankroll_event INSERTs are idempotent via UNIQUE (tx_digest, event_seq).
 */

import { STREAMS, type StreamKey } from '../../config/contracts.js';
import { writer } from '../../db/client.js';
import { runStream, normalizeAddr } from './_runner.js';
import { updateStreamWatermark } from '../bankroll-watermark.js';
import {
  notifyFeed,
  payloadFromGameRound,
  isWhalePayload,
} from '../notify-feed.js';

// ---------- stream defs -----------------------------------------------------

function streamDef(key: StreamKey) {
  const def = STREAMS.find((s) => s.key === key);
  if (!def) throw new Error(`stream not configured: ${key}`);
  return def;
}

const GAME_RESULT_STREAM           = streamDef('bankroll_pool::GameResult');
const BET_REFUNDED_STREAM          = streamDef('bankroll_pool::BetRefunded');
const TREASURY_DEPOSITED_STREAM    = streamDef('bankroll_pool::TreasuryDeposited');
const LIQUIDITY_PROVIDED_STREAM    = streamDef('bankroll_pool::LiquidityProvided');
const WITHDRAW_REQUESTED_STREAM    = streamDef('bankroll_pool::WithdrawRequested');
const LIQUIDITY_REDEEMED_STREAM    = streamDef('bankroll_pool::LiquidityRedeemed');
const POOL_SHARES_SEEDED_STREAM    = streamDef('bankroll_pool::PoolSharesSeeded');
const UTILIZATION_CAP_UPDATED_STREAM = streamDef('bankroll_pool::UtilizationCapUpdated');

// ---------- bankroll_event INSERT scaffolding -------------------------------

type EventTypeName =
  | 'bet_refunded'
  | 'treasury_deposited'
  | 'liquidity_provided'
  | 'withdraw_requested'
  | 'liquidity_redeemed'
  | 'shares_seeded'
  | 'cap_updated';

/**
 * Indexer-enforced allowlist for event_type. DB column is plain TEXT (no
 * CHECK enum) per plan v3 §3.A — single-writer guarantees mean the only
 * gatekeeper that matters is right here.
 */
const ALLOWED_EVENT_TYPES = new Set<EventTypeName>([
  'bet_refunded',
  'treasury_deposited',
  'liquidity_provided',
  'withdraw_requested',
  'liquidity_redeemed',
  'shares_seeded',
  'cap_updated',
]);

interface BankrollEventRow {
  tx_digest: string;
  event_seq: number;
  timestamp_ms: string;       // u64 → string from Sui RPC
  event_type: EventTypeName;
  game_id: number | null;
  actor: string | null;
  amount: string;             // NUMERIC(30,0) safe bigint-string
  shares: string | null;      // NUMERIC(40,0) safe bigint-string (u128)
  reason_code: number | null;
  claimable_at_ms: string | null;
  treasury_reason: string | null;
  cap_bps: number | null;
}

function assertEventType(t: string): asserts t is EventTypeName {
  if (!ALLOWED_EVENT_TYPES.has(t as EventTypeName)) {
    throw new Error(`bankroll_event: unrecognized event_type '${t}'`);
  }
}

/**
 * TreasuryDeposited.source_game_id discriminator. Plain TEXT in DB; values
 * enforced here. See plan v3 §3.D rationale.
 */
function classifyTreasuryDeposit(sourceGameId: number): {
  game_id: number | null;
  treasury_reason: string;
} {
  // source_game_id=1 → lottery contract emit. Both "treasury cut after
  // winners" (lottery.move:421) and "unclaimed-prize sweep" (lottery.move:746)
  // share this code. v1 conflates them under one label to avoid speculative
  // chain re-scan; UI shows the merged figure.
  if (sourceGameId === 1) {
    return { game_id: null, treasury_reason: 'lottery_treasury_inflow' };
  }
  // source_game_id=0 → admin treasury_deposit (e.g. seed-bankroll-v2.ts:77).
  if (sourceGameId === 0) {
    return { game_id: null, treasury_reason: 'admin_seed' };
  }
  // Future bankroll-aware games may emit cuts with their own game_id (2..6).
  // Attribute and surface as 'unknown' for operator triage until a labeled
  // bucket is defined.
  if (sourceGameId >= 2 && sourceGameId <= 6) {
    return { game_id: sourceGameId, treasury_reason: 'unknown' };
  }
  // Out-of-range — store NULL to satisfy the game_id CHECK and breadcrumb.
  console.warn(`[bankroll-pool] TreasuryDeposited unexpected source_game_id=${sourceGameId}`);
  return { game_id: null, treasury_reason: 'unknown' };
}

async function insertBankrollEvents(rows: BankrollEventRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  for (const r of rows) assertEventType(r.event_type);
  const sql = writer();
  // Column list is inlined as literals so the schema-audit vitest regex
  // (db/schema-audit.test.ts:141 helperRe) can extract every column name.
  // Keep order in sync with the BankrollEventRow interface.
  const inserted = await sql`
    INSERT INTO gostop.bankroll_event ${sql(rows,
      'tx_digest', 'event_seq', 'timestamp_ms', 'event_type',
      'game_id', 'actor', 'amount', 'shares',
      'reason_code', 'claimable_at_ms', 'treasury_reason', 'cap_bps'
    )}
    ON CONFLICT (tx_digest, event_seq) DO NOTHING
    RETURNING id
  `;
  return inserted.length;
}

function emptyRow(
  envIdTx: string,
  envIdSeq: string,
  tsMs: string,
  eventType: EventTypeName,
): BankrollEventRow {
  return {
    tx_digest: envIdTx,
    event_seq: Number(envIdSeq),
    timestamp_ms: tsMs,
    event_type: eventType,
    game_id: null,
    actor: null,
    amount: '0',
    shares: null,
    reason_code: null,
    claimable_at_ms: null,
    treasury_reason: null,
    cap_bps: null,
  };
}

// ---------- existing: GameResult (game_round SoT) ---------------------------

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
    type InsertedRow = {
      tx_digest: string;
      event_seq: number;
      game_id: number;
      player: string;
      bet_amount: string;
      payout: string;
      multiplier_bps: string;
      timestamp_ms: string;
    };
    const insertedRaw = await sql`
      INSERT INTO gostop.game_round ${sql(
        rows,
        'tx_digest', 'event_seq', 'game_id', 'player',
        'bet_amount', 'payout', 'multiplier_bps',
        'session_id', 'timestamp_ms'
      )}
      ON CONFLICT (tx_digest, event_seq) DO NOTHING
      RETURNING tx_digest, event_seq, game_id, player,
                bet_amount::text AS bet_amount,
                payout::text AS payout,
                multiplier_bps::text AS multiplier_bps,
                timestamp_ms::text AS timestamp_ms
    `;
    const inserted = insertedRaw as unknown as InsertedRow[];
    for (const row of inserted) {
      const payload = payloadFromGameRound(row, 'round');
      await notifyFeed(sql, payload);
      if (isWhalePayload(payload)) {
        await notifyFeed(sql, { ...payload, kind: 'whale' });
      }
    }
    return inserted.length;
  });
  // GameResult does not advance the bankroll watermark: bet/payout PnL is
  // derived from game_round at query time (plan v3 §3.A), so this stream
  // is not in PNL_STREAMS.
}

// ---------- BetRefunded — dual write (game_round refund flag NOT touched;
// only bankroll_event ingest). Idempotent + watermark heartbeat.
// ----------------------------------------------------------------------------

export async function tickBetRefunded(): Promise<number> {
  return runStream<BetRefundedJson>(
    BET_REFUNDED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => {
        const gid = e.parsedJson.game_id;
        // CHECK constraint: game_id NULL or 2..6. Game 1 (lottery) never emits
        // bankroll_pool::BetRefunded (lottery refunds via prize_pool flow), so
        // any gid outside 2..6 here is a misconfiguration we surface as NULL.
        const safeGid = gid >= 2 && gid <= 6 ? gid : null;
        if (safeGid === null) {
          console.warn(`[bankroll-pool] BetRefunded unexpected game_id=${gid}`);
        }
        return {
          tx_digest: e.id.txDigest,
          event_seq: Number(e.id.eventSeq),
          timestamp_ms: e.parsedJson.timestamp_ms,
          event_type: 'bet_refunded',
          game_id: safeGid,
          actor: normalizeAddr(e.parsedJson.player),
          amount: e.parsedJson.amount,
          shares: null,
          reason_code: e.parsedJson.reason_code,
          claimable_at_ms: null,
          treasury_reason: null,
          cap_bps: null,
        };
      });
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::BetRefunded', ts) },
  );
}

// ---------- TreasuryDeposited -----------------------------------------------

interface TreasuryDepositedJson {
  source_game_id: number;
  amount: string;
  timestamp_ms: string;
}

export async function tickTreasuryDeposited(): Promise<number> {
  return runStream<TreasuryDepositedJson>(
    TREASURY_DEPOSITED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => {
        const cls = classifyTreasuryDeposit(e.parsedJson.source_game_id);
        return {
          tx_digest: e.id.txDigest,
          event_seq: Number(e.id.eventSeq),
          timestamp_ms: e.parsedJson.timestamp_ms,
          event_type: 'treasury_deposited',
          game_id: cls.game_id,
          actor: null,
          amount: e.parsedJson.amount,
          shares: null,
          reason_code: null,
          claimable_at_ms: null,
          treasury_reason: cls.treasury_reason,
          cap_bps: null,
        };
      });
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::TreasuryDeposited', ts) },
  );
}

// ---------- LiquidityProvided -----------------------------------------------

interface LiquidityProvidedJson {
  provider: string;
  amount: string;
  shares: string;       // u128 → JSON string
  timestamp_ms: string;
}

export async function tickLiquidityProvided(): Promise<number> {
  return runStream<LiquidityProvidedJson>(
    LIQUIDITY_PROVIDED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => ({
        tx_digest: e.id.txDigest,
        event_seq: Number(e.id.eventSeq),
        timestamp_ms: e.parsedJson.timestamp_ms,
        event_type: 'liquidity_provided',
        game_id: null,
        actor: normalizeAddr(e.parsedJson.provider),
        amount: e.parsedJson.amount,
        // Move computes shares via virtual-offset math; we store the
        // event-emitted value, never derive.
        shares: e.parsedJson.shares,
        reason_code: null,
        claimable_at_ms: null,
        treasury_reason: null,
        cap_bps: null,
      }));
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::LiquidityProvided', ts) },
  );
}

// ---------- WithdrawRequested -----------------------------------------------

interface WithdrawRequestedJson {
  provider: string;
  shares: string;
  requested_at: string;
  claimable_at: string;
}

export async function tickWithdrawRequested(): Promise<number> {
  return runStream<WithdrawRequestedJson>(
    WITHDRAW_REQUESTED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => ({
        tx_digest: e.id.txDigest,
        event_seq: Number(e.id.eventSeq),
        // WithdrawRequested has no timestamp_ms field — use requested_at
        // (also u64 ms from clock::timestamp_ms at the call site).
        timestamp_ms: e.parsedJson.requested_at,
        event_type: 'withdraw_requested',
        game_id: null,
        actor: normalizeAddr(e.parsedJson.provider),
        amount: '0',
        shares: e.parsedJson.shares,
        reason_code: null,
        claimable_at_ms: e.parsedJson.claimable_at,
        treasury_reason: null,
        cap_bps: null,
      }));
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::WithdrawRequested', ts) },
  );
}

// ---------- LiquidityRedeemed -----------------------------------------------

interface LiquidityRedeemedJson {
  provider: string;
  amount: string;
  shares: string;
  timestamp_ms: string;
}

export async function tickLiquidityRedeemed(): Promise<number> {
  return runStream<LiquidityRedeemedJson>(
    LIQUIDITY_REDEEMED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => ({
        tx_digest: e.id.txDigest,
        event_seq: Number(e.id.eventSeq),
        timestamp_ms: e.parsedJson.timestamp_ms,
        event_type: 'liquidity_redeemed',
        game_id: null,
        actor: normalizeAddr(e.parsedJson.provider),
        amount: e.parsedJson.amount,
        shares: e.parsedJson.shares,
        reason_code: null,
        claimable_at_ms: null,
        treasury_reason: null,
        cap_bps: null,
      }));
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::LiquidityRedeemed', ts) },
  );
}

// ---------- PoolSharesSeeded (bootstrap + audit) ----------------------------

interface PoolSharesSeededJson {
  seed_amount: string;
  seed_shares: string;
  timestamp_ms: string;
}

export async function tickPoolSharesSeeded(): Promise<number> {
  return runStream<PoolSharesSeededJson>(
    POOL_SHARES_SEEDED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => ({
        tx_digest: e.id.txDigest,
        event_seq: Number(e.id.eventSeq),
        timestamp_ms: e.parsedJson.timestamp_ms,
        event_type: 'shares_seeded',
        game_id: null,
        actor: null,
        amount: e.parsedJson.seed_amount,
        shares: e.parsedJson.seed_shares,
        reason_code: null,
        claimable_at_ms: null,
        treasury_reason: null,
        cap_bps: null,
      }));
      return await insertBankrollEvents(rows);
    },
    { onWatermark: (ts) => updateStreamWatermark('bankroll_pool::PoolSharesSeeded', ts) },
  );
}

// ---------- UtilizationCapUpdated (operational visibility) ------------------

interface UtilizationCapUpdatedJson {
  old_cap_bps: string;       // u64 → string
  new_cap_bps: string;
  timestamp_ms: string;
}

export async function tickUtilizationCapUpdated(): Promise<number> {
  return runStream<UtilizationCapUpdatedJson>(
    UTILIZATION_CAP_UPDATED_STREAM,
    async (envelopes) => {
      const rows: BankrollEventRow[] = envelopes.map((e) => {
        const r = emptyRow(e.id.txDigest, e.id.eventSeq, e.parsedJson.timestamp_ms, 'cap_updated');
        // cap_bps is INT (≤ 10000 in practice); coerce.
        const n = Number(e.parsedJson.new_cap_bps);
        r.cap_bps = Number.isFinite(n) ? n : null;
        return r;
      });
      return await insertBankrollEvents(rows);
    },
    // Not in PNL_STREAMS — admin visibility only. Watermark unused.
  );
}
