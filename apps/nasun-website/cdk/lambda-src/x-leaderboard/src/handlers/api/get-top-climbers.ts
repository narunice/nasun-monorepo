/**
 * 🆕 Top Climbers Spotlight API Handler
 *
 * @description
 * 지정된 기간 동안 순위가 가장 많이 상승한 상위 5명의 사용자를 반환합니다.
 * - 기간: today, 7d, 4w, 3m
 * - 2-tier 정렬: 1) 순위 상승폭, 2) 점수 증가량
 * - 최대 5명 반환 (메달: 🥇🥈🥉🏅🏅)
 *
 * @author Claude Code
 * @date 2025-11-22
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardService } from '../../services/leaderboard-service';
import { LeaderboardPeriod, TimeRange, TopClimberEntry, TopClimbersResponse } from '../../types/leaderboard';

const ddbClient = new DynamoDBClient({});

// CORS 헤더
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * TimeRange에 따른 비교 날짜 계산
 * @param timeRange - today, 7d, 4w, 3m
 * @returns 비교 기준 날짜 (YYYY-MM-DD)
 */
function calculateComparisonDate(timeRange: TimeRange): string {
  const today = new Date();
  let daysAgo: number;

  switch (timeRange) {
    case 'today':
      daysAgo = 1; // 어제
      break;
    case '7d':
      daysAgo = 7;
      break;
    case '4w':
      daysAgo = 28; // 4주 = 28일
      break;
    case '3m':
      daysAgo = 90; // 3개월 = 90일
      break;
    default:
      daysAgo = 1;
  }

  const comparisonDate = new Date(today);
  comparisonDate.setDate(comparisonDate.getDate() - daysAgo);
  return comparisonDate.toISOString().split('T')[0];
}

/**
 * 순위 변화 계산 및 Top Climbers 추출
 */
function calculateRankChanges(
  currentEntries: any[],
  previousEntries: any[],
  comparisonDate: string,
  limit: number
): TopClimberEntry[] {
  // 1. 이전 데이터를 Map으로 변환 (빠른 조회용)
  const previousMap = new Map<string, { rank: number; score: number }>();
  for (const entry of previousEntries) {
    previousMap.set(entry.username, {
      rank: entry.rank,
      score: entry.finalScore, // ✅ finalScore 사용 (활동일수 점수, 보너스, 감점 포함)
    });
  }

  // 2. 순위 변화 계산
  const climbers: TopClimberEntry[] = [];

  for (const current of currentEntries) {
    const previous = previousMap.get(current.username);

    // 이전 데이터가 없으면 신규 진입 (제외)
    if (!previous) {
      continue;
    }

    // 순위 상승폭 계산 (양수 = 상승)
    const rankImprovement = previous.rank - current.rank;

    // 순위 상승한 경우만 포함
    if (rankImprovement <= 0) {
      continue;
    }

    // 점수 증가량 계산 (finalScore 기준)
    const scoreIncrease = current.finalScore - previous.score; // ✅ finalScore 사용
    const percentageIncrease = previous.score > 0
      ? ((scoreIncrease / previous.score) * 100)
      : 0;

    climbers.push({
      userId: current.userId,
      username: current.username,
      displayName: current.displayName,
      profileImageUrl: current.profileImageUrl,
      currentRank: current.rank,
      previousRank: previous.rank,
      rankImprovement,
      currentScore: current.finalScore, // ✅ finalScore 사용 (리더보드 "Points"와 일치)
      previousScore: previous.score,
      scoreIncrease,
      percentageIncrease: Math.round(percentageIncrease * 10) / 10, // 소수점 1자리
      comparisonDate,
      xUrl: `https://x.com/${current.username}`,
    });
  }

  // 3. 2-tier 정렬: 1) rankImprovement DESC, 2) scoreIncrease DESC
  climbers.sort((a, b) => {
    if (a.rankImprovement !== b.rankImprovement) {
      return b.rankImprovement - a.rankImprovement; // 순위 상승폭 큰 순서
    }
    return b.scoreIncrease - a.scoreIncrease; // 점수 증가량 큰 순서
  });

  // 4. 상위 N명만 반환
  return climbers.slice(0, limit);
}

