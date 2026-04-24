import { useEffect, useMemo, useState } from 'react';
import {
  countMatchingNumbers,
  fetchLatestRound,
  fetchLotteryRound,
  fetchUserTickets,
  getTicketTier,
  type LotteryRound,
  type Ticket,
} from './lottery-client';
import { LOTTERY_CLAIM_WINDOW_MS, ROUND_STATUS } from '../../lib/gostop-config';

const ROUND_REFRESH_MS = 15_000;
const TICKETS_REFRESH_MS = 20_000;

export function useLatestRound(): {
  round: LotteryRound | null;
  loading: boolean;
  refresh: () => void;
} {
  const [round, setRound] = useState<LotteryRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // sequence id guards against late in-flight responses overwriting
    // newer state when refresh() is called rapidly.
    let mySeq = 0;
    const seqRef = { current: 0 };
    let id: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      mySeq = ++seqRef.current;
      const expected = mySeq;
      // Pause polling when tab is hidden to avoid wasted RPC.
      if (typeof document !== 'undefined' && document.hidden) {
        id = setTimeout(load, ROUND_REFRESH_MS);
        return;
      }
      const r = await fetchLatestRound();
      if (expected !== seqRef.current) return; // stale
      setRound(r);
      setLoading(false);
      id = setTimeout(load, ROUND_REFRESH_MS);
    }
    load();

    return () => {
      seqRef.current++;
      if (id) clearTimeout(id);
    };
  }, [tick]);

  return { round, loading, refresh: () => setTick((n) => n + 1) };
}

export function useMyTickets(
  owner: string | null | undefined,
  roundId?: string,
): { tickets: Ticket[]; loading: boolean; refresh: () => void } {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!owner) {
      setTickets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let id: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const t = await fetchUserTickets(owner!, roundId);
      if (cancelled) return;
      setTickets(t);
      setLoading(false);
      id = setTimeout(load, TICKETS_REFRESH_MS);
    }
    load();

    return () => {
      cancelled = true;
      if (id) clearTimeout(id);
    };
  }, [owner, roundId, tick]);

  return { tickets, loading, refresh: () => setTick((n) => n + 1) };
}

export interface ClaimableTicket {
  ticket: Ticket;
  round: LotteryRound;
  tier: 1 | 2 | 3;
  matchCount: number;
  payout: bigint;
  deadlineMs: number;
  msUntilDeadline: number; // negative if expired
}

export interface ClaimSummary {
  claimable: ClaimableTicket[]; // tier > 0, deadline not passed
  expired: ClaimableTicket[];   // tier > 0, deadline passed (forfeit)
  totalClaimableNusdc: bigint;
  earliestDeadlineMs: number | null;
  loading: boolean;
}

/**
 * Fetch all owned tickets and resolve their settled rounds. Returns a
 * summary of which are still claimable, total prize, and the nearest
 * expiry. Used by the LotteryPage banner.
 *
 * Note: queries each unique roundId once. For users with tickets across
 * many rounds, this is at most one getObject call per round. Caches via
 * the polling interval.
 */
interface CacheEntry {
  round: LotteryRound | null;
  fetchedAt: number;
}
const NON_SETTLED_TTL_MS = 30_000; // re-fetch active rounds every 30s
const NULL_ENTRY_TTL_MS = 60_000;  // retry failed lookups after 1min

export function useClaimSummary(owner: string | null | undefined): ClaimSummary {
  const { tickets, loading: ticketsLoading } = useMyTickets(owner);
  const [roundCache, setRoundCache] = useState<Record<string, CacheEntry>>({});
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Fetch round info for any ticket round that is missing OR stale.
  // SETTLED rounds are immutable, so cached forever. Non-settled / null
  // entries refetch periodically so newly-settled rounds surface promptly.
  useEffect(() => {
    const need: string[] = [];
    for (const t of tickets) {
      const entry = roundCache[t.roundId];
      if (!entry) {
        need.push(t.roundId);
        continue;
      }
      if (entry.round === null && now - entry.fetchedAt > NULL_ENTRY_TTL_MS) {
        need.push(t.roundId);
      } else if (entry.round && entry.round.status !== ROUND_STATUS.SETTLED &&
                 now - entry.fetchedAt > NON_SETTLED_TTL_MS) {
        need.push(t.roundId);
      }
    }
    if (need.length === 0) return;
    const ids = Array.from(new Set(need));
    let cancelled = false;
    Promise.all(ids.map((id) => fetchLotteryRound(id))).then((rounds) => {
      if (cancelled) return;
      const fetchedAt = Date.now();
      setRoundCache((prev) => {
        const next = { ...prev };
        ids.forEach((id, i) => {
          next[id] = { round: rounds[i], fetchedAt };
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tickets, roundCache, now]);

  return useMemo(() => {
    const claimable: ClaimableTicket[] = [];
    const expired: ClaimableTicket[] = [];

    for (const ticket of tickets) {
      const entry = roundCache[ticket.roundId];
      const round = entry?.round;
      if (!round) continue;
      if (round.status !== ROUND_STATUS.SETTLED) continue;
      const matchCount = countMatchingNumbers(ticket.numbers, round.drawnNumbers);
      const tier = getTicketTier(matchCount);
      if (tier === 0) continue;

      const payout =
        tier === 1
          ? round.tier1PayoutPerWinner
          : tier === 2
            ? round.tier2PayoutPerWinner
            : round.tier3PayoutPerWinner;
      if (payout === 0n) continue;

      const deadlineMs = round.drawTime + LOTTERY_CLAIM_WINDOW_MS;
      const msUntilDeadline = deadlineMs - now;
      const item: ClaimableTicket = {
        ticket,
        round,
        tier,
        matchCount,
        payout,
        deadlineMs,
        msUntilDeadline,
      };
      if (msUntilDeadline > 0) claimable.push(item);
      else expired.push(item);
    }

    let totalClaimable = 0n;
    let earliest: number | null = null;
    for (const c of claimable) {
      totalClaimable += c.payout;
      if (earliest === null || c.deadlineMs < earliest) earliest = c.deadlineMs;
    }

    return {
      claimable,
      expired,
      totalClaimableNusdc: totalClaimable,
      earliestDeadlineMs: earliest,
      loading: ticketsLoading,
    };
  }, [tickets, roundCache, now, ticketsLoading]);
}
