/**
 * Admin Export Whitelist CSV Lambda Handler
 * GET /api/admin/whitelist/export
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { csvResponse, errorResponse } from '@/utils/response';
import { validateAdminApiKey } from '@/utils/auth';
import { scanAllItems } from '@/utils/dynamodb';

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Admin Export Request:', JSON.stringify(event, null, 2));

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
      console.warn('Unauthorized export attempt');
      return errorResponse('UNAUTHORIZED', 'Invalid API Key', 401);
    }

    // 2. Query parameter 파싱
    const params = event.queryStringParameters || {};
    const status = (params.status || 'ACTIVE') as 'ACTIVE' | 'WITHDRAWN' | 'ALL';

    console.log('Export status filter:', status);

    // 3. DynamoDB 전체 스캔
    const items = await scanAllItems(status);

    console.log(`Exporting ${items.length} items`);

    // 4. CSV 생성
    const csvHeader = 'walletAddress,joinedAt,signature,status,withdrawnAt\n';
    const csvRows = items.map(item => {
      const withdrawnAt = item.withdrawnAt || '';
      // CSV 이스케이프 처리 (쉼표, 따옴표 등)
      const escapeCsv = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      return [
        escapeCsv(item.walletAddress),
        escapeCsv(item.joinedAt),
        escapeCsv(item.signature),
        escapeCsv(item.status),
        escapeCsv(withdrawnAt)
      ].join(',');
    });

    const csvContent = csvHeader + csvRows.join('\n');

    // 5. 파일명 생성 (날짜 포함)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `founders-whitelist-${status.toLowerCase()}-${today}.csv`;

    console.log(`CSV generated: ${filename} (${csvContent.length} bytes)`);

    // 6. CSV 응답 반환
    return csvResponse(csvContent, filename);
  } catch (error: any) {
    console.error('Admin export error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to export whitelist. Please try again.',
      500
    );
  }
}
