import { useMeEcosystem } from '../../../lib/api/queries';
import type { ScoreHistoryEntry } from '../../../lib/api/types';

export function EcosystemCard() {
  const { data, isLoading, isError, error, refetch } = useMeEcosystem();

  if (isLoading) {
    return (
      <div className="panel p-5 animate-pulse">
        <div className="h-6 w-32 bg-ink-800 rounded mb-3" />
        <div className="h-20 bg-ink-800 rounded" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-xl text-gold mb-2">Ecosystem</h2>
        <p className="text-sm text-rose-300">Failed to load ecosystem: {error.message}</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-gold-200 hover:text-gold-100">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const linked = data.identity_id !== null;

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-start justify-between">
        <h2 className="font-display text-xl text-gold">Ecosystem</h2>
        <div className="text-right">
          <span className="text-xs uppercase tracking-widest text-neutral-300 block">Points</span>
          <span className="font-display text-2xl text-gold-200">
            {data.ecosystem_points.toLocaleString('en-US')}
          </span>
        </div>
      </div>

      {!linked && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">
          This wallet is not linked to a Nasun identity yet. Link it on{' '}
          <a
            href="https://nasun.io/my-account"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-amber-200"
          >
            nasun.io/my-account
          </a>{' '}
          to start accruing ecosystem points across products.
        </div>
      )}

      {linked && (
        <>
          {data.score_history.length > 0 ? (
            <Sparkline rows={data.score_history.slice(-30)} />
          ) : (
            <p className="text-sm text-neutral-300">No score history yet.</p>
          )}

          <div>
            <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">
              Active Missions ({data.active_missions.length})
            </h3>
            {data.active_missions.length === 0 ? (
              <p className="text-sm text-neutral-300">None active right now.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.active_missions.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-1 rounded-full text-xs bg-gold-400/10 text-gold-200 border border-gold-subtle"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="text-sm text-neutral-300 pt-2 border-t border-gold-subtle">
            Last snapshot: {data.last_snapshot_date ?? '—'}
          </div>
        </>
      )}
    </div>
  );
}

function Sparkline({ rows }: { rows: ScoreHistoryEntry[] }) {
  if (rows.length < 2) {
    return (
      <div>
        <div className="text-xs text-neutral-300 mb-1">Score history</div>
        <span className="font-mono text-lg text-gold-200">
          {rows[0]?.all_time_score?.toLocaleString('en-US') ?? '—'}
        </span>
      </div>
    );
  }
  const values = rows.map((r) => r.all_time_score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 320;
  const H = 64;
  const stepX = W / (rows.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(' ');
  const latest = values[values.length - 1];
  const first = values[0];
  const delta = latest - first;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-widest text-neutral-300">
          Score (last {rows.length})
        </span>
        <span className={`text-xs font-mono ${delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toLocaleString('en-US')}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-gold-300"
          points={points}
        />
      </svg>
    </div>
  );
}
