/**
 * 🆕 Phase 1: User Rank Search - Get User Rank Handler
 *
 * API Endpoint: GET /leaderboard/{period}/user/{username}
 *
 * @description
 * 특정 사용자의 현재 랭킹 정보를 조회하는 Lambda 핸들러입니다.
 *
 * @example
 * GET /leaderboard/cumulative/user/johndoe
 * GET /leaderboard/event1/user/@alice?date=2025-10-21
 *
 * @returns UserRankResponse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LeaderboardService } from '../../services/leaderboard-service';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardPeriod, UserRankResponse } from '../../types/leaderboard';

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
  console.log('🔍 [get-user-rank] 요청 시작', {
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  });

  try {
    // 1. Path Parameters 추출
    const period = event.pathParameters?.period?.toUpperCase() as LeaderboardPeriod;
    const username = event.pathParameters?.username;

    if (!period || !username) {
      const errorResponse: UserRankResponse = {
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
    const date = event.queryStringParameters?.date; // 옵션: YYYY-MM-DD 형식

    // 3. Period 유효성 검증
    if (!Object.values(LeaderboardPeriod).includes(period)) {
      const errorResponse: UserRankResponse = {
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

    // 4. 사용자 랭킹 조회
    const userRankData = await leaderboardService.getUserRank(period, username, date);

    if (!userRankData) {
      const errorResponse: UserRankResponse = {
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

    // 5. 성공 응답
    const successResponse: UserRankResponse = {
      success: true,
      data: userRankData,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log('✅ [get-user-rank] 조회 성공', {
      username: userRankData.username,
      rank: userRankData.rank,
      processingTimeMs: successResponse.processingTimeMs
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(successResponse)
    };

  } catch (error) {
    console.error('❌ [get-user-rank] 에러 발생:', error);

    const errorResponse: UserRankResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse)
    };
  }
};
