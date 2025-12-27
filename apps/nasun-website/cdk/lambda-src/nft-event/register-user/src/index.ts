/**
 * register-user Lambda Handler
 *
 * @description
 * 검증이 완료된 사용자를 NFT 화이트리스트에 등록합니다:
 * 1. 모든 작업(팔로우/좋아요/리트윗) 완료 확인
 * 2. 중복 등록 방지 (xUserId GSI 조회)
 * 3. NftWhitelist 테이블에 등록
 * 4. engagementScore 초기화 (기본값: 0)
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  RegisterUserRequest,
  RegisterUserResponse,
  NftEventEnv,
  ErrorCode,
  NftEventError,
} from './types';
import { WhitelistService } from './services/whitelistService';
import { TaskTracker } from './services/taskTracker';

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  TASKS_TABLE_NAME: process.env.TASKS_TABLE_NAME!,
  X_API_BEARER_TOKEN: process.env.X_API_BEARER_TOKEN!,
  X_TARGET_USERNAME: process.env.X_TARGET_USERNAME || 'Nasun_io',
  X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID!,
  ENABLE_RATE_LIMIT_CACHE: process.env.ENABLE_RATE_LIMIT_CACHE || 'true',
  CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES || '15',
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[register-user] Event:', JSON.stringify(event, null, 2));

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    const request: RegisterUserRequest = JSON.parse(event.body);

    // 2. 입력 검증
    validateRequest(request);

    // 3. 서비스 초기화
    const whitelistService = new WhitelistService(env.WHITELIST_TABLE_NAME);
    const taskTracker = new TaskTracker(env.TASKS_TABLE_NAME);

    // 4. 모든 작업 완료 확인 (EventTasks 조회)
    // Step 3에서 xUserId로 태스크를 저장했으므로, xUserId로 조회
    console.log(`[register-user] Checking task completion for xUserId: ${request.xUserId}`);
    const allTasksCompleted = await taskTracker.areAllTasksCompleted(request.xUserId);

    if (!allTasksCompleted) {
      throw new NftEventError(
        'Not all tasks are completed',
        ErrorCode.TASKS_NOT_COMPLETED,
        400
      );
    }

    // 5. xUserId로 저장된 태스크를 실제 walletAddress로 복사
    console.log(`[register-user] Copying tasks from ${request.xUserId} to ${request.walletAddress}`);
    await taskTracker.copyTasks(request.xUserId, request.walletAddress, request.xUsername);

    // 5. 중복 등록 방지 (지갑 주소 및 X User ID 확인)
    console.log(`[register-user] Checking for duplicates`);
    const isDuplicate = await whitelistService.checkDuplicate(
      request.walletAddress,
      request.xUserId
    );

    if (isDuplicate) {
      // 이미 등록된 경우 기존 정보 반환 (Idempotent)
      const existing = await whitelistService.findByWalletAddress(request.walletAddress);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        },
        body: JSON.stringify({
          success: true,
          registered: true,
          whitelist: existing,
          message: '이미 등록된 지갑 주소입니다.',
        } as RegisterUserResponse),
      };
    }

    // 6. 화이트리스트 등록
    console.log(`[register-user] Registering user to whitelist`);
    const whitelist = await whitelistService.registerUser(request);

    const response: RegisterUserResponse = {
      success: true,
      registered: true,
      whitelist,
      message: '화이트리스트 등록이 완료되었습니다.',
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[register-user] Error:', error);

    if (error instanceof NftEventError) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          registered: false,
          message: error.message,
        } as RegisterUserResponse),
      };
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        registered: false,
        message: 'Internal server error',
      } as RegisterUserResponse),
    };
  }
};

/**
 * 요청 입력 검증
 */
function validateRequest(request: RegisterUserRequest): void {
  if (!request.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
    throw new NftEventError('Invalid wallet address', ErrorCode.INVALID_WALLET_ADDRESS, 400);
  }

  if (!request.xUserId || !/^\d+$/.test(request.xUserId)) {
    throw new NftEventError('Invalid X User ID', ErrorCode.INVALID_X_USER_ID, 400);
  }

  if (!request.xUsername || request.xUsername.trim() === '') {
    throw new NftEventError('Invalid X Username', ErrorCode.INVALID_X_USERNAME, 400);
  }
}
