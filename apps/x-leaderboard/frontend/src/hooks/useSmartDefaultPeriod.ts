import { useMemo } from 'react';
import { useLeaderboardConfig } from './useLeaderboardConfig';
import { getSmartDefaultPeriod } from '../utils/getSmartDefaultPeriod';
import { CumulativePeriod } from '../types';

/**
 * 스마트 기본 기간을 반환하는 훅
 *
 * useLeaderboardConfig를 사용하여 API에서 리더보드 설정을 가져온 후,
 * getSmartDefaultPeriod 유틸리티를 사용하여 스마트 기본 기간을 계산합니다.
 *
 * 우선순위:
 * 1. 진행 중인 이벤트 (오늘이 startDate ~ endDate 사이)
 * 2. 가장 최근 종료된 이벤트
 * 3. 첫 번째 visible 리더보드
 * 4. 'cumulative' (폴백)
 *
 * @param fallbackPeriod - 설정 로딩 중 또는 에러 시 사용할 폴백 기간
 * @returns { defaultPeriod, isLoading, isError }
 *
 * @example
 * ```tsx
 * const { defaultPeriod, isLoading } = useSmartDefaultPeriod();
 *
 * if (isLoading) {
 *   return <Loading />;
 * }
 *
 * // defaultPeriod를 사용하여 초기 기간 설정
 * ```
 */
export function useSmartDefaultPeriod(
  fallbackPeriod: CumulativePeriod = CumulativePeriod.CUMULATIVE
) {
  const { data: configData, isLoading, isError } = useLeaderboardConfig();

  const defaultPeriod = useMemo(() => {
    // 로딩 중이거나 에러가 있으면 폴백 기간 반환
    if (isLoading || isError || !configData?.data?.availableLeaderboards) {
      return fallbackPeriod;
    }

    return getSmartDefaultPeriod(configData.data.availableLeaderboards);
  }, [configData, isLoading, isError, fallbackPeriod]);

  return {
    defaultPeriod,
    isLoading,
    isError,
    availableLeaderboards: configData?.data?.availableLeaderboards,
  };
}
