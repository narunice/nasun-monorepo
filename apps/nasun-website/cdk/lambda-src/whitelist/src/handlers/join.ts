/**
 * Join Whitelist Lambda Handler
 * POST /api/whitelist/join
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse, corsHeaders } from '@/utils/response';
import { validateJoinRequest } from '@/utils/validation';
import { verifyWhitelistSignature, normalizeAddress, validateMessageFormat } from '@/utils/ethereum';
import { getWhitelistItem, putWhitelistItem, reactivateWhitelistItem } from '@/utils/dynamodb';
import { logInfo, logError } from '@/utils/logger';
import { JoinRequest, WhitelistItem } from '@/types/whitelist';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logInfo('join_whitelist_request', {
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
    // 1. 요청 본문 파싱
    if (!event.body) {
      return errorResponse('INVALID_REQUEST', 'Request body is required', 400, undefined, requestOrigin);
    }

    const body: JoinRequest = JSON.parse(event.body);

    // 2. 입력 검증
    const validation = validateJoinRequest(body);
    if (!validation.valid) {
      return errorResponse('INVALID_INPUT', validation.error || 'Invalid input', 400, undefined, requestOrigin);
    }

    // 3. 지갑 주소 정규화
    const walletAddress = normalizeAddress(body.walletAddress);

    // 4. 메시지 포맷 검증
    if (!validateMessageFormat(body.message, body.timestamp, 'join')) {
      return errorResponse(
        'INVALID_MESSAGE_FORMAT',
        'Message format does not match expected format',
        400,
        undefined,
        requestOrigin
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
        400,
        undefined,
        requestOrigin
      );
    }

    // 6. 중복 체크 및 재등록 처리
    const existingItem = await getWhitelistItem(walletAddress);

    // 6-1. ACTIVE 상태: 이미 등록됨
    if (existingItem && existingItem.status === 'ACTIVE') {
      logInfo('already_registered', { walletAddress });
      return errorResponse(
        'ALREADY_REGISTERED',
        'This wallet address is already registered',
        409,
        {
          walletAddress,
          joinedAt: existingItem.joinedAt
        },
        requestOrigin
      );
    }

    // 6-2. WITHDRAWN 상태: 재등록 허용 (UPDATE)
    const now = new Date().toISOString();

    if (existingItem && existingItem.status === 'WITHDRAWN') {
      logInfo('reregistering_withdrawn_wallet', { walletAddress });
      // WITHDRAWN 상태에서 재등록: UPDATE (withdrawnAt 제거)
      await reactivateWhitelistItem(walletAddress, body.signature, body.message, body.timestamp, now);
    } else {
      // 7. 신규 등록: PUT
      const item: WhitelistItem = {
        walletAddress,
        signature: body.signature,
        message: body.message,
        timestamp: body.timestamp,
        joinedAt: now,
        status: 'ACTIVE'
      };
      await putWhitelistItem(item);
    }

    logInfo('join_whitelist_success', { walletAddress });

    // 8. 성공 응답
    return successResponse(
      {
        walletAddress,
        joinedAt: now
      },
      200,
      requestOrigin
    );
  } catch (error: any) {
    logError('join_whitelist_error', error);

    // 중복 등록 에러 처리
    if (error.message === 'ALREADY_REGISTERED') {
      return errorResponse(
        'ALREADY_REGISTERED',
        'This wallet address is already registered',
        409,
        undefined,
        requestOrigin
      );
    }

    // 기타 에러
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to join whitelist. Please try again.',
      500,
      undefined,
      requestOrigin
    );
  }
}
