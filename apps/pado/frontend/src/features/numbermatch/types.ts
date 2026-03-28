/**
 * Number Match Type Definitions
 */

export interface NumberMatchPool {
  id: string;
  poolBalance: bigint;
  isPaused: boolean;
  currentDay: number;
  dailyPlayCount: number;
  totalPlays: number;
  totalPrizesPaid: bigint;
  nextGameId: number;
}

/** Result parsed from NumberMatchPlayed event */
export interface NumberMatchResult {
  gameId: number;
  player: string;
  picks: number[];
  winningNumber: number;
  isWin: boolean;
  cost: bigint;
  payout: bigint;
  timestampMs?: number;
}

/** Game phase for UI state machine */
export type GamePhase = 'idle' | 'buying' | 'revealing' | 'revealed';

/** Format NUSDC amount (6 decimals) for display */
export function formatNusdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
