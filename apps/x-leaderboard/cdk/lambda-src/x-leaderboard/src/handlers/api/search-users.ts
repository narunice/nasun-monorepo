/**
 * 🆕 Phase 1: User Rank Search - Search Users Handler
 *
 * API Endpoint: GET /leaderboard/{period}/search?q={query}
 *
 * @description
 * 리더보드에서 사용자를 검색하는 Lambda 핸들러입니다.
 * 하이브리드 검색 방식: 정확히 일치 우선 → 부분 일치 폴백
 *
 * @example
 * GET /leaderboard/cumulative/search?q=john
 * GET /leaderboard/event1/search?q=@alice&date=2025-10-21&limit=5
 *
 * @returns SearchResponse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LeaderboardService } from '../../services/leaderboard-service';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardPeriod, SearchResponse } from '../../types/leaderboard';

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
  console.log('🔍 [search-users] 요청 시작', {
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  });

  try {
    // 1. Path Parameters 추출
    const period = event.pathParameters?.period?.toUpperCase() as LeaderboardPeriod;

    if (!period) {
      const errorResponse: SearchResponse = {
        success: false,
        error: 'Missing required parameter: period',
        code: 'MISSING_PARAMETER',
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
    const query = event.queryStringParameters?.q || event.queryStringParameters?.query;
    const date = event.queryStringParameters?.date; // 옵션: YYYY-MM-DD 형식
    const limit = parseInt(event.queryStringParameters?.limit || '10', 10);

    if (!query) {
      const errorResponse: SearchResponse = {
        success: false,
        error: 'Missing required query parameter: q',
        code: 'MISSING_QUERY',
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify(errorResponse)
      };
    }

    // 3. Period 유효성 검증
    if (!Object.values(LeaderboardPeriod).includes(period)) {
      const errorResponse: SearchResponse = {
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

    // 4. 사용자 검색 실행
    const searchResultData = await leaderboardService.searchUsers(period, query, date, limit);

    // 5. 성공 응답
    const successResponse: SearchResponse = {
      success: true,
      data: searchResultData,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log('✅ [search-users] 검색 성공', {
      query,
      exactMatch: !!searchResultData.exactMatch,
      totalMatches: searchResultData.total,
      processingTimeMs: successResponse.processingTimeMs
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify(successResponse)
    };

  } catch (error) {
    console.error('❌ [search-users] 에러 발생:', error);

    const errorResponse: SearchResponse = {
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
