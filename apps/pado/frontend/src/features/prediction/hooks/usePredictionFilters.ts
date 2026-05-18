/**
 * usePredictionFilters
 *
 * Client-side filter + sort for prediction markets list. State lives in URL
 * search params so Umami tracks each filter change as a distinct page view.
 *
 * URL structure: /predict?status=open&category=crypto&sort=closing-soon
 * Defaults (omitted from URL): status=open, category=All, sort=closing-soon
 *
 * bigint comparisons use direct ordering (no Number() conversion) to avoid
 * 2^53 precision loss on large supply totals.
 */

import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PredictionMarket } from '../types';

export type MarketCategory =
  | 'All'
  | 'Crypto'
  | 'Space'
  | 'Music'
  | 'Sports'
  | 'Weather'
  | 'Finance'
  | 'Other';

export type MarketSort = 'most-liquid' | 'newest' | 'closing-soon';
export type StatusFilter = 'open' | 'resolved' | 'mine' | 'all';

const DEFAULT_STATUS: StatusFilter = 'open';
const DEFAULT_CATEGORY: MarketCategory = 'All';
const DEFAULT_SORT: MarketSort = 'closing-soon';

const VALID_STATUSES = new Set<StatusFilter>(['open', 'resolved', 'mine', 'all']);
const VALID_CATEGORIES = new Set<MarketCategory>(['All', 'Crypto', 'Space', 'Music', 'Sports', 'Weather', 'Finance', 'Other']);
const VALID_SORTS = new Set<MarketSort>(['most-liquid', 'newest', 'closing-soon']);

const CANONICAL = ['crypto', 'space', 'music', 'sports', 'weather', 'finance'] as const;

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
  myMarketIds?: ReadonlySet<string>,
): UsePredictionFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = (() => {
    const v = searchParams.get('status') as StatusFilter | null;
    return v && VALID_STATUSES.has(v) ? v : DEFAULT_STATUS;
  })();

  const category = (() => {
    const raw = searchParams.get('category');
    if (!raw) return DEFAULT_CATEGORY;
    const v = (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()) as MarketCategory;
    return VALID_CATEGORIES.has(v) ? v : DEFAULT_CATEGORY;
  })();

  const sortBy = (() => {
    const v = searchParams.get('sort') as MarketSort | null;
    return v && VALID_SORTS.has(v) ? v : DEFAULT_SORT;
  })();

  const setParam = useCallback(
    (key: string, value: string, defaultValue: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === defaultValue) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      }, { replace: false });
    },
    [setSearchParams],
  );

  const setStatus = useCallback(
    (s: StatusFilter) => setParam('status', s, DEFAULT_STATUS),
    [setParam],
  );

  const setCategory = useCallback(
    (c: MarketCategory) => setParam('category', c.toLowerCase(), DEFAULT_CATEGORY.toLowerCase()),
    [setParam],
  );

  const setSortBy = useCallback(
    (s: MarketSort) => setParam('sort', s, DEFAULT_SORT),
    [setParam],
  );

  const filtered = useMemo(() => {
    let result = markets;
    if (status === 'mine') {
      // "Mine" surfaces every market the user holds a Position in regardless
      // of lifecycle stage — so resolved-but-unclaimed wins are easy to find.
      const ids = myMarketIds ?? new Set<string>();
      result = result.filter((m) => ids.has(m.id));
    } else if (status !== 'all') {
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
      // Stable across refetches when primary keys tie.
      if (primary !== 0) return primary;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [markets, category, sortBy, status, myMarketIds]);

  return { filtered, category, sortBy, status, setCategory, setSortBy, setStatus };
}
