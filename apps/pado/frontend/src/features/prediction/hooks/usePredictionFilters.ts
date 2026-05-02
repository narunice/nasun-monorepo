/**
 * usePredictionFilters
 *
 * Client-side filter + sort for prediction markets list. Handles:
 * - Status (open / resolved / all) — default: open
 * - Category pill (All + canonical Crypto/Sports/Politics/Finance + Other)
 * - Sort (most-liquid / newest / closing-soon)
 *
 * bigint comparisons use direct ordering (no Number() conversion) to avoid
 * 2^53 precision loss on large supply totals.
 */

import { useMemo, useState } from 'react';
import type { PredictionMarket } from '../types';

export type MarketCategory =
  | 'All'
  | 'Crypto'
  | 'Sports'
  | 'Politics'
  | 'Finance'
  | 'Other';

export type MarketSort = 'most-liquid' | 'newest' | 'closing-soon';
export type StatusFilter = 'open' | 'resolved' | 'all';

const CANONICAL = ['crypto', 'sports', 'politics', 'finance'] as const;

function bucketCategory(raw: string): MarketCategory {
  const lower = raw.toLowerCase();
  if ((CANONICAL as readonly string[]).includes(lower)) {
    return (lower.charAt(0).toUpperCase() + lower.slice(1)) as MarketCategory;
  }
  return 'Other';
}

export interface UsePredictionFiltersResult {
  filtered: PredictionMarket[];
  category: MarketCategory;
  sortBy: MarketSort;
  status: StatusFilter;
  setCategory: (c: MarketCategory) => void;
  setSortBy: (s: MarketSort) => void;
  setStatus: (s: StatusFilter) => void;
}

export function usePredictionFilters(
  markets: PredictionMarket[],
): UsePredictionFiltersResult {
  const [category, setCategory] = useState<MarketCategory>('All');
  const [sortBy, setSortBy] = useState<MarketSort>('most-liquid');
  const [status, setStatus] = useState<StatusFilter>('open');

  const filtered = useMemo(() => {
    let result = markets;
    if (status !== 'all') {
      result = result.filter((m) => m.status === status);
    }
    if (category !== 'All') {
      result = result.filter((m) => bucketCategory(m.category) === category);
    }

    return [...result].sort((a, b) => {
      let primary = 0;
      switch (sortBy) {
        case 'most-liquid': {
          const aTotal = a.yesSupply + a.noSupply;
          const bTotal = b.yesSupply + b.noSupply;
          primary = bTotal > aTotal ? 1 : bTotal < aTotal ? -1 : 0;
          break;
        }
        case 'newest':
          primary = b.createdAt - a.createdAt;
          break;
        case 'closing-soon':
          primary = a.closeTime - b.closeTime;
          break;
      }
      // Stable across refetches when primary keys tie. Without this,
      // unrelated re-renders can flicker the row order on equal supply/time.
      if (primary !== 0) return primary;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [markets, category, sortBy, status]);

  return { filtered, category, sortBy, status, setCategory, setSortBy, setStatus };
}
