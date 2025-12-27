import { useState, useCallback, useRef } from "react";
import {
  CumulativeLeaderboardData,
  CumulativeApiResponse,
  CumulativePeriod,
  CumulativeApiErrorResponse,
} from "../types";
import { ERROR_MESSAGES } from "../constants";

/**
 * 캐시 유지 시간 (Stage 5 최적화)
 *
 * 30분으로 설정:
 * - 리더보드는 매일 09:10 AM에 1회 업데이트됨
 * - 30분 캐싱으로 불필요한 API 재요청 방지
 * - 페이지 전환 시 즉시 데이터 표시 (로딩 없음)
 */
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes (Stage 5 최적화: 5분 → 30분)
const API_ENDPOINT_DEFAULT =
  "https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard/cumulative";

interface CacheEntry {
  data: CumulativeLeaderboardData;
  timestamp: number;
}

export const useCumulativeLeaderboard = (itemsPerPage: number, initialPeriod: CumulativePeriod) => {
  const [leaderboardData, setLeaderboardData] = useState<CumulativeLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<CumulativePeriod>(initialPeriod);
  const leaderboardCache = useRef<Map<string, CacheEntry>>(new Map());

  const fetchLeaderboard = useCallback(
    async (page: number, period: CumulativePeriod, onComplete?: () => void) => {
      const cacheKey = `${period}-${page}-${itemsPerPage}`;
      const cachedEntry = leaderboardCache.current.get(cacheKey);

      // 캐시된 데이터가 있고 유효하면 사용
      if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
        setLeaderboardData(cachedEntry.data);
        setCurrentPeriod(period);
        setLoading(false);
        onComplete?.();
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 리더보드 API 엔드포인트는 환경변수에서 가져오거나 기본값 사용
        // VITE_X_LEADERBOARD_V2_API_ENDPOINT + /leaderboard/cumulative 경로
        const baseApi = import.meta.env.VITE_X_LEADERBOARD_V2_API_ENDPOINT;
        const apiEndpoint = baseApi ? `${baseApi}/leaderboard/cumulative` : API_ENDPOINT_DEFAULT;
        const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;

        if (!apiKey) {
          throw new Error(ERROR_MESSAGES.API_ENDPOINT_MISSING);
        }

        // period는 소문자로 변환 (백엔드가 소문자를 기대함)
        const url = `${apiEndpoint}?page=${page}&limit=${itemsPerPage}&period=${period.toLowerCase()}`;

        console.log(`🔍 [Leaderboard API] Fetching: ${url}`);

        const response = await fetch(url, {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData: CumulativeApiErrorResponse = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result: CumulativeApiResponse = await response.json();

        if (!result.success) {
          throw new Error("API returned success: false");
        }

        // 캐시에 저장
        leaderboardCache.current.set(cacheKey, {
          data: result.data,
          timestamp: Date.now(),
        });

        console.log(`✅ [Leaderboard API] Success:`, {
          period,
          page,
          entriesCount: result.data.entries.length,
          totalUsers: result.data.metadata.totalUsers,
          processingTime: result.processingTimeMs,
        });

        setLeaderboardData(result.data);
        setCurrentPeriod(period);
        onComplete?.();
      } catch (err) {
        console.error("❌ [Leaderboard API] Error fetching leaderboard:", err);
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    },
    [itemsPerPage]
  );

  // 캐시 클리어 함수
  const clearCache = useCallback(() => {
    leaderboardCache.current.clear();
    console.log("🧹 [Leaderboard API] Cache cleared");
  }, []);

  // 특정 기간의 캐시만 클리어
  const clearPeriodCache = useCallback((period: CumulativePeriod) => {
    const keysToDelete = Array.from(leaderboardCache.current.keys()).filter((key) =>
      key.includes(`${period}`)
    );

    keysToDelete.forEach((key) => {
      leaderboardCache.current.delete(key);
    });

    console.log(`🧹 [Leaderboard API] Cache cleared for period: ${period}`);
  }, []);

  // 수동 새로고침
  const refreshLeaderboard = useCallback(() => {
    clearCache();
    fetchLeaderboard(1, currentPeriod);
  }, [fetchLeaderboard, currentPeriod, clearCache]);

  return {
    leaderboardData,
    loading,
    error,
    currentPeriod,
    fetchLeaderboard,
    setCurrentPeriod,
    clearCache,
    clearPeriodCache,
    refreshLeaderboard,
  };
};
