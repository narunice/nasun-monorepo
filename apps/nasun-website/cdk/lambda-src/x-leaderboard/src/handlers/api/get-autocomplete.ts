/**
 * 🆕 Phase 3: User Rank Search - Get Autocomplete Suggestions Handler
 *
 * API Endpoint: GET /leaderboard/{period}/autocomplete?q={query}
 *
 * @description
 * 사용자 검색어에 대한 자동완성 제안을 제공하는 Lambda 핸들러입니다.
 * searchUsers API와 유사하지만, 더 빠른 응답을 위해 최적화되었습니다.
 *
 * @example
 * GET /leaderboard/cumulative/autocomplete?q=fal
 * → ["Fall2026", "Fallback123", "WaterfallX"]
 *
 * GET /leaderboard/event1/autocomplete?q=sun&limit=5
 * → ["SunyoungP29745", "SunriseKim", "SunsetPark"]
 *
 * @returns AutocompleteResponse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LeaderboardService } from '../../services/leaderboard-service';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardPeriod } from '../../types/leaderboard';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const config = getEnvConfigV2();
const leaderboardService = new LeaderboardService(ddbClient, config);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

interface AutocompleteResponse {
  success: boolean;
  suggestions?: string[];  // 사용자명 배열
  total?: number;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  console.log('🔍 [get-autocomplete] 요청 시작', {
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters
  });

  try {
    // 1. Path Parameters 추출
    const period = event.pathParameters?.period?.toUpperCase() as LeaderboardPeriod;

    if (!period) {
      const errorResponse: AutocompleteResponse = {
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
    const limit = parseInt(event.queryStringParameters?.limit || '10', 10);

    // 쿼리 길이 검증 (최소 2글자)
    if (!query || query.length < 2) {
      const errorResponse: AutocompleteResponse = {
        success: false,
        error: 'Query must be at least 2 characters long',
        code: 'QUERY_TOO_SHORT',
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
      const errorResponse: AutocompleteResponse = {
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

    // 4. 자동완성 제안 조회 (searchUsers 재사용)
    const searchResult = await leaderboardService.searchUsers(period, query, undefined, limit);

    // 5. 사용자명만 추출
    const suggestions = searchResult.matches.map(match => match.username);

    // 6. 성공 응답
    const successResponse: AutocompleteResponse = {
      success: true,
      suggestions,
      total: suggestions.length,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log('✅ [get-autocomplete] 조회 성공', {
      query,
      totalSuggestions: suggestions.length,
      processingTimeMs: successResponse.processingTimeMs
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(successResponse)
    };

  } catch (error) {
    console.error('❌ [get-autocomplete] 에러 발생:', error);

    const errorResponse: AutocompleteResponse = {
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
