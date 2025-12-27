/**
 * API Gateway 응답 헬퍼 함수
 */

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

export function successResponse(data: any, statusCode: number = 200) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({
      success: true,
      data
    })
  };
}

export function errorResponse(
  error: string,
  message: string,
  statusCode: number = 400,
  data?: any
) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({
      success: false,
      error,
      message,
      ...(data && { data })
    })
  };
}

export function csvResponse(csvContent: string, filename: string) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*'
    },
    body: csvContent
  };
}
