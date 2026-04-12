/**
 * Creator Posts handler integration tests.
 *
 * DDB + UserProfiles interactions are stubbed in-memory. Covers the full
 * handler contracts (submit + my list) end-to-end within a single process.
 *
 * Run with:
 *   npx --no-install tsx --test apps/nasun-website/cdk/lambda-src/bug-report/src/__tests__/creator-posts-handler.test.ts
 */

import { test, describe, before, beforeEach, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Provide deterministic env BEFORE importing the module
process.env.CREATOR_POSTS_TABLE = 'test-nasun-creator-posts';
process.env.USER_PROFILES_TABLE = 'test-UserProfiles';
process.env.CREATOR_POSTS_DAILY_LIMIT = '3';

// ============================================
// In-memory DDB stub
// ============================================

type DdbItem = Record<string, unknown>;

interface DdbState {
  items: Map<string, DdbItem>; // creator-posts table (PK=postId)
  userProfiles: Map<string, DdbItem>;
}

let state: DdbState;

function resetState() {
  state = { items: new Map(), userProfiles: new Map() };
}

// Command symbol-name matching: each Command has constructor.name.
async function mockSend(cmd: unknown): Promise<unknown> {
  const name = (cmd as { constructor: { name: string } }).constructor.name;
  const input = (cmd as { input: Record<string, unknown> }).input;

  if (name === 'PutCommand') {
    const tbl = input.TableName as string;
    const item = input.Item as DdbItem;
    const cond = input.ConditionExpression as string | undefined;
    if (tbl === process.env.CREATOR_POSTS_TABLE) {
      if (cond === 'attribute_not_exists(postId)') {
        if (state.items.has(item.postId as string)) {
          const err = new Error('Conditional check failed') as Error & { name: string };
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
      }
      state.items.set(item.postId as string, { ...item });
      return {};
    }
    throw new Error(`Unexpected table in PutCommand: ${tbl}`);
  }

  if (name === 'GetCommand') {
    const tbl = input.TableName as string;
    const key = input.Key as { postId?: string; identityId?: string };
    if (tbl === process.env.USER_PROFILES_TABLE) {
      const id = key.identityId!;
      const item = state.userProfiles.get(id);
      return item ? { Item: item } : {};
    }
    if (tbl === process.env.CREATOR_POSTS_TABLE) {
      const item = state.items.get(key.postId!);
      return item ? { Item: item } : {};
    }
    throw new Error(`Unexpected table in GetCommand: ${tbl}`);
  }

  if (name === 'QueryCommand') {
    const tbl = input.TableName as string;
    const indexName = input.IndexName as string;
    const values = (input.ExpressionAttributeValues || {}) as Record<string, unknown>;

    if (tbl === process.env.CREATOR_POSTS_TABLE && indexName === 'identityId-createdAt-index') {
      let list = [...state.items.values()].filter(
        (it) => it.identityId === values[':id'],
      );
      if (typeof values[':start'] === 'string') {
        list = list.filter(
          (it) => String(it.createdAt || '') >= String(values[':start']),
        );
      }
      // Filter expression evaluation (for status IN or <>)
      const filter = input.FilterExpression as string | undefined;
      if (filter) {
        list = list.filter((it) => {
          const s = it.status as string;
          if (filter.includes('#status IN')) {
            return (
              s === values[':pending'] ||
              s === values[':scored'] ||
              s === values[':granted']
            );
          }
          if (filter.includes('#status <> :canceled')) {
            return s !== values[':canceled'];
          }
          return true;
        });
      }
      if (input.ScanIndexForward === false) {
        list.sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        );
      }
      if (input.Select === 'COUNT') {
        return { Count: list.length };
      }
      if (typeof input.Limit === 'number') {
        list = list.slice(0, input.Limit as number);
      }
      // Project to KEYS_ONLY + status to mimic GSI projection
      const projected = list.map((it) => ({
        postId: it.postId,
        identityId: it.identityId,
        createdAt: it.createdAt,
        status: it.status,
      }));
      return { Items: projected };
    }
    throw new Error(`Unexpected Query: ${tbl}/${indexName}`);
  }

  if (name === 'BatchGetCommand') {
    const req = input.RequestItems as Record<
      string,
      { Keys: Array<{ postId: string }> }
    >;
    const tblReq = req[process.env.CREATOR_POSTS_TABLE!];
    const items = (tblReq?.Keys || [])
      .map((k) => state.items.get(k.postId))
      .filter((x): x is DdbItem => !!x);
    return {
      Responses: { [process.env.CREATOR_POSTS_TABLE!]: items },
    };
  }

  if (name === 'UpdateCommand') {
    const tbl = input.TableName as string;
    if (tbl !== process.env.CREATOR_POSTS_TABLE) {
      throw new Error(`UpdateCommand unexpected table ${tbl}`);
    }
    const key = input.Key as { postId: string };
    const item = state.items.get(key.postId);
    if (!item) {
      const err = new Error('Not found') as Error & { name: string };
      err.name = 'ResourceNotFoundException';
      throw err;
    }
    const cond = input.ConditionExpression as string | undefined;
    const values = (input.ExpressionAttributeValues || {}) as Record<string, unknown>;
    if (cond) {
      // Very simple condition evaluation for our 2 patterns
      if (cond === '#status IN (:pending, :scored)') {
        if (item.status !== values[':pending'] && item.status !== values[':scored']) {
          const err = new Error('Conditional check failed') as Error & { name: string };
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
      } else if (
        cond ===
        '#status = :scored OR (attribute_exists(grantTxDigest) AND grantTxDigest = :digest)'
      ) {
        const okFirst = item.status === values[':scored'];
        const okSecond =
          item.grantTxDigest != null && item.grantTxDigest === values[':digest'];
        if (!okFirst && !okSecond) {
          const err = new Error('Conditional check failed') as Error & { name: string };
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
      }
    }
    // Parse UpdateExpression: SET a = :x, b = :y, ...
    const updateExpr = input.UpdateExpression as string;
    const setClause = updateExpr.replace(/^SET\s+/i, '');
    const assigns = setClause.split(',').map((s) => s.trim());
    const names = (input.ExpressionAttributeNames || {}) as Record<string, string>;
    for (const a of assigns) {
      const [lhs, rhs] = a.split('=').map((s) => s.trim());
      const attrName = lhs.startsWith('#') ? names[lhs] : lhs;
      const v = rhs.startsWith(':') ? values[rhs] : rhs;
      item[attrName] = v;
    }
    state.items.set(key.postId, item);
    return { Attributes: item };
  }

  throw new Error(`Unhandled command in mockSend: ${name}`);
}

// Patch DDB client before importing handlers
before(async () => {
  const lib = await import('@aws-sdk/lib-dynamodb');
  // @ts-expect-error - runtime monkey-patch
  lib.DynamoDBDocumentClient.from = () => ({ send: mockSend });
});

// Dynamic imports to pick up patched DDB
let handleSubmit: typeof import('../creator-posts').handleSubmit;
let handleMyList: typeof import('../creator-posts').handleMyList;

before(async () => {
  const mod = await import('../creator-posts');
  handleSubmit = mod.handleSubmit;
  handleMyList = mod.handleMyList;
});

// ============================================
// Event builder
// ============================================

function buildEvent(
  method: 'POST' | 'GET',
  body?: unknown,
  query?: Record<string, string>,
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: query || null,
    headers: { origin: 'https://nasun.io' },
    path: method === 'POST' ? '/v1/creator-posts' : '/v1/creator-posts/my',
    pathParameters: null,
    requestContext: { authorizer: {} } as never,
    resource: '',
    stageVariables: null,
    multiValueHeaders: null,
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEvent;
}

function cors() {
  return { 'Access-Control-Allow-Origin': 'https://nasun.io' };
}

function parseBody(res: APIGatewayProxyResult): Record<string, unknown> {
  return JSON.parse(res.body);
}

// ============================================
// Fixtures
// ============================================

const USER_A = 'ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B = 'ap-northeast-2:ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj';

function setupUsers() {
  state.userProfiles.set(USER_A, {
    identityId: USER_A,
    twitterHandle: 'alice',
    twitterId: '1001',
    profileImageUrl: 'https://pbs.twimg.com/profile_images/1/alice_400x400.jpg',
  });
  state.userProfiles.set(USER_B, {
    identityId: USER_B,
    twitterHandle: 'bob',
    twitterId: '1002',
    profileImageUrl: 'https://evil.com/bob.jpg', // intentionally bad host
  });
}

beforeEach(() => {
  resetState();
  setupUsers();
});

// ============================================
// Submit — happy path
// ============================================

describe('POST /v1/creator-posts — submit', () => {
  test('happy path: accepts, stores PENDING, canonicalizes URL', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://twitter.com/Alice/status/100001?s=20' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.equal(body.postId, '100001');
    assert.equal(body.status, 'PENDING');
    assert.equal(body.dailyLimit, 3);
    assert.equal(body.remainingToday, 2);

    const stored = state.items.get('100001');
    assert.ok(stored);
    assert.equal(stored!.status, 'PENDING');
    assert.equal(stored!.twitterHandle, 'alice'); // lowercased
    assert.equal(stored!.postUrl, 'https://x.com/alice/status/100001'); // canonical
    assert.equal(stored!.identityId, USER_A);
    assert.equal(
      stored!.twitterProfileImageUrl,
      'https://pbs.twimg.com/profile_images/1/alice_400x400.jpg',
    );
  });

  test('omits twitterProfileImageUrl when allowlist fails', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/bob/status/200001' }),
      USER_B,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const stored = state.items.get('200001');
    assert.ok(stored);
    assert.equal(stored!.twitterProfileImageUrl, undefined);
  });

  test('returns 400 twitter_not_linked when profile missing handle', async () => {
    state.userProfiles.set(USER_A, { identityId: USER_A }); // wipe handle
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100001' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(parseBody(res).error, 'twitter_not_linked');
  });

  test('returns 400 invalid_url for non-tweet URL', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(parseBody(res).error, 'invalid_url');
  });

  test('returns 400 invalid_url for javascript:', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'javascript:alert(1)' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(parseBody(res).error, 'invalid_url');
  });

  test('returns 400 handle_mismatch for another user\'s post', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/bob/status/100001' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(parseBody(res).error, 'handle_mismatch');
    assert.equal(state.items.size, 0);
  });

  test('case-insensitive handle match (URL uppercase)', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/ALICE/status/100001' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(state.items.get('100001')?.twitterHandle, 'alice');
  });

  test('returns 409 already_submitted on duplicate (same user)', async () => {
    await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100001' }),
      USER_A,
      cors(),
    );
    const res2 = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100001' }),
      USER_A,
      cors(),
    );
    assert.equal(res2.statusCode, 409);
    assert.equal(parseBody(res2).error, 'already_submitted');
  });

  test('returns 409 already_submitted even if other user attempts same tweet', async () => {
    await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100001' }),
      USER_A,
      cors(),
    );
    // Another user trying same tweet — handle check fails first (they are 'bob')
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/bob/status/100001' }),
      USER_B,
      cors(),
    );
    // bob's URL is different (different handle) — actually it parses to same postId
    // 100001. So this tests the permanent block: even with different URL path, same
    // tweet ID is blocked.
    assert.equal(res.statusCode, 409);
    assert.equal(parseBody(res).error, 'already_submitted');
  });

  test('returns 429 at daily limit (inclusive of PENDING/SCORED/GRANTED)', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await handleSubmit(
        buildEvent('POST', { postUrl: `https://x.com/alice/status/10000${i}` }),
        USER_A,
        cors(),
      );
      assert.equal(res.statusCode, 200);
    }
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100004' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 429);
    const body = parseBody(res);
    assert.equal(body.error, 'daily_limit_reached');
    assert.equal(body.dailyLimit, 3);
    assert.ok(typeof body.resetAt === 'string');
  });

  test('rejected submissions do NOT consume daily quota', async () => {
    for (let i = 1; i <= 3; i++) {
      await handleSubmit(
        buildEvent('POST', { postUrl: `https://x.com/alice/status/10000${i}` }),
        USER_A,
        cors(),
      );
    }
    // Manually flip one to REJECTED
    state.items.get('100001')!.status = 'REJECTED';
    // Now quota should count 2 (100002 PENDING, 100003 PENDING)
    const res = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100004' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 200);
  });

  test('invalid url does NOT consume quota', async (t: TestContext) => {
    // Fill to 2/3 with good submissions
    await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100001' }),
      USER_A,
      cors(),
    );
    await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100002' }),
      USER_A,
      cors(),
    );
    // Spray 10 invalid attempts — none should consume quota
    for (let i = 0; i < 10; i++) {
      const res = await handleSubmit(
        buildEvent('POST', { postUrl: 'not-a-url' }),
        USER_A,
        cors(),
      );
      assert.equal(res.statusCode, 400);
    }
    // Third valid submission still works
    const ok = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100003' }),
      USER_A,
      cors(),
    );
    t.diagnostic(`remaining after 3: ${parseBody(ok).remainingToday}`);
    assert.equal(ok.statusCode, 200);
    // Next must be 429
    const block = await handleSubmit(
      buildEvent('POST', { postUrl: 'https://x.com/alice/status/100004' }),
      USER_A,
      cors(),
    );
    assert.equal(block.statusCode, 429);
  });

  test('returns 400 on malformed JSON body', async () => {
    const ev = buildEvent('POST');
    ev.body = '{not valid json';
    const res = await handleSubmit(ev, USER_A, cors());
    assert.equal(res.statusCode, 400);
  });

  test('returns 400 when postUrl missing', async () => {
    const res = await handleSubmit(
      buildEvent('POST', { foo: 'bar' }),
      USER_A,
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });
});

