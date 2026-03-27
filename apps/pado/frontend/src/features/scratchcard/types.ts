/**
 * Scratchcard Type Definitions
 */

export interface ScratchCardPool {
  id: string;
  poolBalance: bigint;
  isPaused: boolean;
  currentDay: number;
  dailyCardCount: number;
  totalCardsSold: number;
  totalPrizesPaid: bigint;
  nextCardId: number;
}

export interface ScratchCard {
  id: string;
  cardId: number;
  purchaseTime: number;
  multiplier: number;
  prizeAmount: bigint;
}

/** Result parsed from ScratchCardPurchased event */
export interface ScratchResult {
  cardId: number;
  buyer: string;
  multiplier: number;
  prizeAmount: bigint;
  isWinner: boolean;
}

/** Format NUSDC amount (6 decimals) for display */
export function formatNusdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/** Get tier label for a given multiplier */
export function getTierLabel(multiplier: number): string {
  if (multiplier >= 100) return 'MEGA JACKPOT';
  if (multiplier >= 50) return 'JACKPOT';
  if (multiplier >= 20) return 'HUGE WIN';
  if (multiplier >= 10) return 'BIG WIN';
  if (multiplier >= 5) return 'Nice Win';
  if (multiplier >= 2) return 'Win';
  if (multiplier >= 1) return 'Even';
  return 'No Prize';
}

/** Get tier color class for a given multiplier */
export function getTierColorClass(multiplier: number): string {
  if (multiplier >= 50) return 'text-yellow-200 dark:text-yellow-300';
  if (multiplier >= 20) return 'text-yellow-500 dark:text-yellow-400';
  if (multiplier >= 10) return 'text-yellow-600 dark:text-yellow-400';
  if (multiplier >= 5) return 'text-green-600 dark:text-green-400';
  if (multiplier >= 2) return 'text-green-600 dark:text-green-500';
  if (multiplier >= 1) return 'text-theme-accent';
  return 'text-theme-text-muted';
}
