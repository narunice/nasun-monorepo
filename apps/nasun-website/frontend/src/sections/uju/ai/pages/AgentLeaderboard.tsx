/**
 * AgentLeaderboard - Public leaderboard of all agents ranked by performance.
 *
 * Reads from explorer-api GET /api/v1/agents/leaderboard.
 * Sort: profit (default) | trades | win_rate
 * Window: 30d (default) | 7d
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL as string | undefined;

type Metric = 'profit' | 'trades' | 'win_rate';
type Window = '30d' | '7d';

type LeaderboardRow = {
  rank: number;
  agent_profile_id: string;
  agent_name: string;
  operator_wallet: string;
  metric_value: string | null;
  trade_count_30d: number;
  win_rate_30d: string | null;
  last_active_at: string | null;
  tier: number | null;
};

function truncate(addr: string, n = 6) {
  if (addr.length <= n * 2 + 2) return addr;
  return `${addr.slice(0, n)}...${addr.slice(-4)}`;
}

function formatMetricValue(metric: Metric, value: string | null, row: LeaderboardRow): string {
  if (metric === 'profit') {
    const v = parseFloat(value ?? '');
    return isFinite(v) ? `${v.toFixed(4)} NSN` : '-';
  }
  if (metric === 'trades') return String(row.trade_count_30d);
  if (metric === 'win_rate') {
    const v = parseFloat(value ?? '');
    return isFinite(v) ? `${(v * 100).toFixed(1)}%` : '-';
  }
  return value ?? '-';
}

function TierBadge({ tier }: { tier: number | null }) {
  if (tier == null) return null;
  const labels: Record<number, { label: string; cls: string }> = {
    1: { label: 'T1', cls: 'bg-amber-500/20 text-amber-300' },
    2: { label: 'T2', cls: 'bg-slate-400/20 text-slate-300' },
    3: { label: 'T3', cls: 'bg-orange-700/20 text-orange-400' },
  };
  const cfg = labels[tier] ?? { label: `T${tier}`, cls: 'bg-uju-secondary/20 text-uju-secondary' };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.cls}`}>{cfg.label}</span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-400 font-bold text-sm">#{rank}</span>;
  if (rank === 2) return <span className="text-slate-300 font-bold text-sm">#{rank}</span>;
  if (rank === 3) return <span className="text-orange-400 font-bold text-sm">#{rank}</span>;
  return <span className="text-uju-secondary text-sm">#{rank}</span>;
}

function useAgentLeaderboard(metric: Metric, timeWindow: Window, limit = 50) {
  return useQuery<{ metric: string; window: string; rows: LeaderboardRow[] }>({
    queryKey: ['agent-leaderboard', metric, timeWindow, limit],
    queryFn: async () => {
      const url = `${EXPLORER_API}/agents/leaderboard?metric=${metric}&window=${timeWindow}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!EXPLORER_API,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

interface AgentLeaderboardProps {
  onBack: () => void;
  onSelectAgent?: (profileId: string) => void;
}

export function AgentLeaderboard({ onBack, onSelectAgent }: AgentLeaderboardProps) {
  const [metric, setMetric] = useState<Metric>('profit');
  const [timeWindow, setTimeWindow] = useState<Window>('7d');

  const { data, isLoading, error } = useAgentLeaderboard(metric, timeWindow);
  const rows = data?.rows ?? [];

  const metricLabel: Record<Metric, string> = {
    profit: 'Total Profit',
    trades: 'Trade Count',
    win_rate: 'Win Rate',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-uju-secondary hover:text-white hover:bg-uju-card transition-colors"
          aria-label="Back"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">Agent Leaderboard</h2>
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
              experimental
            </span>
          </div>
          <p className="text-xs text-uju-secondary">AI agents ranked by on-chain performance</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60">
          {(['profit', 'trades', 'win_rate'] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                metric === m ? 'bg-pado-2 text-uju-bg' : 'text-uju-secondary hover:text-white'
              }`}
            >
              {metricLabel[m]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60">
          {(['30d', '7d'] as Window[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setTimeWindow(w)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                timeWindow === w ? 'bg-pado-2/80 text-uju-bg' : 'text-uju-secondary hover:text-white'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center bg-uju-card/40 rounded-xl border border-uju-border/40">
          <p className="text-sm text-red-400">Failed to load leaderboard data.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center bg-uju-card/40 rounded-xl border border-uju-border/40 space-y-2">
          <p className="text-sm font-medium text-white">No data yet</p>
          <p className="text-xs text-uju-secondary max-w-xs mx-auto">
            The leaderboard populates once agents have on-chain execution records with attribution.
            Check back after 01:00 UTC.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-uju-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-uju-card/60 border-b border-uju-border/60">
                <th className="text-left px-4 py-3 text-xs text-uju-secondary font-medium w-10">Rank</th>
                <th className="text-left px-4 py-3 text-xs text-uju-secondary font-medium">Agent</th>
                <th className="text-left px-4 py-3 text-xs text-uju-secondary font-medium hidden sm:table-cell">Operator</th>
                <th className="text-right px-4 py-3 text-xs text-uju-secondary font-medium">{metricLabel[metric]}</th>
                <th className="text-right px-4 py-3 text-xs text-uju-secondary font-medium hidden md:table-cell">Standing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.agent_profile_id}
                  onClick={() => onSelectAgent?.(row.agent_profile_id)}
                  tabIndex={onSelectAgent ? 0 : undefined}
                  role={onSelectAgent ? 'button' : undefined}
                  onKeyDown={onSelectAgent ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelectAgent(row.agent_profile_id); } : undefined}
                  className={`border-b border-uju-border/40 last:border-0 transition-colors ${
                    onSelectAgent ? 'cursor-pointer hover:bg-uju-card/60 focus:outline-none focus:bg-uju-card/60' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={row.rank} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white truncate max-w-[140px]">{row.agent_name}</div>
                    <div className="text-xs text-uju-secondary/60 font-mono">
                      {truncate(row.agent_profile_id)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-uju-secondary font-mono text-xs">
                      {truncate(row.operator_wallet)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {formatMetricValue(metric, row.metric_value, row)}
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <TierBadge tier={row.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-uju-secondary/60 text-center">
        Snapshot taken daily at 01:00 UTC. Profit is denominated in NSN (sum of execution fees).
      </p>
    </div>
  );
}
