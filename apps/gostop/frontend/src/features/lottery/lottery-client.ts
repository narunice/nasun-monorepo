import { getSuiClient } from '../../lib/sui-client';
import { apiRequest } from '../../lib/api/client';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY_ID,
  ROUND_STATUS,
  TICKET_TYPE,
  type RoundStatus,
} from '../../lib/gostop-config';

/**
 * Resolve the most recent round object ids, newest first, from the backend
 * indexer. This is the PRIMARY discovery path and is immune to devnet pruning:
 * the indexer persists `round_id` in `gostop.lottery_round` at RoundCreated
 * time, so the current (open) round is always resolvable even after the
 * fullnode drops the create_round tx/events. The round objects themselves are
 * live shared state and never pruned, so a later getObject(round_id) still
 * returns authoritative status/ticket_count. Throws on network/config error so
 * the caller can fall back to on-chain discovery.
 */
async function fetchRecentRoundIdsFromBackend(limit: number): Promise<string[]> {
  const resp = await apiRequest<{ rounds: { round_id: string }[] }>(
    `/api/gostop/round/lottery/recent?limit=${encodeURIComponent(limit)}`,
  );
  return resp.rounds.map((r) => r.round_id).filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * Fallback: return round object ids from the on-chain tx index, newest first,
 * WITHOUT queryEvents. The devnet fullnode prunes transaction events after a
 * couple of epochs (~4h), so queryEvents(RoundCreated) throws "Could not find
 * the referenced transaction events" once a round's create tx ages out — which
 * blanked the current round and history on this page. queryTransactionBlocks
 * degrades gracefully (pruned txs come back with empty effects, not a throw),
 * and each create_round tx carries the created shared LotteryRound in its
 * effects. Tx-index retention is short too (only the newest round(s) survive),
 * which is why the backend indexer above is preferred for discovery.
 */
async function fetchRecentRoundIdsOnChain(limit: number): Promise<string[]> {
  const client = getSuiClient();
  const txs = await client.queryTransactionBlocks({
    filter: {
      MoveFunction: { package: LOTTERY_PACKAGE_ID, module: 'lottery', function: 'create_round' },
    },
    options: { showEffects: true },
    order: 'descending',
    limit,
  });
  const ids: string[] = [];
  for (const tx of txs.data) {
    const created = tx.effects?.created ?? [];
    const roundRef = created.find(
      (c) => c.owner && typeof c.owner === 'object' && 'Shared' in c.owner,
    );
    if (roundRef) ids.push(roundRef.reference.objectId);
  }
  return ids;
}

/**
 * Backend-first round discovery with on-chain fallback. The backend is durable
 * against pruning; the on-chain path is the safety net when the backend is
 * unreachable or not configured (e.g. local dev without VITE_GOSTOP_API_URL).
 */
async function fetchRecentRoundIds(limit: number): Promise<string[]> {
  try {
    const ids = await fetchRecentRoundIdsFromBackend(limit);
    if (ids.length > 0) return ids;
  } catch (e) {
    console.warn('[lottery] backend round discovery failed, falling back on-chain:', e);
  }
  return fetchRecentRoundIdsOnChain(limit);
}

export interface LotteryRegistry {
  id: string;
  currentRound: number;
  nextTicketId: number;
}

export interface LotteryRound {
  id: string;
  roundNumber: number;
  status: RoundStatus;
  startTime: number;
  closeTime: number;
  drawTime: number;
  prizePool: bigint;
  rolloverIn: bigint;
  drawnNumbers: number[] | null;
  ticketCount: number;
  totalSales: bigint;
  tier1Winners: number;
  tier2Winners: number;
  tier3Winners: number;
  tier1PayoutPerWinner: bigint;
  tier2PayoutPerWinner: bigint;
  tier3PayoutPerWinner: bigint;
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
  numbers: number[];
  purchaseTime: number;
}

export async function fetchLotteryRegistry(): Promise<LotteryRegistry | null> {
  const client = getSuiClient();
  try {
    const obj = await client.getObject({
      id: LOTTERY_REGISTRY_ID,
      options: { showContent: true },
    });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
    const f = obj.data.content.fields as Record<string, unknown>;
    return {
      id: LOTTERY_REGISTRY_ID,
      currentRound: Number(f.current_round || 0),
      nextTicketId: Number(f.next_ticket_id || 1),
    };
  } catch (e) {
    console.error('[lottery] fetchLotteryRegistry:', e);
    return null;
  }
}

export async function fetchLotteryRound(roundId: string): Promise<LotteryRound | null> {
  const client = getSuiClient();
  try {
    const obj = await client.getObject({
      id: roundId,
      options: { showContent: true },
    });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
    return parseRoundFields(roundId, obj.data.content.fields as Record<string, unknown>);
  } catch (e) {
    console.error('[lottery] fetchLotteryRound:', e);
    return null;
  }
}

/**
 * Resolve a round object id by round number from the backend indexer. Returns
 * null on 404/error so the caller can fall back.
 */
async function fetchRoundIdByNumber(roundNumber: number): Promise<string | null> {
  try {
    const resp = await apiRequest<{ round: { round_id: string } }>(
      `/api/gostop/round/lottery/by-number/${encodeURIComponent(roundNumber)}`,
    );
    const id = resp.round?.round_id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Return the object id of the CURRENT lottery round.
 *
 * The authoritative round number comes from the on-chain LotteryRegistry — a
 * live shared object that is never pruned — and the backend indexer maps that
 * number to the round object id durably. This is robust against two devnet
 * hazards at once: (1) tx-index/event pruning, which blanked on-chain
 * discovery mid-week, and (2) genesis resets, which leave STALE higher
 * round_numbers in the indexer so "newest by number" would resolve a dead
 * round object. Falls back to on-chain tx-index discovery only when the
 * registry or backend is unavailable.
 */
export async function fetchLatestRoundId(): Promise<string | null> {
  try {
    const registry = await fetchLotteryRegistry();
    if (registry && registry.currentRound > 0) {
      const id = await fetchRoundIdByNumber(registry.currentRound);
      if (id) return id;
    }
  } catch (e) {
    console.warn('[lottery] registry-anchored round discovery failed, falling back on-chain:', e);
  }
  try {
    const ids = await fetchRecentRoundIdsOnChain(1);
    return ids[0] ?? null;
  } catch (e) {
    console.error('[lottery] fetchLatestRoundId on-chain fallback:', e);
    return null;
  }
}

export async function fetchLatestRound(): Promise<LotteryRound | null> {
  const id = await fetchLatestRoundId();
  if (!id) return null;
  return fetchLotteryRound(id);
}

/**
 * Fetch up to `limit` most recent rounds, descending by round_number.
 * Used by the history page to render past round results (drawn numbers,
 * winners per tier, payouts).
 */
export async function fetchPastRounds(limit = 24): Promise<LotteryRound[]> {
  const client = getSuiClient();
  try {
    // On-chain discovery is bounded by tx-index pruning (only the newest
    // round(s) survive); older history is served from the backend indexer.
    const roundIds = await fetchRecentRoundIds(limit);
    if (roundIds.length === 0) return [];
    const rounds: LotteryRound[] = [];
    for (let i = 0; i < roundIds.length; i += 50) {
      const chunk = roundIds.slice(i, i + 50);
      const results = await client.multiGetObjects({
        ids: chunk,
        options: { showContent: true },
      });
      for (const obj of results) {
        if (obj.data?.content?.dataType !== 'moveObject') continue;
        try {
          rounds.push(
            parseRoundFields(
              obj.data.objectId,
              obj.data.content.fields as Record<string, unknown>,
            ),
          );
        } catch {
          // skip unparseable
        }
      }
    }
    return rounds.sort((a, b) => b.roundNumber - a.roundNumber);
  } catch (e) {
    console.error('[lottery] fetchPastRounds:', e);
    return [];
  }
}

export async function fetchUserTickets(
  owner: string,
  roundId?: string,
): Promise<Ticket[]> {
  const client = getSuiClient();
  try {
    const tickets: Ticket[] = [];
    let cursor: string | null | undefined = null;
    do {
      const resp = await client.getOwnedObjects({
        owner,
        filter: { StructType: TICKET_TYPE },
        options: { showContent: true },
        cursor,
        limit: 50,
      });
      for (const o of resp.data) {
        if (!o.data?.content || o.data.content.dataType !== 'moveObject') continue;
        const f = o.data.content.fields as Record<string, unknown>;
        const ticketRoundId = String(f.round_id || '');
        if (roundId && ticketRoundId !== roundId) continue;
        tickets.push({
          id: o.data.objectId,
          ticketId: Number(f.ticket_id || 0),
          roundId: ticketRoundId,
          roundNumber: Number(f.round_number || 0),
          owner: String(f.owner || ''),
          numbers: parseNumbers(f.numbers),
          purchaseTime: Number(f.purchase_time || 0),
        });
      }
      cursor = resp.hasNextPage ? resp.nextCursor : undefined;
    } while (cursor);
    return tickets.sort((a, b) => b.purchaseTime - a.purchaseTime);
  } catch (e) {
    console.error('[lottery] fetchUserTickets:', e);
    return [];
  }
}

export function countMatchingNumbers(ticket: number[], drawn: number[] | null): number {
  if (!drawn) return 0;
  const set = new Set(drawn);
  return ticket.filter((n) => set.has(n)).length;
}

export function getTicketTier(matchCount: number): 0 | 1 | 2 | 3 {
  if (matchCount === 5) return 1;
  if (matchCount === 4) return 2;
  if (matchCount === 3) return 3;
  return 0;
}

// Prize tier constants and helpers used by game-history (added in PR2).
// `parseLotteryRoundFields` is a public alias of the internal `parseRoundFields`
// so the history feature can multi-get rounds without re-implementing parsing.
export const PRIZE_TIER = {
  JACKPOT: 1,
  SECOND: 2,
  THIRD: 3,
  NONE: 0,
} as const;
export type PrizeTier = (typeof PRIZE_TIER)[keyof typeof PRIZE_TIER];

export function getTierPayout(round: LotteryRound, tier: PrizeTier): bigint {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return round.tier1PayoutPerWinner;
    case PRIZE_TIER.SECOND:  return round.tier2PayoutPerWinner;
    case PRIZE_TIER.THIRD:   return round.tier3PayoutPerWinner;
    default: return 0n;
  }
}

export function getTierLabel(tier: PrizeTier): string {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return 'Jackpot';
    case PRIZE_TIER.SECOND:  return '2nd';
    case PRIZE_TIER.THIRD:   return '3rd';
    default: return '';
  }
}

export function isClaimable(round: LotteryRound, ticket: Ticket, nowMs: number): boolean {
  if (round.status !== ROUND_STATUS.SETTLED) return false;
  if (ticket.roundId !== round.id) return false;
  const matches = countMatchingNumbers(ticket.numbers, round.drawnNumbers);
  if (getTicketTier(matches) === 0) return false;
  // Pure check; on-chain enforces CLAIM_WINDOW_MS via Clock.
  return nowMs < round.drawTime + 30 * 24 * 60 * 60 * 1000;
}

// ===== Internal (with public alias for game-history) =====

export { parseRoundFields as parseLotteryRoundFields };

function parseRoundFields(id: string, f: Record<string, unknown>): LotteryRound {
  // `Option<vector<u8>>` is serialized differently across Sui SDK versions.
  // Older RPC: `{ vec: [[1,2,3,4,5]] }` for Some, `{ vec: [] }` for None.
  // Newer normalized RPC: `[1,2,3,4,5]` for Some, `null` for None.
  // Tolerate both shapes; otherwise drawn rounds show as "Settling" forever.
  let drawnNumbers: number[] | null = null;
  const drawn = f.drawn_numbers;
  if (Array.isArray(drawn) && drawn.length > 0) {
    drawnNumbers = parseNumbers(drawn);
  } else if (drawn && typeof drawn === 'object' && 'vec' in drawn) {
    const vec = (drawn as { vec?: unknown[] }).vec;
    if (Array.isArray(vec) && vec.length > 0) {
      drawnNumbers = parseNumbers(vec[0]);
    }
  }

  // prize_pool is a Balance<NUSDC>. RPC may serialize either as a Balance
  // with `value` field or as a plain number string depending on SDK version.
  let prizePool = 0n;
  const pp = f.prize_pool;
  if (pp != null) {
    if (typeof pp === 'object' && pp !== null && 'fields' in pp) {
      const v = (pp as { fields?: { value?: string } }).fields?.value;
      if (v != null) prizePool = BigInt(v);
    } else if (typeof pp === 'string' || typeof pp === 'number') {
      prizePool = BigInt(pp.toString());
    }
  }

  return {
    id,
    roundNumber: Number(f.round_number || 0),
    status: (Number(f.status) || 0) as RoundStatus,
    startTime: Number(f.start_time || 0),
    closeTime: Number(f.close_time || 0),
    drawTime: Number(f.draw_time || 0),
    prizePool,
    rolloverIn: BigInt(f.rollover_in?.toString() || '0'),
    drawnNumbers,
    ticketCount: Number(f.ticket_count || 0),
    totalSales: BigInt(f.total_sales?.toString() || '0'),
    tier1Winners: Number(f.tier1_winners || 0),
    tier2Winners: Number(f.tier2_winners || 0),
    tier3Winners: Number(f.tier3_winners || 0),
    tier1PayoutPerWinner: BigInt(f.tier1_payout_per_winner?.toString() || '0'),
    tier2PayoutPerWinner: BigInt(f.tier2_payout_per_winner?.toString() || '0'),
    tier3PayoutPerWinner: BigInt(f.tier3_payout_per_winner?.toString() || '0'),
    tier1RolloverOut: BigInt(f.tier1_rollover_out?.toString() || '0'),
    tier2RolloverOut: BigInt(f.tier2_rollover_out?.toString() || '0'),
    tier3RolloverOut: BigInt(f.tier3_rollover_out?.toString() || '0'),
  };
}

function parseNumbers(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((n) => Number(n));
  return [];
}
