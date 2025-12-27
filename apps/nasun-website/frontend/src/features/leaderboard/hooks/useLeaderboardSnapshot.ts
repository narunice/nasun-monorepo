import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { 
  CumulativeLeaderboardData, 
  CumulativeApiResponse, 
  CumulativePeriod,
  CumulativeApiErrorResponse 
} from '../types';

// 리더보드 API 기본 엔드포인트 (Production)
const API_ENDPOINT_DEFAULT = 'https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/api';

interface UseLeaderboardSnapshotParams {
  period: CumulativePeriod;
  selectedDate: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface UseLeaderboardSnapshotReturn {
  data: CumulativeLeaderboardData | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
  refetch: () => void;
}

/**
 * 리더보드 스냅샷 데이터를 조회하는 훅
 * 특정 날짜의 리더보드 스냅샷을 가져옴
 */
export const useLeaderboardSnapshot = ({
  period,
  selectedDate,
  page = 1,
  limit = 50,
  enabled = true
}: UseLeaderboardSnapshotParams): UseLeaderboardSnapshotReturn => {
  
  const fetchSnapshot = async (): Promise<CumulativeLeaderboardData> => {
    // API 엔드포인트와 키 설정
    const baseEndpoint = import.meta.env.VITE_X_LEADERBOARD_V2_API_ENDPOINT || API_ENDPOINT_DEFAULT;
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;

    if (!apiKey) {
      throw new Error('API 키가 설정되지 않았습니다.');
    }

    // 스냅샷 API URL 구성: /api/leaderboard/{period}/snapshots/{date}
    const snapshotUrl = `${baseEndpoint}/leaderboard/${period}/snapshots/${selectedDate}`;
    const urlWithParams = `${snapshotUrl}?page=${page}&limit=${limit}`;

    console.log(`📸 스냅샷 API 호출: ${urlWithParams}`);

    try {
      const response = await fetch(urlWithParams, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          const error = new Error(`SNAPSHOT_NOT_FOUND:${selectedDate}`);
          error.name = 'SnapshotNotFoundError';
          throw error;
        } else if (response.status === 400) {
          throw new Error('잘못된 날짜 형식이거나 미래 날짜입니다.');
        } else if (response.status === 500) {
          throw new Error(`서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`);
        } else {
          throw new Error(`스냅샷 조회 실패: ${response.status}`);
        }
      }

      const result: CumulativeApiResponse | CumulativeApiErrorResponse = await response.json();

      if (!result.success) {
        const errorResult = result as CumulativeApiErrorResponse;
        throw new Error(errorResult.error || '스냅샷 조회 중 오류가 발생했습니다.');
      }

      const successResult = result as CumulativeApiResponse;
      return successResult.data;
    } catch (error) {
      // 네트워크 에러 (CORS, 연결 실패 등) 처리
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error('NETWORK_ERROR:네트워크 연결을 확인해주세요.');
        networkError.name = 'NetworkError';
        throw networkError;
      }
      throw error;
    }
  };

  const queryResult: UseQueryResult<CumulativeLeaderboardData, Error> = useQuery({
    queryKey: ['leaderboard-snapshot', period, selectedDate, page, limit],
    queryFn: fetchSnapshot,
    enabled: enabled && !!selectedDate,
    // 스냅샷은 변하지 않는 데이터이므로 긴 캐시 시간 설정
    staleTime: 24 * 60 * 60 * 1000, // 24시간
    gcTime: 24 * 60 * 60 * 1000, // 24시간 (이전 cacheTime)
    retry: (failureCount, error) => {
      // 스냅샷 없음, 네트워크 에러, 400 에러는 재시도하지 않음
      if (error.name === 'SnapshotNotFoundError' ||
          error.name === 'NetworkError' ||
          error.message.includes('400')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    data: queryResult.data,
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    isError: queryResult.isError,
    refetch: queryResult.refetch
  };
};