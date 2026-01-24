/**
 * 🆕 Phase 1: useUserSearch Hook
 * 🔄 Stage 5: React Query 전환 (캐싱 최적화)
 *
 * @description
 * 사용자 검색 기능을 제공하는 React Hook입니다.
 * 하이브리드 검색(정확 일치 우선 + 부분 일치 폴백)을 지원합니다.
 * Stage 5에서 React Query로 전환하여 검색 결과 캐싱 지원.
 *
 * @author Claude Code
 * @date 2025-10-23 (최초 작성)
 * @updated 2025-10-27 (Stage 5: React Query 전환)
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchUsers, getAutocomplete } from '../services/userRankApi';
import {
  CumulativePeriod,
  SearchResultData,
  SearchMatch,
} from '../types/leaderboard';

export interface UseUserSearchResult {
  // 상태
  query: string;
  results: SearchResultData | null | undefined;
  isSearching: boolean;
  error: string | null;

  // 자동완성 (Phase 3)
  autocomplete: {
    suggestions: SearchMatch[];
    isLoading: boolean;
  };

  // 핸들러
  setQuery: (query: string) => void;
  search: (searchQuery?: string) => void;
  clear: () => void;
  getAutocompleteSuggestions: (query: string) => Promise<void>;
}

export interface UseUserSearchOptions {
  period: CumulativePeriod;
  date?: string;
  limit?: number;
  onSearchComplete?: (results: SearchResultData) => void;
}

/**
 * 사용자 검색 Hook (Stage 5: React Query 전환)
 *
 * @param options - 검색 옵션 (period, date, limit)
 * @returns UseUserSearchResult
 *
 * @example
 * const { query, results, setQuery, search } = useUserSearch({
 *   period: CumulativePeriod.CUMULATIVE,
 * });
 *
 * <input value={query} onChange={(e) => setQuery(e.target.value)} />
 * <button onClick={() => search()}>검색</button>
 */
export function useUserSearch(options: UseUserSearchOptions): UseUserSearchResult {
  const { period, date, limit = 10, onSearchComplete } = options;

  const [query, setQuery] = useState('');

  // 자동완성 상태 (Phase 3) - 별도 관리 (React Query 미적용)
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<SearchMatch[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);

  // ✅ React Query로 전환 (Stage 5)
  const searchQuery = useQuery({
    queryKey: ['userSearch', period, query, date, limit],
    queryFn: async (): Promise<SearchResultData | null> => {
      const queryToSearch = query.trim();

      // 빈 쿼리는 null 반환
      if (!queryToSearch) {
        return null;
      }

      console.log(`🔍 [useUserSearch] Searching for: "${queryToSearch}"`);

      const response = await searchUsers(period, queryToSearch, date, limit);

      if (!response.success) {
        throw new Error(response.error || '검색 실패');
      }

      if (response.data) {
        console.log(`✅ [useUserSearch] Found ${response.data.total} results`);
        onSearchComplete?.(response.data);
      }

      return response.data || null;
    },
    /**
     * React Query 캐싱 설정 (Stage 5 최적화)
     *
     * staleTime: 10분
     * - 검색 결과는 신규 사용자 추가 가능성이 있으므로 10분 캐싱
     * - 동일한 검색어 재입력 시 캐시에서 즉시 반환
     *
     * gcTime: 30분
     * - 컴포넌트 언마운트 후 30분 동안 메모리에 캐시 보관
     * - 사용자가 다시 검색 시 즉시 표시 가능
     *
     * enabled: query.length >= 2
     * - 최소 2자 이상 입력 시에만 검색 실행
     * - 불필요한 API 호출 방지
     */
    staleTime: 10 * 60 * 1000, // 10분
    gcTime: 30 * 60 * 1000, // 30분
    enabled: query.trim().length >= 2, // 최소 2자 이상
    retry: 1,
  });

  /**
   * 검색 실행 (수동 refetch)
   */
  const search = useCallback(
    (manualQuery?: string) => {
      if (manualQuery !== undefined) {
        setQuery(manualQuery);
      }
      // React Query가 자동으로 검색하므로, 수동 refetch는 선택적
      searchQuery.refetch();
    },
    [searchQuery]
  );

  /**
   * 검색 초기화
   */
  const clear = useCallback(() => {
    setQuery('');
    setAutocompleteSuggestions([]);
  }, []);

  /**
   * 자동완성 제안 가져오기 (Phase 3) - React Query 미적용
   */
  const getAutocompleteSuggestions = useCallback(
    async (autocompleteQuery: string) => {
      const cleanQuery = autocompleteQuery.trim();

      // 최소 2자 이상
      if (cleanQuery.length < 2) {
        setAutocompleteSuggestions([]);
        return;
      }

      setIsAutocompleteLoading(true);

      try {
        const response = await getAutocomplete(period, cleanQuery, date, 5);

        if (response.success && response.data) {
          setAutocompleteSuggestions(response.data.suggestions);
        } else {
          setAutocompleteSuggestions([]);
        }
      } catch (err) {
        console.error('❌ [useUserSearch] Autocomplete error:', err);
        setAutocompleteSuggestions([]);
      } finally {
        setIsAutocompleteLoading(false);
      }
    },
    [period, date]
  );

  return {
    query,
    results: searchQuery.data || null,
    isSearching: searchQuery.isLoading,
    error: searchQuery.error?.message || null,
    autocomplete: {
      suggestions: autocompleteSuggestions,
      isLoading: isAutocompleteLoading,
    },
    setQuery,
    search,
    clear,
    getAutocompleteSuggestions,
  };
}
