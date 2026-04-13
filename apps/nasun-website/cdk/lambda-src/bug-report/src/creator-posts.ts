/**
 * Creator Posts handlers (user-facing).
 *
 * Endpoints (mounted under the existing bug-report Lambda):
 * - POST /v1/creator-posts        Submit a creator post URL
 * - GET  /v1/creator-posts/my     List own submissions (cursor-based, 2-step Query+BatchGet)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  BatchGetCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  parseTweetUrl,
  normalizeHandle,
  safeImageUrl,
  startOfUtcTodayIso,
  utcNextMidnightIso,
  encodeCursor,
  decodeCursor,
} from './creator-posts-utils.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CREATOR_POSTS_TABLE = process.env.CREATOR_POSTS_TABLE || 'nasun-creator-posts';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const DAILY_LIMIT = Math.max(1, parseInt(process.env.CREATOR_POSTS_DAILY_LIMIT || '20', 10));

function respond(
  statusCode: number,
  body: unknown,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function countTodaySubmissions(identityId: string): Promise<number> {
  // GSI projection = KEYS_ONLY + status. Sufficient for count without BatchGet.
  // FilterExpression drops REJECTED/CANCELED (not counted toward daily limit).
  const result = await ddb.send(new QueryCommand({
    TableName: CREATOR_POSTS_TABLE,
    IndexName: 'identityId-createdAt-index',
    KeyConditionExpression: 'identityId = :id AND createdAt >= :start',
    FilterExpression: '#status IN (:pending, :scored, :granted)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':id': identityId,
      ':start': startOfUtcTodayIso(),
      ':pending': 'PENDING',
      ':scored': 'SCORED',
      ':granted': 'GRANTED',
    },
    Select: 'COUNT',
  }));
  return result.Count || 0;
}

// ============================================
// POST /v1/creator-posts
// ============================================

export async function handleSubmit(
  event: APIGatewayProxyEvent,
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  let body: { postUrl?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' }, cors);
  }
  const { postUrl } = body;
  if (!postUrl || typeof postUrl !== 'string') {
    return respond(400, { error: 'postUrl is required' }, cors);
  }

  // 1. Load UserProfiles: need twitterHandle, twitterId, profile image
  const profile = await ddb.send(new GetCommand({
    TableName: USER_PROFILES_TABLE,
    Key: { identityId },
    ProjectionExpression:
      'twitterHandle, twitterId, profileImageUrl, linkedAccounts',
  }));
  const profileItem = profile.Item || {};

  // Prefer top-level twitterHandle/twitterId (primary provider = twitter)
  // Fallback to linkedAccounts.twitter for users whose primary is non-twitter
  const linked =
    (profileItem.linkedAccounts as { twitter?: { twitterHandle?: string; twitterId?: string; profileImageUrl?: string } } | undefined)?.twitter;
  const rawHandle =
    (profileItem.twitterHandle as string | undefined) ??
    linked?.twitterHandle ??
    undefined;
  const twitterId =
    (profileItem.twitterId as string | undefined) ?? linked?.twitterId ?? undefined;
  const rawImage =
    (profileItem.profileImageUrl as string | undefined) ??
    linked?.profileImageUrl ??
    undefined;

  if (!rawHandle || !twitterId) {
    return respond(400, { error: 'twitter_not_linked', message: 'Connect your X account first.' }, cors);
  }

  const myHandle = normalizeHandle(rawHandle);
  if (!myHandle) {
    // Stored handle is unexpectedly malformed.
    console.warn('[creator-posts] malformed stored handle', { identityId });
    return respond(400, { error: 'twitter_not_linked' }, cors);
  }

  // 2. URL regex + ID extraction + canonicalization
  const parsed = parseTweetUrl(postUrl);
  if (!parsed) {
    return respond(400, { error: 'invalid_url', message: 'Not a valid X post URL.' }, cors);
  }

  // 3. Handle match
  if (parsed.handle !== myHandle) {
    return respond(400, { error: 'handle_mismatch', message: 'The URL handle does not match your connected X account.' }, cors);
  }
  const { postId } = parsed;

  // 4. Image allowlist (result used in PutItem; omit attribute if rejected)
  const safeImg = safeImageUrl(rawImage);

  // 5. Rate limit (performed LAST so that other validation failures do not consume quota)
  const todayCount = await countTodaySubmissions(identityId);
  if (todayCount >= DAILY_LIMIT) {
    return respond(429, {
      error: 'daily_limit_reached',
      dailyLimit: DAILY_LIMIT,
      resetAt: utcNextMidnightIso(),
    }, cors);
  }

  // 6. Conditional Put (permanent uniqueness per tweet)
  const now = new Date().toISOString();
  const item: Record<string, unknown> = {
    postId,
    createdAt: now,
    identityId,
    twitterId,
    twitterHandle: myHandle,
    postUrl: parsed.canonicalUrl,
    status: 'PENDING',
  };
  if (safeImg) {
    item.twitterProfileImageUrl = safeImg;
  }

  try {
    await ddb.send(new PutCommand({
      TableName: CREATOR_POSTS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(postId)',
    }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      return respond(409, {
        error: 'already_submitted',
        message: 'This post has already been submitted.',
      }, cors);
    }
    throw err;
  }

  return respond(200, {
    postId,
    status: 'PENDING',
    createdAt: now,
    dailyLimit: DAILY_LIMIT,
    remainingToday: Math.max(0, DAILY_LIMIT - todayCount - 1),
  }, cors);
}

// ============================================
// GET /v1/creator-posts/my
// ============================================

const MY_LIMIT_DEFAULT = 10;
const MY_LIMIT_MAX = 50;

export async function handleMyList(
  event: APIGatewayProxyEvent,
  identityId: string,
  cors: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters || {};
  const rawLimit = parseInt(qs.limit || '', 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= MY_LIMIT_MAX
      ? rawLimit
      : MY_LIMIT_DEFAULT;
  const exclusiveStartKey = decodeCursor(qs.cursor);

  // Step 1: Query GSI for postIds (KEYS_ONLY + status projection).
  // CANCELED excluded by filter.
  const q = await ddb.send(new QueryCommand({
    TableName: CREATOR_POSTS_TABLE,
    IndexName: 'identityId-createdAt-index',
    KeyConditionExpression: 'identityId = :id',
    FilterExpression: '#status <> :canceled',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':id': identityId,
      ':canceled': 'CANCELED',
    },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const keys = (q.Items || []).map(it => ({ postId: it.postId as string }));
  if (keys.length === 0) {
    return respond(200, { items: [], nextCursor: encodeCursor(q.LastEvaluatedKey) }, cors);
  }

  // Step 2: BatchGetItem with up to 2 retries for UnprocessedKeys
  const fullItems = await batchGetWithRetry(keys);

  // Preserve GSI (Query) order
  const orderedPostIds = (q.Items || []).map(it => it.postId as string);
  const map = new Map<string, Record<string, unknown>>();
  for (const it of fullItems) {
    map.set(it.postId as string, it);
  }
  const items = orderedPostIds.map(id => map.get(id)).filter(Boolean);

  return respond(200, {
    items,
    nextCursor: encodeCursor(q.LastEvaluatedKey),
    dailyLimit: DAILY_LIMIT,
  }, cors);
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
    const got = res.Responses?.[CREATOR_POSTS_TABLE] || [];
    collected.push(...got);
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

  if (remaining.length > 0) {
    console.warn('[creator-posts] BatchGet UnprocessedKeys remaining after retries', remaining.length);
  }
  return collected;
}
