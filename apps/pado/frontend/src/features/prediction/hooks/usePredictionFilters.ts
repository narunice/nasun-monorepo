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
      switch (sortBy) {
        case 'most-liquid': {
          const aTotal = a.yesSupply + a.noSupply;
          const bTotal = b.yesSupply + b.noSupply;
          return bTotal > aTotal ? 1 : bTotal < aTotal ? -1 : 0;
        }
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'closing-soon':
          return a.closeTime - b.closeTime;
        default:
          return 0;
      }
    });
  }, [markets, category, sortBy, status]);

  return { filtered, category, sortBy, status, setCategory, setSortBy, setStatus };
}
