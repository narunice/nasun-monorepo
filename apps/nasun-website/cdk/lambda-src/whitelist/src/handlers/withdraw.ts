/**
 * Withdraw from Whitelist Lambda Handler
 * POST /api/whitelist/withdraw
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '@/utils/response';
import { validateWithdrawRequest } from '@/utils/validation';
import { verifyWhitelistSignature, normalizeAddress, validateMessageFormat } from '@/utils/ethereum';
import { getWhitelistItem, updateWhitelistItem } from '@/utils/dynamodb';
import { WithdrawRequest } from '@/types/whitelist';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Withdraw Whitelist Request:', JSON.stringify(event, null, 2));

  // OPTIONS 요청 처리 (CORS Preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // 1. 요청 본문 파싱
    if (!event.body) {
      return errorResponse('INVALID_REQUEST', 'Request body is required');
    }

    const body: WithdrawRequest = JSON.parse(event.body);

    // 2. 입력 검증
    const validation = validateWithdrawRequest(body);
    if (!validation.valid) {
      return errorResponse('INVALID_INPUT', validation.error || 'Invalid input', 400);
    }

    // 3. 지갑 주소 정규화
    const walletAddress = normalizeAddress(body.walletAddress);

    // 4. 메시지 포맷 검증
    if (!validateMessageFormat(body.message, body.timestamp, 'withdraw')) {
      return errorResponse(
        'INVALID_MESSAGE_FORMAT',
        'Message format does not match expected format',
        400
      );
    }

    // 5. 서명 검증
    const signatureCheck = verifyWhitelistSignature(
      walletAddress,
      body.message,
      body.signature
    );

    if (!signatureCheck.valid) {
      console.error('Signature verification failed:', signatureCheck.error);
      return errorResponse(
        'INVALID_SIGNATURE',
        signatureCheck.error || 'Signature verification failed',
        400
      );
    }

    // 6. 존재 확인
    const existingItem = await getWhitelistItem(walletAddress);
    if (!existingItem || existingItem.status !== 'ACTIVE') {
      console.log('Not found or already withdrawn:', walletAddress);
      return errorResponse(
        'NOT_FOUND',
        'This wallet address is not registered',
        404
      );
    }

    // 7. Soft Delete (withdrawnAt 설정)
    const withdrawnAt = new Date().toISOString();
    await updateWhitelistItem(walletAddress, withdrawnAt);

    console.log('Successfully withdrawn from whitelist:', walletAddress);

    // 8. 성공 응답
    return successResponse(
      {
        walletAddress,
        withdrawnAt
      },
      200
    );
  } catch (error: any) {
    console.error('Withdraw whitelist error:', error);

    // Not found 에러 처리
    if (error.message === 'NOT_FOUND') {
      return errorResponse(
        'NOT_FOUND',
        'This wallet address is not registered',
        404
      );
    }

    // 기타 에러
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to withdraw from whitelist. Please try again.',
      500
    );
  }
}
