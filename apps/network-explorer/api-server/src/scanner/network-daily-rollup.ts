/**
 * Daily rollup of network stats, so the Analytics charts stop scanning the indexer.
 *
 * Two problems this solves:
 *
 * 1. `/stats/active-addresses` was broken for range=14d and 30d. The live query joins
 *    `tx_affected_addresses` (63 GB) with a per-day sequence range and counts DISTINCT
 *    senders -- measured at 13.8s for a *single* day on 2026-07-30, so 14 or 30 days
 *    exceeded the request timeout, the endpoint's catch returned [], and `cached()` then
 *    served that empty array for 15 minutes.
 * 2. The charts read from sui_indexer, whose retention is finite (400 epochs / ~32 days).
 *    That coupling is why `epochs_to_keep` cannot be lowered: the 30d charts would
 *    silently truncate. A rollup that lives in nasun_points -- which is permanent and
 *    backed up daily -- breaks the coupling and lets retention be a pure disk decision.
 *
 * Invariant: a day is written once, from a fully-retained source range, and never
 * rewritten. Recomputing a day whose checkpoints have been partially pruned would
 * silently shrink it, which is the same class of bug as a points regression, so
 * `computeDay` refuses to touch days the indexer can no longer cover in full and the
 * upsert is ON CONFLICT DO NOTHING.
 */
import { sql, pointsDb } from '../db.js';

export interface NetworkDailyRow {
  day: string;
  txCount: number;
  totalGasCost: string;
  avgGasPerTx: string;
  activeAddresses: number;
}

