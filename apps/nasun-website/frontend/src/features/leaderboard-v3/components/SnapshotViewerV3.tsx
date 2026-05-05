/**
 * SnapshotViewerV3 Component
 *
 * Date picker for viewing past rankings.
 * V2 SnapshotHeader pattern.
 */

import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
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
  const { t } = useTranslation("leaderboard");
  const handleClear = () => {
    onDateChange(undefined);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Status indicator */}
      {!selectedDate ? (
        isEnded ? (
          <span className="px-2 py-0.5 bg-gray-600 rounded text-xs text-gray-200 uppercase tracking-wide">{t("v3.snapshot.finalRankings")}</span>
        ) : (
          <span className="text-nasun-c4/70 text-sm">{t("v3.snapshot.viewingLatest")}</span>
        )
      ) : (
        <span className="text-nasun-c4/90 text-sm">
          {t("v3.snapshot.viewing")}{" "}
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}
      <div className="flex items-center gap-3">
        {/* Snapshot Viewer label */}
        <span className="text-sm font-medium text-nasun-white/70">{t("v3.snapshot.title")}</span>
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate || ""}
            onChange={(e) => onDateChange(e.target.value || undefined)}
            min={minDate}
            max={maxDate}
            className="bg-black/60 border border-nasun-c4/50 rounded-sm px-3 py-1.5 text-sm text-nasun-white/60 focus:outline-none focus:border-nasun-c7/50 cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-75"
          />
          {selectedDate && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-nasun-c5/30 text-nasun-white/50 hover:text-nasun-white transition-colors"
              title={t("v3.snapshot.clearDate")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
