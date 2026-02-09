import { useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTraderStats, useTraderFills, TraderProfileHeader, TraderFillsTable } from '../features/leaderboard';
import { useTraderClassification } from '../features/leaderboard/hooks/useTraderClassification';
import { PerformanceSummary } from '../features/leaderboard/components/PerformanceSummary';
import { useBadges, BadgeGrid, BadgeNotification } from '../features/badges';
import type { BadgeEvalContext } from '../features/badges';

function buildBadgeContext(stats: ReturnType<typeof useTraderStats>['data']): BadgeEvalContext {
  const allStats = stats?.stats['all'];
  const totalVolume = allStats ? parseFloat(allStats.volume) : 0;
  const totalTrades = allStats?.tradeCount ?? 0;
  const uniquePools = allStats?.uniquePools ?? 0;

  let bestRank = 0;
  if (stats) {
    for (const periodStats of Object.values(stats.stats)) {
      if (periodStats && (bestRank === 0 || periodStats.rank < bestRank)) {
        bestRank = periodStats.rank;
      }
    }
  }

  // Check localStorage for feature usage
  let usedTpsl = false;
  let usedTrailingStop = false;
  let chatMessageCount = 0;
  try {
    const raw = localStorage.getItem('pado:tpsl:orders');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        usedTpsl = parsed.some((o: { triggerType?: string }) =>
          o.triggerType === 'tp' || o.triggerType === 'sl'
        );
        usedTrailingStop = parsed.some((o: { triggerType?: string }) =>
          o.triggerType === 'trailing-stop'
        );
      }
    }
    chatMessageCount = parseInt(localStorage.getItem('pado-chat-message-count') ?? '0', 10) || 0;
  } catch { /* ignore */ }

  return { totalTrades, totalVolume, bestRank, uniquePools, usedTpsl, usedTrailingStop, chatMessageCount };
}

export function TraderProfilePage() {
  const { address } = useParams<{ address: string }>();

  const { data: stats, isLoading: statsLoading } = useTraderStats(address ?? null);
  const { data: fillsData, isLoading: fillsLoading } = useTraderFills(address ?? null);
  const fills = useMemo(() => fillsData?.fills ?? [], [fillsData]);
  const classification = useTraderClassification(fills, stats);

  const badgeContext = useMemo(() => buildBadgeContext(stats), [stats]);
  const { badges, unlockedCount, totalCount, newlyUnlocked } = useBadges(badgeContext);
  const [showNotification, setShowNotification] = useState(true);
  const dismissNotification = useCallback(() => setShowNotification(false), []);

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
        classification={classification}
        isLoading={statsLoading}
      />

      {/* Performance Summary */}
      <PerformanceSummary
        stats={stats}
        fills={fills}
        classification={classification}
        isLoading={statsLoading || fillsLoading}
      />

      {/* Badges */}
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-theme-text-primary">Achievements</h3>
          <span className="text-xs text-theme-text-muted">
            {unlockedCount}/{totalCount}
          </span>
        </div>
        <BadgeGrid badges={badges} />
      </div>

      {/* Trade History */}
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border overflow-hidden">
        <div className="px-4 py-3 border-b border-theme-border">
          <h3 className="text-sm font-medium text-theme-text-primary">Recent Trades</h3>
        </div>
        <TraderFillsTable
          fills={fills}
          isLoading={fillsLoading}
        />
      </div>

      {/* Badge unlock notification */}
      {showNotification && (
        <BadgeNotification badges={newlyUnlocked} onDismiss={dismissNotification} />
      )}
    </div>
  );
}
