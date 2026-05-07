import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPastRounds,
  fetchUserTickets,
  type LotteryRound,
  type Ticket,
} from '../features/lottery/lottery-client';
import { PastRoundCard } from '../features/lottery/components/PastRoundCard';
import { ROUND_STATUS } from '../lib/gostop-config';
import { useActiveAddress } from '../hooks/useActiveAddress';

export default function LotteryHistoryPage() {
  const walletAddress = useActiveAddress();
  const [rounds, setRounds] = useState<LotteryRound[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPastRounds(24);
        if (!cancelled) setRounds(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load rounds');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setTickets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchUserTickets(walletAddress);
      if (!cancelled) setTickets(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const ticketsByRound = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const arr = map.get(t.roundId) ?? [];
      arr.push(t);
      map.set(t.roundId, arr);
    }
    return map;
  }, [tickets]);

  // Hide the in-progress current round (no draw yet). The active page is /lottery.
  const past = (rounds ?? []).filter(
    (r) => r.status === ROUND_STATUS.DRAWN || r.status === ROUND_STATUS.SETTLED,
  );

  return (
    <div className="space-y-6 min-h-screen">
      <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">Past Results</p>
        <h1 className="font-display text-4xl md:text-5xl text-gold">The Weekly · History</h1>
        <p className="text-base text-neutral-200 mt-3 max-w-xl leading-relaxed">
          Drawn numbers, winner counts, and per-tier payouts for previous rounds. All values are
          read live from on-chain round objects.
        </p>
        <div className="mt-5">
          <Link to="/lottery" className="btn-ghost !py-2 !px-4 text-sm">
            ← Back to current round
          </Link>
        </div>
      </header>

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {rounds === null && !error && (
        <div className="panel p-10 text-center text-neutral-300">Loading past rounds...</div>
      )}

      {rounds !== null && past.length === 0 && !error && (
        <div className="panel p-10 text-center">
          <h2 className="font-display text-2xl text-gold mb-2">No completed rounds yet</h2>
          <p className="text-base text-neutral-200">
            Once the first round is drawn, results will appear here.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {past.map((r) => (
          <PastRoundCard key={r.id} round={r} userTickets={ticketsByRound.get(r.id)} />
        ))}
      </div>
    </div>
  );
}
