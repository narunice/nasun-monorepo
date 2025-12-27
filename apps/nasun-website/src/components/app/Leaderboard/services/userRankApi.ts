/**
 * 🆕 Phase 1: User Rank Search API Client
 *
 * @description
 * 사용자 랭킹 조회 및 검색을 위한 API 클라이언트입니다.
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import {
  UserRankResponse,
  SearchResponse,
  AutocompleteResponse,
  RankChangesResponse,
  RankHistoryResponse,
  TopClimbersResponse,
  CumulativePeriod,
  TimeRange,
} from '../types/leaderboard';

// API 엔드포인트 기본값 (환경변수로 오버라이드 가능)
const API_BASE_URL = import.meta.env.VITE_X_LEADERBOARD_V2_API_ENDPOINT ||
  'https://bb4zdy0rwe.execute-api.ap-northeast-2.amazonaws.com/prod/api';

/**
 * 사용자 랭킹 조회 API
 *
 * @param period - 리더보드 기간 (cumulative, event1, event2)
 * @param username - 검색할 사용자명 (@ 기호 포함 가능, 대소문자 무관)
 * @param date - 옵션: 특정 날짜의 스냅샷 조회 (YYYY-MM-DD)
 * @returns UserRankResponse
 *
 * @example
 * const result = await getUserRank('cumulative', 'johndoe');
 * const historicalRank = await getUserRank('event1', '@alice', '2025-10-21');
 */
