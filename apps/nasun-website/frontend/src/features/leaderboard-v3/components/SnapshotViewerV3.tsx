/**
 * SnapshotViewerV3 Component
 *
 * Date picker for viewing past rankings.
 * V2 SnapshotHeader pattern.
 */

import { Calendar, X } from 'lucide-react';

interface SnapshotViewerV3Props {
  selectedDate: string | undefined;
  onDateChange: (date: string | undefined) => void;
  minDate?: string;
  maxDate?: string;
  lastUpdated?: string;
  isEnded?: boolean;
}

export function SnapshotViewerV3({
  selectedDate,
  onDateChange,
  minDate,
  maxDate,
  lastUpdated,
  isEnded = false,
}: SnapshotViewerV3Props) {
  const handleClear = () => {
    onDateChange(undefined);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-nasun-c6/30 border border-nasun-c5/20 rounded-lg gap-3">
      {/* Left: Snapshot Viewer label + Date picker */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-nasun-white/70">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-medium">Snapshot Viewer</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate || ''}
            onChange={(e) => onDateChange(e.target.value || undefined)}
            min={minDate}
            max={maxDate}
            className="bg-black/60 border border-nasun-c3/50 rounded px-3 py-1.5 text-sm text-nasun-white focus:outline-none focus:border-nasun-c3 cursor-pointer"
          />
          {selectedDate && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white transition-colors"
              title="Clear date"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Latest Rankings label + Last updated */}
      <div className="flex items-center gap-3 text-sm">
        {!selectedDate ? (
          <span className="text-nasun-c3 font-medium">Latest Rankings</span>
        ) : (
          <span className="text-nasun-white/50">
            Viewing: {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}

        {lastUpdated && (
          <span className="text-nasun-white/40 hidden sm:inline">
            Last updated: {new Date(lastUpdated).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}

        {isEnded && !selectedDate && (
          <span className="px-2 py-0.5 bg-gray-600 rounded text-xs text-gray-200">
            FINAL
          </span>
        )}
      </div>
    </div>
  );
}
