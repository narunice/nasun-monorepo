/**
 * Admin List Whitelist Lambda Handler
 * GET /api/admin/whitelist/list
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { successResponse, errorResponse } from '@/utils/response';
import { validateAdminApiKey } from '@/utils/auth';
import { queryByStatus, getStatistics, scanAllItems } from '@/utils/dynamodb';
import { WhitelistListRequest, WhitelistListResponse } from '@/types/whitelist';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Admin List Request:', JSON.stringify(event, null, 2));

  // OPTIONS 요청 처리 (CORS Preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // 1. API Key 검증
    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
    if (!validateAdminApiKey(apiKey)) {
      console.warn('Unauthorized access attempt');
      return errorResponse('UNAUTHORIZED', 'Invalid API Key', 401);
    }

    // 2. Query parameters 파싱
    const params = event.queryStringParameters || {};
    const page = parseInt(params.page || '1', 10);
    const limit = Math.min(parseInt(params.limit || '50', 10), 100); // 최대 100
    const status = (params.status || 'ACTIVE') as 'ACTIVE' | 'WITHDRAWN' | 'ALL';
    const search = params.search || '';
    const sortBy = (params.sortBy || 'joinedAt') as 'joinedAt' | 'walletAddress';
    const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc';

    console.log('Query params:', { page, limit, status, search, sortBy, sortOrder });

    // 3. 통계 조회
    const statistics = await getStatistics();

    // 4. 데이터 조회
    let items;
    let total;

    if (status === 'ALL' || search) {
      // Scan 사용 (검색 또는 ALL 상태)
      const allItems = await scanAllItems(status);

      // 검색 필터링
      let filteredItems = allItems;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = allItems.filter(item =>
          item.walletAddress.toLowerCase().includes(searchLower)
        );
      }

      // 정렬
      filteredItems.sort((a, b) => {
        if (sortBy === 'joinedAt') {
          const aTime = new Date(a.joinedAt).getTime();
          const bTime = new Date(b.joinedAt).getTime();
          return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
        } else {
          // walletAddress 정렬
          return sortOrder === 'asc'
            ? a.walletAddress.localeCompare(b.walletAddress)
            : b.walletAddress.localeCompare(a.walletAddress);
        }
      });

      // 페이지네이션
      total = filteredItems.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      items = filteredItems.slice(startIndex, endIndex);
    } else {
      // GSI Query 사용 (ACTIVE 또는 WITHDRAWN)
      const result = await queryByStatus(status, limit);
      items = result.items;
      total = status === 'ACTIVE' ? statistics.totalActive : statistics.totalWithdrawn;
    }

    // 5. 응답 구성
    const response: WhitelistListResponse = {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      statistics
    };

    console.log(`Returning ${items.length} items (page ${page}/${response.pagination.totalPages})`);

    return successResponse(response, 200);
  } catch (error: any) {
    console.error('Admin list error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to retrieve whitelist. Please try again.',
      500
    );
  }
}