/**
 * Lambda Handler
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // 1. Path Parameters 추출
    const period = (event.pathParameters?.period?.toUpperCase() || 'CUMULATIVE') as LeaderboardPeriod;

    // 2. Query Parameters 추출
    const timeRange = (event.queryStringParameters?.timeRange || 'today') as TimeRange;
    const limit = parseInt(event.queryStringParameters?.limit || '5', 10);

    // 3. 검증: Period
    if (!['CUMULATIVE', 'EVENT1', 'EVENT2', 'EVENT3'].includes(period)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Invalid period: ${period}. Must be one of: CUMULATIVE, EVENT1, EVENT2, EVENT3`,
          code: 'INVALID_PERIOD',
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as TopClimbersResponse),
      };
    }

    // 4. 검증: TimeRange
    if (!['today', '7d', '4w', '3m'].includes(timeRange)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Invalid timeRange: ${timeRange}. Must be one of: today, 7d, 4w, 3m`,
          code: 'INVALID_TIME_RANGE',
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as TopClimbersResponse),
      };
    }

    // 5. 검증: EVENT 리더보드는 4w, 3m 지원 안 함
    if ((period === 'EVENT1' || period === 'EVENT2' || period === 'EVENT3') && (timeRange === '4w' || timeRange === '3m')) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Event leaderboards only support timeRange: today, 7d`,
          code: 'INVALID_TIME_RANGE_FOR_EVENT',
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as TopClimbersResponse),
      };
    }

    console.log(`🏆 [getTopClimbers] Top Climbers 조회 시작:`, {
      period,
      timeRange,
      limit,
    });

    const config = getEnvConfigV2();
    const leaderboardService = new LeaderboardService(ddbClient, config);

    // 6. 현재 리더보드 조회 (전체)
    const currentResult = await leaderboardService.getLeaderboard(
      period,
      1, // page
      500 // 전체 조회 (현재 사용자 수가 ~200명이므로 충분)
    );

    if (!currentResult.success || !currentResult.data) {
      console.error(`❌ [getTopClimbers] 현재 리더보드 조회 실패:`, currentResult.error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch current leaderboard',
          code: 'CURRENT_FETCH_FAILED',
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as TopClimbersResponse),
      };
    }

    // 7. 비교 날짜 계산 및 이전 스냅샷 조회
    const comparisonDate = calculateComparisonDate(timeRange);
    console.log(`📅 [getTopClimbers] 비교 날짜: ${comparisonDate}`);

    const previousResult = await leaderboardService.getLeaderboardSnapshot(
      period,
      comparisonDate,
      1,
      500
    );

    // 이전 스냅샷이 없을 수 있음 (첫날, 또는 스냅샷 미생성)
    const previousEntries = previousResult.success && previousResult.data
      ? previousResult.data.entries
      : [];

    console.log(`📊 [getTopClimbers] 데이터 조회 완료:`, {
      current: currentResult.data.entries.length,
      previous: previousEntries.length,
    });

    // 8. 이전 데이터가 없으면 빈 배열 반환
    if (previousEntries.length === 0) {
      console.warn(`⚠️ [getTopClimbers] 이전 스냅샷 없음: ${comparisonDate}`);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          version: 'v2',
          data: {
            period,
            timeRange,
            comparisonDate,
            climbers: [],
            metadata: {
              totalUsers: currentResult.data.entries.length,
              totalClimbers: 0,
              averageImprovement: 0,
            },
          },
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as TopClimbersResponse),
      };
    }

    // 9. Top Climbers 계산
    const topClimbers = calculateRankChanges(
      currentResult.data.entries,
      previousEntries,
      comparisonDate,
      limit
    );

    // 10. 메타데이터 계산
    const totalClimbers = topClimbers.length;
    const averageImprovement = totalClimbers > 0
      ? topClimbers.reduce((sum, c) => sum + c.rankImprovement, 0) / totalClimbers
      : 0;

    const duration = Date.now() - startTime;

    console.log(`✅ [getTopClimbers] Top Climbers 계산 완료:`, {
      period,
      timeRange,
      climbers: totalClimbers,
      averageImprovement: Math.round(averageImprovement * 10) / 10,
      duration: `${duration}ms`,
    });

    // 11. 응답 반환
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        version: 'v2',
        data: {
          period,
          timeRange,
          comparisonDate,
          climbers: topClimbers,
          metadata: {
            totalUsers: currentResult.data.entries.length,
            totalClimbers,
            averageImprovement: Math.round(averageImprovement * 10) / 10,
          },
        },
        processingTimeMs: duration,
        timestamp: new Date().toISOString(),
      } as TopClimbersResponse),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`❌ [getTopClimbers] 예외 발생 (${duration}ms):`, error);

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        processingTimeMs: duration,
        timestamp: new Date().toISOString(),
      } as TopClimbersResponse),
    };
  }
};
