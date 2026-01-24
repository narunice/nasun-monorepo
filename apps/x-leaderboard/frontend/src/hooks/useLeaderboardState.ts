import { useState, useCallback, useEffect } from 'react';
import { CumulativePeriod } from '../types';

/**
 * 리더보드 상태 인터페이스
 */
export interface LeaderboardState {
  selectedDate: string | null;
  isSnapshotMode: boolean;
  currentPeriod: CumulativePeriod;
}

/**
 * 리더보드 상태 액션 인터페이스
 */
export interface LeaderboardStateActions {
  setSelectedDate: (date: string | null) => void;
  setIsSnapshotMode: (mode: boolean) => void;
  setCurrentPeriod: (period: CumulativePeriod) => void;
  resetToLatest: () => void;
}

/**
 * 리더보드 상태 관리 훅
 *
 * @description
 * 리더보드의 핵심 상태(날짜 선택, 스냅샷 모드, 현재 기간)만을 관리하는 단순한 훅입니다.
 * 단일 책임 원칙(SRP)을 따라 상태 관리만 담당합니다.
 *
 * @param initialPeriod - 초기 리더보드 기간
 * @returns 상태와 상태 변경 액션들
 *
 * @example
 * ```tsx
 * const { state, actions } = useLeaderboardState(CumulativePeriod.CUMULATIVE);
 *
 * // 날짜 선택
 * actions.setSelectedDate('2025-10-01');
 *
 * // 최신 리더보드로 리셋
 * actions.resetToLatest();
 * ```
 */
export const useLeaderboardState = (initialPeriod: CumulativePeriod) => {
  // 선택된 날짜 상태
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 스냅샷 모드 여부 (과거 데이터 조회 모드)
  const [isSnapshotMode, setIsSnapshotMode] = useState(false);

  // 현재 선택된 기간 (누적/이벤트1/이벤트2)
  const [currentPeriod, setCurrentPeriod] = useState<CumulativePeriod>(initialPeriod);

  // 🆕 initialPeriod 변경 시 currentPeriod 동기화
  // API 로딩 완료 후 스마트 기본값이 변경될 때 탭을 자동으로 전환
  useEffect(() => {
    setCurrentPeriod(initialPeriod);
  }, [initialPeriod]);

  /**
   * 최신 리더보드 상태로 리셋
   * 날짜 선택과 스냅샷 모드를 모두 해제합니다.
   */
  const resetToLatest = useCallback(() => {
    setSelectedDate(null);
    setIsSnapshotMode(false);
  }, []);

  return {
    state: {
      selectedDate,
      isSnapshotMode,
      currentPeriod
    },
    actions: {
      setSelectedDate,
      setIsSnapshotMode,
      setCurrentPeriod,
      resetToLatest
    }
  };
};
