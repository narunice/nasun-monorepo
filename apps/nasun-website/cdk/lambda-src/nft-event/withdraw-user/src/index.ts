/**
 * withdraw-user Lambda Handler
 *
 * @description
 * NFT Event 화이트리스트에서 사용자 참여를 취소합니다:
 * 1. MetaMask 서명 검증 (지갑 소유권 확인)
 * 2. 타임스탬프 검증 (5분 이내)
 * 3. NftWhitelist 테이블에서 status를 'WITHDRAWN'으로 업데이트
 *
 * @author Claude Code
 * @date 2025-11-01
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { ethers } from 'ethers';
import {
  WithdrawUserRequest,
  WithdrawUserResponse,
  NftEventEnv,
  ErrorCode,
  NftEventError,
} from './types';
import { WhitelistService } from './services/whitelistService';

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * CORS 헤더
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[withdraw-user] Event:', JSON.stringify(event, null, 2));

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    const request: WithdrawUserRequest = JSON.parse(event.body);

    // 2. 입력 검증
    validateRequest(request);

    // 3. MetaMask 서명 검증
    console.log('[withdraw-user] Verifying signature');
    const recoveredAddress = ethers.verifyMessage(request.message, request.signature);

    if (recoveredAddress.toLowerCase() !== request.walletAddress.toLowerCase()) {
      throw new NftEventError(
        'Invalid signature: Signer does not match wallet address',
        ErrorCode.INVALID_SIGNATURE,
        400
      );
    }

    console.log('[withdraw-user] Signature verified successfully');

    // 4. 타임스탬프 검증 (5분 이내)
    const signedAt = new Date(request.timestamp);
    const now = new Date();
    const diff = now.getTime() - signedAt.getTime();
    const MAX_AGE_MS = 5 * 60 * 1000; // 5분

    if (diff > MAX_AGE_MS) {
      throw new NftEventError(
        `Signature expired (${Math.floor(diff / 1000)}s old, max 300s)`,
        ErrorCode.SIGNATURE_EXPIRED,
        400
      );
    }

    if (diff < 0) {
      throw new NftEventError(
        'Invalid timestamp: Future timestamp not allowed',
        ErrorCode.SIGNATURE_EXPIRED,
        400
      );
    }

    console.log('[withdraw-user] Timestamp verified successfully');

    // 5. 화이트리스트에서 사용자 제거 (Soft Delete)
    const whitelistService = new WhitelistService(env.WHITELIST_TABLE_NAME);
    await whitelistService.withdrawUser(request.walletAddress);

    const response: WithdrawUserResponse = {
      success: true,
      message: 'Successfully withdrawn from whitelist',
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[withdraw-user] Error:', error);

    if (error instanceof NftEventError) {
      return {
        statusCode: error.statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          message: error.message,
          errorCode: error.code,
        } as WithdrawUserResponse & { errorCode: string }),
      };
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        errorCode: ErrorCode.INTERNAL_ERROR,
      } as WithdrawUserResponse & { errorCode: string }),
    };
  }
};

/**
 * 요청 입력 검증
 */
function validateRequest(request: WithdrawUserRequest): void {
  if (!request.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
    throw new NftEventError('Invalid wallet address', ErrorCode.INVALID_WALLET_ADDRESS, 400);
  }

  if (!request.signature || typeof request.signature !== 'string') {
    throw new NftEventError('Invalid signature', ErrorCode.INVALID_SIGNATURE, 400);
  }

  if (!request.message || typeof request.message !== 'string') {
    throw new NftEventError('Invalid message', ErrorCode.INVALID_SIGNATURE, 400);
  }

  if (!request.timestamp || isNaN(Date.parse(request.timestamp))) {
    throw new NftEventError('Invalid timestamp', ErrorCode.SIGNATURE_EXPIRED, 400);
  }
}
