/**
 * Bug Report Lambda
 *
 * User-facing endpoints:
 * - POST /bug-report       - Submit a bug report (with Telegram notification)
 * - GET  /bug-report/my-reports  - List own reports (identityId-index GSI)
 * - GET  /bug-report/upload-url  - Get S3 presigned POST URL for screenshot
 *
 * Auth: Cognito JWT (tokenAuthorizer -> identityId in authorizer context)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { handleSubmit as handleCreatorPostSubmit, handleMyList as handleCreatorPostMyList } from './creator-posts.js';

// ============================================
// Clients & Config
// ============================================

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const smClient = new SecretsManagerClient({});

const BUG_REPORTS_TABLE = process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';
const INTERNAL_CACHE_BUCKET = process.env.INTERNAL_CACHE_BUCKET || '';
const TELEGRAM_BOT_TOKEN_SECRET_NAME =
  process.env.TELEGRAM_BOT_TOKEN_SECRET_NAME || 'nasun-telegram-bot-token';
const NARU_TELEGRAM_CHAT_ID = process.env.NARU_TELEGRAM_CHAT_ID || '';

const ALLOWED_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Performance', 'Security', 'Feature Request', 'Other'];
const MAX_SCREENSHOTS = 3;
const SCREENSHOT_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const COOLDOWN_MINUTES = 5;

// Module-scope cache for bot token
let cachedBotToken: string | null = null;

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io,https://staging.nasun.io').split(',');

function getCorsHeaders(event: APIGatewayProxyEvent): Record<string, string> {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

function respond(statusCode: number, body: unknown, headers: Record<string, string>): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ============================================
// Router
// ============================================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cors = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {}, cors);
  }

  const identityId = event.requestContext.authorizer?.identityId;
  if (!identityId) {
    return respond(401, { error: 'Unauthorized' }, cors);
  }

  const path = event.path.replace(/\/prod\/?/, '/').replace(/\/$/, '');

  try {
    // POST /bug-report
    if (event.httpMethod === 'POST' && path.endsWith('/bug-report')) {
      return await handleSubmit(event, identityId, cors);
    }

    // GET /bug-report/my-reports
    if (event.httpMethod === 'GET' && path.endsWith('/my-reports')) {
      return await handleMyReports(identityId, cors);
    }

    // GET /bug-report/upload-url
    if (event.httpMethod === 'GET' && path.endsWith('/upload-url')) {
      return await handleUploadUrl(event, identityId, cors);
    }

    // POST /bug-report/{reportId}/reply
    if (event.httpMethod === 'POST' && path.endsWith('/reply')) {
      return await handleReply(event, identityId, cors);
    }

    // POST /v1/creator-posts
    if (event.httpMethod === 'POST' && path.endsWith('/v1/creator-posts')) {
      return await handleCreatorPostSubmit(event, identityId, cors);
    }

    // GET /v1/creator-posts/my
    if (event.httpMethod === 'GET' && path.endsWith('/v1/creator-posts/my')) {
      return await handleCreatorPostMyList(event, identityId, cors);
    }

    return respond(404, { error: 'Not found' }, cors);
  } catch (err) {
    console.error('Unhandled error:', err);
    return respond(500, { error: 'Internal server error' }, cors);
  }
}

// ============================================
// POST /bug-report - Submit a bug report
// ============================================

async function handleSubmit(
  event: APIGatewayProxyEvent,
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  // Parse body
  let body: {
    title?: string;
    category?: string;
    description?: string;
    reproSteps?: string;
    displayName?: string;
    screenshotKeys?: string[];
    pageUrl?: string;
    walletAddress?: string;
  };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }

  const { title, category, description, reproSteps, displayName, screenshotKeys, pageUrl, walletAddress } = body;

  // Validate required fields
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return respond(400, { error: 'Title is required' }, cors);
  }
  if (title.length > 100) {
    return respond(400, { error: 'Title too long (max 100 characters)' }, cors);
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return respond(400, { error: 'Description is required' }, cors);
  }
  if (description.length > 2000) {
    return respond(400, { error: 'Description too long (max 2000 characters)' }, cors);
  }
  if (category && (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category))) {
    return respond(400, { error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` }, cors);
  }
  if (reproSteps && (typeof reproSteps !== 'string' || reproSteps.length > 2000)) {
    return respond(400, { error: 'Repro steps too long (max 2000 characters)' }, cors);
  }

  // Validate walletAddress (required for points reward)
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
    return respond(400, { error: 'Wallet address is required' }, cors);
  }

  // Validate screenshot keys
  if (screenshotKeys) {
    if (!Array.isArray(screenshotKeys) || screenshotKeys.length > MAX_SCREENSHOTS) {
      return respond(400, { error: `Maximum ${MAX_SCREENSHOTS} screenshots allowed` }, cors);
    }
    if (screenshotKeys.some(k =>
      typeof k !== 'string' ||
      !k.startsWith('bug-screenshots/') ||
      k.includes('..') ||
      k.includes('//'),
    )) {
      return respond(400, { error: 'Invalid screenshot key format' }, cors);
    }
  }

  // Per-user cooldown check
  const cooldownResult = await ddbClient.send(new QueryCommand({
    TableName: BUG_REPORTS_TABLE,
    IndexName: 'identityId-index',
    KeyConditionExpression: 'identityId = :id AND #ts > :since',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ExpressionAttributeValues: {
      ':id': identityId,
      ':since': new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString(),
    },
    Limit: 1,
    ScanIndexForward: false,
  }));

  if (cooldownResult.Items && cooldownResult.Items.length > 0) {
    return respond(429, { error: `Please wait ${COOLDOWN_MINUTES} minutes between submissions` }, cors);
  }

  const reportId = randomUUID();
  const timestamp = new Date().toISOString();

  // Store in DynamoDB
  await ddbClient.send(new PutCommand({
    TableName: BUG_REPORTS_TABLE,
    Item: {
      reportId,
      timestamp,
      identityId,
      title: title.trim(),
      category: category || 'Other',
      description: description.trim(),
      reproSteps: reproSteps?.trim() || null,
      screenshotKeys: screenshotKeys || [],
      walletAddress: walletAddress.trim(),
      pageUrl: pageUrl && typeof pageUrl === 'string' ? pageUrl.trim().slice(0, 500) : null,
      status: 'new',
    },
  }));

  // Send Telegram notification (best-effort)
  await sendTelegramNotification({
    reportId,
    title: title.trim(),
    category: category || 'Other',
    description: description.trim(),
    identityId,
    displayName: typeof displayName === 'string' ? displayName : 'Unknown',
    screenshotCount: screenshotKeys?.length || 0,
  });

  return respond(200, { reportId, message: 'Bug report submitted successfully' }, cors);
}

// ============================================
// GET /bug-report/my-reports - List own reports
// ============================================

async function handleMyReports(
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const result = await ddbClient.send(new QueryCommand({
    TableName: BUG_REPORTS_TABLE,
    IndexName: 'identityId-index',
    KeyConditionExpression: 'identityId = :id',
    ExpressionAttributeValues: { ':id': identityId },
    ScanIndexForward: false, // newest first
    Limit: 50,
  }));

  return respond(200, { reports: result.Items || [] }, cors);
}

// ============================================
// GET /bug-report/upload-url - Presigned POST URL for screenshot
// ============================================

async function handleUploadUrl(
  event: APIGatewayProxyEvent,
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  if (!INTERNAL_CACHE_BUCKET) {
    return respond(500, { error: 'Screenshot upload not configured' }, cors);
  }

  const contentType = event.queryStringParameters?.contentType;
  if (!contentType || !['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
    return respond(400, { error: 'contentType must be image/png, image/jpeg, or image/webp' }, cors);
  }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const key = `bug-screenshots/${identityId}/${randomUUID()}.${ext}`;

  const presigned = await createPresignedPost(s3Client, {
    Bucket: INTERNAL_CACHE_BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 0, SCREENSHOT_MAX_SIZE],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: {
      'Content-Type': contentType,
    },
    Expires: 300, // 5 minutes
  });

  return respond(200, { ...presigned, key }, cors);
}

// ============================================
// POST /bug-report/{reportId}/reply - Follow-up on a closed ticket
// ============================================

const REPLY_MAX_LENGTH = 1000;

async function handleReply(
  event: APIGatewayProxyEvent,
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const reportId =
    event.pathParameters?.reportId ||
    event.path.split('/').slice(-2, -1)[0];

  if (!reportId || typeof reportId !== 'string') {
    return respond(400, { error: 'reportId is required' }, cors);
  }

  let body: { timestamp?: string; text?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }

  const { timestamp, text } = body;
  if (!timestamp || typeof timestamp !== 'string') {
    return respond(400, { error: 'timestamp is required' }, cors);
  }
  if (!text || typeof text !== 'string') {
    return respond(400, { error: 'text is required' }, cors);
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > REPLY_MAX_LENGTH) {
    return respond(400, { error: `text must be 1-${REPLY_MAX_LENGTH} characters` }, cors);
  }

  const now = new Date().toISOString();

  try {
    await ddbClient.send(new UpdateCommand({
      TableName: BUG_REPORTS_TABLE,
      Key: { reportId, timestamp },
      UpdateExpression: 'SET userReply = :text, #status = :new, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':text': trimmed,
        ':new': 'new',
        ':now': now,
        ':me': identityId,
        ':fixed': 'fixed',
        ':wontfix': 'wont-fix',
      },
      ConditionExpression: 'identityId = :me AND #status IN (:fixed, :wontfix)',
    }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      const existing = await ddbClient.send(new GetCommand({
        TableName: BUG_REPORTS_TABLE,
        Key: { reportId, timestamp },
      }));
      if (!existing.Item) {
        return respond(404, { error: 'Report not found' }, cors);
      }
      if (existing.Item.identityId !== identityId) {
        console.warn(`Reply forgery attempt: identity=${identityId} tried to reply on report owned by=${existing.Item.identityId} reportId=${reportId}`);
        return respond(403, { error: 'Forbidden' }, cors);
      }
      return respond(409, { error: 'This ticket is not open for reply' }, cors);
    }
    throw err;
  }

  // Telegram notification (inline, best-effort)
  if (NARU_TELEGRAM_CHAT_ID) {
    try {
      const botToken = await getBotToken();
      const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
      const notifyText = [
        `[Bug Report Reopened] #${reportId.slice(0, 8)}`,
        `From: identity=${identityId.slice(0, 16)}...`,
        '---',
        `Reply: ${preview}`,
      ].join('\n').slice(0, 4096);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: NARU_TELEGRAM_CHAT_ID,
            text: notifyText,
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn('Telegram reopen notification failed (best-effort):', err);
    }
  }

  return respond(200, { ok: true, updatedAt: now }, cors);
}

// ============================================
// Telegram Notification
// ============================================

async function getBotToken(): Promise<string> {
  if (cachedBotToken) return cachedBotToken;
  const secret = await smClient.send(
    new GetSecretValueCommand({ SecretId: TELEGRAM_BOT_TOKEN_SECRET_NAME }),
  );
  cachedBotToken = secret.SecretString || '';
  return cachedBotToken;
}

async function sendTelegramNotification(report: {
  reportId: string;
  title: string;
  category: string;
  description: string;
  identityId: string;
  displayName: string;
  screenshotCount: number;
}): Promise<void> {
  if (!NARU_TELEGRAM_CHAT_ID) return;

  try {
    const botToken = await getBotToken();
    const text = [
      `[Bug Report] #${report.reportId.slice(0, 8)}`,
      `Category: ${report.category}`,
      `From: ${report.displayName}`,
      '---',
      `Title: ${report.title}`,
      `Description: ${report.description.slice(0, 500)}`,
      report.screenshotCount > 0 ? `Screenshots: ${report.screenshotCount}` : '',
    ].filter(Boolean).join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: NARU_TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn('Telegram notification failed (best-effort):', err);
  }
}
