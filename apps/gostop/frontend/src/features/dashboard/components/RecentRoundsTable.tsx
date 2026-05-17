import { useMeRecentRounds } from '../../../lib/api/queries';
import type { RecentRound } from '../../../lib/api/types';
import {
  fmtTimeAgo,
  fmtUsdc,
  fmtUsdcSigned,
  gameLabel,
  multiplierBpsToX,
} from '../format';

interface RecentRoundsTableProps {
  limit?: number;
  onRowClick?: (round: RecentRound) => void;
}

export function RecentRoundsTable({ limit = 20, onRowClick }: RecentRoundsTableProps) {
  const { data, isLoading, isError, error, refetch } = useMeRecentRounds(limit);

  if (isLoading) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-3">Recent Rounds</h2>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-ink-800 rounded" />
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">Recent Rounds</h2>
        <p className="text-sm text-rose-300">Failed to load rounds: {error.message}</p>
        <button onClick={() => refetch()} className="mt-3 text-sm text-gold-200 hover:text-gold-100">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const rounds = data.rounds;
  if (rounds.length === 0) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">Recent Rounds</h2>
        <p className="text-sm text-neutral-200">No rounds yet.</p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl text-gold">Recent Rounds</h2>
        <span className="text-xs text-neutral-300">Last {rounds.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-widest text-neutral-300 border-b border-gold-subtle">
              <th className="text-left py-2 pr-3 font-medium">Game</th>
              <th className="text-right py-2 px-3 font-medium">Bet</th>
              <th className="text-right py-2 px-3 font-medium">Payout</th>
              <th className="text-right py-2 px-3 font-medium">Net</th>
              <th className="text-right py-2 px-3 font-medium">Mult</th>
              <th className="text-right py-2 pl-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const net = (() => {
                try {
                  return (BigInt(r.payout) - BigInt(r.bet_amount)).toString();
                } catch {
                  return '0';
                }
              })();
              const netPositive = (() => {
                try { return BigInt(net) >= 0n; } catch { return false; }
              })();
              const clickable = !!onRowClick;
              return (
                <tr
                  key={`${r.tx_digest}-${r.session_id_hex}`}
                  onClick={clickable ? () => onRowClick(r) : undefined}
                  className={`border-b border-ink-800/60 last:border-0 ${
                    clickable ? 'cursor-pointer hover:bg-gold-400/5' : ''
                  }`}
                >
                  <td className="py-2 pr-3 text-neutral-100">{gameLabel(r.key)}</td>
                  <td className="py-2 px-3 text-right font-mono text-neutral-200">
                    {fmtUsdc(r.bet_amount)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-neutral-200">
                    {fmtUsdc(r.payout)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono ${
                      netPositive ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {fmtUsdcSigned(net)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-neutral-200">
                    {multiplierBpsToX(r.multiplier_bps)}
                  </td>
                  <td className="py-2 pl-3 text-right text-neutral-300">
                    {fmtTimeAgo(r.timestamp_ms)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
