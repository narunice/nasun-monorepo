/**
 * POST /bug-report
 *
 * Accepts bug report form submissions.
 * Primary: stores in DynamoDB.
 * Best-effort: sends Telegram notification to naru.
 *
 * Auth: Cognito JWT (tokenAuthorizer)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { randomUUID } from 'crypto';

// DynamoDB
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const BUG_REPORTS_TABLE = process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';

// Secrets Manager
const smClient = new SecretsManagerClient({});
const TELEGRAM_BOT_TOKEN_SECRET_NAME =
  process.env.TELEGRAM_BOT_TOKEN_SECRET_NAME || 'nasun-telegram-bot-token';
const NARU_TELEGRAM_CHAT_ID = process.env.NARU_TELEGRAM_CHAT_ID || '';

// Module-scope cache for bot token
let cachedBotToken: string | null = null;

const ALLOWED_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Feature Request', 'Other'];

// CORS: reflect matching origin from allowed list
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io,https://staging.nasun.io').split(',');

function getCorsHeaders(event: APIGatewayProxyEvent): Record<string, string> {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
}

function response(statusCode: number, body: unknown, headers: Record<string, string>): APIGatewayProxyResult {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

async function getBotToken(): Promise<string> {
  if (cachedBotToken) return cachedBotToken;
  const secret = await smClient.send(
    new GetSecretValueCommand({ SecretId: TELEGRAM_BOT_TOKEN_SECRET_NAME })
  );
  cachedBotToken = secret.SecretString || '';
  return cachedBotToken;
}

async function sendTelegramNotification(report: {
  title: string;
  category: string;
  description: string;
  reproSteps?: string;
  identityId: string;
  displayName: string;
}): Promise<void> {
  if (!NARU_TELEGRAM_CHAT_ID) {
    console.warn('NARU_TELEGRAM_CHAT_ID not configured, skipping Telegram notification');
    return;
  }

  try {
    const botToken = await getBotToken();
    const text = [
      `[Bug Report] ${report.category}`,
      `From: ${report.displayName} (${report.identityId.slice(0, 30)}...)`,
      '---',
      `Title: ${report.title}`,
      `Description: ${report.description.slice(0, 500)}`,
      report.reproSteps ? `Steps: ${report.reproSteps.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: NARU_TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn('Telegram API error:', res.status, await res.text());
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn('Telegram notification failed (best-effort):', err);
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cors = getCorsHeaders(event);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return response(200, {}, cors);
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method not allowed' }, cors);
  }

  // Extract identityId from authorizer context (set by tokenAuthorizer)
  const identityId = event.requestContext.authorizer?.identityId;
  if (!identityId) {
    return response(401, { error: 'Unauthorized' }, cors);
  }

  // Parse body
  let body: {
    title?: string;
    category?: string;
    description?: string;
    reproSteps?: string;
    displayName?: string;
  };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON' }, cors);
  }

  // Validate
  const { title, category, description, reproSteps, displayName } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return response(400, { error: 'Title is required' }, cors);
  }
  if (title.length > 100) {
    return response(400, { error: 'Title too long (max 100 characters)' }, cors);
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return response(400, { error: 'Description is required' }, cors);
  }
  if (description.length > 2000) {
    return response(400, { error: 'Description too long (max 2000 characters)' }, cors);
  }
  if (category && (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category))) {
    return response(400, { error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` }, cors);
  }
  if (reproSteps && (typeof reproSteps !== 'string' || reproSteps.length > 2000)) {
    return response(400, { error: 'Repro steps too long (max 2000 characters)' }, cors);
  }
  if (displayName && typeof displayName !== 'string') {
    return response(400, { error: 'Invalid displayName' }, cors);
  }

  const reportId = randomUUID();
  const timestamp = new Date().toISOString();

  // Store in DynamoDB (primary)
  try {
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
        status: 'new',
      },
    }));
  } catch (err) {
    console.error('DynamoDB write failed:', err);
    return response(500, { error: 'Failed to save bug report. Please try again.' }, cors);
  }

  // Send Telegram notification (best-effort with 5s timeout)
  await sendTelegramNotification({
    title: title.trim(),
    category: category || 'Other',
    description: description.trim(),
    reproSteps: reproSteps?.trim(),
    identityId,
    displayName: typeof displayName === 'string' ? displayName : 'Unknown',
  });

  return response(200, { reportId, message: 'Bug report submitted successfully' }, cors);
}
