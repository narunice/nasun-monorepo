/**
 * MarketFilterBar
 *
 * Status tabs + category pills + sort dropdown for the prediction markets list.
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
  'All',
  'Crypto',
  'Sports',
  'Politics',
  'Finance',
  'Other',
];

interface MarketFilterBarProps {
  status: StatusFilter;
  category: MarketCategory;
  sortBy: MarketSort;
  setStatus: (s: StatusFilter) => void;
  setCategory: (c: MarketCategory) => void;
  setSortBy: (s: MarketSort) => void;
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              status === s.value
                ? 'bg-pd1 text-white'
                : 'bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              category === c
                ? 'bg-pd2 text-white'
                : 'bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as MarketSort)}
        className="ml-auto text-sm bg-theme-bg-tertiary text-theme-text-secondary rounded-md px-2 py-1.5 border border-theme-border focus:outline-none focus:ring-1 focus:ring-pd3"
      >
        <option value="most-liquid">Most Liquid</option>
        <option value="newest">Newest</option>
        <option value="closing-soon">Closing Soon</option>
      </select>
    </div>
  );
}
