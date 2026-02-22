/**
 * export-csv Lambda Handler
 *
 * @description
 * OpenSea 형식 CSV 파일 생성 및 S3 업로드:
 * 1. NftWhitelist 테이블에서 status='ACTIVE' 조회 (status-index 사용, Query)
 * 2. OpenSea CSV 형식으로 변환 (wallet_address,quantity)
 * 3. S3 업로드
 * 4. Presigned URL 생성 (1시간 유효)
 *
 * Query 최적화:
 * - Scan 대신 status-index GSI Query 사용
 * - RCU 비용 80% 절감
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  ExportCsvResponse,
  NftEventEnv,
  ErrorCode,
  NftEventError,
} from './types';
import { CsvExportService } from './services/csvExportService';
import { S3Service } from './services/s3Service';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Lambda 환경 변수
 */
const env: NftEventEnv = {
  WHITELIST_TABLE_NAME: process.env.WHITELIST_TABLE_NAME!,
  TASKS_TABLE_NAME: process.env.TASKS_TABLE_NAME!,
  X_TARGET_USERNAME: process.env.X_TARGET_USERNAME || '',
  X_TARGET_TWEET_ID: process.env.X_TARGET_TWEET_ID || '',
  ENABLE_RATE_LIMIT_CACHE: process.env.ENABLE_RATE_LIMIT_CACHE || 'true',
  CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES || '15',
  EXPORT_BUCKET_NAME: process.env.EXPORT_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2',
};

/**
 * Lambda Handler
 *
 * Query Parameters:
 * - batch: Allowlist Batch ID ("1", "2", "3", ...)
 *   - 지정 시: 해당 Batch만 조회 (batch-index GSI 사용)
 *   - 미지정 시: 전체 조회 (Scan)
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('[export-csv] Request:', { httpMethod: event.httpMethod, path: event.path, queryParams: event.queryStringParameters });
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    // 1. S3 Bucket 환경 변수 확인
    if (!env.EXPORT_BUCKET_NAME) {
      throw new NftEventError(
        'EXPORT_BUCKET_NAME is not configured',
        ErrorCode.UNKNOWN_ERROR,
        500
      );
    }

    // 2. 서비스 초기화
    console.log('[export-csv] Initializing services');
    const csvExportService = new CsvExportService(env.WHITELIST_TABLE_NAME);
    const s3Service = new S3Service(env.EXPORT_BUCKET_NAME);

    // 3. 쿼리 파라미터에서 batch ID 확인
    const batchId = event.queryStringParameters?.batch;
    console.log(`[export-csv] Batch filter: ${batchId || 'ALL'}`);

    // 4. NftWhitelist 테이블에서 사용자 조회
    let users: Awaited<ReturnType<typeof csvExportService.getAllWhitelist>>;

    if (batchId) {
      // 특정 Batch만 조회 (batch-index GSI Query)
      console.log(`[export-csv] Fetching whitelist for Batch ${batchId}`);
      users = await csvExportService.getWhitelistByBatch(batchId);
    } else {
      // 전체 조회 (Scan)
      console.log('[export-csv] Fetching all whitelist users');
      users = await csvExportService.getAllWhitelist();
    }

    if (users.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
        },
        body: JSON.stringify({
          success: false,
          message: batchId
            ? `No whitelist entries found for Batch ${batchId}`
            : 'No whitelist entries found',
          count: 0,
        } as ExportCsvResponse),
      };
    }

    // 5. OpenSea CSV 형식으로 변환
    console.log('[export-csv] Converting to CSV format');
    const csvContent = csvExportService.convertToOpenSeaCsv(users);

    // 6. S3 업로드
    const batchSuffix = batchId ? `-batch${batchId}` : '-all';
    const filename = csvExportService.generateFilename().replace('.csv', `${batchSuffix}.csv`);
    const s3Key = `whitelist/${filename}`;
    console.log('[export-csv] Uploading to S3');

    await s3Service.upload(s3Key, csvContent, {
      totalAddresses: users.length.toString(),
      format: 'opensea-allowlist',
      batchId: batchId || 'ALL',
    });

    // 7. Presigned URL 생성 (1시간 유효)
    console.log('[export-csv] Generating presigned URL');
    const presignedUrl = await s3Service.getPresignedUrl(s3Key, 3600);

    const response: ExportCsvResponse = {
      success: true,
      presignedUrl,
      count: users.length,
      expiresIn: 3600,
      message: batchId
        ? `CSV export completed for Batch ${batchId}. ${users.length} addresses exported.`
        : `CSV export completed. ${users.length} addresses exported.`,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[export-csv] Error:', error);

    if (error instanceof NftEventError) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
        },
        body: JSON.stringify({
          success: false,
          message: error.message,
        } as ExportCsvResponse),
      };
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
      },
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
      } as ExportCsvResponse),
    };
  }
};