// ============================================
// List
// ============================================

describe('GET /v1/creator-posts/my — list', () => {
  test('returns empty list when no submissions', async () => {
    const res = await handleMyList(buildEvent('GET'), USER_A, cors());
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.deepEqual(body.items, []);
  });

  test('returns all non-canceled items (newest first)', async () => {
    // Directly seed state
    const now = Date.now();
    state.items.set('p1', {
      postId: 'p1',
      createdAt: new Date(now).toISOString(),
      identityId: USER_A,
      status: 'PENDING',
      twitterHandle: 'alice',
      postUrl: 'https://x.com/alice/status/p1',
    });
    state.items.set('p2', {
      postId: 'p2',
      createdAt: new Date(now + 1000).toISOString(),
      identityId: USER_A,
      status: 'SCORED',
      twitterHandle: 'alice',
      postUrl: 'https://x.com/alice/status/p2',
      scoredPoints: 10,
    });
    state.items.set('p3', {
      postId: 'p3',
      createdAt: new Date(now + 2000).toISOString(),
      identityId: USER_A,
      status: 'CANCELED', // excluded
      twitterHandle: 'alice',
      postUrl: 'https://x.com/alice/status/p3',
    });

    const res = await handleMyList(buildEvent('GET'), USER_A, cors());
    assert.equal(res.statusCode, 200);
    const body = parseBody(res) as { items: Array<{ postId: string }> };
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].postId, 'p2'); // newest
    assert.equal(body.items[1].postId, 'p1');
  });

  test('respects limit query param', async () => {
    for (let i = 0; i < 5; i++) {
      state.items.set(`p${i}`, {
        postId: `p${i}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
        identityId: USER_A,
        status: 'PENDING',
        twitterHandle: 'alice',
        postUrl: `https://x.com/alice/status/p${i}`,
      });
    }
    const res = await handleMyList(
      buildEvent('GET', undefined, { limit: '2' }),
      USER_A,
      cors(),
    );
    const body = parseBody(res) as { items: unknown[] };
    assert.equal(body.items.length, 2);
  });

  test('does not leak another user\'s submissions (IDOR guard)', async () => {
    state.items.set('pA', {
      postId: 'pA',
      createdAt: new Date().toISOString(),
      identityId: USER_A,
      status: 'PENDING',
    });
    state.items.set('pB', {
      postId: 'pB',
      createdAt: new Date().toISOString(),
      identityId: USER_B,
      status: 'PENDING',
    });
    const res = await handleMyList(buildEvent('GET'), USER_A, cors());
    const body = parseBody(res) as { items: Array<{ postId: string }> };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].postId, 'pA');
  });
});
