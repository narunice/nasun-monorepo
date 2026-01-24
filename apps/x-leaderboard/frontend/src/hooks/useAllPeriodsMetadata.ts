import { useState, useEffect } from 'react';
import { CumulativePeriod, CumulativeLeaderboardMetadata } from '../types/leaderboard';

/**
 * 모든 기간의 metadata를 한 번에 가져오는 hook
 * 페이지 로드 시 모든 탭에 날짜를 표시하기 위해 사용
 */
export const useAllPeriodsMetadata = () => {
  const [metadata, setMetadata] = useState<Record<string, CumulativeLeaderboardMetadata>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllMetadata = async () => {
      try {
        const periods = [CumulativePeriod.CUMULATIVE, CumulativePeriod.EVENT1, CumulativePeriod.EVENT2];
        const baseUrl = import.meta.env.VITE_LEADERBOARD_API_URL || 'https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod';

        // 모든 기간의 metadata를 병렬로 가져오기
        const responses = await Promise.all(
          periods.map(period =>
            fetch(`${baseUrl}/api/leaderboard/cumulative?page=1&limit=1&period=${period}`)
              .then(res => res.json())
              .then(data => ({ period, metadata: data.data?.metadata }))
              .catch(err => {
                console.error(`Failed to fetch metadata for ${period}:`, err);
                return { period, metadata: null };
              })
          )
        );

        // Record 형태로 변환
        const metadataMap: Record<string, CumulativeLeaderboardMetadata> = {};
        responses.forEach(({ period, metadata: periodMetadata }) => {
          if (periodMetadata) {
            metadataMap[period] = periodMetadata;
          }
        });

        console.log('🔍 [useAllPeriodsMetadata] Fetched all metadata:', metadataMap);
        setMetadata(metadataMap);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch all periods metadata:', error);
        setLoading(false);
      }
    };

    fetchAllMetadata();
  }, []);

  return { metadata, loading };
};
