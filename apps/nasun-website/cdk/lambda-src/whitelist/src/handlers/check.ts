/**
 * Check Whitelist Status Lambda Handler
 * GET /api/whitelist/check/:address
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse, corsHeaders } from '@/utils/response';
import { validateEthereumAddress } from '@/utils/validation';
import { normalizeAddress } from '@/utils/ethereum';
import { getWhitelistItem } from '@/utils/dynamodb';
import { CheckResponse } from '@/types/whitelist';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Check Whitelist Request:', {
    httpMethod: event.httpMethod,
    path: event.path,
  });

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
    // 1. Path parameter 또는 Query string에서 address 추출
    const address =
      event.pathParameters?.address ||
      event.queryStringParameters?.walletAddress;

    if (!address) {
      return errorResponse('INVALID_REQUEST', 'Wallet address is required', 400, undefined, requestOrigin);
    }

    // 2. 주소 검증
    if (!validateEthereumAddress(address)) {
      return errorResponse('INVALID_ADDRESS', 'Invalid wallet address format', 400, undefined, requestOrigin);
    }

    // 3. 주소 정규화
    const walletAddress = normalizeAddress(address);

    // 4. DynamoDB 조회
    const item = await getWhitelistItem(walletAddress);

    // 5. 응답 구성
    const response: CheckResponse = {
      registered: item ? item.status === 'ACTIVE' : false,
      walletAddress
    };

    if (item) {
      response.joinedAt = item.joinedAt;
      response.status = item.status;
    }

    console.log('Check result:', response);

    return successResponse(response, 200, requestOrigin);
  } catch (error: any) {
    console.error('Check whitelist error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to check whitelist status. Please try again.',
      500,
      undefined,
      requestOrigin
    );
  }
}
