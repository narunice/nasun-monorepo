// Phase 2: 제외 계정 상태 확인 API 엔드포인트
// 현재 제외된 계정 목록 및 통계 조회

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAccountFilterService } from '../../services/account-filter-service';
import { isAdminUser } from '../../utils/excluded-accounts-utils';

/**
 * 제외 계정 상태 확인 API 응답 인터페이스
 */
interface ExcludedAccountsStatusResponse {
  success: boolean;
  data: {
    excludedUsernames: string[];
    excludedUserIds: string[];
    adminUsernames: string[];
    totalExcludedAccounts: number;
    lastConfigLoad: string;
    systemInfo: {
      configSource: 'environment_variables';
      exclusionMethod: 'soft_exclusion';
      dataPreservation: true;
      reversible: true;
    };
  };
  timestamp: string;
  processingTimeMs: number;
  message?: string;
}

/**
 * 제외 계정 상태 확인 API 핸들러
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  
  // CORS 헤더 설정
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONS 요청 처리 (CORS Preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    console.log('🔍 제외 계정 상태 확인 API 요청 시작');

    // 관리자 권한 확인 (선택사항 - 보안이 필요한 경우 활성화)
    const requestContext = event.requestContext;
    const sourceIp = requestContext.identity?.sourceIp;
    console.log('📡 요청 정보:', {
      httpMethod: event.httpMethod,
      sourceIp,
      userAgent: requestContext.identity?.userAgent
    });

    // AccountFilterService 인스턴스 가져오기
    const accountFilterService = getAccountFilterService();
    
    // 현재 제외 계정 설정 조회
    const config = accountFilterService.getExcludedAccountsConfig();
    if (!config) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Failed to load excluded accounts configuration',
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime
        })
      };
    }

    // 제외 계정 통계 조회
    const stats = accountFilterService.getExclusionStats();
    if (!stats) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Failed to load exclusion statistics',
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime
        })
      };
    }

    // 응답 데이터 구성
    const response: ExcludedAccountsStatusResponse = {
      success: true,
      data: {
        excludedUsernames: config.excludedUsernames,
        excludedUserIds: config.excludedUserIds,
        adminUsernames: config.adminUsernames,
        totalExcludedAccounts: config.excludedUsernames.length + config.excludedUserIds.length,
        lastConfigLoad: stats.lastConfigLoad,
        systemInfo: {
          configSource: 'environment_variables',
          exclusionMethod: 'soft_exclusion',
          dataPreservation: true,
          reversible: true
        }
      },
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      message: `Currently ${config.excludedUsernames.length + config.excludedUserIds.length} accounts are excluded from leaderboards`
    };

    console.log('✅ 제외 계정 상태 조회 완료:', {
      excludedUsernamesCount: config.excludedUsernames.length,
      excludedUserIdsCount: config.excludedUserIds.length,
      totalExcluded: config.excludedUsernames.length + config.excludedUserIds.length,
      processingTimeMs: response.processingTimeMs
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response, null, 2)
    };

  } catch (error: any) {
    console.error('❌ 제외 계정 상태 확인 API 오류:', error);

    const errorResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime
    };

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(errorResponse)
    };
  }
};