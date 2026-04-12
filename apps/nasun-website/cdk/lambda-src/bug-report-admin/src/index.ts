/**
 * Bug Report Admin Lambda
 *
 * Admin-only endpoints:
 * - GET  /admin/bug-reports           - List all reports (status filter)
 * - PATCH /admin/bug-reports/{reportId} - Update status, note, reward points
 *
 * Auth: Cognito JWT (tokenAuthorizer) + admin role check via UserProfiles.
 * Points reward: HTTP call to Explorer API POST /bug-report-reward.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================
// Clients & Config
// ============================================

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const BUG_REPORTS_TABLE = process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const INTERNAL_CACHE_BUCKET = process.env.INTERNAL_CACHE_BUCKET || '';
const EXPLORER_API_URL = process.env.EXPLORER_API_URL || '';
const BUG_REPORT_API_KEY = process.env.BUG_REPORT_API_KEY || '';

const VALID_STATUSES = ['new', 'investigating', 'in-progress', 'fixed', 'wont-fix', 'duplicate'];
const MAX_BONUS_POINTS = 100;

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io,https://staging.nasun.io').split(',');

function getCorsHeaders(event: APIGatewayProxyEvent): Record<string, string> {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
  };
}

function respond(statusCode: number, body: unknown, headers: Record<string, string>): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ============================================
// Admin Auth (uses authorizer context + UserProfiles role check)
// ============================================

async function authenticateAdmin(event: APIGatewayProxyEvent): Promise<string | null> {
  const identityId = event.requestContext.authorizer?.identityId;
  if (!identityId) return null;

  // Check admin role in UserProfiles (Document Client - consistent API)
  const result = await ddbClient.send(new GetCommand({
    TableName: USER_PROFILES_TABLE,
    Key: { identityId },
  }));

  if (!result.Item || result.Item.role !== 'ADMIN') {
    return null;
  }

  return identityId;
}

// ============================================
// Router
// ============================================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cors = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {}, cors);
  }

  try {
    const adminId = await authenticateAdmin(event);
    if (!adminId) {
      return respond(401, { error: 'Unauthorized: admin access required' }, cors);
    }

    const path = event.path.replace(/\/prod\/?/, '/').replace(/\/$/, '');

    // GET /admin/bug-reports
    if (event.httpMethod === 'GET' && path.endsWith('/bug-reports')) {
      return await handleList(event, cors);
    }

    // PATCH /admin/bug-reports/{reportId}
    if (event.httpMethod === 'PATCH' && event.pathParameters?.reportId) {
      return await handleUpdate(event, cors);
    }

    return respond(404, { error: 'Not found' }, cors);
  } catch (err) {
    console.error('Unhandled error:', err);
    return respond(500, { error: 'Internal server error' }, cors);
  }
}

// ============================================
// GET /admin/bug-reports - List all reports
// ============================================

async function handleList(
  event: APIGatewayProxyEvent,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const statusFilter = event.queryStringParameters?.status;

  if (statusFilter) {
    if (!VALID_STATUSES.includes(statusFilter)) {
      return respond(400, { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, cors);
    }
  }

  // Default to "new" status when no filter specified
  const queryStatus = statusFilter || 'new';

  const result = await ddbClient.send(new QueryCommand({
    TableName: BUG_REPORTS_TABLE,
    IndexName: 'status-index',
    KeyConditionExpression: '#s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': queryStatus },
    ScanIndexForward: false,
    Limit: 100,
  }));

  let reports = await attachScreenshotUrls(result.Items || []);
  reports = await attachUserProfiles(reports);
  return respond(200, { reports, filter: queryStatus }, cors);
}

// ============================================
// PATCH /admin/bug-reports/{reportId} - Update status/note/reward
// ============================================

async function handleUpdate(
  event: APIGatewayProxyEvent,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const reportId = event.pathParameters?.reportId;
  if (!reportId) {
    return respond(400, { error: 'reportId is required' }, cors);
  }

  let body: {
    status?: string;
    adminNote?: string;
    bonusPoints?: number;
    timestamp?: string;
  };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }

  // Validate status
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return respond(400, { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, cors);
  }

  // Validate bonusPoints
  if (body.bonusPoints !== undefined) {
    if (typeof body.bonusPoints !== 'number' || body.bonusPoints < 0 || body.bonusPoints > MAX_BONUS_POINTS) {
      return respond(400, { error: `bonusPoints must be 0-${MAX_BONUS_POINTS}` }, cors);
    }
  }

  // Validate adminNote
  if (body.adminNote && (typeof body.adminNote !== 'string' || body.adminNote.length > 1000)) {
    return respond(400, { error: 'adminNote too long (max 1000 characters)' }, cors);
  }

  // Need timestamp to identify the item (composite key: reportId + timestamp)
  if (!body.timestamp) {
    return respond(400, { error: 'timestamp is required to identify the report' }, cors);
  }

  // Fetch existing report to verify it exists and get wallet/identity info
  const existing = await ddbClient.send(new GetCommand({
    TableName: BUG_REPORTS_TABLE,
    Key: { reportId, timestamp: body.timestamp },
  }));

  if (!existing.Item) {
    return respond(404, { error: 'Bug report not found' }, cors);
  }

  // Build update expression - collect user fields first, then add updatedAt
  const userUpdateParts: string[] = [];
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, unknown> = {};

  if (body.status) {
    userUpdateParts.push('#s = :status');
    exprNames['#s'] = 'status';
    exprValues[':status'] = body.status;
  }
  if (body.adminNote !== undefined) {
    userUpdateParts.push('adminNote = :note');
    exprValues[':note'] = body.adminNote;
  }
  if (body.bonusPoints !== undefined) {
    userUpdateParts.push('bonusPoints = :bp');
    exprValues[':bp'] = body.bonusPoints;
  }

  if (userUpdateParts.length === 0) {
    return respond(400, { error: 'No fields to update' }, cors);
  }

  // Add updatedAt after validation
  userUpdateParts.push('updatedAt = :now');
  exprValues[':now'] = new Date().toISOString();

  await ddbClient.send(new UpdateCommand({
    TableName: BUG_REPORTS_TABLE,
    Key: { reportId, timestamp: body.timestamp },
    UpdateExpression: `SET ${userUpdateParts.join(', ')}`,
    ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
    ExpressionAttributeValues: exprValues,
  }));

  // If status is "fixed" and bonusPoints > 0, trigger points reward
  let rewardResult: { success: boolean; created?: boolean; finalPoints?: number; error?: string } | null = null;

  if (body.status === 'fixed' && body.bonusPoints && body.bonusPoints > 0) {
    // Prevent double reward: check if already rewarded
    if (existing.Item.rewardStatus === 'rewarded') {
      rewardResult = { success: true, created: false, error: 'Already rewarded' };
    } else {
      const walletAddress = existing.Item.walletAddress as string | undefined;
      const identityId = existing.Item.identityId as string;

      if (!walletAddress) {
        await ddbClient.send(new UpdateCommand({
          TableName: BUG_REPORTS_TABLE,
          Key: { reportId, timestamp: body.timestamp },
          UpdateExpression: 'SET rewardStatus = :rs',
          ExpressionAttributeValues: { ':rs': 'pending-no-wallet' },
        }));
        rewardResult = { success: false, error: 'User has no wallet address. Reward pending.' };
      } else {
        rewardResult = await sendRewardToExplorer({
          walletAddress,
          identityId,
          reportId,
          points: body.bonusPoints,
          reason: `Bug report fix: ${(existing.Item.title as string) || reportId}`,
        });

        await ddbClient.send(new UpdateCommand({
          TableName: BUG_REPORTS_TABLE,
          Key: { reportId, timestamp: body.timestamp },
          UpdateExpression: 'SET rewardStatus = :rs',
          ExpressionAttributeValues: {
            ':rs': rewardResult.success ? 'rewarded' : 'pending',
          },
        }));
      }
    }
  }

  return respond(200, {
    success: true,
    reportId,
    ...(rewardResult ? { reward: rewardResult } : {}),
  }, cors);
}

// ============================================
// Explorer API: Send reward points
// ============================================

async function sendRewardToExplorer(payload: {
  walletAddress: string;
  identityId: string;
  reportId: string;
  points: number;
  reason: string;
}): Promise<{ success: boolean; created?: boolean; finalPoints?: number; error?: string }> {
  if (!EXPLORER_API_URL || !BUG_REPORT_API_KEY) {
    console.warn('EXPLORER_API_URL or BUG_REPORT_API_KEY not configured');
    return { success: false, error: 'Points reward not configured' };
  }

  const url = `${EXPLORER_API_URL}/api/v1/points/bug-report-reward`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BUG_REPORT_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { success: boolean; created?: boolean; finalPoints?: number };
        console.log(`Points reward sent: ${payload.reportId} -> ${data.finalPoints} points (created: ${data.created})`);
        return data;
      }

      const errBody = await res.text();
      console.warn(`Explorer API error (attempt ${attempt + 1}): ${res.status} ${errBody}`);
    } catch (err) {
      console.warn(`Explorer API request failed (attempt ${attempt + 1}):`, err);
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return { success: false, error: 'Failed to send reward after retries' };
}

// ============================================
// Helpers
// ============================================

async function attachUserProfiles(
  reports: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  // Collect unique identityIds
  const ids = [...new Set(
    reports.map(r => r.identityId as string).filter(Boolean),
  )];
  if (ids.length === 0) return reports;

  const profileMap = new Map<string, { twitterHandle?: string; profileImageUrl?: string; customDisplayName?: string }>();

  // Individual lookups (sufficient for <100 reports per page)
  await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await ddbClient.send(new GetCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: id },
          ProjectionExpression: 'twitterHandle, profileImageUrl, customDisplayName',
        }));
        if (result.Item) {
          profileMap.set(id, {
            twitterHandle: result.Item.twitterHandle as string | undefined,
            profileImageUrl: result.Item.profileImageUrl as string | undefined,
            customDisplayName: result.Item.customDisplayName as string | undefined,
          });
        }
      } catch { /* ignore */ }
    }),
  );

  return reports.map((report) => {
    const profile = profileMap.get(report.identityId as string);
    if (!profile) return report;
    return {
      ...report,
      twitterHandle: profile.twitterHandle,
      profileImageUrl: profile.profileImageUrl,
      displayName: profile.customDisplayName,
    };
  });
}

async function attachScreenshotUrls(
  reports: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!INTERNAL_CACHE_BUCKET) return reports;

  return Promise.all(
    reports.map(async (report) => {
      const keys = report.screenshotKeys as string[] | undefined;
      if (!keys || keys.length === 0) return report;

      const urls = await Promise.all(
        keys.map(async (key) => {
          try {
            return await getSignedUrl(
              s3Client,
              new GetObjectCommand({ Bucket: INTERNAL_CACHE_BUCKET, Key: key }),
              { expiresIn: 3600 },
            );
          } catch {
            return null;
          }
        }),
      );

      return { ...report, screenshotUrls: urls.filter(Boolean) };
    }),
  );
}
