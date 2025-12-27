import { useState, useEffect } from "react";

interface UserCountResponse {
  count: number;
  tableName: string;
  updatedAt: string;
}

interface UseUserCountResult {
  count: number | null;
  loading: boolean;
  error: string | null;
}

const USER_COUNT_API = import.meta.env.VITE_USER_COUNT_API;
const CACHE_KEY = "nasun_user_count";
const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시

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

export const useUserCount = (): UseUserCountResult => {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserCount = async () => {
      // 캐시 확인
      const cached = getCachedData();
      if (cached) {
        setCount(cached.count);
        setLoading(false);
        return;
      }

      // API 엔드포인트가 설정되지 않은 경우
      if (!USER_COUNT_API || USER_COUNT_API.includes("PLACEHOLDER")) {
        console.warn("[useUserCount] API endpoint not configured");
        setCount(null);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(USER_COUNT_API);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: UserCountResponse = await response.json();
        setCount(data.count);
        setCachedData(data.count);
        setError(null);
      } catch (err) {
        console.error("[useUserCount] Failed to fetch user count:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // 에러 발생 시 null 유지 (실제 값만 표시)
        setCount(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserCount();
  }, []);

  return { count, loading, error };
};

export default useUserCount;
