import { useState, useEffect } from "react";

interface FollowerCountResponse {
  count: number;
  username: string;
  cached: boolean;
  stale?: boolean;
  updatedAt: string;
}

interface UseFollowerCountResult {
  count: number | null;
  loading: boolean;
  error: string | null;
}

const FOLLOWER_COUNT_API = import.meta.env.VITE_FOLLOWER_COUNT_API;
const CACHE_KEY = "nasun_follower_count";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간 캐시 (팔로워 수는 실시간 업데이트 불필요)

interface CachedData {
  count: number;
  timestamp: number;
}

const getCachedData = (): CachedData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedData;
      if (Date.now() - data.timestamp < CACHE_DURATION) {
        return data;
      }
    }
  } catch {
    // 캐시 오류 무시
  }
  return null;
};

const setCachedData = (count: number): void => {
  try {
    const data: CachedData = { count, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // 캐시 저장 오류 무시
  }
};

/**
 * Twitter/X 타겟 계정의 팔로워 수를 조회하는 Hook
 *
 * - Dev 환경: @Naru010110 팔로워 수
 * - Prod 환경: @Nasun_io 팔로워 수
 * - 30분 localStorage 캐싱 (Twitter API Rate Limit 보호)
 *
 * @example
 * const { count, loading, error } = useFollowerCount();
 * if (loading) return <Spinner />;
 * if (count !== null) return <div>{count} followers</div>;
 */
export const useFollowerCount = (): UseFollowerCountResult => {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFollowerCount = async () => {
      // 캐시 확인
      const cached = getCachedData();
      if (cached) {
        setCount(cached.count);
        setLoading(false);
        return;
      }

      // API 엔드포인트가 설정되지 않은 경우
      if (!FOLLOWER_COUNT_API || FOLLOWER_COUNT_API.includes("PLACEHOLDER")) {
        console.warn("[useFollowerCount] API endpoint not configured");
        setCount(null);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(FOLLOWER_COUNT_API);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: FollowerCountResponse = await response.json();
        setCount(data.count);
        setCachedData(data.count);
        setError(null);

        // stale 데이터인 경우 경고 로그
        if (data.stale) {
          console.warn("[useFollowerCount] Using stale cached data from API");
        }
      } catch (err) {
        console.error("[useFollowerCount] Failed to fetch follower count:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // 에러 발생 시 null 유지 (실제 값만 표시)
        setCount(null);
      } finally {
        setLoading(false);
      }
    };

    fetchFollowerCount();
  }, []);

  return { count, loading, error };
};

export default useFollowerCount;
