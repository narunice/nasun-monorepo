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
import { getBearerToken } from './utils/bearer-token';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  TASKS_TABLE_NAME: process.env.TASKS_TABLE_NAME!,
  X_TARGET_USERNAME: process.env.X_TARGET_USERNAME || 'Nasun_io',
  X_TARGET_USER_ID: process.env.X_TARGET_USER_ID || '1725466995565752320',
  X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID!,
  ENABLE_RATE_LIMIT_CACHE: process.env.ENABLE_RATE_LIMIT_CACHE || 'true',
  CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES || '15',
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[verify-eligibility] Request:', { httpMethod: event.httpMethod, path: event.path, queryParams: event.queryStringParameters });
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    const request: VerifyEligibilityRequest = JSON.parse(event.body);

    // 2. 입력 검증
    validateRequest(request);

    // 3. Retrieve User Access Token from server-side DynamoDB (never from request body)
    let xAccessToken: string | undefined;
    try {
      const ddbClient = new DynamoDBClient({ region: env.AWS_REGION });
      const docClient = DynamoDBDocumentClient.from(ddbClient);
      const tokenResult = await docClient.send(new GetCommand({
        TableName: env.TASKS_TABLE_NAME,
        Key: {
          walletAddress: '__X_TOKEN_STORE__',
          taskType: request.xUserId,
        },
      }));
      if (tokenResult.Item?.xAccessToken) {
        const now = Math.floor(Date.now() / 1000);
        if (!tokenResult.Item.expiresAt || tokenResult.Item.expiresAt > now) {
          xAccessToken = tokenResult.Item.xAccessToken;
        } else {
          console.log('[verify-eligibility] Stored X token expired, cleaning up');
          await docClient.send(new DeleteCommand({
            TableName: env.TASKS_TABLE_NAME,
            Key: { walletAddress: '__X_TOKEN_STORE__', taskType: request.xUserId },
          }));
        }
      }
    } catch (tokenErr: any) {
      console.warn('[verify-eligibility] Failed to retrieve stored X token:', tokenErr?.message);
    }

    console.log('[verify-eligibility] OAuth context:', {
      hasUserToken: Boolean(xAccessToken),
    });

    // 4. VerificationService — always uses App Bearer Token for base client
    //    User Context (xAccessToken) is passed to verifyAllTasks for Tier 3
    const bearerToken = await getBearerToken();
    const verificationService = new VerificationService({
      xApiConfig: {
        bearerToken,
        targetUserId: env.X_TARGET_USER_ID,
        targetTweetId: env.X_TARGET_TWEET_ID,
      },
      tasksTableName: env.TASKS_TABLE_NAME,
    });

    console.log('[verify-eligibility] Starting 3-tier verification for:', {
      walletAddress: request.walletAddress,
      xUserId: request.xUserId,
      xUsername: request.xUsername,
      hasUserToken: Boolean(xAccessToken),
    });

    // 5. 3-Tier verification: Task Cache → Engagement Cache → User Context API
    const response = await verificationService.verifyAllTasks(
      request.xUserId,
      request.walletAddress,
      request.xUsername,
      xAccessToken
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
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
    }, origin);
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

  if (!request.xUsername || request.xUsername.trim() === '' || request.xUsername.length > 50) {
    throw new NftEventError('Invalid X Username', ErrorCode.INVALID_X_USERNAME, 400);
  }
}
