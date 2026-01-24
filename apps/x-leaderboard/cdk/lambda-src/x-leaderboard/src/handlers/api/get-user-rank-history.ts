/**
 * My Account Rank History - Get User Rank History Handler
 *
 * API Endpoint: GET /leaderboard/{period}/user/{username}/history?days=7
 *
 * @description
 * 특정 사용자의 랭킹 히스토리를 조회하는 Lambda 핸들러입니다.
 * 일자별 순위 변화와 통계를 제공합니다.
 *
 * @example
 * GET /leaderboard/cumulative/user/johndoe/history?days=7
 * GET /leaderboard/event1/user/@alice/history?days=30
 *
 * @returns RankHistoryResponse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LeaderboardService } from '../../services/leaderboard-service';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardPeriod, RankHistoryResponse, RankHistoryEntry } from '../../types/leaderboard';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const config = getEnvConfigV2();
const leaderboardService = new LeaderboardService(ddbClient, config);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  console.log('📊 [get-user-rank-history] 요청 시작', {
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  });

  try {
    // 1. Path Parameters 추출
    const period = event.pathParameters?.period?.toUpperCase() as LeaderboardPeriod;
    const username = event.pathParameters?.username;

    if (!period || !username) {
      const errorResponse: RankHistoryResponse = {
        success: false,
        error: 'Missing required parameters: period and username',
        code: 'MISSING_PARAMETERS',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 2. Query Parameters 추출
    const days = parseInt(event.queryStringParameters?.days || '7');

    // 3. Period 유효성 검증
    if (!Object.values(LeaderboardPeriod).includes(period)) {
      const errorResponse: RankHistoryResponse = {
        success: false,
        error: `Invalid period: ${period}. Must be one of: ${Object.values(LeaderboardPeriod).join(', ')}`,
        code: 'INVALID_PERIOD',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 4. Days 유효성 검증
    if (isNaN(days) || days < 1 || days > 365) {
      const errorResponse: RankHistoryResponse = {
        success: false,
        error: 'Invalid days parameter. Must be between 1 and 365',
        code: 'INVALID_DAYS',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 5. Username을 userId로 변환 (getUserRank 사용)
    const userRankData = await leaderboardService.getUserRank(period, username);

    if (!userRankData) {
      const errorResponse: RankHistoryResponse = {
        success: false,
        error: `User not found: ${username}`,
        code: 'USER_NOT_FOUND',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 6. 날짜 범위 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1); // days일 전부터 오늘까지

    const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log('📅 [get-user-rank-history] 날짜 범위 계산', {
      days,
      startDate: startDateStr,
      endDate: endDateStr,
      userId: userRankData.entry.userId
    });

    // 7. 랭킹 히스토리 조회
    const history = await leaderboardService.getUserRankHistory(
      userRankData.entry.userId,
      period,
      startDateStr,
      endDateStr
    );

    if (history.length === 0) {
      const errorResponse: RankHistoryResponse = {
        success: false,
        error: 'No ranking history found for this user in the specified date range',
        code: 'NO_HISTORY',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 8. 통계 계산
    const stats = calculateStats(history, userRankData.rank);

    // 9. 성공 응답
    const successResponse: RankHistoryResponse = {
      success: true,
      data: {
        history,
        stats
      },
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log('✅ [get-user-rank-history] 조회 성공', {
      username,
      historyCount: history.length,
      stats,
      processingTimeMs: successResponse.processingTimeMs
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(successResponse)
    };

  } catch (error) {
    console.error('❌ [get-user-rank-history] 에러 발생:', error);

    const errorResponse: RankHistoryResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify(errorResponse)
    };
  }
};

/**
 * 랭킹 히스토리 통계 계산
 */
function calculateStats(history: RankHistoryEntry[], currentRank: number) {
  if (history.length === 0) {
    return {
      bestRank: currentRank,
      worstRank: currentRank,
      averageRank: currentRank,
      currentRank,
      totalDays: 0,
      scoreIncrease: 0,
      rankImprovement: 0
    };
  }

  // 순위: 낮을수록 좋음 (1등이 최고)
  const ranks = history.map(h => h.rank);
  const scores = history.map(h => h.totalScore);

  const bestRank = Math.min(...ranks);
  const worstRank = Math.max(...ranks);
  const averageRank = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;

  const firstScore = scores[0];
  const lastScore = scores[scores.length - 1];
  const scoreIncrease = lastScore - firstScore;

  const firstRank = ranks[0];
  const lastRank = ranks[ranks.length - 1];
  const rankImprovement = firstRank - lastRank; // 양수면 순위 개선, 음수면 하락

  return {
    bestRank,
    worstRank,
    averageRank: Math.round(averageRank * 10) / 10, // 소수점 첫째자리
    currentRank,
    totalDays: history.length,
    scoreIncrease: Math.round(scoreIncrease * 100) / 100,
    rankImprovement
  };
}
