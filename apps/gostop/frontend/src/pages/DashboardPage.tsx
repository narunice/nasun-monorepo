import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGostopAuth } from '../hooks/useGostopAuth';
import { MyProfileCard } from '../features/dashboard/components/MyProfileCard';
import { RecentRoundsTable } from '../features/dashboard/components/RecentRoundsTable';
import { StatsCard } from '../features/dashboard/components/StatsCard';
import { GostopActivityCard } from '../features/dashboard/components/GostopActivityCard';
import { MyLiquidityCard } from '../features/dashboard/components/MyLiquidityCard';
import { LiveFeedWidget } from '../features/dashboard/components/LiveFeedWidget';
import { SettingsModal } from '../features/dashboard/components/SettingsModal';
import { RoundDetailModal } from '../features/dashboard/components/RoundDetailModal';
import { WalletCleanupTab } from '../features/dashboard/components/WalletCleanupTab';
import {
  useGameHistory,
  GameSummaryCards,
  GameActivityList,
  HISTORY_WINDOW_LABEL,
  type GameType,
  type HistoryWindow,
} from '../features/game-history';
import { ENABLE_CRASH } from '../lib/gostop-config';
import type { RecentRound } from '../lib/api/types';

type SuiteTab = 'overview' | 'history' | 'cleanup';

const SUITE_TABS: { id: SuiteTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History' },
  { id: 'cleanup', label: 'Cleanup' },
];

function isSuiteTab(value: string | null): value is SuiteTab {
  return value === 'overview' || value === 'history' || value === 'cleanup';
}

const FILTER_OPTIONS: { value: GameType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'numbermatch', label: 'Match' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'mines', label: 'Mines' },
  { value: 'wheel', label: 'Wheel' },
  ...(ENABLE_CRASH ? [{ value: 'crash' as const, label: 'Crash' }] : []),
];

const WINDOW_OPTIONS: { value: HistoryWindow; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '2w', label: '2w' },
  { value: '4w', label: '4w' },
  { value: '3m', label: '3m' },
];

function HistoryTabContent() {
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const [win, setWin] = useState<HistoryWindow>('7d');
  const { activities, summary, hasCrashActivity, isLoading, error, refetch } =
    useGameHistory(filter, win);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">
          Last {HISTORY_WINDOW_LABEL[win]} across all games
        </p>
        <button
          type="button"
          onClick={refetch}
          disabled={isLoading}
          className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <GameSummaryCards summary={summary} isLoading={isLoading} />

      <div role="group" aria-label="History time window" className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-neutral-300 mr-1">
          Window
        </span>
        {WINDOW_OPTIONS.map((opt) => {
          const active = win === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWin(opt.value)}
              aria-pressed={active}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 ${
                active
                  ? 'bg-gold-400/15 text-gold-200 border-gold-200/60 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]'
                  : 'border-gold-subtle text-neutral-300 hover:text-gold-200 hover:border-gold-200/40'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Filter by game" className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              aria-pressed={active}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 ${
                active
                  ? 'bg-gold-400/15 text-gold-200 border-gold-200/60 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]'
                  : 'border-gold-subtle text-neutral-300 hover:text-gold-200 hover:border-gold-200/40'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <GameActivityList
        activities={activities}
        isLoading={isLoading}
        error={error}
        showCrashFootnote={hasCrashActivity}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { walletAddress, tokenReady, error, ensureToken } = useGostopAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeRound, setActiveRound] = useState<RecentRound | null>(null);

  const tabParam = searchParams.get('tab');
  const activeTab: SuiteTab = isSuiteTab(tabParam) ? tabParam : 'overview';

  const setTab = (tab: SuiteTab) => {
    if (tab === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  if (!walletAddress) {
    return (
      <div className="panel p-10 max-w-md mx-auto text-center space-y-3">
        <h1 className="font-display text-3xl text-gold">Suite</h1>
        <p className="text-base text-neutral-200">
          Connect a wallet to see your rounds, stats, and ecosystem standing.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-10 max-w-md mx-auto text-center space-y-3">
        <h1 className="font-display text-3xl text-gold">Sign In Required</h1>
        <p className="text-base text-neutral-200">
          We need a signed message to load your data. The wallet prompt was dismissed
          or failed.
        </p>
        <button
          onClick={() => { void ensureToken(); }}
          className="mt-2 px-5 py-2.5 rounded-md bg-gold-400/20 text-gold-100 border border-gold-300/50 hover:bg-gold-400/30 min-h-[44px] font-medium"
        >
          Sign in
        </button>
        <p className="text-sm text-neutral-300 break-words">{error.message}</p>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <div className="panel p-10 max-w-md mx-auto text-center">
        <p className="text-base text-neutral-200">Waiting for wallet signature…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-3xl text-gold">Suite</h1>
        <div className="flex items-center gap-3">
          <div role="tablist" className="flex rounded-full border border-gold-subtle overflow-hidden">
            {SUITE_TABS.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 text-sm font-medium transition-all min-h-[36px] ${
                  activeTab === id
                    ? 'bg-gold-400/15 text-gold-200'
                    : 'text-neutral-300 hover:text-gold-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab === 'overview' && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-2 text-sm font-medium rounded-md border border-gold-subtle text-neutral-200 hover:text-gold-200 hover:border-gold-300/40 min-h-[40px]"
            >
              Feed Settings
            </button>
          )}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <MyProfileCard />
            <StatsCard />
            <RecentRoundsTable onRowClick={(r) => setActiveRound(r)} />
          </div>
          <div className="space-y-5">
            <GostopActivityCard />
            <MyLiquidityCard />
            <LiveFeedWidget />
          </div>
        </div>
      )}
      {activeTab === 'history' && <HistoryTabContent />}
      {activeTab === 'cleanup' && <WalletCleanupTab />}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RoundDetailModal
        round={activeRound}
        onClose={() => setActiveRound(null)}
      />
    </div>
  );
}
