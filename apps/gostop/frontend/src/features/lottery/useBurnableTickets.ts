import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSuiClient } from '../../lib/sui-client';
import {
  fetchUserTickets,
  countMatchingNumbers,
  type Ticket,
  type LotteryRound,
} from './lottery-client';
import { parseLotteryRoundFields } from './lottery-client';
import { ROUND_STATUS } from '../../lib/gostop-config';

const REFRESH_MS = 60_000;

export interface BurnableRoundGroup {
  round: LotteryRound;
  tickets: Ticket[];
}

export interface UseBurnableTicketsResult {
  groups: BurnableRoundGroup[];
  totalTickets: number;
  loading: boolean;
  refresh: () => void;
}

/**
 * Scan every Ticket NFT owned by `owner` and surface only those whose round
 * is SETTLED and which did NOT win a tier 1/2/3 prize. These are the safe
 * burn candidates — winning tickets must be claimed first (the contract
 * itself rejects burn_ticket on a winning match count, so wallet stragglers
 * with 3+ matches are filtered out client-side too).
 */
export function useBurnableTickets(
  owner: string | null | undefined,
): UseBurnableTicketsResult {
  const [groups, setGroups] = useState<BurnableRoundGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!owner) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const tickets = await fetchUserTickets(owner!);
        if (cancelled) return;

        // Bucket tickets by round so we only fetch each round once.
        const byRound = new Map<string, Ticket[]>();
        for (const t of tickets) {
          const list = byRound.get(t.roundId) ?? [];
          list.push(t);
          byRound.set(t.roundId, list);
        }
        const roundIds = Array.from(byRound.keys());
        if (roundIds.length === 0) {
          if (!cancelled) setGroups([]);
        } else {
          const client = getSuiClient();
          const rounds: LotteryRound[] = [];
          // multiGetObjects caps at 50 per call.
          for (let i = 0; i < roundIds.length; i += 50) {
            const chunk = roundIds.slice(i, i + 50);
            const resp = await client.multiGetObjects({
              ids: chunk,
              options: { showContent: true },
            });
            for (const obj of resp) {
              if (obj.data?.content?.dataType !== 'moveObject') continue;
              try {
                rounds.push(
                  parseLotteryRoundFields(
                    obj.data.objectId,
                    obj.data.content.fields as Record<string, unknown>,
                  ),
                );
              } catch {
                // skip
              }
            }
          }

          const next: BurnableRoundGroup[] = [];
          for (const round of rounds) {
            if (round.status !== ROUND_STATUS.SETTLED) continue;
            const roundTickets = byRound.get(round.id) ?? [];
            const losers = roundTickets.filter(
              (t) => countMatchingNumbers(t.numbers, round.drawnNumbers) < 3,
            );
            if (losers.length > 0) next.push({ round, tickets: losers });
          }
          // Newest first.
          next.sort((a, b) => b.round.roundNumber - a.round.roundNumber);
          if (!cancelled) setGroups(next);
        }
      } catch (e) {
        console.error('[lottery] useBurnableTickets:', e);
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(load, REFRESH_MS);
        }
      }
    }
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [owner, tick]);

  const totalTickets = useMemo(
    () => groups.reduce((acc, g) => acc + g.tickets.length, 0),
    [groups],
  );

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { groups, totalTickets, loading, refresh };
}
