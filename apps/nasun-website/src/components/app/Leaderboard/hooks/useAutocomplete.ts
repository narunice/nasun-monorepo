/**
 * 🆕 Phase 3: useAutocomplete Hook
 * 🔄 Stage 5: React Query 전환 (캐싱 최적화)
 *
 * @description
 * 사용자 검색 자동완성 Hook
 * Debounce 지연 시간 후 API 호출하여 자동완성 제안 제공
 * Stage 5에서 React Query로 전환하여 자동완성 결과 캐싱 지원.
 *
 * @author Claude Code
 * @date 2025-10-23 (최초 작성)
 * @updated 2025-10-27 (Stage 5: React Query 전환)
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LeaderboardPeriod } from '../types';
import { autocompleteUsersApi } from '../services/userRankApi';

export interface UseAutocompleteOptions {
  /** 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2) */
  period: LeaderboardPeriod;
  /** 자동완성 활성화 여부 */
  enabled?: boolean;
  /** Debounce 지연 시간 (ms, 기본값: 300ms) */
  debounceDelay?: number;
  /** 최대 제안 개수 (기본값: 10) */
  limit?: number;
  /** 최소 query 길이 (기본값: 2) */
  minLength?: number;
}

export interface UseAutocompleteResult {
  /** 자동완성 제안 목록 */
  suggestions: string[];
  /** 로딩 상태 (Debounce 중 + API 호출 중) */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 자동완성 제안 가져오기 */
  fetchSuggestions: (query: string) => void;
  /** 자동완성 초기화 */
  clearSuggestions: () => void;
}

/**
 * 사용자 검색 자동완성 Hook (Stage 5: React Query 전환)
 *
 * @param options - 자동완성 옵션
 *
 * @example
 * ```tsx
 * const { suggestions, isLoading, fetchSuggestions, clearSuggestions } = useAutocomplete({
 *   period: LeaderboardPeriod.CUMULATIVE,
 *   enabled: true,
 *   debounceDelay: 300,
 *   limit: 10
 * });
 *
 * // 입력 이벤트
 * <input
 *   onChange={(e) => fetchSuggestions(e.target.value)}
 *   onBlur={() => clearSuggestions()}
 * />
 *
 * // 드롭다운 표시
 * {suggestions.length > 0 && (
 *   <ul>
 *     {suggestions.map(username => (
 *       <li key={username}>{username}</li>
 *     ))}
 *   </ul>
 * )}
 * ```
 */
export const useAutocomplete = (options: UseAutocompleteOptions): UseAutocompleteResult => {
  const {
    period,
    enabled = true,
    debounceDelay = 300,
    limit = 10,
    minLength = 2
  } = options;

  const [inputQuery, setInputQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // ✅ Debounce 로직 (useEffect)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputQuery);
    }, debounceDelay);

    return () => clearTimeout(timer);
  }, [inputQuery, debounceDelay]);

  // ✅ React Query (Stage 5)
  const autocompleteQuery = useQuery({
    queryKey: ['autocomplete', period, debouncedQuery, limit],
    queryFn: async (): Promise<string[]> => {
      console.log(`🔍 [useAutocomplete] Fetching suggestions for: "${debouncedQuery}"`);

      const result = await autocompleteUsersApi(period, debouncedQuery, limit);

      if (!result.success) {
        throw new Error(result.error || 'Autocomplete failed');
      }

      console.log(`✅ [useAutocomplete] Found ${result.suggestions?.length || 0} suggestions (${result.processingTimeMs}ms)`);

      return result.suggestions || [];
    },
    /**
     * React Query 캐싱 설정 (Stage 5 최적화)
     *
     * staleTime: 5분
     * - 자동완성은 실시간성이 중요하므로 5분 캐싱
     * - 동일한 입력에 대해 5분 이내 재요청 방지
     *
     * gcTime: 15분
     * - 컴포넌트 언마운트 후 15분 동안 메모리에 캐시 보관
     * - 사용자가 다시 입력 시 즉시 표시 가능
     *
     * enabled: debouncedQuery.length >= minLength
     * - 최소 길이 이상일 때만 API 호출
     * - Debounce된 query 사용으로 불필요한 API 호출 방지
     */
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 15 * 60 * 1000, // 15분
    enabled: enabled && debouncedQuery.length >= minLength,
    retry: 1,
  });

  /**
   * 자동완성 제안 가져오기
   * 사용자 입력 값을 설정하면, Debounce 후 자동으로 API 호출
   */
  const fetchSuggestions = useCallback((query: string) => {
    setInputQuery(query);
  }, []);

  /**
   * 자동완성 초기화
   */
  const clearSuggestions = useCallback(() => {
    setInputQuery('');
    setDebouncedQuery('');
  }, []);

  return {
    suggestions: autocompleteQuery.data || [],
    // Debounce 중에도 로딩 표시 (UX 개선)
    isLoading: autocompleteQuery.isLoading || (inputQuery !== debouncedQuery),
    error: autocompleteQuery.error?.message || null,
    fetchSuggestions,
    clearSuggestions,
  };
};
