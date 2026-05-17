/**
 * Win/loss streak reducer.
 *
 * Streak rules (per game-result-schema.md):
 *   - win  = payout >  bet_amount
 *   - loss = payout <  bet_amount
 *   - push = payout == bet_amount (breaks the streak, counted as neither)
 *
 * Input rows must be ordered DESC by timestamp_ms (most recent first). The
 * streak ends at the first row whose kind differs from the leading row, or
 * at a push (regardless of leading kind).
 */

export type StreakKind = 'win' | 'loss';

export interface StreakRoundInput {
  payout: bigint;
  bet_amount: bigint;
  timestamp_ms: number;
}

export interface StreakResult {
  kind: StreakKind | null;
  length: number;
  started_ts_ms: number | null;
}

function classify(row: StreakRoundInput): StreakKind | 'push' {
  if (row.payout > row.bet_amount) return 'win';
  if (row.payout < row.bet_amount) return 'loss';
  return 'push';
}

export function reduceStreak(rows: readonly StreakRoundInput[]): StreakResult {
  if (rows.length === 0) {
    return { kind: null, length: 0, started_ts_ms: null };
  }
  const head = classify(rows[0]!);
  if (head === 'push') {
    return { kind: null, length: 0, started_ts_ms: null };
  }
  let length = 1;
  let startedTs = rows[0]!.timestamp_ms;
  for (let i = 1; i < rows.length; i++) {
    const k = classify(rows[i]!);
    if (k !== head) break;
    length += 1;
    startedTs = rows[i]!.timestamp_ms;
  }
  return { kind: head, length, started_ts_ms: startedTs };
}
