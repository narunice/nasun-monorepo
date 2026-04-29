import { ROUND_STATUS, PRIZE_TIER, type PrizeTier } from './constants';

export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];
export type { PrizeTier };

export interface LotteryRound {
  id: string;
  roundNumber: number;
  status: RoundStatus;

  // Timing (milliseconds)
  startTime: number;
  closeTime: number;
  drawTime: number;

  // Prize pool
  prizePool: bigint;
  rolloverIn: bigint;
  drawnNumbers: number[] | null;

  // Statistics
  ticketCount: number;
  totalSales: bigint;

  // Multi-tier winner tracking
  tier1Winners: number; // Jackpot (5 match)
  tier2Winners: number; // 2nd prize (4 match)
  tier3Winners: number; // 3rd prize (3 match)
  tier1PayoutPerWinner: bigint;
  tier2PayoutPerWinner: bigint;
  tier3PayoutPerWinner: bigint;

  // Rollover per tier (for no-winner cases)
  tier1RolloverOut: bigint;
  tier2RolloverOut: bigint;
  tier3RolloverOut: bigint;
}

export interface Ticket {
  id: string;
  ticketId: number;
  roundId: string;
  roundNumber: number;
  owner: string;
  numbers: number[]; // Sorted 5 numbers
  purchaseTime: number;
  isClaimed: boolean;
}

export interface LotteryRegistry {
  id: string;
  currentRound: number;
  treasuryBalance: bigint;
  treasuryAddress: string;
  nextTicketId: number;
}

// Helper type for status display
export type RoundStatusLabel = 'open' | 'closed' | 'drawn' | 'settled';

export function getStatusLabel(status: RoundStatus): RoundStatusLabel {
  switch (status) {
    case ROUND_STATUS.OPEN:
      return 'open';
    case ROUND_STATUS.CLOSED:
      return 'closed';
    case ROUND_STATUS.DRAWN:
      return 'drawn';
    case ROUND_STATUS.SETTLED:
      return 'settled';
    default:
      return 'open';
  }
}

export function isRoundActive(round: LotteryRound): boolean {
  return round.status === ROUND_STATUS.OPEN && Date.now() < round.closeTime;
}

export function canClaimPrize(round: LotteryRound): boolean {
  return round.status === ROUND_STATUS.SETTLED;
}

// Multi-tier helper functions

export type TierLabel = 'jackpot' | '2nd' | '3rd' | 'none';

export function getTierFromMatchCount(matchCount: number): PrizeTier {
  if (matchCount === 5) return PRIZE_TIER.JACKPOT;
  if (matchCount === 4) return PRIZE_TIER.SECOND;
  if (matchCount === 3) return PRIZE_TIER.THIRD;
  return PRIZE_TIER.NONE;
}

export function getTierLabel(tier: PrizeTier): TierLabel {
  switch (tier) {
    case PRIZE_TIER.JACKPOT:
      return 'jackpot';
    case PRIZE_TIER.SECOND:
      return '2nd';
    case PRIZE_TIER.THIRD:
      return '3rd';
    default:
      return 'none';
  }
}

export function getTierPayout(round: LotteryRound, tier: PrizeTier): bigint {
  switch (tier) {
    case PRIZE_TIER.JACKPOT:
      return round.tier1PayoutPerWinner;
    case PRIZE_TIER.SECOND:
      return round.tier2PayoutPerWinner;
    case PRIZE_TIER.THIRD:
      return round.tier3PayoutPerWinner;
    default:
      return 0n;
  }
}

export function countMatchingNumbers(drawn: number[], ticket: number[]): number {
  const drawnSet = new Set(drawn);
  return ticket.filter((n) => drawnSet.has(n)).length;
}

export function getTicketTier(drawn: number[] | null, ticketNumbers: number[]): PrizeTier {
  if (!drawn) return PRIZE_TIER.NONE;
  const matchCount = countMatchingNumbers(drawn, ticketNumbers);
  return getTierFromMatchCount(matchCount);
}

export function isTicketWinner(drawn: number[] | null, ticketNumbers: number[]): boolean {
  return getTicketTier(drawn, ticketNumbers) !== PRIZE_TIER.NONE;
}
