/**
 * verify-eligibility Lambda Handler
 *
 * @description
 * X API를 사용하여 사용자의 참여 자격을 검증합니다:
 * 1. @Nasun_io 팔로우 여부
 * 2. 특정 트윗 좋아요 여부
 * 3. 특정 트윗 리트윗 여부
 *
 * Rate Limit 최적화:
 * - lastCheckedAt가 15분 이내이고 completed: true인 경우 X API skip
 * - API 호출 75% 절감 효과
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  VerifyEligibilityRequest,
  VerifyEligibilityResponse,
  NftEventEnv,
  ErrorCode,
  NftEventError,
} from './types';
import { VerificationService } from './services/verificationService';
import { handleError } from './utils/errorHandler';

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  TASKS_TABLE_NAME: process.env.TASKS_TABLE_NAME!,
  X_API_BEARER_TOKEN: process.env.X_API_BEARER_TOKEN!,
  X_TARGET_USERNAME: process.env.X_TARGET_USERNAME || 'Nasun_io',
  X_TARGET_USER_ID: process.env.X_TARGET_USER_ID || '1863020068785004544',
  X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID!,
  ENABLE_RATE_LIMIT_CACHE: process.env.ENABLE_RATE_LIMIT_CACHE || 'true',
  CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES || '15',
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[verify-eligibility] Event:', JSON.stringify(event, null, 2));

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    const request: VerifyEligibilityRequest = JSON.parse(event.body);

    // 2. 입력 검증
    validateRequest(request);

    // 3. Access Token 우선순위 결정: User Access Token > App Bearer Token
    const accessToken = (request as any).xAccessToken || env.X_API_BEARER_TOKEN;
    const isUserContextAuth = Boolean((request as any).xAccessToken);

    console.log('[verify-eligibility] Using OAuth:', {
      isUserContextAuth,
      hasUserToken: Boolean((request as any).xAccessToken),
    });

    // 4. VerificationService 초기화
    const verificationService = new VerificationService({
      xApiConfig: {
        bearerToken: accessToken, // User Access Token 또는 App Bearer Token
        targetUserId: env.X_TARGET_USER_ID, // Naru010110의 User ID (1863020068785004544)
        targetTweetId: env.X_TARGET_TWEET_ID,
        isUserContext: isUserContextAuth, // User Context OAuth 여부
      },
      tasksTableName: env.TASKS_TABLE_NAME,
    });

    console.log('[verify-eligibility] Starting verification for:', {
      walletAddress: request.walletAddress,
      xUserId: request.xUserId,
      xUsername: request.xUsername,
      isUserContextAuth,
    });

    // 5. X API 검증 및 태스크 상태 저장
    const response = await verificationService.verifyAllTasks(
      request.xUserId,
      request.walletAddress,
      request.xUsername
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[verify-eligibility] Error:', error);

    // 표준화된 에러 핸들러 사용
    return handleError(error, {
      handler: 'verify-eligibility',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * 요청 입력 검증
 */
function validateRequest(request: VerifyEligibilityRequest): void {
  // walletAddress는 Ethereum 주소 또는 xUserId (임시 키) 형식 허용
  const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(request.walletAddress);
  const isXUserId = /^\d+$/.test(request.walletAddress);

  if (!request.walletAddress || (!isEthereumAddress && !isXUserId)) {
    throw new NftEventError(
      'Invalid wallet address (must be Ethereum address or X User ID)',
      ErrorCode.INVALID_WALLET_ADDRESS,
      400
    );
  }

  if (!request.xUserId || !/^\d+$/.test(request.xUserId)) {
    throw new NftEventError('Invalid X User ID', ErrorCode.INVALID_X_USER_ID, 400);
  }

  if (!request.xUsername || request.xUsername.trim() === '') {
    throw new NftEventError('Invalid X Username', ErrorCode.INVALID_X_USERNAME, 400);
  }
}
