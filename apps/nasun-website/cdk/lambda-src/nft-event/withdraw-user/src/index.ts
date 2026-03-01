/**
 * withdraw-user Lambda Handler
 *
 * @description
 * NFT Event 화이트리스트에서 사용자 참여를 취소합니다:
 * 1. 지갑 주소 + xUserId 검증 (레코드 소유권 확인)
 * 2. NftWhitelist 테이블에서 status를 'WITHDRAWN'으로 업데이트
 *
 * MetaMask 서명 기반 walletProof는 제거 — 모바일 UX 개선 목적.
 * 대신 walletAddress + xUserId 조합으로 레코드 소유권을 검증합니다.
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

    if (!request.xUserId || !/^\d+$/.test(request.xUserId)) {
      throw new NftEventError('Missing or invalid xUserId', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    // 3. Withdraw with xUserId ownership verification
    const whitelistService = new WhitelistService(env.WHITELIST_TABLE_NAME);
    await whitelistService.withdrawUser(request.walletAddress, request.xUserId);

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
