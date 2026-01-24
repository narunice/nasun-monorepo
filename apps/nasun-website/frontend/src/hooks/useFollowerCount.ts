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
const PERMANENT_KEY = "nasun_follower_permanent";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24-hour cache
const FALLBACK_COUNT = 1000;

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
    // Also save to permanent cache (never expires)
    localStorage.setItem(PERMANENT_KEY, JSON.stringify(data));
  } catch {
    // Ignore cache save errors
  }
};

const getPermanentData = (): number | null => {
  try {
    const cached = localStorage.getItem(PERMANENT_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedData;
      return data.count;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
};

/**
 * Twitter/X 타겟 계정의 팔로워 수를 조회하는 Hook
 *
 * - 모든 환경: @Nasun_io 팔로워 수
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

      // API endpoint not configured - use fallback chain
      if (!FOLLOWER_COUNT_API || FOLLOWER_COUNT_API.includes("PLACEHOLDER")) {
        console.warn("[useFollowerCount] API endpoint not configured, using fallback");
        const permanentCount = getPermanentData();
        setCount(permanentCount ?? FALLBACK_COUNT);
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

        // Fallback chain: permanent cache -> hardcoded fallback (never show 0)
        const permanentCount = getPermanentData();
        if (permanentCount !== null) {
          console.warn("[useFollowerCount] Using permanent cache:", permanentCount);
          setCount(permanentCount);
        } else {
          console.warn("[useFollowerCount] Using fallback value:", FALLBACK_COUNT);
          setCount(FALLBACK_COUNT);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFollowerCount();
  }, []);

  return { count, loading, error };
};

export default useFollowerCount;
