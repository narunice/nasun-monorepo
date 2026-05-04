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
} from '../hooks/usePredictionFilters';

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const CATEGORY_OPTIONS: ReadonlyArray<MarketCategory> = [
  'All', 'Crypto', 'Finance', 'Sports', 'Politics', 'Other',
];

// Categories with no live markets — kept visible for product-shape clarity
// but disabled until at least one market in that category is created.
const DISABLED_CATEGORIES = new Set<MarketCategory>(['Sports', 'Politics', 'Other']);

const SORT_OPTIONS: ReadonlyArray<{ value: MarketSort; label: string }> = [
  { value: 'closing-soon', label: 'Closing Soon' },
  { value: 'most-liquid', label: 'Most Liquid' },
  { value: 'newest', label: 'Newest' },
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
  return (
    <div className="flex items-center gap-0.5 bg-theme-bg-tertiary rounded-lg p-0.5">
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

function TabButton({ active, onClick, children, disabled, title }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
        active
          ? 'bg-pd1 text-white shadow-sm'
          : disabled
            ? 'text-theme-text-muted opacity-25 cursor-not-allowed'
            : 'text-theme-text-muted opacity-50 hover:opacity-100 hover:text-theme-text-primary'
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
          <TabButton key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
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
              title={disabled ? 'No markets available yet' : undefined}
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

      {/* Sort group */}
      <div className="ml-auto">
        <SegmentedGroup>
          {SORT_OPTIONS.map((s) => (
            <TabButton key={s.value} active={sortBy === s.value} onClick={() => setSortBy(s.value)}>
              {s.label}
            </TabButton>
          ))}
        </SegmentedGroup>
      </div>
    </div>
  );
}