export async function ensureNetworkDailyStatsSchema(): Promise<void> {
  if (!pointsDb) return;
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS network_daily_stats (
      day              date PRIMARY KEY,
      tx_count         bigint NOT NULL,
      total_gas_cost   numeric NOT NULL,
      active_addresses integer NOT NULL,
      computed_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/** UTC date string for `daysAgo` days before today. */
function utcDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute one complete UTC day from the indexer. Returns null when the day cannot be
 * computed truthfully: no checkpoints for it, or the indexer's oldest retained
 * checkpoint falls inside the day (so the numbers would be partial).
 */
async function computeDay(day: string): Promise<NetworkDailyRow | null> {
  const [cp] = await sql`
    SELECT
      SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::bigint AS tx_count,
      SUM(total_gas_cost)::text                                        AS total_gas_cost,
      MIN(min_tx_sequence_number)::bigint                              AS day_min_seq,
      MAX(max_tx_sequence_number)::bigint                              AS day_max_seq,
      MIN(sequence_number)::bigint                                     AS day_min_cp
    FROM checkpoints
    WHERE DATE(to_timestamp(timestamp_ms / 1000.0)) = ${day}::date
  `;
  if (!cp?.day_min_seq) return null;

  // Retention guard: if the oldest checkpoint the indexer still has is inside this day,
  // the day is already being eaten by the pruner and any total would be an undercount.
  const [{ min_cp: retainedFrom }] = await sql`
    SELECT MIN(sequence_number)::bigint AS min_cp FROM checkpoints
  `;
  if (Number(retainedFrom) > Number(cp.day_min_cp)) return null;

  const [addr] = await sql`
    SELECT COUNT(DISTINCT sender)::int AS active
    FROM tx_affected_addresses
    WHERE tx_sequence_number BETWEEN ${cp.day_min_seq} AND ${cp.day_max_seq}
  `;

  const txCount = Number(cp.tx_count ?? 0);
  const gas = String(cp.total_gas_cost ?? '0');
  return {
    day,
    txCount,
    totalGasCost: gas,
    avgGasPerTx: txCount > 0 ? String(BigInt(gas) / BigInt(txCount)) : '0',
    activeAddresses: Number(addr?.active ?? 0),
  };
}

/**
 * Fill in any missing complete days within the last `lookbackDays`. Today is always
 * skipped -- it is incomplete by definition and the endpoints compute it live.
 *
 * Called from the points-scanner daily gate, and by the backfill script with a wider
 * lookback. Cheap in the steady state: one day's DISTINCT-sender scan (~14s) once per
 * UTC day, versus once per cache miss per range as before.
 */
export async function rollUpNetworkDailyStats(lookbackDays = 3): Promise<number> {
  if (!pointsDb) return 0;
  await ensureNetworkDailyStatsSchema();

  const candidates: string[] = [];
  for (let i = 1; i <= lookbackDays; i++) candidates.push(utcDay(i));

  const existing = await pointsDb<{ day: string }[]>`
    SELECT day::text FROM network_daily_stats WHERE day = ANY(${candidates}::date[])
  `;
  const have = new Set(existing.map((r) => r.day));
  const missing = candidates.filter((d) => !have.has(d));
  if (missing.length === 0) return 0;

  let written = 0;
  // Oldest first, so a mid-run failure leaves a contiguous prefix rather than holes.
  for (const day of missing.sort()) {
    try {
      const row = await computeDay(day);
      if (!row) {
        console.warn(`[NetworkRollup] ${day} skipped (no checkpoints, or already partly pruned)`);
        continue;
      }
      await pointsDb`
        INSERT INTO network_daily_stats (day, tx_count, total_gas_cost, active_addresses)
        VALUES (${row.day}::date, ${row.txCount}, ${row.totalGasCost}, ${row.activeAddresses})
        ON CONFLICT (day) DO NOTHING
      `;
      written++;
      console.log(
        `[NetworkRollup] ${day}: tx=${row.txCount} gas=${row.totalGasCost} active=${row.activeAddresses}`,
      );
    } catch (err) {
      console.error(`[NetworkRollup] ${day} failed:`, (err as Error).message);
    }
  }
  return written;
}

/**
 * Today's partial numbers, computed live. Split in two because the tx/gas half is a cheap
 * aggregate over `checkpoints` while the address half is the expensive DISTINCT-sender
 * scan, and only one endpoint needs the latter.
 */
export async function computeTodayTxGas(): Promise<Omit<NetworkDailyRow, 'activeAddresses'> | null> {
  const [cp] = await sql`
    SELECT
      DATE(to_timestamp(timestamp_ms / 1000.0))::text                  AS day,
      SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::bigint AS tx_count,
      SUM(total_gas_cost)::text                                        AS total_gas_cost
    FROM checkpoints
    WHERE DATE(to_timestamp(timestamp_ms / 1000.0)) = CURRENT_DATE
    GROUP BY 1
  `;
  if (!cp?.day) return null;
  const txCount = Number(cp.tx_count ?? 0);
  const gas = String(cp.total_gas_cost ?? '0');
  return {
    day: cp.day as string,
    txCount,
    totalGasCost: gas,
    avgGasPerTx: txCount > 0 ? String(BigInt(gas) / BigInt(txCount)) : '0',
  };
}

export async function computeTodayActiveAddresses(): Promise<{ day: string; activeAddresses: number } | null> {
  const [cp] = await sql`
    SELECT DATE(to_timestamp(timestamp_ms / 1000.0))::text AS day,
           MIN(min_tx_sequence_number)::bigint             AS day_min_seq,
           MAX(max_tx_sequence_number)::bigint             AS day_max_seq
    FROM checkpoints
    WHERE DATE(to_timestamp(timestamp_ms / 1000.0)) = CURRENT_DATE
    GROUP BY 1
  `;
  if (!cp?.day_min_seq) return null;
  const [addr] = await sql`
    SELECT COUNT(DISTINCT sender)::int AS active
    FROM tx_affected_addresses
    WHERE tx_sequence_number BETWEEN ${cp.day_min_seq} AND ${cp.day_max_seq}
  `;
  return { day: cp.day as string, activeAddresses: Number(addr?.active ?? 0) };
}

/** Read complete days from the rollup, newest last, for the given window. */
export async function readNetworkDailyStats(days: number): Promise<NetworkDailyRow[]> {
  if (!pointsDb) return [];
  const from = utcDay(days);
  const rows = await pointsDb<
    { day: string; tx_count: string; total_gas_cost: string; active_addresses: number }[]
  >`
    SELECT day::text, tx_count::text, total_gas_cost::text, active_addresses
    FROM network_daily_stats
    WHERE day >= ${from}::date
    ORDER BY day ASC
  `;
  return rows.map((r) => {
    const txCount = Number(r.tx_count);
    return {
      day: r.day,
      txCount,
      totalGasCost: r.total_gas_cost,
      avgGasPerTx: txCount > 0 ? String(BigInt(r.total_gas_cost) / BigInt(txCount)) : '0',
      activeAddresses: r.active_addresses,
    };
  });
}
