/**
 * Creator Posts admin handler integration tests.
 *
 * Covers: score/reject/grant state transitions + idempotency + tampered digest guard
 * + REJECTED/CANCELED terminal states + race resolution.
 *
 * DDB + fetch(Explorer) are stubbed in-memory.
 *
 * Run with:
 *   npx --no-install tsx --test apps/nasun-website/cdk/lambda-src/bug-report-admin/src/__tests__/creator-posts-admin.test.ts
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

process.env.CREATOR_POSTS_TABLE = 'test-nasun-creator-posts';
process.env.USER_PROFILES_TABLE = 'test-UserProfiles';
process.env.EXPLORER_API_URL = 'https://explorer.test';
process.env.BUG_REPORT_API_KEY = 'test-api-key';

// ============================================
// In-memory DDB
// ============================================

type DdbItem = Record<string, unknown>;

interface DdbState {
  items: Map<string, DdbItem>;
  userProfiles: Map<string, DdbItem>;
}

let state: DdbState;

function resetState() {
  state = { items: new Map(), userProfiles: new Map() };
}

async function mockSend(cmd: unknown): Promise<unknown> {
  const name = (cmd as { constructor: { name: string } }).constructor.name;
  const input = (cmd as { input: Record<string, unknown> }).input;

  if (name === 'GetCommand') {
    const tbl = input.TableName as string;
    const key = input.Key as { postId?: string; identityId?: string };
    if (tbl === process.env.USER_PROFILES_TABLE) {
      const item = state.userProfiles.get(key.identityId!);
      return item ? { Item: item } : {};
    }
    if (tbl === process.env.CREATOR_POSTS_TABLE) {
      const item = state.items.get(key.postId!);
      return item ? { Item: { ...item } } : {};
    }
    throw new Error(`GetCommand table ${tbl}`);
  }

  if (name === 'QueryCommand') {
    const tbl = input.TableName as string;
    const indexName = input.IndexName as string;
    const values = (input.ExpressionAttributeValues || {}) as Record<string, unknown>;
    if (tbl === process.env.CREATOR_POSTS_TABLE && indexName === 'status-createdAt-index') {
      let list = [...state.items.values()].filter((it) => it.status === values[':status']);
      if (input.ScanIndexForward === false) {
        list.sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        );
      }
      if (typeof input.Limit === 'number') list = list.slice(0, input.Limit as number);
      return {
        Items: list.map((it) => ({
          postId: it.postId,
          status: it.status,
          createdAt: it.createdAt,
        })),
      };
    }
    throw new Error(`QueryCommand unexpected ${tbl}/${indexName}`);
  }

  if (name === 'BatchGetCommand') {
    const req = input.RequestItems as Record<string, { Keys: Array<{ postId: string }> }>;
    const tblReq = req[process.env.CREATOR_POSTS_TABLE!];
    const items = (tblReq?.Keys || [])
      .map((k) => state.items.get(k.postId))
      .filter((x): x is DdbItem => !!x)
      .map((x) => ({ ...x }));
    return { Responses: { [process.env.CREATOR_POSTS_TABLE!]: items } };
  }

  if (name === 'UpdateCommand') {
    const tbl = input.TableName as string;
    if (tbl !== process.env.CREATOR_POSTS_TABLE) throw new Error(`UpdateCommand ${tbl}`);
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
      if (cond === '#status IN (:pending, :scored)') {
        if (item.status !== values[':pending'] && item.status !== values[':scored']) {
          const err = new Error('cond failed') as Error & { name: string };
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
          const err = new Error('cond failed') as Error & { name: string };
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
      }
    }
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

  throw new Error(`Unhandled mock cmd: ${name}`);
}

// Explorer fetch mock
interface ExplorerCall {
  body: Record<string, unknown>;
  key: string;
}
let explorerCalls: ExplorerCall[];
let explorerBehavior: (call: ExplorerCall) => { status: number; body: unknown };

before(async () => {
  const lib = await import('@aws-sdk/lib-dynamodb');
  // @ts-expect-error - runtime monkey-patch
  lib.DynamoDBDocumentClient.from = () => ({ send: mockSend });

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (!u.includes('/v1/points/creator-post-reward')) {
      throw new Error(`Unexpected fetch URL: ${u}`);
    }
    const body = JSON.parse((init?.body as string) || '{}');
    const headers = (init?.headers || {}) as Record<string, string>;
    const call: ExplorerCall = { body, key: headers['x-api-key'] || '' };
    explorerCalls.push(call);
    const behavior = explorerBehavior(call);
    return {
      ok: behavior.status >= 200 && behavior.status < 300,
      status: behavior.status,
      json: async () => behavior.body,
      text: async () =>
        typeof behavior.body === 'string' ? behavior.body : JSON.stringify(behavior.body),
    } as unknown as Response;
  }) as typeof fetch;
});

let handleList: typeof import('../creator-posts-admin').handleList;
let handleScore: typeof import('../creator-posts-admin').handleScore;
let handleReject: typeof import('../creator-posts-admin').handleReject;
let handleGrant: typeof import('../creator-posts-admin').handleGrant;

before(async () => {
  const mod = await import('../creator-posts-admin');
  handleList = mod.handleList;
  handleScore = mod.handleScore;
  handleReject = mod.handleReject;
  handleGrant = mod.handleGrant;
});

// ============================================
// Fixtures
// ============================================

const ADMIN = 'ap-northeast-2:admin-user-iddddddddddddddddddddd';
const USER_A = 'ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildEvent(
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
  pathParameters?: Record<string, string>,
  query?: Record<string, string>,
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
    queryStringParameters: query || null,
    headers: { origin: 'https://nasun.io' },
    path: '/admin/creator-posts',
    requestContext: { authorizer: { identityId: ADMIN } } as never,
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

function seedPost(postId: string, status: string, extra: Partial<DdbItem> = {}) {
  state.items.set(postId, {
    postId,
    createdAt: new Date().toISOString(),
    identityId: USER_A,
    twitterHandle: 'alice',
    twitterId: '1001',
    postUrl: `https://x.com/alice/status/${postId}`,
    status,
    ...extra,
  });
}

beforeEach(() => {
  resetState();
  state.userProfiles.set(USER_A, {
    identityId: USER_A,
    twitterHandle: 'alice',
    walletAddress:
      '0x' + 'a'.repeat(64),
  });
  explorerCalls = [];
  explorerBehavior = () => ({ status: 200, body: { created: true, txDigest: 'x' } });
});

// ============================================
// score
// ============================================

describe('PATCH /:postId/score', () => {
  test('PENDING → SCORED with valid points', async () => {
    seedPost('p1', 'PENDING');
    const res = await handleScore(
      buildEvent('PATCH', { points: 15 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const item = state.items.get('p1');
    assert.equal(item!.status, 'SCORED');
    assert.equal(item!.scoredPoints, 15);
    assert.equal(item!.scoredByAdminId, ADMIN);
  });

  test('SCORED → SCORED (update score)', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 5 });
    await handleScore(
      buildEvent('PATCH', { points: 25 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(state.items.get('p1')!.scoredPoints, 25);
  });

  test('rejects points out of range', async () => {
    seedPost('p1', 'PENDING');
    const low = await handleScore(
      buildEvent('PATCH', { points: 0 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(low.statusCode, 400);
    const high = await handleScore(
      buildEvent('PATCH', { points: 31 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(high.statusCode, 400);
    const frac = await handleScore(
      buildEvent('PATCH', { points: 5.5 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(frac.statusCode, 400);
    // state unchanged
    assert.equal(state.items.get('p1')!.status, 'PENDING');
  });

  test('GRANTED record rejects score mutation (409)', async () => {
    seedPost('p1', 'GRANTED', { scoredPoints: 10, grantTxDigest: 'creatorpost:p1' });
    const res = await handleScore(
      buildEvent('PATCH', { points: 15 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
    // state unchanged
    assert.equal(state.items.get('p1')!.scoredPoints, 10);
  });

  test('REJECTED record rejects score mutation', async () => {
    seedPost('p1', 'REJECTED', { rejectionReason: 'off-topic' });
    const res = await handleScore(
      buildEvent('PATCH', { points: 10 }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
  });

  test('missing postId → 400', async () => {
    const res = await handleScore(
      buildEvent('PATCH', { points: 10 }, undefined),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });
});

// ============================================
// reject
// ============================================

describe('PATCH /:postId/reject', () => {
  test('PENDING → REJECTED with reason', async () => {
    seedPost('p1', 'PENDING');
    const res = await handleReject(
      buildEvent('PATCH', { reason: 'spam' }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const item = state.items.get('p1');
    assert.equal(item!.status, 'REJECTED');
    assert.equal(item!.rejectionReason, 'spam');
  });

  test('SCORED → REJECTED (pre-grant rollback)', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 10 });
    const res = await handleReject(
      buildEvent('PATCH', { reason: 'changed mind' }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(state.items.get('p1')!.status, 'REJECTED');
  });

  test('GRANTED rejects reject mutation', async () => {
    seedPost('p1', 'GRANTED', { grantTxDigest: 'creatorpost:p1' });
    const res = await handleReject(
      buildEvent('PATCH', { reason: 'too late' }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
  });

  test('empty reason → 400', async () => {
    seedPost('p1', 'PENDING');
    const res = await handleReject(
      buildEvent('PATCH', { reason: '' }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });

  test('reason over 500 chars → 400', async () => {
    seedPost('p1', 'PENDING');
    const res = await handleReject(
      buildEvent('PATCH', { reason: 'x'.repeat(501) }, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });
});

// ============================================
// grant
// ============================================

describe('POST /:postId/grant', () => {
  test('SCORED → GRANTED on happy path', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 20 });
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.equal(body.status, 'GRANTED');
    assert.equal(body.scoredPoints, 20);
    assert.equal(body.duplicate, false);

    const item = state.items.get('p1');
    assert.equal(item!.status, 'GRANTED');
    assert.equal(item!.grantTxDigest, 'creatorpost:p1');
    assert.equal(item!.grantedByAdminId, ADMIN);

    // Explorer called with correct payload
    assert.equal(explorerCalls.length, 1);
    assert.equal(explorerCalls[0].key, 'test-api-key');
    assert.equal(explorerCalls[0].body.postId, 'p1');
    assert.equal(explorerCalls[0].body.points, 20);
    assert.equal(explorerCalls[0].body.identityId, USER_A);
    assert.equal(explorerCalls[0].body.walletAddress, '0x' + 'a'.repeat(64));
  });

  test('omits walletAddress when UserProfiles lacks one', async () => {
    state.userProfiles.set(USER_A, { identityId: USER_A });
    seedPost('p1', 'SCORED', { scoredPoints: 5 });
    await handleGrant(buildEvent('POST', undefined, { postId: 'p1' }), ADMIN, cors());
    assert.equal(explorerCalls.length, 1);
    assert.equal(explorerCalls[0].body.walletAddress, undefined);
  });

  test('finds walletAddress in linkedAccounts.nasun wallet', async () => {
    const nasunWallet = '0x' + 'b'.repeat(64);
    state.userProfiles.set(USER_A, {
      identityId: USER_A,
      linkedAccounts: { 'nasun wallet': { walletAddress: nasunWallet } },
    });
    seedPost('p1', 'SCORED', { scoredPoints: 5 });
    await handleGrant(buildEvent('POST', undefined, { postId: 'p1' }), ADMIN, cors());
    assert.equal(explorerCalls[0].body.walletAddress, nasunWallet);
  });

  test('idempotent retry: already-GRANTED with same digest → 200', async () => {
    seedPost('p1', 'GRANTED', {
      scoredPoints: 20,
      grantTxDigest: 'creatorpost:p1',
      grantedAt: '2026-04-12T00:00:00.000Z',
    });
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.equal(body.idempotent, true);
    // Short-circuited: Explorer NOT called
    assert.equal(explorerCalls.length, 0);
  });

  test('tampered grantTxDigest → 500 (entry guard)', async () => {
    seedPost('p1', 'GRANTED', {
      scoredPoints: 20,
      grantTxDigest: 'creatorpost:DIFFERENT_ID', // tampered
    });
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 500);
    assert.equal(parseBody(res).error, 'inconsistent_state');
    assert.equal(explorerCalls.length, 0);
  });

  test('PENDING (not SCORED) → 409 invalid_state', async () => {
    seedPost('p1', 'PENDING');
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
    assert.equal(parseBody(res).error, 'invalid_state');
    assert.equal(explorerCalls.length, 0);
  });

  test('REJECTED → 409 invalid_state', async () => {
    seedPost('p1', 'REJECTED', { rejectionReason: 'off-topic' });
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
  });

  test('CANCELED → 409 invalid_state', async () => {
    seedPost('p1', 'CANCELED');
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 409);
  });

  test('missing scoredPoints → 400', async () => {
    seedPost('p1', 'SCORED'); // no scoredPoints seeded
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });

  test('post not found → 404', async () => {
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'nonexistent' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 404);
  });

  test('Explorer returns duplicate=true (PG ON CONFLICT path)', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 15 });
    explorerBehavior = () => ({
      status: 200,
      body: { created: false, txDigest: 'creatorpost:p1' },
    });
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.equal(body.duplicate, true);
    assert.equal(state.items.get('p1')!.status, 'GRANTED');
  });

  test('Explorer returns 500 — DDB NOT transitioned, retry-safe', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 15 });
    let attempt = 0;
    explorerBehavior = () => {
      attempt++;
      return { status: 500, body: { error: 'server' } };
    };
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 502);
    assert.equal(parseBody(res).error, 'explorer_unavailable');
    // Status still SCORED
    assert.equal(state.items.get('p1')!.status, 'SCORED');
    assert.ok(attempt >= 3, `expected at least 3 attempts, got ${attempt}`); // retries
  });

  test('Explorer returns 401 (bad key) → no retry, 502', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 15 });
    let attempt = 0;
    explorerBehavior = () => {
      attempt++;
      return { status: 401, body: { error: 'unauthorized' } };
    };
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 502);
    // 4xx must not retry
    assert.equal(attempt, 1);
    assert.equal(state.items.get('p1')!.status, 'SCORED');
  });

  test('retry after transient success still converges to GRANTED idempotently', async () => {
    seedPost('p1', 'SCORED', { scoredPoints: 7 });
    // First call succeeds
    await handleGrant(buildEvent('POST', undefined, { postId: 'p1' }), ADMIN, cors());
    assert.equal(state.items.get('p1')!.status, 'GRANTED');
    assert.equal(explorerCalls.length, 1);

    // Retry (e.g., client retried because prior response lost): should be idempotent
    explorerCalls.length = 0;
    const res = await handleGrant(
      buildEvent('POST', undefined, { postId: 'p1' }),
      ADMIN,
      cors(),
    );
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).idempotent, true);
    assert.equal(explorerCalls.length, 0); // short-circuited at GetItem stage
  });
});

// ============================================
// list
// ============================================

describe('GET /admin/creator-posts', () => {
  test('defaults to PENDING when no status filter', async () => {
    seedPost('p1', 'PENDING');
    seedPost('p2', 'SCORED');
    seedPost('p3', 'GRANTED');
    const res = await handleList(buildEvent('GET'), cors());
    const body = parseBody(res) as { filter: string; items: Array<{ postId: string }> };
    assert.equal(res.statusCode, 200);
    assert.equal(body.filter, 'PENDING');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].postId, 'p1');
  });

  test('status filter: SCORED', async () => {
    seedPost('p1', 'PENDING');
    seedPost('p2', 'SCORED');
    seedPost('p3', 'SCORED');
    const res = await handleList(
      buildEvent('GET', undefined, undefined, { status: 'SCORED' }),
      cors(),
    );
    const body = parseBody(res) as { items: unknown[] };
    assert.equal(body.items.length, 2);
  });

  test('rejects invalid status', async () => {
    const res = await handleList(
      buildEvent('GET', undefined, undefined, { status: 'FOO' }),
      cors(),
    );
    assert.equal(res.statusCode, 400);
  });
});
