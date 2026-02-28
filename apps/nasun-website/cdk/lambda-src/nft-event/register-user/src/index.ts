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

import { createHmac, timingSafeEqual } from 'crypto';
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
import { getWalletProofSecret } from './utils/wallet-proof';

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
  X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID!,
  ENABLE_RATE_LIMIT_CACHE: process.env.ENABLE_RATE_LIMIT_CACHE || 'true',
  CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES || '15',
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[register-user] Request:', { httpMethod: event.httpMethod, path: event.path });
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    const request: RegisterUserRequest = JSON.parse(event.body);

    // 2. 입력 검증
    validateRequest(request);

    // 2.5. HMAC wallet proof validation (from MetaMask verify Lambda)
    const walletProofSecret = await getWalletProofSecret();
    validateWalletProof(request.walletAddress, request.walletProof, request.proofIssuedAt, walletProofSecret);

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

    // 6. 중복 등록 방지 (지갑 주소 및 X User ID 확인)
    console.log(`[register-user] Checking for duplicates`);
    const isDuplicate = await whitelistService.checkDuplicate(
      request.walletAddress,
      request.xUserId
    );

    if (isDuplicate) {
      // Check if duplicate is by wallet (idempotent) or by X account (upsert)
      const existingByWallet = await whitelistService.findByWalletAddress(request.walletAddress);

      if (existingByWallet && existingByWallet.status !== 'WITHDRAWN') {
        // Check if same X account (idempotent) or different X account (conflict)
        if (existingByWallet.xUserId !== request.xUserId) {
          throw new NftEventError(
            'This wallet address is already registered to a different X account.',
            ErrorCode.ALREADY_REGISTERED,
            409,
          );
        }

        // Idempotent: same wallet + same X registering again — return existing record
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCorsOrigin(origin),
            'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
          },
          body: JSON.stringify({
            success: true,
            registered: true,
            whitelist: existingByWallet,
            message: '이미 등록된 지갑 주소입니다.',
          } as RegisterUserResponse),
        };
      }

      // Different wallet, same X account → upsert (replace old wallet with new)
      const existingByX = await whitelistService.findByXUserId(request.xUserId);

      if (existingByX) {
        // Guard: reject if NFT was already minted — wallet changes no longer allowed
        if (existingByX.mintedAt) {
          throw new NftEventError(
            'This X account has already minted an NFT. Wallet changes are no longer allowed.',
            ErrorCode.ALREADY_MINTED,
            409,
          );
        }

        // Upsert: register new wallet first (PUT), then delete old record (DELETE).
        // PUT-before-DELETE prevents data loss on partial failure.
        console.log(`[register-user] Upsert: replacing wallet ${existingByX.walletAddress} → ${request.walletAddress}`);

        let whitelist;
        try {
          whitelist = await whitelistService.registerUser(request);
        } catch (regErr: any) {
          // New wallet is already registered to a different X account
          if (regErr.message?.includes('ALREADY_REGISTERED')) {
            throw new NftEventError(
              'This wallet address is already registered to a different X account.',
              ErrorCode.ALREADY_REGISTERED,
              409,
            );
          }
          throw regErr;
        }

        // Best-effort delete: new record is already saved, so return success even if delete fails.
        // An orphaned old record is detectable and recoverable; data loss is not.
        try {
          await whitelistService.deleteByWalletAddress(existingByX.walletAddress);
          console.log(`[register-user] Upsert complete: old record deleted`);
        } catch (delErr) {
          console.error(`[register-user] Upsert: failed to delete old record ${existingByX.walletAddress}. Orphaned record may exist.`, delErr);
        }

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getCorsOrigin(origin),
            'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
          },
          body: JSON.stringify({
            success: true,
            registered: true,
            whitelist,
            message: '지갑 주소가 업데이트되었습니다.',
          } as RegisterUserResponse),
        };
      }
    }

    // 7. 화이트리스트 등록
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
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
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
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
        },
        body: JSON.stringify({
          success: false,
          registered: false,
          message: error.message,
          code: error.code,
        }),
      };
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
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

  if (!request.xUsername || request.xUsername.trim() === '' || request.xUsername.length > 50) {
    throw new NftEventError('Invalid X Username', ErrorCode.INVALID_X_USERNAME, 400);
  }

  if (!request.walletProof || !request.proofIssuedAt) {
    throw new NftEventError('Missing wallet proof', ErrorCode.INVALID_SIGNATURE, 400);
  }
}

const PROOF_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Validate HMAC wallet proof token issued by MetaMask verify Lambda.
 * Proves the caller completed wallet ownership verification within the time window.
 */
function validateWalletProof(walletAddress: string, proof: string, issuedAt: string, secret: string): void {
  // Format validation: HMAC-SHA256 hex is always 64 chars
  if (!/^[a-f0-9]{64}$/.test(proof)) {
    throw new NftEventError('Invalid wallet proof format', ErrorCode.INVALID_SIGNATURE, 400);
  }

  const age = Date.now() - new Date(issuedAt).getTime();
  if (isNaN(age) || age < 0 || age > PROOF_MAX_AGE_MS) {
    throw new NftEventError('Wallet proof expired', ErrorCode.SIGNATURE_EXPIRED, 401);
  }

  const expected = createHmac('sha256', secret)
    .update(`${walletAddress.toLowerCase()}:${issuedAt}`)
    .digest('hex');

  const proofBuf = Buffer.from(proof);
  const expectedBuf = Buffer.from(expected);

  if (proofBuf.length !== expectedBuf.length || !timingSafeEqual(proofBuf, expectedBuf)) {
    throw new NftEventError('Invalid wallet proof', ErrorCode.INVALID_SIGNATURE, 401);
  }

  console.log('[register-user] Wallet proof validated:', `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
}
