/**
 * MarketFilterBar
 *
 * Three segmented-control groups: Status | Category | Sort
 * Each group is a pill container; active tab uses bg highlight, no border.
 */

import type {
  MarketCategory,
  MarketSort,
  StatusFilter,
} from "../hooks/usePredictionFilters";

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "mine", label: "Mine" },
  { value: "all", label: "All" },
];

const CATEGORY_OPTIONS: ReadonlyArray<MarketCategory> = [
  "All",
  "Crypto",
  "Finance",
  "Space",
  "Music",
  "Sports",
  "Weather",
  "Other",
];

// Categories with no live markets — kept visible for product-shape clarity
// but disabled until at least one market in that category is created.
// Space/Music/Sports/Weather all received seed markets on 2026-05-18.
const DISABLED_CATEGORIES = new Set<MarketCategory>(["Other"]);

const SORT_OPTIONS: ReadonlyArray<{ value: MarketSort; label: string }> = [
  { value: "closing-soon", label: "Closing Soon" },
  { value: "most-liquid", label: "Most Liquid" },
  { value: "newest", label: "Newest" },
];

interface MarketFilterBarProps {
  status: StatusFilter;
  category: MarketCategory;
  sortBy: MarketSort;
  setStatus: (s: StatusFilter) => void;
  setCategory: (c: MarketCategory) => void;
  setSortBy: (s: MarketSort) => void;
}

function SegmentedGroup({ children }: { children: React.ReactNode }) {
  // max-w-full + overflow-x-auto keeps an overcrowded pill (e.g. 8-item
  // Category group) scrollable inside its own bounds instead of stretching
  // the page width on mobile.
  return (
    <div className="flex items-center gap-0.5 bg-gray-200 dark:bg-gray-800/70 rounded-lg p-0.5 max-w-full overflow-x-auto scrollbar-hide">
      {children}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

function TabButton({
  active,
  onClick,
  children,
  disabled,
  title,
}: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${
        active
          ? "bg-gray-700 text-white dark:bg-sky-200 dark:text-gray-900 shadow-sm"
          : disabled
            ? "text-gray-400 dark:text-gray-600 cursor-not-allowed"
            : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function MarketFilterBar({
  status,
  category,
  sortBy,
  setStatus,
  setCategory,
  setSortBy,
}: MarketFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status group */}
      <SegmentedGroup>
        {STATUS_OPTIONS.map((s) => (
          <TabButton
            key={s.value}
            active={status === s.value}
            onClick={() => setStatus(s.value)}
          >
            {s.label}
          </TabButton>
        ))}
      </SegmentedGroup>

      {/* Category group */}
      <SegmentedGroup>
        {CATEGORY_OPTIONS.map((c) => {
          const disabled = DISABLED_CATEGORIES.has(c);
          return (
            <TabButton
              key={c}
              active={category === c}
              disabled={disabled}
              title={disabled ? "No markets available yet" : undefined}
              onClick={() => {
                if (disabled) return;
                setCategory(c);
              }}
            >
              {c}
            </TabButton>
          );
        })}
      </SegmentedGroup>

      {/* Sort group — pushed right on desktop only; left-aligned with the rest on mobile */}
      <div className="lg:ml-auto">
        <SegmentedGroup>
          {SORT_OPTIONS.map((s) => (
            <TabButton
              key={s.value}
              active={sortBy === s.value}
              onClick={() => setSortBy(s.value)}
            >
              {s.label}
            </TabButton>
          ))}
        </SegmentedGroup>
      </div>
    </div>
  );
}
