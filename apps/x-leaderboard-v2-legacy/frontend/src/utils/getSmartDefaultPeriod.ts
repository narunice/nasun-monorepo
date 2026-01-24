import { LeaderboardConfigItem } from '@/types/leaderboard';
import { CumulativePeriod } from '../types';

/**
 * 스마트 기본 기간 선택 유틸리티
 *
 * 리더보드의 기본 기간을 다음 우선순위에 따라 결정합니다:
 *
 * 1. **CUMULATIVE (누적 리더보드)**: visible인 경우 최우선 표시
 * 2. **Active Event (진행 중인 이벤트)**: CUMULATIVE가 숨겨진 경우, 오늘 날짜가 startDate와 endDate 사이에 있는 이벤트
 * 3. **Most Recently Ended Event (가장 최근 종료된 이벤트)**: endDate가 오늘보다 이전인 이벤트 중 가장 최근
 * 4. **First Visible Leaderboard (첫 번째 visible 리더보드)**: 위 조건을 만족하는 것이 없을 때
 * 5. **Fallback (폴백)**: 'cumulative'
 *
 * @param availableLeaderboards - API에서 반환된 리더보드 설정 배열
 * @returns CumulativePeriod - 스마트하게 선택된 기본 기간
 *
 * @example
 * ```ts
 * const config = await fetchLeaderboardConfig();
 * const defaultPeriod = getSmartDefaultPeriod(config.data.availableLeaderboards);
 * // CUMULATIVE가 visible이면 → 'cumulative'
 * // CUMULATIVE가 숨겨져 있고 EVENT2가 진행 중이면 → 'event2'
 * // CUMULATIVE가 숨겨져 있고 모든 이벤트가 종료되면 → 가장 최근 종료된 이벤트
 * ```
 */
export function getSmartDefaultPeriod(
  availableLeaderboards: LeaderboardConfigItem[] | undefined
): CumulativePeriod {
  // 설정 데이터가 없으면 기본값 반환
  if (!availableLeaderboards || availableLeaderboards.length === 0) {
    return CumulativePeriod.CUMULATIVE;
  }

  // visible한 리더보드만 필터링
  const visibleLeaderboards = availableLeaderboards.filter(lb => lb.visible);

  if (visibleLeaderboards.length === 0) {
    return CumulativePeriod.CUMULATIVE;
  }

  // 🎯 Priority 1: CUMULATIVE가 visible인 경우 최우선
  const cumulativeLeaderboard = visibleLeaderboards.find(lb => lb.id === 'CUMULATIVE');
  if (cumulativeLeaderboard) {
    console.log(`🎯 [SmartDefault] CUMULATIVE is visible, selecting as default`);
    return CumulativePeriod.CUMULATIVE;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // 시간 제거하여 날짜만 비교

  // 🎯 Priority 2: 진행 중인 이벤트 (CUMULATIVE가 숨겨진 경우)
  const activeEvent = visibleLeaderboards.find(lb => {
    // CUMULATIVE는 기간이 없으므로 건너뜀
    if (lb.id === 'CUMULATIVE' || !lb.startDate || !lb.endDate) {
      return false;
    }

    const startDate = new Date(lb.startDate);
    const endDate = new Date(lb.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999); // endDate는 해당 날짜의 끝까지 포함

    return today >= startDate && today <= endDate;
  });

  if (activeEvent) {
    console.log(`🎯 [SmartDefault] Active event found: ${activeEvent.id}`);
    return activeEvent.id.toLowerCase() as CumulativePeriod;
  }

  // 🎯 Priority 3: 가장 최근 종료된 이벤트
  const endedEvents = visibleLeaderboards
    .filter(lb => {
      // CUMULATIVE는 건너뜀
      if (lb.id === 'CUMULATIVE' || !lb.endDate) {
        return false;
      }

      const endDate = new Date(lb.endDate);
      endDate.setHours(23, 59, 59, 999);

      return today > endDate; // 오늘이 endDate 이후인 경우 (종료된 이벤트)
    })
    .sort((a, b) => {
      // endDate 기준 내림차순 정렬 (가장 최근 종료된 것이 첫 번째)
      const dateA = new Date(a.endDate!);
      const dateB = new Date(b.endDate!);
      return dateB.getTime() - dateA.getTime();
    });

  if (endedEvents.length > 0) {
    console.log(`🎯 [SmartDefault] Most recently ended event: ${endedEvents[0].id}`);
    return endedEvents[0].id.toLowerCase() as CumulativePeriod;
  }

  // 🎯 Priority 4: 첫 번째 visible 리더보드
  const firstVisible = visibleLeaderboards[0];
  if (firstVisible) {
    console.log(`🎯 [SmartDefault] First visible leaderboard: ${firstVisible.id}`);
    return firstVisible.id.toLowerCase() as CumulativePeriod;
  }

  // 🎯 Priority 5: Fallback
  console.log(`🎯 [SmartDefault] Fallback to CUMULATIVE`);
  return CumulativePeriod.CUMULATIVE;
}

/**
 * CUMULATIVE가 visible한지 확인하는 헬퍼 함수
 *
 * @param availableLeaderboards - API에서 반환된 리더보드 설정 배열
 * @returns boolean - CUMULATIVE가 visible이면 true
 */
export function isCumulativeVisible(
  availableLeaderboards: LeaderboardConfigItem[] | undefined
): boolean {
  if (!availableLeaderboards) {
    return true; // 설정이 없으면 기본적으로 visible로 간주
  }

  const cumulative = availableLeaderboards.find(lb => lb.id === 'CUMULATIVE');
  return cumulative?.visible ?? true;
}
