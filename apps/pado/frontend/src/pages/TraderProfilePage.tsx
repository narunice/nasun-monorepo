import { useParams, Link } from 'react-router-dom';
import { useTraderStats, useTraderFills, TraderProfileHeader, TraderFillsTable } from '../features/leaderboard';

export function TraderProfilePage() {
  const { address } = useParams<{ address: string }>();

  const { data: stats, isLoading: statsLoading } = useTraderStats(address ?? null);
  const { data: fillsData, isLoading: fillsLoading } = useTraderFills(address ?? null);

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center text-theme-text-muted">
        Invalid trader address
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Back link */}
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-1 text-sm text-theme-text-muted hover:text-theme-text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Leaderboard
      </Link>

      {/* Profile Header */}
      <TraderProfileHeader
        address={address}
        stats={stats}
        isLoading={statsLoading}
      />

      {/* Trade History */}
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border overflow-hidden">
        <div className="px-4 py-3 border-b border-theme-border">
          <h3 className="text-sm font-medium text-theme-text-primary">Recent Trades</h3>
        </div>
        <TraderFillsTable
          fills={fillsData?.fills ?? []}
          isLoading={fillsLoading}
        />
      </div>
    </div>
  );
}
