/**
 * withdraw-user Lambda Handler
 *
 * @description
 * NFT Event 화이트리스트에서 사용자 참여를 취소합니다:
 * 1. 지갑 주소 검증
 * 2. NftWhitelist 테이블에서 status를 'WITHDRAWN'으로 업데이트
 *
 * @author Claude Code
 * @date 2025-11-01
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  WithdrawUserRequest,
  WithdrawUserResponse,
  NftEventEnv,
  ErrorCode,
  NftEventError,
} from './types';
import { WhitelistService } from './services/whitelistService';
import { ethers } from 'ethers';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
}

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[withdraw-user] Request:', { method: event.httpMethod, path: event.path });
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = corsHeaders(origin);

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. 요청 파싱
    if (!event.body) {
      throw new NftEventError('Missing request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    let request: WithdrawUserRequest;
    try {
      request = JSON.parse(event.body);
    } catch {
      throw new NftEventError('Invalid JSON in request body', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    // 2. Input validation
    if (!request.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
      throw new NftEventError('Invalid wallet address', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    if (!request.signature || !request.message || !request.timestamp) {
      throw new NftEventError('signature, message, and timestamp are required', ErrorCode.INVALID_SIGNATURE, 400);
    }

    // 3. Verify signature is not expired (5-minute window, 30s forward tolerance for clock skew)
    const signedAt = new Date(request.timestamp).getTime();
    const age = Date.now() - signedAt;
    if (isNaN(signedAt) || age < -30_000 || age > 5 * 60 * 1000) {
      throw new NftEventError('Signature expired or invalid timestamp', ErrorCode.SIGNATURE_EXPIRED, 400);
    }

    // 4. Verify message content — prevent cross-action signature replay.
    // The signed message must contain the timestamp to bind it to this specific request.
    if (!request.message.includes(request.timestamp)) {
      throw new NftEventError('Signed message must contain the request timestamp', ErrorCode.INVALID_SIGNATURE, 400);
    }

    // 5. Verify MetaMask signature — proves caller owns the wallet
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(request.message, request.signature);
    } catch {
      throw new NftEventError('Invalid signature', ErrorCode.INVALID_SIGNATURE, 400);
    }

    if (recoveredAddress.toLowerCase() !== request.walletAddress.toLowerCase()) {
      throw new NftEventError('Signature does not match wallet address', ErrorCode.INVALID_SIGNATURE, 403);
    }

    console.log('[withdraw-user] Wallet ownership verified:', request.walletAddress);

    // 6. 화이트리스트에서 사용자 제거 (Soft Delete)
    const whitelistService = new WhitelistService(env.WHITELIST_TABLE_NAME);
    await whitelistService.withdrawUser(request.walletAddress);

    const response: WithdrawUserResponse = {
      success: true,
      message: 'Successfully withdrawn from whitelist',
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[withdraw-user] Error:', error);

    if (error instanceof NftEventError) {
      return {
        statusCode: error.statusCode,
        headers,
        body: JSON.stringify({
          success: false,
          message: error.message,
          errorCode: error.code,
        } as WithdrawUserResponse & { errorCode: string }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        errorCode: ErrorCode.INTERNAL_ERROR,
      } as WithdrawUserResponse & { errorCode: string }),
    };
  }
};
