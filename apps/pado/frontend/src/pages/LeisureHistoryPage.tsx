/**
 * LeisureHistoryPage
 * Unified view of all leisure game activity (lottery, scratchcard, numbermatch).
 */
import { useState } from 'react';
import { useActiveAddress } from '../features/leisure-history/hooks/useActiveAddress';
import { useLeisureHistory } from '../features/leisure-history/hooks/useLeisureHistory';
import { LeisureSummaryCards } from '../features/leisure-history/components/LeisureSummaryCards';
import { LeisureActivityList } from '../features/leisure-history/components/LeisureActivityList';
import type { GameType } from '../features/leisure-history/types';

const FILTER_OPTIONS: { value: GameType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'numbermatch', label: 'Match' },
];

export function LeisureHistoryPage() {
  const address = useActiveAddress();
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const { activities, summary, isLoading, error } = useLeisureHistory(filter);

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-theme-text-muted text-lg">
          Connect wallet to view your leisure history
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-theme-text">Leisure History</h1>

      <LeisureSummaryCards summary={summary} isLoading={isLoading} />

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

      <LeisureActivityList activities={activities} isLoading={isLoading} error={error} />
    </div>
  );
}
