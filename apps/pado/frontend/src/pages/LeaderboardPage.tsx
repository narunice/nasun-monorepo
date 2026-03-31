import { useState } from 'react';
import { useWallet, useZkLogin, useSignerAddress, usePasskeyStore } from '@nasun/wallet';
import { useLeaderboard, usePnlLeaderboard, usePointsLeaderboard, LeaderboardTable, PnlLeaderboardTable, PointsLeaderboardTable, PeriodSelector, ModeSelector, MyRankCard } from '../features/leaderboard';
import { CompetitionBanner } from '../features/competitions';
import { ActivityFeed } from '../features/social/components/ActivityFeed';
import type { Period, LeaderboardMode } from '../features/leaderboard';

const MODE_DESCRIPTIONS: Record<LeaderboardMode, string> = {
  activity: 'Recent trades from traders you follow',
  volume: 'Top traders ranked by volume',
  pnl: 'Top traders ranked by realized PnL',
  points: 'Earn points from trades, volume, and pool diversity',
};

export function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [mode, setMode] = useState<LeaderboardMode>('volume');
  const [showFollowing, setShowFollowing] = useState(false);

  const volumeQuery = useLeaderboard(period, 100);
  const pnlQuery = usePnlLeaderboard(period, 100);
  const pointsQuery = usePointsLeaderboard(100);

  const activeData = mode === 'pnl'
    ? pnlQuery.data
    : mode === 'points'
    ? pointsQuery.data
    : volumeQuery.data;

  const activeLoading = mode === 'pnl'
    ? pnlQuery.isLoading
    : mode === 'points'
    ? pointsQuery.isLoading
    : volumeQuery.isLoading;

  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const signerAddress = useSignerAddress();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;
  const userAddress = signerAddress || null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-theme-text-primary">Leaderboard</h1>
            <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">FEATURE PREVIEW</span>
          </div>
          <p className="text-sm text-theme-text-muted mt-0.5">
            {MODE_DESCRIPTIONS[mode]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode !== 'activity' && (
            <button
              onClick={() => setShowFollowing(!showFollowing)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                showFollowing
                  ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400'
                  : 'border-theme-border text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              Following
            </button>
          )}
          <ModeSelector selected={mode} onSelect={setMode} />
          {mode !== 'points' && mode !== 'activity' && (
            <PeriodSelector selected={period} onSelect={setPeriod} />
          )}
        </div>
      </div>

      {/* Active Competition Banner */}
      <CompetitionBanner />

      {mode === 'activity' ? (
        // Activity Feed mode
        isConnected ? (
          <ActivityFeed />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-theme-bg-secondary rounded-lg border border-theme-border">
            <p className="text-theme-text-muted mb-2">
              Connect wallet to see your feed
            </p>
            <p className="text-xs text-theme-text-muted">
              Follow traders and see their recent activity here
            </p>
          </div>
        )
      ) : (
        <>
          {/* My Rank Card (only when connected) */}
          {isConnected && userAddress && (
            <MyRankCard address={userAddress} />
          )}

          {/* Stats Bar */}
          {activeData && activeData.totalTraders > 0 && (
            <div className="flex items-center gap-4 text-xs text-theme-text-muted">
              <span>{activeData.totalTraders} active traders</span>
              {activeData.updatedAt > 0 && (
                <span>
                  Updated {new Date(activeData.updatedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit', hour12: false,
                  })}
                </span>
              )}
            </div>
          )}

          {/* Leaderboard Table */}
          <div className="bg-theme-bg-secondary rounded-lg border border-theme-border overflow-hidden">
            {mode === 'points' ? (
              <PointsLeaderboardTable
                traders={pointsQuery.data?.traders ?? []}
                isLoading={activeLoading}
                currentUserAddress={userAddress}
                followFilter={showFollowing}
              />
            ) : mode === 'pnl' ? (
              <PnlLeaderboardTable
                traders={pnlQuery.data?.traders ?? []}
                isLoading={activeLoading}
                currentUserAddress={userAddress}
                followFilter={showFollowing}
              />
            ) : (
              <LeaderboardTable
                traders={volumeQuery.data?.traders ?? []}
                isLoading={activeLoading}
                currentUserAddress={userAddress}
                followFilter={showFollowing}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
