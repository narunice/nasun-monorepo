/**
 * check-registration-status Lambda Handler
 *
 * @description
 * 지갑 주소로 NFT Event 등록 상태를 조회합니다.
 * GET /event/status?walletAddress=0x...
 *
 * @features
 * - 지갑 주소 검증 (Ethereum 주소 형식)
 * - DynamoDB 조회 (NftWhitelist 테이블)
 * - 등록 여부 및 상세 정보 반환
 *
 * @author Claude Code
 * @date 2025-11-02
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { CheckStatusEnv, CheckStatusResponse, ErrorCode, NftEventError } from './types';
import { WhitelistService } from './services/whitelistService';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Lambda 환경 변수
 */
const env: CheckStatusEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[check-registration-status] Request:', { httpMethod: event.httpMethod, path: event.path, queryParams: event.queryStringParameters });
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    // 1. Query Parameters 파싱
    const walletAddress = event.queryStringParameters?.walletAddress;
    const xUserId = event.queryStringParameters?.xUserId;

    if (!walletAddress && !xUserId) {
      throw new NftEventError(
        'Missing walletAddress or xUserId query parameter',
        ErrorCode.INVALID_WALLET_ADDRESS,
        400
      );
    }

    // 2. 입력 형식 검증
    if (walletAddress) {
      validateWalletAddress(walletAddress);
    }
    if (xUserId && !/^\d+$/.test(xUserId)) {
      throw new NftEventError('Invalid X User ID format', ErrorCode.INVALID_WALLET_ADDRESS, 400);
    }

    // 3. WhitelistService 초기화
    const whitelistService = new WhitelistService(env.WHITELIST_TABLE_NAME);

    console.log('[check-registration-status] Checking registration for:', { walletAddress, xUserId });

    // 4. DynamoDB 조회 — walletAddress first, then xUserId fallback
    let whitelist = walletAddress
      ? await whitelistService.findByWalletAddress(walletAddress)
      : null;

    // Skip WITHDRAWN records from wallet lookup — fall through to xUserId
    // to find the user's current ACTIVE registration (wallet may have changed via upsert)
    if (whitelist?.status === 'WITHDRAWN') {
      whitelist = null;
    }

    if (!whitelist && xUserId) {
      whitelist = await whitelistService.findByXUserId(xUserId);
    }

    // 5. 응답 생성 (Soft delete: WITHDRAWN 상태는 미등록으로 처리)
    const isActive = whitelist !== null && whitelist.status !== 'WITHDRAWN';

    // Security: omit xUserId from public response to prevent enumeration attacks
    let sanitizedData = null;
    if (isActive && whitelist) {
      const { xUserId: _omit, ...rest } = whitelist;
      sanitizedData = rest;
    }

    const response: CheckStatusResponse = {
      success: true,
      registered: isActive,
      data: sanitizedData,
    };

    console.log('[check-registration-status] Response:', response);

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
    console.error('[check-registration-status] Error:', error);

    // NftEventError 처리
    if (error instanceof NftEventError) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
        },
        body: JSON.stringify({
          success: false,
          error: error.code,
          message: error.message,
        }),
      };
    }

    // 기타 에러 처리
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
      },
      body: JSON.stringify({
        success: false,
        error: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    };
  }
};

/**
 * 지갑 주소 형식 검증
 */
function validateWalletAddress(address: string): void {
  const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  if (!isEthereumAddress) {
    throw new NftEventError(
      'Invalid wallet address (must be Ethereum address)',
      ErrorCode.INVALID_WALLET_ADDRESS,
      400
    );
  }
}
