/**
 * Withdraw from Whitelist Lambda Handler
 * POST /api/whitelist/withdraw
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse, corsHeaders } from '@/utils/response';
import { normalizeAddress } from '@/utils/ethereum';
import { getWhitelistItem, updateWhitelistItem } from '@/utils/dynamodb';
import { WithdrawRequest } from '@/types/whitelist';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Withdraw Whitelist Request:', JSON.stringify(event, null, 2));

  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // OPTIONS 요청 처리 (CORS Preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(requestOrigin),
      body: ''
    };
  }

  try {
    // 1. 요청 본문 파싱
    if (!event.body) {
      return errorResponse('INVALID_REQUEST', 'Request body is required', 400, undefined, requestOrigin);
    }

    const body: WithdrawRequest = JSON.parse(event.body);

    // 2. 지갑 주소 검증
    if (!body.walletAddress || !/^0x[a-fA-F0-9]{40}$/i.test(body.walletAddress)) {
      return errorResponse('INVALID_INPUT', 'Invalid wallet address', 400, undefined, requestOrigin);
    }

    // 3. 지갑 주소 정규화
    const walletAddress = normalizeAddress(body.walletAddress);

    console.log('[withdraw] Wallet address validated:', walletAddress);

    // 4. 존재 확인
    const existingItem = await getWhitelistItem(walletAddress);
    if (!existingItem || existingItem.status !== 'ACTIVE') {
      console.log('Not found or already withdrawn:', walletAddress);
      return errorResponse(
        'NOT_FOUND',
        'This wallet address is not registered',
        404,
        undefined,
        requestOrigin
      );
    }

    // 5. Soft Delete (withdrawnAt 설정)
    const withdrawnAt = new Date().toISOString();
    await updateWhitelistItem(walletAddress, withdrawnAt);

    console.log('Successfully withdrawn from whitelist:', walletAddress);

    // 6. 성공 응답
    return successResponse(
      {
        walletAddress,
        withdrawnAt
      },
      200,
      requestOrigin
    );
  } catch (error: any) {
    console.error('Withdraw whitelist error:', error);

    // Not found 에러 처리
    if (error.message === 'NOT_FOUND') {
      return errorResponse(
        'NOT_FOUND',
        'This wallet address is not registered',
        404,
        undefined,
        requestOrigin
      );
    }

    // 기타 에러
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to withdraw from whitelist. Please try again.',
      500,
      undefined,
      requestOrigin
    );
  }
}
