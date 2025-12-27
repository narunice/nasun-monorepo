import { useEffect, useState, useCallback } from 'react';

export interface HighlightState {
  /** 현재 하이라이트된 사용자명 */
  highlightedUser: string | null;
  /** 하이라이트 활성화 여부 */
  isHighlighted: (username: string) => boolean;
  /** 사용자 하이라이트 시작 */
  startHighlight: (username: string, duration?: number) => void;
  /** 하이라이트 제거 */
  clearHighlight: () => void;
}

/**
 * 리더보드 테이블에서 특정 사용자를 하이라이트하는 Hook
 *
 * @param defaultDuration 기본 하이라이트 지속 시간 (ms, 기본값: 6000ms = 6초)
 *
 * @example
 * ```tsx
 * const { highlightedUser, isHighlighted, startHighlight, clearHighlight } = useHighlight();
 *
 * // 검색 결과 클릭 시
 * <button onClick={() => startHighlight('test_handle')}>
 *   View Rank
 * </button>
 *
 * // 테이블 행 렌더링
 * <tr className={isHighlighted(entry.username) ? 'highlighted' : ''}>
 *   ...
 * </tr>
 * ```
 */
export const useHighlight = (defaultDuration: number = 6000): HighlightState => {
  const [highlightedUser, setHighlightedUser] = useState<string | null>(null);
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);

  /**
   * 특정 사용자 하이라이트 시작
   * @param username 하이라이트할 사용자명
   * @param duration 하이라이트 지속 시간 (ms, 생략 시 defaultDuration 사용)
   */
  const startHighlight = useCallback(
    (username: string, duration?: number) => {
      // 이전 타이머 제거
      if (timerId) {
        clearTimeout(timerId);
      }

      // 하이라이트 시작
      setHighlightedUser(username);
      console.log(`✨ [useHighlight] 하이라이트 시작: ${username} (${duration || defaultDuration}ms)`);

      // 지정된 시간 후 자동 제거
      const newTimerId = setTimeout(() => {
        setHighlightedUser(null);
        console.log(`🕐 [useHighlight] 하이라이트 종료: ${username}`);
      }, duration || defaultDuration);

      setTimerId(newTimerId);
    },
    [timerId, defaultDuration]
  );

  /**
   * 하이라이트 즉시 제거
   */
  const clearHighlight = useCallback(() => {
    if (timerId) {
      clearTimeout(timerId);
      setTimerId(null);
    }
    if (highlightedUser) {
      console.log(`❌ [useHighlight] 하이라이트 수동 제거: ${highlightedUser}`);
    }
    setHighlightedUser(null);
  }, [timerId, highlightedUser]);

  /**
   * 특정 사용자가 하이라이트되어 있는지 확인
   * @param username 확인할 사용자명
   * @returns 하이라이트 여부
   */
  const isHighlighted = useCallback(
    (username: string): boolean => {
      return highlightedUser === username;
    },
    [highlightedUser]
  );

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [timerId]);

  return {
    highlightedUser,
    isHighlighted,
    startHighlight,
    clearHighlight,
  };
};
