/**
 * V2 Health Update: NFT health state machine per user per day.
 *
 * Called from runDailyNftChecks (daily-nft-check.ts) after ECO_HEALTH_V2_CUTOFF is set.
 * Computes 5-step health (0/12.5/25/50/100) based on real-activity streak.
 *
 * Alliance grace: 1 day. Genesis Pass grace: 2 days.
 * Recovery: +1 step per active day (cap 100). Decay: -1 step after grace expires.
 *
 * Idempotent: WHERE last_evaluated_day < EXCLUDED.last_evaluated_day on upsert.
 * Bulk: single unnest() INSERT for all holders per day.
 */

import { pointsDb } from '../db.js';
import { HEALTH_CONFIG, type NftActivation } from '../config/ecosystem.js';
import { EXCLUDED_CATEGORIES } from '../config/excluded-categories.js';

interface PrevHealthRow {
  identity_id: string;
  nft_type: string;
  health_pct: string;
  consecutive_rest_days: number;
  last_active_day: string | null;
  last_evaluated_day: string;
}

interface NextHealthState {
  health_pct: number;
  consecutive_rest_days: number;
  last_active_day: string | null;
}

function stepHealth(
  prev: { health_pct: number; consecutive_rest_days: number; last_active_day: string | null },
  wasActive: boolean,
  graceDays: number,
  targetDay: string,
): NextHealthState {
  const STEPS = HEALTH_CONFIG.steps as readonly number[];
  if (wasActive) {
    const i = STEPS.indexOf(prev.health_pct);
    const nextIdx = Math.min(STEPS.length - 1, (i < 0 ? 0 : i) + 1);
    return {
      health_pct: STEPS[nextIdx],
      consecutive_rest_days: 0,
      last_active_day: targetDay,
    };
  }
  const restDays = (prev.consecutive_rest_days ?? 0) + 1;
  if (restDays <= graceDays) {
    return { health_pct: prev.health_pct, consecutive_rest_days: restDays, last_active_day: prev.last_active_day };
  }
  // Decay: move one step down
  const i = STEPS.indexOf(prev.health_pct);
  const nextIdx = Math.max(0, (i < 0 ? STEPS.length - 1 : i) - 1);
  return {
    health_pct: STEPS[nextIdx],
    consecutive_rest_days: restDays,
    last_active_day: prev.last_active_day,
  };
}

export async function updateHealthForAllNftHolders(
  activationsCache: Map<string, NftActivation[]>,
  targetDay: string, // UTC 'YYYY-MM-DD'
): Promise<{ updated: number; skipped: number }> {
  if (!pointsDb) return { updated: 0, skipped: 0 };

  // 1. Partition holders by NFT type
  const holdersByType: Record<'alliance' | 'genesis-pass', Set<string>> = {
    'alliance': new Set(),
    'genesis-pass': new Set(),
  };
  for (const [id, acts] of activationsCache) {
    for (const a of acts) {
      if (a.status !== 'ACTIVE') continue;
      if (a.nftType === 'alliance') holdersByType['alliance'].add(id);
      else if (a.nftType === 'genesis-pass') holdersByType['genesis-pass'].add(id);
    }
  }
  const totalHolders = holdersByType['alliance'].size + holdersByType['genesis-pass'].size;
  if (totalHolders === 0) return { updated: 0, skipped: 0 };

  // 2. Load real-activity users for targetDay (1 query, EXCLUDED_CATEGORIES filter)
  const allHolders = [...holdersByType['alliance'], ...holdersByType['genesis-pass']];
  const activeRows = await pointsDb!`
    SELECT DISTINCT identity_id FROM activity_points
    WHERE NOT flagged
      AND tx_timestamp >= ${targetDay}::date
      AND tx_timestamp <  (${targetDay}::date + interval '1 day')
      AND category NOT IN ${pointsDb!(EXCLUDED_CATEGORIES)}
      AND identity_id = ANY(${allHolders})
  `;
  const activeIds = new Set(activeRows.map((r: any) => r.identity_id as string));

  // 3. Batch load existing health state for all holders
  const stateRows = await pointsDb!`
    SELECT identity_id, nft_type, health_pct, consecutive_rest_days,
           last_active_day::text, last_evaluated_day::text
    FROM nft_health_state
    WHERE identity_id = ANY(${allHolders})
  ` as PrevHealthRow[];
  const stateMap = new Map<string, PrevHealthRow>();
  for (const r of stateRows) stateMap.set(`${r.identity_id}:${r.nft_type}`, r);

  // 4. Compute next states, collect into batch arrays (skip already-evaluated)
  const ids: string[] = [];
  const types: string[] = [];
  const healths: number[] = [];
  const rests: number[] = [];
  const lastActiveDays: (string | null)[] = [];
  let skipped = 0;

  for (const nftType of ['alliance', 'genesis-pass'] as const) {
    const graceDays = nftType === 'alliance'
      ? HEALTH_CONFIG.alliance.graceDays
      : HEALTH_CONFIG.genesisPass.graceDays;

    for (const id of holdersByType[nftType]) {
      const prev = stateMap.get(`${id}:${nftType}`);
      // Idempotency: skip if already evaluated for this day
      if (prev && prev.last_evaluated_day >= targetDay) {
        skipped++;
        continue;
      }
      const prevState = prev
        ? { health_pct: parseFloat(prev.health_pct), consecutive_rest_days: prev.consecutive_rest_days, last_active_day: prev.last_active_day }
        : { health_pct: 100, consecutive_rest_days: 0, last_active_day: null };

      const next = stepHealth(prevState, activeIds.has(id), graceDays, targetDay);
      ids.push(id);
      types.push(nftType);
      healths.push(next.health_pct);
      rests.push(next.consecutive_rest_days);
      lastActiveDays.push(next.last_active_day);
    }
  }

  if (ids.length === 0) return { updated: 0, skipped };

  // 5. Single bulk upsert — atomic idempotency guard via WHERE on last_evaluated_day
  const targetDays = ids.map(() => targetDay);
  const result = await pointsDb!`
    INSERT INTO nft_health_state
      (identity_id, nft_type, health_pct, consecutive_rest_days,
       last_active_day, last_evaluated_day)
    SELECT * FROM unnest(
      ${pointsDb!.array(ids)}::text[],
      ${pointsDb!.array(types)}::text[],
      ${pointsDb!.array(healths)}::numeric[],
      ${pointsDb!.array(rests)}::int[],
      ${pointsDb!.array(lastActiveDays)}::date[],
      ${pointsDb!.array(targetDays)}::date[]
    ) AS t(identity_id, nft_type, health_pct, consecutive_rest_days,
           last_active_day, last_evaluated_day)
    ON CONFLICT (identity_id, nft_type) DO UPDATE
      SET health_pct            = EXCLUDED.health_pct,
          consecutive_rest_days = EXCLUDED.consecutive_rest_days,
          last_active_day       = EXCLUDED.last_active_day,
          last_evaluated_day    = EXCLUDED.last_evaluated_day,
          updated_at            = NOW()
      WHERE nft_health_state.last_evaluated_day < EXCLUDED.last_evaluated_day
  `;

  return { updated: result.count, skipped };
}

// Global watermark: MAX(last_evaluated_day) across all nft_health_state rows.
// Returns null if table is empty (fresh start).
export async function getHealthWatermark(): Promise<string | null> {
  if (!pointsDb) return null;
  const [row] = await pointsDb!`
    SELECT MAX(last_evaluated_day)::text AS wm FROM nft_health_state
  `;
  return (row?.wm as string | null) ?? null;
}

// addDays: add N days to a 'YYYY-MM-DD' string (UTC)
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}
