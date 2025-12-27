import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface LeaderboardUrlParams {
  /** 검색할 사용자명 */
  user?: string;
  /** 하이라이트 활성화 여부 */
  highlight?: boolean;
  /** 리더보드 기간 */
  period?: string;
  /** 스냅샷 날짜 */
  date?: string;
}

/**
 * URL 파라미터를 읽고 관리하는 Hook
 *
 * URL 예시:
 * - /leaderboard?user=Fall2026&highlight=true
 * - /leaderboard?user=Fall2026&period=cumulative&date=2025-10-22
 *
 * @returns {object} URL 파라미터 객체와 업데이트 함수
 */
export const useUrlParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 🆕 초기값을 searchParams에서 직접 읽기 (useEffect 대기 없이 즉시 사용 가능)
  const getParamsFromSearchParams = (): LeaderboardUrlParams => ({
    user: searchParams.get('user') || undefined,
    highlight: searchParams.get('highlight') === 'true',
    period: searchParams.get('period') || undefined,
    date: searchParams.get('date') || undefined,
  });

  // 초기값을 즉시 설정 (첫 렌더에서 URL 파라미터 사용 가능)
  const [params, setParams] = useState<LeaderboardUrlParams>(getParamsFromSearchParams);

  // URL 파라미터 변경 시 동기화
  useEffect(() => {
    const newParams = getParamsFromSearchParams();
    setParams(newParams);

    console.log('🔗 [useUrlParams] URL 파라미터 감지:', newParams);
  }, [searchParams]);

  /**
   * URL 파라미터 업데이트
   * @param newParams 새로운 파라미터 (undefined 값은 제거됨)
   * @param replace true일 경우 history.replaceState 사용 (기본: false)
   */
  const updateParams = (newParams: Partial<LeaderboardUrlParams>, replace = false) => {
    // 현재 파라미터 복사 (Record<string, string>으로 변환)
    const current: Record<string, string> = Object.fromEntries(searchParams.entries());

    // 새 파라미터를 문자열로 변환하여 병합을 위해 임시 객체 생성
    const formattedNewParams: Record<string, string | undefined> = {};
    
    if (newParams.user !== undefined) formattedNewParams.user = newParams.user;
    if (newParams.highlight !== undefined) formattedNewParams.highlight = String(newParams.highlight);
    if (newParams.period !== undefined) formattedNewParams.period = newParams.period;
    if (newParams.date !== undefined) formattedNewParams.date = newParams.date;

    // 병합
    const merged: Record<string, string | undefined> = { ...current, ...formattedNewParams };

    // undefined, null 제거
    const finalParams: Record<string, string> = {};
    Object.keys(merged).forEach((key) => {
      const value = merged[key];
      if (value !== undefined && value !== null) {
        finalParams[key] = value;
      }
    });

    // highlight가 'false'인 경우 제거
    if (finalParams.highlight === 'false') {
      delete finalParams.highlight;
    }

    console.log('🔗 [useUrlParams] URL 파라미터 업데이트:', finalParams);

    setSearchParams(finalParams, { replace });
  };

  /**
   * 특정 파라미터 제거
   * @param keys 제거할 파라미터 키 배열
   */
  const removeParams = (...keys: (keyof LeaderboardUrlParams)[]) => {
    const current = Object.fromEntries(searchParams.entries());

    keys.forEach(key => {
      // keyof LeaderboardUrlParams 타입이므로 string으로 단언하여 삭제
      delete current[key as string];
    });

    console.log('🔗 [useUrlParams] URL 파라미터 제거:', keys);

    setSearchParams(current, { replace: true });
  };

  /**
   * 모든 파라미터 제거
   */
  const clearParams = () => {
    console.log('🔗 [useUrlParams] 모든 URL 파라미터 제거');
    setSearchParams({}, { replace: true });
  };

  return {
    params,
    updateParams,
    removeParams,
    clearParams,
    hasParams: Object.keys(params).length > 0,
  };
};
