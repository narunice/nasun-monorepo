import { getSuiClient } from '../../../lib/sui-client';
import {
  LOTTERY_REGISTRY_ID,
  LOTTERY_ROUND_TYPE,
  TICKET_TYPE,
  ROUND_STATUS,
} from '../constants';
import { LOTTERY_ORIGINAL_PACKAGE_ID } from '@nasun/devnet-config';
import type { LotteryRound, Ticket, LotteryRegistry } from '../types';

/**
 * Fetch lottery registry info
 */
export async function fetchLotteryRegistry(): Promise<LotteryRegistry | null> {
  const client = getSuiClient();

  try {
    const object = await client.getObject({
      id: LOTTERY_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = object.data.content.fields as Record<string, unknown>;

    return {
      id: LOTTERY_REGISTRY_ID,
      currentRound: Number(fields.current_round || 0),
      treasuryBalance: BigInt(
        (fields.treasury_balance as { fields: { value: string } })?.fields?.value || '0'
      ),
      treasuryAddress: String(fields.treasury_address || ''),
      nextTicketId: Number(fields.next_ticket_id || 1),
    };
  } catch (error) {
    console.error('Error fetching lottery registry:', error);
    return null;
  }
}

/**
 * Fetch a single lottery round by ID
 */
export async function fetchLotteryRound(
  roundId: string
): Promise<LotteryRound | null> {
  const client = getSuiClient();

  try {
    const object = await client.getObject({
      id: roundId,
      options: { showContent: true },
    });

    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return null;
    }

    return parseLotteryRoundFields(roundId, object.data.content.fields as Record<string, unknown>);
  } catch (error) {
    console.error('Error fetching lottery round:', error);
    return null;
  }
}

/**
 * Fetch all lottery rounds (by querying events or known round IDs)
 * For MVP, we'll fetch recent RoundCreated events
 */
export async function fetchLotteryRounds(): Promise<LotteryRound[]> {
  const client = getSuiClient();

  try {
    // Query RoundCreated events to get round IDs
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    const roundIds = events.data.map((event) => {
      const parsedJson = event.parsedJson as { round_id: string };
      return parsedJson.round_id;
    });

    // Fetch each round
    const rounds: LotteryRound[] = [];
    for (const roundId of roundIds) {
      const round = await fetchLotteryRound(roundId);
      if (round) {
        rounds.push(round);
      }
    }

    return rounds;
  } catch (error) {
    console.error('Error fetching lottery rounds:', error);
    return [];
  }
}

/**
 * Fetch user's tickets for a specific round or all rounds
 */
export async function fetchUserTickets(
  userAddress: string,
  roundId?: string
): Promise<Ticket[]> {
  const client = getSuiClient();

  console.log('[fetchUserTickets] Fetching tickets for:', userAddress, 'roundId:', roundId);
  console.log('[fetchUserTickets] TICKET_TYPE:', TICKET_TYPE);

  try {
    const response = await client.getOwnedObjects({
      owner: userAddress,
      filter: { StructType: TICKET_TYPE },
      options: { showContent: true },
    });

    console.log('[fetchUserTickets] Response data count:', response.data.length);
    if (response.data.length > 0) {
      console.log('[fetchUserTickets] First object:', JSON.stringify(response.data[0], null, 2));
    }

    const tickets: Ticket[] = [];

    for (const obj of response.data) {
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        console.log('[fetchUserTickets] Skipping non-moveObject');
        continue;
      }

      const fields = obj.data.content.fields as Record<string, unknown>;
      // round_id is an ID type in Move, which serializes as a string
      const ticketRoundId = (fields.round_id as string) || '';

      console.log('[fetchUserTickets] Ticket fields:', JSON.stringify(fields, null, 2));
      console.log('[fetchUserTickets] ticketRoundId:', ticketRoundId, 'vs roundId:', roundId);

      // Filter by round if specified
      if (roundId && ticketRoundId !== roundId) {
        console.log('[fetchUserTickets] Skipping ticket - round mismatch');
        continue;
      }

      tickets.push({
        id: obj.data.objectId,
        ticketId: Number(fields.ticket_id || 0),
        roundId: ticketRoundId,
        roundNumber: Number(fields.round_number || 0),
        owner: (fields.owner as string) || '',
        numbers: parseNumbers(fields.numbers),
        purchaseTime: Number(fields.purchase_time || 0),
        isClaimed: false, // Field doesn't exist in Move contract
      });
    }

    console.log('[fetchUserTickets] Filtered tickets count:', tickets.length);
    return tickets.sort((a, b) => b.purchaseTime - a.purchaseTime);
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    return [];
  }
}

