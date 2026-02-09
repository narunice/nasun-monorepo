import { useState } from 'react';
import { useWallet, useZkLogin, useSignerAddress } from '@nasun/wallet';
import { useLeaderboard, usePnlLeaderboard, LeaderboardTable, PnlLeaderboardTable, PeriodSelector, ModeSelector, MyRankCard } from '../features/leaderboard';
import { CompetitionBanner } from '../features/competitions';
import type { Period, LeaderboardMode } from '../features/leaderboard';

export function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [mode, setMode] = useState<LeaderboardMode>('volume');

  const volumeQuery = useLeaderboard(period, 100);
  const pnlQuery = usePnlLeaderboard(period, 100);

  const activeData = mode === 'pnl' ? pnlQuery.data : volumeQuery.data;
  const activeLoading = mode === 'pnl' ? pnlQuery.isLoading : volumeQuery.isLoading;

  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const signerAddress = useSignerAddress();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;
  const userAddress = signerAddress || null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-theme-text-primary">Leaderboard</h1>
          <p className="text-sm text-theme-text-muted mt-0.5">
            {mode === 'pnl' ? 'Top traders ranked by realized PnL' : 'Top traders ranked by volume'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModeSelector selected={mode} onSelect={setMode} />
          <PeriodSelector selected={period} onSelect={setPeriod} />
        </div>
      </div>

      {/* Active Competition Banner */}
      <CompetitionBanner />

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
        {mode === 'pnl' ? (
          <PnlLeaderboardTable
            traders={pnlQuery.data?.traders ?? []}
            isLoading={activeLoading}
            currentUserAddress={userAddress}
          />
        ) : (
          <LeaderboardTable
            traders={volumeQuery.data?.traders ?? []}
            isLoading={activeLoading}
            currentUserAddress={userAddress}
          />
        )}
      </div>
    </div>
  );
}