export async function getUserRank(
  period: CumulativePeriod,
  username: string,
  date?: string
): Promise<UserRankResponse> {
  const periodLowerCase = period.toLowerCase();
  const cleanUsername = username.trim();

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/user/${encodeURIComponent(cleanUsername)}`);
  if (date) {
    url.searchParams.append('date', date);
  }

  console.log(`🔍 [getUserRank] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result: UserRankResponse = await response.json();

    if (!response.ok) {
      console.error(`❌ [getUserRank] HTTP ${response.status}:`, result.error);
    } else if (result.success) {
      console.log(`✅ [getUserRank] Found rank for ${username}:`, result.data?.rank);
    } else {
      console.warn(`⚠️ [getUserRank] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [getUserRank] Network error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 사용자 검색 API
 *
 * @param period - 리더보드 기간
 * @param query - 검색 쿼리 (@ 기호 포함 가능, 대소문자 무관)
 * @param date - 옵션: 특정 날짜의 스냅샷 검색
 * @param limit - 최대 결과 수 (기본값: 10)
 * @returns SearchResponse
 *
 * @example
 * const results = await searchUsers('cumulative', 'kim');
 * const limitedResults = await searchUsers('event1', 'john', undefined, 5);
 */
export async function searchUsers(
  period: CumulativePeriod,
  query: string,
  date?: string,
  limit: number = 10
): Promise<SearchResponse> {
  const periodLowerCase = period.toLowerCase();
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return {
      success: true,
      data: {
        matches: [],
        exactMatch: null,
        total: 0,
      },
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/search`);
  url.searchParams.append('q', cleanQuery);
  if (date) {
    url.searchParams.append('date', date);
  }
  if (limit !== 10) {
    url.searchParams.append('limit', limit.toString());
  }

  console.log(`🔍 [searchUsers] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result: SearchResponse = await response.json();

    if (!response.ok) {
      console.error(`❌ [searchUsers] HTTP ${response.status}:`, result.error);
    } else if (result.success) {
      console.log(`✅ [searchUsers] Found ${result.data?.total} matches for "${query}"`);
    } else {
      console.warn(`⚠️ [searchUsers] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [searchUsers] Network error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 자동완성 API (Phase 3 - 전용 엔드포인트 사용)
 *
 * @param period - 리더보드 기간
 * @param query - 검색 쿼리 (최소 2자 이상)
 * @param limit - 최대 제안 수 (기본값: 10)
 * @returns Promise<{ success: boolean; suggestions?: string[]; total?: number; error?: string }>
 *
 * @example
 * const result = await autocompleteUsersApi('cumulative', 'ki', 5);
 * if (result.success) {
 *   console.log(result.suggestions); // ['kim123', 'kimchi', ...]
 * }
 */
export async function autocompleteUsersApi(
  period: CumulativePeriod,
  query: string,
  limit: number = 10
): Promise<{ success: boolean; suggestions?: string[]; total?: number; error?: string; code?: string; processingTimeMs?: number }> {
  const periodLowerCase = period.toLowerCase();
  const cleanQuery = query.trim();

  // 최소 2자 검증
  if (cleanQuery.length < 2) {
    return {
      success: true,
      suggestions: [],
      total: 0,
      processingTimeMs: 0,
    };
  }

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/autocomplete`);
  url.searchParams.append('q', cleanQuery);
  if (limit !== 10) {
    url.searchParams.append('limit', limit.toString());
  }

  console.log(`🔍 [autocompleteUsersApi] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`❌ [autocompleteUsersApi] HTTP ${response.status}:`, result.error);
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
        code: result.code || 'HTTP_ERROR',
      };
    }

    if (result.success) {
      console.log(`✅ [autocompleteUsersApi] Found ${result.total} suggestions for "${query}" (${result.processingTimeMs}ms)`);
    } else {
      console.warn(`⚠️ [autocompleteUsersApi] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [autocompleteUsersApi] Network error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * @deprecated Phase 1 fallback - Phase 3에서는 autocompleteUsersApi 사용 권장
 */
export async function getAutocomplete(
  period: CumulativePeriod,
  query: string,
  date?: string,
  limit: number = 5
): Promise<AutocompleteResponse> {
  const cleanQuery = query.trim();

  // 최소 2자 검증
  if (cleanQuery.length < 2) {
    return {
      success: true,
      data: {
        suggestions: [],
        total: 0,
      },
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // Phase 1에서는 searchUsers를 재사용
  const searchResult = await searchUsers(period, cleanQuery, date, limit);

  if (!searchResult.success || !searchResult.data) {
    return {
      success: false,
      error: searchResult.error,
      code: searchResult.code,
      processingTimeMs: searchResult.processingTimeMs,
      timestamp: searchResult.timestamp,
    };
  }

  return {
    success: true,
    data: {
      suggestions: searchResult.data.matches,
      total: searchResult.data.total,
    },
    processingTimeMs: searchResult.processingTimeMs,
    timestamp: searchResult.timestamp,
  };
}

/**
 * 🆕 Phase 3: 랭킹 변동 조회 API
 *
 * @description
 * 어제 대비 오늘의 랭킹 변동을 조회합니다.
 * - 오늘 리더보드와 어제 스냅샷을 비교
 * - 각 사용자의 순위 변동 및 점수 변화 계산
 * - NEW(신규 진입), UP(상승), DOWN(하락), SAME(동일) 표시
 *
 * @param period - 리더보드 기간 (cumulative, event1, event2)
 * @returns RankChangesResponse
 *
 * @example
 * const result = await getRankChanges('cumulative');
 * if (result.success) {
 *   console.log(`Total users: ${result.data.total}`);
 *   console.log(`New entries: ${result.data.summary.new}`);
 *   console.log(`Rank ups: ${result.data.summary.up}`);
 * }
 */
export async function getRankChanges(
  period: CumulativePeriod
): Promise<RankChangesResponse> {
  const periodLowerCase = period.toLowerCase();

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/changes`);

  console.log(`📊 [getRankChanges] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result: RankChangesResponse = await response.json();

    if (!response.ok) {
      console.error(`❌ [getRankChanges] HTTP ${response.status}:`, result.error);
    } else if (result.success) {
      console.log(`✅ [getRankChanges] Found ${result.data?.total} rank changes (${result.meta?.duration})`);
    } else {
      console.warn(`⚠️ [getRankChanges] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [getRankChanges] Network error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * 🆕 Rank History: 사용자 랭킹 히스토리 조회 API
 *
 * @description
 * 특정 사용자의 랭킹 변화 추이를 조회합니다.
 * - 지정된 기간 동안의 일자별 랭킹 데이터
 * - 통계 정보 (최고/최저/평균 순위, 점수 증가량 등)
 * - My Account 페이지의 랭킹 그래프에 사용
 *
 * @param period - 리더보드 기간 (cumulative, event1, event2)
 * @param username - X 사용자명 (@ 기호 포함 가능)
 * @param days - 조회 기간 (기본값: 7일, 범위: 1-365)
 * @returns RankHistoryResponse
 *
 * @example
 * // 최근 7일 히스토리 조회
 * const result = await getUserRankHistory('cumulative', 'johndoe');
 * if (result.success) {
 *   console.log(`History entries: ${result.data.history.length}`);
 *   console.log(`Best rank: ${result.data.stats.bestRank}`);
 * }
 *
 * @example
 * // 최근 30일 히스토리 조회
 * const result = await getUserRankHistory('event1', '@alice', 30);
 */
export async function getUserRankHistory(
  period: CumulativePeriod,
  username: string,
  days: number = 7
): Promise<RankHistoryResponse> {
  const periodLowerCase = period.toLowerCase();
  const cleanUsername = username.trim();

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/user/${encodeURIComponent(cleanUsername)}/history`);
  url.searchParams.append('days', days.toString());

  console.log(`📊 [getUserRankHistory] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result: RankHistoryResponse = await response.json();

    if (!response.ok) {
      console.error(`❌ [getUserRankHistory] HTTP ${response.status}:`, result.error);
    } else if (result.success) {
      console.log(`✅ [getUserRankHistory] Found ${result.data?.history.length} history entries for ${username} (${result.processingTimeMs}ms)`);
    } else {
      console.warn(`⚠️ [getUserRankHistory] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [getUserRankHistory] Network error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Top Climbers 조회 API
 *
 * @param period - 리더보드 기간 (cumulative, event1, event2)
 * @param timeRange - 비교 기간 (today, 7d, 4w, 3m)
 * @param limit - 최대 결과 수 (기본값: 5)
 * @returns TopClimbersResponse
 *
 * @example
 * const result = await getTopClimbers('cumulative', '7d');
 * const top3 = await getTopClimbers('event1', 'today', 3);
 */
export async function getTopClimbers(
  period: CumulativePeriod,
  timeRange: TimeRange = 'today',
  limit: number = 5
): Promise<TopClimbersResponse> {
  const periodLowerCase = period.toLowerCase();

  // URL 생성
  const url = new URL(`${API_BASE_URL}/leaderboard/${periodLowerCase}/top-climbers`);
  url.searchParams.append('timeRange', timeRange);
  url.searchParams.append('limit', limit.toString());

  console.log(`🏆 [getTopClimbers] Fetching: ${url.toString()}`);

  try {
    const apiKey = import.meta.env.VITE_X_LEADERBOARD_API_KEY;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const result: TopClimbersResponse = await response.json();

    if (!response.ok) {
      console.error(`❌ [getTopClimbers] HTTP ${response.status}:`, result.error);
    } else if (result.success) {
      console.log(`✅ [getTopClimbers] Found ${result.data?.climbers.length} climbers for ${period}/${timeRange} (${result.processingTimeMs}ms)`);
    } else {
      console.warn(`⚠️ [getTopClimbers] API returned success: false`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`❌ [getTopClimbers] Network error:`, error);
    return {
      success: false,
      version: "v2",
      error: error instanceof Error ? error.message : 'Network error',
      code: 'NETWORK_ERROR',
      processingTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}
