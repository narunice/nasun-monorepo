/**
 * Creator Posts admin handlers (mounted under bug-report-admin Lambda).
 *
 * Endpoints:
 * - GET   /admin/creator-posts                     List by status
 * - PATCH /admin/creator-posts/{postId}/score      Score (1..30)
 * - PATCH /admin/creator-posts/{postId}/reject     Reject with reason
 * - POST  /admin/creator-posts/{postId}/grant      Grant points (irrevocable)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  BatchGetCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CREATOR_POSTS_TABLE = process.env.CREATOR_POSTS_TABLE || 'nasun-creator-posts';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const EXPLORER_API_URL = process.env.EXPLORER_API_URL || '';
const BUG_REPORT_API_KEY = process.env.BUG_REPORT_API_KEY || '';

const VALID_STATUSES = ['PENDING', 'SCORED', 'GRANTED', 'REJECTED', 'CANCELED'] as const;
type Status = (typeof VALID_STATUSES)[number];

function respond(
  statusCode: number,
  body: unknown,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function encodeCursor(key: Record<string, unknown> | undefined): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

async function batchGetWithRetry(keys: Array<{ postId: string }>): Promise<Record<string, unknown>[]> {
  let remaining: Array<{ postId: string }> = [...keys];
  const collected: Record<string, unknown>[] = [];
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (remaining.length === 0) break;
    const res = await ddb.send(new BatchGetCommand({
      RequestItems: {
        [CREATOR_POSTS_TABLE]: { Keys: remaining },
      },
    }));
    collected.push(...(res.Responses?.[CREATOR_POSTS_TABLE] || []));
    const unproc = res.UnprocessedKeys?.[CREATOR_POSTS_TABLE]?.Keys;
    if (!unproc || unproc.length === 0) {
      remaining = [];
      break;
    }
    remaining = unproc as Array<{ postId: string }>;
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
    }
  }
  return collected;
}

// ============================================
// GET /admin/creator-posts?status=PENDING&limit=50&cursor=...
// ============================================

const ADMIN_LIMIT_DEFAULT = 50;
const ADMIN_LIMIT_MAX = 100;

export async function handleList(
  event: APIGatewayProxyEvent,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters || {};
  const statusParam = (qs.status || 'PENDING') as Status;
  if (!VALID_STATUSES.includes(statusParam)) {
    return respond(400, { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, cors);
  }

  const rawLimit = parseInt(qs.limit || '', 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= ADMIN_LIMIT_MAX
      ? rawLimit
      : ADMIN_LIMIT_DEFAULT;
  const exclusiveStartKey = decodeCursor(qs.cursor);

  // Step 1: Query GSI (KEYS_ONLY) for postIds in requested status.
  const q = await ddb.send(new QueryCommand({
    TableName: CREATOR_POSTS_TABLE,
    IndexName: 'status-createdAt-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': statusParam },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const keys = (q.Items || []).map(it => ({ postId: it.postId as string }));
  if (keys.length === 0) {
    return respond(200, { items: [], filter: statusParam, nextCursor: encodeCursor(q.LastEvaluatedKey) }, cors);
  }

  // Step 2: BatchGet full rows
  const fullItems = await batchGetWithRetry(keys);

  const orderedIds = (q.Items || []).map(it => it.postId as string);
  const map = new Map<string, Record<string, unknown>>();
  for (const it of fullItems) map.set(it.postId as string, it);
  const items = orderedIds.map(id => map.get(id)).filter(Boolean);

  return respond(200, {
    items,
    filter: statusParam,
    nextCursor: encodeCursor(q.LastEvaluatedKey),
  }, cors);
}

// ============================================
// PATCH /admin/creator-posts/{postId}/score
// ============================================

export async function handleScore(
  event: APIGatewayProxyEvent,
  adminId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const postId = event.pathParameters?.postId;
  if (!postId) return respond(400, { error: 'postId is required' }, cors);

  let body: { points?: number };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }
  const { points } = body;
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 1 || points > 30) {
    return respond(400, { error: 'points must be integer 1-30' }, cors);
  }

  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateCommand({
      TableName: CREATOR_POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET #status = :scored, scoredPoints = :p, scoredAt = :now, scoredByAdminId = :admin',
      ConditionExpression: '#status IN (:pending, :scored)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':scored': 'SCORED',
        ':pending': 'PENDING',
        ':p': points,
        ':now': now,
        ':admin': adminId,
      },
    }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      return respond(409, { error: 'invalid_state', message: 'Only PENDING/SCORED posts can be scored.' }, cors);
    }
    throw err;
  }

  console.log(`action=score postId=${postId} adminId=${adminId} points=${points}`);
  return respond(200, { postId, status: 'SCORED', scoredPoints: points, scoredAt: now }, cors);
}

// ============================================
// PATCH /admin/creator-posts/{postId}/reject
// ============================================

export async function handleReject(
  event: APIGatewayProxyEvent,
  adminId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const postId = event.pathParameters?.postId;
  if (!postId) return respond(400, { error: 'postId is required' }, cors);

  let body: { reason?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }
  const reason = (body.reason || '').trim();
  if (!reason || reason.length > 500) {
    return respond(400, { error: 'reason is required (max 500 chars)' }, cors);
  }

  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateCommand({
      TableName: CREATOR_POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET #status = :rejected, rejectionReason = :r, scoredByAdminId = :admin, scoredAt = :now',
      ConditionExpression: '#status IN (:pending, :scored)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':rejected': 'REJECTED',
        ':pending': 'PENDING',
        ':scored': 'SCORED',
        ':r': reason,
        ':admin': adminId,
        ':now': now,
      },
    }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      return respond(409, { error: 'invalid_state' }, cors);
    }
    throw err;
  }

  console.log(`action=reject postId=${postId} adminId=${adminId}`);
  return respond(200, { postId, status: 'REJECTED', rejectionReason: reason }, cors);
}

// ============================================
// POST /admin/creator-posts/{postId}/grant
// ============================================

export async function handleGrant(
  event: APIGatewayProxyEvent,
  adminId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const postId = event.pathParameters?.postId;
  if (!postId) return respond(400, { error: 'postId is required' }, cors);

  const expectedDigest = `creatorpost:${postId}`;

  // Step 1: GetItem — load current state
  const getRes = await ddb.send(new GetCommand({
    TableName: CREATOR_POSTS_TABLE,
    Key: { postId },
  }));
  const item = getRes.Item;
  if (!item) {
    return respond(404, { error: 'not_found' }, cors);
  }

  // Step 2: Entry guard against tampered grantTxDigest
  if (item.grantTxDigest && item.grantTxDigest !== expectedDigest) {
    console.error(
      `[creator-posts][GRANT] tampered grantTxDigest detected postId=${postId} stored=${item.grantTxDigest} expected=${expectedDigest}`,
    );
    return respond(500, { error: 'inconsistent_state' }, cors);
  }

  // Idempotent short-circuit: already GRANTED with matching digest
  if (item.status === 'GRANTED' && item.grantTxDigest === expectedDigest) {
    console.log(`action=grant postId=${postId} adminId=${adminId} idempotent=true`);
    return respond(200, {
      postId,
      status: 'GRANTED',
      scoredPoints: item.scoredPoints,
      grantedAt: item.grantedAt,
      idempotent: true,
    }, cors);
  }

  if (item.status !== 'SCORED') {
    return respond(409, {
      error: 'invalid_state',
      message: `Only SCORED posts can be granted. Current: ${item.status}`,
    }, cors);
  }

  const scoredPoints = item.scoredPoints as number | undefined;
  if (typeof scoredPoints !== 'number' || scoredPoints < 1 || scoredPoints > 30) {
    return respond(400, { error: 'invalid_scored_points' }, cors);
  }
  const identityId = item.identityId as string;

  // Step 3: Look up walletAddress from UserProfiles (optional — points are not money)
  let walletAddress: string | undefined;
  try {
    const profile = await ddb.send(new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression: 'walletAddress, linkedAccounts',
    }));
    const profileItem = profile.Item;
    if (profileItem) {
      const direct = profileItem.walletAddress as string | undefined;
      const linked = (profileItem.linkedAccounts as {
        metamask?: { walletAddress?: string };
        'nasun wallet'?: { walletAddress?: string };
      } | undefined);
      walletAddress =
        direct ||
        linked?.['nasun wallet']?.walletAddress ||
        linked?.metamask?.walletAddress;
    }
  } catch (err) {
    console.warn('[creator-posts][GRANT] profile lookup failed (non-fatal):', err);
  }

  // Step 4: Call Explorer API
  const rewardRes = await callExplorerReward({
    identityId,
    walletAddress,
    postId,
    points: scoredPoints,
  });
  if (!rewardRes.ok) {
    console.error(`[creator-posts][GRANT] explorer call failed postId=${postId} err=${rewardRes.error}`);
    return respond(502, { error: 'explorer_unavailable', detail: rewardRes.error }, cors);
  }

  // Step 5: DDB update with idempotent condition
  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateCommand({
      TableName: CREATOR_POSTS_TABLE,
      Key: { postId },
      UpdateExpression:
        'SET #status = :granted, grantedAt = :now, grantTxDigest = :digest, grantedByAdminId = :admin',
      ConditionExpression:
        '#status = :scored OR (attribute_exists(grantTxDigest) AND grantTxDigest = :digest)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':granted': 'GRANTED',
        ':scored': 'SCORED',
        ':digest': expectedDigest,
        ':now': now,
        ':admin': adminId,
      },
    }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      // Re-GetItem with ConsistentRead to determine final outcome
      const reload = await ddb.send(new GetCommand({
        TableName: CREATOR_POSTS_TABLE,
        Key: { postId },
        ConsistentRead: true,
      }));
      const current = reload.Item;
      if (current?.status === 'GRANTED' && current.grantTxDigest === expectedDigest) {
        console.log(`action=grant postId=${postId} adminId=${adminId} idempotent=raceResolved`);
        return respond(200, {
          postId,
          status: 'GRANTED',
          scoredPoints: current.scoredPoints,
          grantedAt: current.grantedAt,
          idempotent: true,
        }, cors);
      }
      if (current?.status === 'REJECTED' || current?.status === 'CANCELED') {
        return respond(409, { error: 'invalid_state', message: `Current: ${current.status}` }, cors);
      }
      // status === 'SCORED' on consistent read = transient (should not happen)
      console.error(`[creator-posts][GRANT] condition failed but post is still SCORED postId=${postId}`);
      return respond(500, { error: 'transient_state' }, cors);
    }
    throw err;
  }

  console.log(
    `action=grant postId=${postId} adminId=${adminId} identity=${identityId.slice(0, 16)}... ` +
    `points=${scoredPoints} duplicate=${!rewardRes.created}`,
  );
  return respond(200, {
    postId,
    status: 'GRANTED',
    scoredPoints,
    grantedAt: now,
    duplicate: !rewardRes.created,
  }, cors);
}

// ============================================
// Explorer API call
// ============================================

async function callExplorerReward(payload: {
  identityId: string;
  walletAddress: string | undefined;
  postId: string;
  points: number;
}): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  if (!EXPLORER_API_URL || !BUG_REPORT_API_KEY) {
    return { ok: false, error: 'explorer_not_configured' };
  }
  const url = `${EXPLORER_API_URL}/api/v1/points/creator-post-reward`;
  const bodyObj: Record<string, unknown> = {
    identityId: payload.identityId,
    postId: payload.postId,
    points: payload.points,
  };
  if (payload.walletAddress) {
    bodyObj.walletAddress = payload.walletAddress;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BUG_REPORT_API_KEY,
        },
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as { created?: boolean };
        return { ok: true, created: !!data.created };
      }
      const text = await res.text();
      console.warn(`[creator-posts][Explorer] attempt ${attempt + 1} failed ${res.status} ${text}`);
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, error: `explorer_${res.status}` };
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[creator-posts][Explorer] attempt ${attempt + 1} error:`, err);
    }
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return { ok: false, error: 'explorer_retry_exhausted' };
}
