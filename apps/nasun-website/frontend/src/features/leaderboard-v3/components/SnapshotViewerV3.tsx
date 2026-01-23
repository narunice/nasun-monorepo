/**
 * SnapshotViewerV3 Component
 *
 * Date picker for viewing past rankings.
 * V2 SnapshotHeader pattern.
 */

import { X } from "lucide-react";

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
  isEnded = false,
}: SnapshotViewerV3Props) {
  const handleClear = () => {
    onDateChange(undefined);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Status indicator */}
      {!selectedDate ? (
        <span className="text-nasun-c4/70 text-sm ">Viewing: Latest Rankings</span>
      ) : (
        <span className="text-nasun-c4/90 text-sm">
          Viewing:{" "}
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}

      {isEnded && !selectedDate && (
        <span className="px-2 py-0.5 bg-gray-600 rounded text-xs text-gray-200">FINAL</span>
      )}
      <div className="flex items-center gap-3">
        {/* Snapshot Viewer label */}
        <span className="text-sm font-medium text-nasun-white/70">Snapshot Viewer</span>
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate || ""}
            onChange={(e) => onDateChange(e.target.value || undefined)}
            min={minDate}
            max={maxDate}
            className="bg-black/60 border border-nasun-c3/50 rounded-sm px-3 py-1.5 text-sm text-nasun-white focus:outline-none focus:border-nasun-c3 cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-100"
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
    </div>
  );
}
