import { useQuery } from '@tanstack/react-query';
import { fetchLeaderboardConfig } from '@/services/leaderboardApi';

/**
 * 리더보드 설정을 가져오는 React Query Hook
 *
 * 백엔드 API를 통해 프론트엔드에 표시할 리더보드 탭 목록,
 * 각 리더보드의 기간 정보 등을 동적으로 가져옵니다.
 */
export const useLeaderboardConfig = () => {
  return useQuery({
    queryKey: ['leaderboardConfig'],
    queryFn: fetchLeaderboardConfig,
    staleTime: 1000 * 60 * 30, // 30분
    gcTime: 1000 * 60 * 60,    // 1시간
  });
};
