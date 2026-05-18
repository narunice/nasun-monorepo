import { useMeProfile, useMeStats, useMeLeaderboardRank, useMeEcosystem } from '../../../lib/api/queries';
import { fmtUsdcSigned, gameLabel } from '../format';
import type { StatsByGame } from '../../../lib/api/types';

export function GostopActivityCard() {
  const profile = useMeProfile();
  const stats = useMeStats('all');
  const rank = useMeLeaderboardRank();
  const ecosystem = useMeEcosystem();

  const isLoading = profile.isLoading || stats.isLoading;

  if (isLoading) {
    return (
      <div className="panel p-5 animate-pulse space-y-4">
        <div className="h-6 w-36 bg-ink-800 rounded" />
        <div className="h-16 bg-ink-800 rounded" />
        <div className="h-20 bg-ink-800 rounded" />
      </div>
    );
  }

  if (profile.isError || stats.isError) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">GoStop Activity</h2>
        <p className="text-sm text-rose-300">
          {profile.error?.message ?? stats.error?.message ?? 'Failed to load'}
        </p>
        <button
          onClick={() => { void profile.refetch(); void stats.refetch(); }}
          className="mt-2 text-sm text-gold-200 hover:text-gold-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const p = profile.data;
  const s = stats.data;
  if (!p || !s) return null;

  const rankRow = rank.data?.row ?? null;
  const activeMissions = ecosystem.data?.active_missions ?? [];
  const gostopMissions = activeMissions.filter((m) => m.startsWith('gostop-'));

  return (
    <div className="panel p-5 space-y-4">
      <h2 className="font-display text-xl text-gold">GoStop Activity</h2>

      {/* Lifetime + Rank */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <span className="text-xs uppercase tracking-widest text-neutral-300 block mb-2">
            Lifetime
          </span>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rounds" value={p.total_rounds.toLocaleString('en-US')} />
            <Stat
              label="Net PnL"
              value={fmtUsdcSigned(p.net_pnl)}
              suffix="N"
              tone={BigInt(p.net_pnl) >= 0n ? 'positive' : 'negative'}
            />
            <Stat
              label="Win Rate"
              value={s.win_rate_bps > 0 ? `${(s.win_rate_bps / 100).toFixed(1)}%` : '—'}
            />
          </div>
        </div>
        {rankRow && (
          <div className="col-span-2 border-t border-gold-subtle pt-3">
            <span className="text-xs uppercase tracking-widest text-neutral-300 block mb-1">
              Rank (All Time)
            </span>
            <span className="font-display text-2xl text-gold-200">
              #{rankRow.rank.toLocaleString('en-US')}
            </span>
            <span className="ml-2 text-sm text-neutral-300">by net PnL</span>
          </div>
        )}
      </div>

      {/* Per-game breakdown */}
      {s.by_game.length > 0 && (
        <div>
          <span className="text-xs uppercase tracking-widest text-neutral-300 block mb-2">
            By Game
          </span>
          <GameBreakdown games={s.by_game} />
        </div>
      )}

      {/* Active missions (gostop-prefixed) */}
      {gostopMissions.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">
            Active Missions
          </h3>
          <div className="flex flex-wrap gap-2">
            {gostopMissions.map((m) => (
              <span
                key={m}
                className="px-2 py-1 rounded-full text-xs bg-gold-400/10 text-gold-200 border border-gold-subtle"
              >
                {formatMissionLabel(m)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* No activity state */}
      {p.total_rounds === 0 && (
        <div className="rounded-lg border border-gold-subtle bg-gold-400/5 p-4 text-sm text-neutral-200">
          No rounds played yet. Head to the Floor to start.
        </div>
      )}
    </div>
  );
}

function GameBreakdown({ games }: { games: StatsByGame[] }) {
  const sorted = [...games].sort((a, b) => b.rounds - a.rounds);
  const maxRounds = sorted[0]?.rounds ?? 1;
  const SHOW = 4;
  const visible = sorted.slice(0, SHOW);
  const hidden = sorted.length - SHOW;

  return (
    <div className="space-y-2">
      {visible.map((g) => {
        const widthPct = maxRounds > 0 ? (g.rounds / maxRounds) * 100 : 0;
        const pnl = BigInt(g.net_pnl);
        const tone = pnl >= 0n ? 'bg-emerald-500/60' : 'bg-rose-500/60';
        return (
          <div key={g.key}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-sm text-neutral-200 w-28 truncate">{gameLabel(g.key)}</span>
              <span className="text-xs font-mono text-neutral-300 mr-2">{g.rounds} rounds</span>
              <span
                className={`text-xs font-mono ${pnl >= 0n ? 'text-emerald-300' : 'text-rose-300'}`}
              >
                {fmtUsdcSigned(g.net_pnl)} N
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
              <div className={`h-full ${tone}`} style={{ width: `${widthPct.toFixed(1)}%` }} />
            </div>
          </div>
        );
      })}
      {hidden > 0 && (
        <p className="text-xs text-neutral-400 pt-1">+{hidden} more games</p>
      )}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'positive' | 'negative';
}

function formatMissionLabel(key: string): string {
  // Strip "gostop-" prefix and capitalize remaining segments.
  // e.g. "gostop-scratch-card-daily" -> "Scratch Card Daily"
  const stripped = key.replace(/^gostop-/, '');
  return stripped
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function Stat({ label, value, suffix, tone }: StatProps) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-300'
    : tone === 'negative' ? 'text-rose-300'
    : 'text-gold-200';
  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-neutral-300 block">{label}</span>
      <span className={`font-mono text-base ${toneClass}`}>{value}</span>
      {suffix && <span className="ml-1 text-xs text-neutral-300">{suffix}</span>}
    </div>
  );
}