/**
 * Check if a ticket is a winner (any tier: 3+ matches)
 */
export function isWinningTicket(
  ticket: Ticket,
  drawnNumbers: number[] | null
): boolean {
  if (!drawnNumbers || drawnNumbers.length !== 5) {
    return false;
  }

  const matchCount = countMatchingNumbers(ticket.numbers, drawnNumbers);
  return matchCount >= 3; // At least 3 matches = prize winner
}

/**
 * Check if a ticket is a jackpot winner (5 matches)
 */
export function isJackpotWinner(
  ticket: Ticket,
  drawnNumbers: number[] | null
): boolean {
  if (!drawnNumbers || drawnNumbers.length !== 5) {
    return false;
  }

  const matchCount = countMatchingNumbers(ticket.numbers, drawnNumbers);
  return matchCount === 5;
}

/**
 * Count matching numbers between ticket and drawn numbers
 */
export function countMatchingNumbers(
  ticketNumbers: number[],
  drawnNumbers: number[] | null
): number {
  if (!drawnNumbers) return 0;

  const drawnSet = new Set(drawnNumbers);
  return ticketNumbers.filter((num) => drawnSet.has(num)).length;
}

// ===== Helper Functions =====

export function parseLotteryRoundFields(
  id: string,
  fields: Record<string, unknown>
): LotteryRound {
  // Parse drawn_numbers from Option<vector<u8>>
  let drawnNumbers: number[] | null = null;
  const drawnNumbersField = fields.drawn_numbers as { vec?: unknown[] } | null;
  if (drawnNumbersField?.vec && Array.isArray(drawnNumbersField.vec) && drawnNumbersField.vec.length > 0) {
    drawnNumbers = parseNumbers(drawnNumbersField.vec[0]);
  }

  return {
    id,
    roundNumber: Number(fields.round_number || 0),
    status: (Number(fields.status) || ROUND_STATUS.OPEN) as typeof ROUND_STATUS[keyof typeof ROUND_STATUS],
    startTime: Number(fields.start_time || 0),
    closeTime: Number(fields.close_time || 0),
    drawTime: Number(fields.draw_time || 0),
    prizePool: BigInt(
      (fields.prize_pool as { fields: { value: string } })?.fields?.value || '0'
    ),
    rolloverIn: BigInt(fields.rollover_in?.toString() || '0'),
    drawnNumbers,
    ticketCount: Number(fields.ticket_count || 0),
    totalSales: BigInt(fields.total_sales?.toString() || '0'),
    // Multi-tier winner tracking
    tier1Winners: Number(fields.tier1_winners || 0),
    tier2Winners: Number(fields.tier2_winners || 0),
    tier3Winners: Number(fields.tier3_winners || 0),
    tier1PayoutPerWinner: BigInt(fields.tier1_payout_per_winner?.toString() || '0'),
    tier2PayoutPerWinner: BigInt(fields.tier2_payout_per_winner?.toString() || '0'),
    tier3PayoutPerWinner: BigInt(fields.tier3_payout_per_winner?.toString() || '0'),
    // Rollover per tier
    tier1RolloverOut: BigInt(fields.tier1_rollover_out?.toString() || '0'),
    tier2RolloverOut: BigInt(fields.tier2_rollover_out?.toString() || '0'),
    tier3RolloverOut: BigInt(fields.tier3_rollover_out?.toString() || '0'),
  };
}

function parseNumbers(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((n) => Number(n));
  }
  return [];
}

/**
 * Format NUSDC amount for display (6 decimals)
 */
export function formatNusdc(amount: bigint): string {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Generate random numbers for Quick Pick
 */
export function generateQuickPick(): number[] {
  const numbers: Set<number> = new Set();

  while (numbers.size < 5) {
    const num = Math.floor(Math.random() * 32) + 1; // 1-32
    numbers.add(num);
  }

  return [...numbers].sort((a, b) => a - b);
}
