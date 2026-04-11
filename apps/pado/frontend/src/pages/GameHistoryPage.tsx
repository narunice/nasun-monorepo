/**
 * GameHistoryPage
 * Unified view of all game activity (lottery, scratchcard, numbermatch).
 */
import { useState } from 'react';
import { useActiveAddress } from '../features/game-history/hooks/useActiveAddress';
import { useGameHistory } from '../features/game-history/hooks/useGameHistory';
import { GameSummaryCards } from '../features/game-history/components/GameSummaryCards';
import { GameActivityList } from '../features/game-history/components/GameActivityList';
import type { GameType } from '../features/game-history/types';
import { GamesNav } from '../components/common';

const FILTER_OPTIONS: { value: GameType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'numbermatch', label: 'Match' },
];

export function GameHistoryPage() {
  const address = useActiveAddress();
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const { activities, summary, isLoading, error } = useGameHistory(filter);

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <GamesNav />
        <div className="text-center py-10">
          <p className="text-theme-text-muted text-lg">
            Connect wallet to view your game history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <GamesNav />
      <h1 className="text-2xl font-bold text-theme-text">Game History</h1>

      <GameSummaryCards summary={summary} isLoading={isLoading} />

      {/* Filter buttons */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === opt.value
                ? 'bg-theme-accent text-white'
                : 'bg-theme-bg-secondary text-theme-text-muted hover:text-theme-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <GameActivityList activities={activities} isLoading={isLoading} error={error} />
    </div>
  );
}
