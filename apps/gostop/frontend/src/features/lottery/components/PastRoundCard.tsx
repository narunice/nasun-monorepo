import { Link } from 'react-router-dom';
import { formatNusdc } from '../../../lib/format';
import { ROUND_STATUS } from '../../../lib/gostop-config';
import { statusLabel } from '../lottery-utils';
import {
  countMatchingNumbers,
  getTicketTier,
  type LotteryRound,
  type Ticket,
} from '../lottery-client';

interface Props {
  round: LotteryRound;
  userTickets?: Ticket[];
}

const CLAIM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function DrawnNumbers({ numbers }: { numbers: number[] | null }) {
  if (!numbers || numbers.length === 0) {
    return <p className="text-sm text-neutral-300 italic">Awaiting draw</p>;
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gold-gradient text-ink-900 font-display text-lg font-bold shadow-gold-glow"
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function MyTicketsBadge({ round, tickets }: { round: LotteryRound; tickets: Ticket[] }) {
  if (tickets.length === 0) return null;
  let jackpot = 0;
  let second = 0;
  let third = 0;
  for (const t of tickets) {
    const tier = getTicketTier(countMatchingNumbers(t.numbers, round.drawnNumbers));
    if (tier === 1) jackpot += 1;
    else if (tier === 2) second += 1;
    else if (tier === 3) third += 1;
  }
  const claimable =
    round.status === ROUND_STATUS.SETTLED &&
    Date.now() < round.drawTime + CLAIM_WINDOW_MS;
  const totalClaimable =
    round.tier1PayoutPerWinner * BigInt(jackpot) +
    round.tier2PayoutPerWinner * BigInt(second) +
    round.tier3PayoutPerWinner * BigInt(third);
  const winnerCount = jackpot + second + third;

  return (
    <div className="rounded-lg border border-gold-200/40 bg-gold-400/5 p-4 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm uppercase tracking-widest text-gold-200">Your Tickets</span>
        <span className="font-mono text-base text-neutral-100">
          {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
        </span>
        {winnerCount > 0 ? (
          <span className="text-sm text-gold-100">
            · Jackpot {jackpot} · 2nd {second} · 3rd {third}
          </span>
        ) : (
          <span className="text-sm text-neutral-300">· No matches this round</span>
        )}
      </div>
      {totalClaimable > 0n && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-base text-emerald-300">
            {formatNusdc(totalClaimable)} NUSDC {claimable ? 'claimable' : 'won'}
          </span>
          {claimable && (
            <Link to="/lottery" className="btn-gold !py-1.5 !px-3 text-sm">
              Claim
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function PastRoundCard({ round, userTickets }: Props) {
  const totalPool = round.prizePool + round.rolloverIn;
  const isSettled = round.status === ROUND_STATUS.SETTLED || round.status === ROUND_STATUS.DRAWN;
  const tiers = [
    {
      label: 'Jackpot',
      match: '5 / 5',
      winners: round.tier1Winners,
      perWinner: round.tier1PayoutPerWinner,
      rollover: round.tier1RolloverOut,
      color: 'text-gold-200',
    },
    {
      label: '2nd',
      match: '4 / 5',
      winners: round.tier2Winners,
      perWinner: round.tier2PayoutPerWinner,
      rollover: round.tier2RolloverOut,
      color: 'text-gold-100',
    },
    {
      label: '3rd',
      match: '3 / 5',
      winners: round.tier3Winners,
      perWinner: round.tier3PayoutPerWinner,
      rollover: round.tier3RolloverOut,
      color: 'text-gold-50',
    },
  ];

  return (
    <article className="panel p-5 sm:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-gold-300">
            Round {String(round.roundNumber).padStart(3, '0')} · {statusLabel(round.status)}
          </p>
          <h3 className="font-display text-2xl text-gold mt-1">
            Drawn {formatDate(round.drawTime)}
          </h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm text-neutral-200">Total Pool</p>
          <p className="font-mono text-xl text-gold-200">{formatNusdc(totalPool)} NUSDC</p>
          <p className="text-sm text-neutral-300 mt-1">
            {round.ticketCount.toLocaleString('en-US')} tickets sold
          </p>
        </div>
      </header>

      <div>
        <p className="text-sm uppercase tracking-widest text-neutral-200 mb-2">Winning Numbers</p>
        <DrawnNumbers numbers={round.drawnNumbers} />
      </div>

      {userTickets && userTickets.length > 0 && round.drawnNumbers && (
        <MyTicketsBadge round={round} tickets={userTickets} />
      )}

      {isSettled && (
        <div className="overflow-x-auto rounded-lg border border-gold-subtle">
          <table className="w-full min-w-[20rem] text-sm">
            <thead className="bg-ink-800/80 uppercase tracking-widest text-neutral-200">
              <tr>
                <th className="text-left px-3 py-2">Tier</th>
                <th className="text-left px-3 py-2">Match</th>
                <th className="text-right px-3 py-2">Winners</th>
                <th className="text-right px-3 py-2">Per Winner</th>
                <th className="text-right px-3 py-2">Rolled Over</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.label} className="border-t border-gold-subtle/50">
                  <td className={`px-3 py-2 font-display ${t.color}`}>{t.label}</td>
                  <td className="px-3 py-2 text-neutral-200">{t.match}</td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-100">
                    {t.winners.toLocaleString('en-US')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gold-200">
                    {t.winners > 0 ? `${formatNusdc(t.perWinner)} NUSDC` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-300">
                    {t.rollover > 0n ? `${formatNusdc(t.rollover)} NUSDC` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isSettled && round.drawnNumbers && (
        <p className="text-sm text-neutral-300 italic">Settlement in progress.</p>
      )}

      <div className="flex justify-end">
        <Link
          to="/games/history"
          className="text-sm text-gold-200 hover:text-gold-100 underline-offset-4 hover:underline"
        >
          See your tickets in History →
        </Link>
      </div>
    </article>
  );
}
