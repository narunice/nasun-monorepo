/**
 * Plan D D-3 — wake endpoint + idempotency + JWT/HMAC integration tests.
 *
 * Covers all four new modules in one file: jwt-verify, idempotency,
 * wake-router, wake-server. Builds a real Hono app and hits it with `fetch`
 * style Request objects via `app.fetch` (no socket bind).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { newIntentId } from '@nasun/baram-sdk';
import { verifyJWT, verifyHmac } from './jwt-verify.js';
import { IdempotencyStore } from './idempotency.js';
import { dispatchWake, type WakeRouterDeps, type WakeContext } from './wake-router.js';
import { buildWakeApp } from './wake-server.js';

const JWT_SECRET = 'a'.repeat(64);
const HMAC_SECRET = 'b'.repeat(64);

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(sid: string, expSec: number): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8'));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({ sid, iat: Math.floor(Date.now() / 1000), exp: expSec, jti: 'test' }),
      'utf8',
    ),
  );
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${b64url(sig)}`;
}

function hmac(body: string): string {
  return createHmac('sha256', HMAC_SECRET).update(body, 'utf8').digest('hex');
}

function tempDbPath(): string {
  return join(tmpdir(), `baram-idempotency-test-${randomBytes(8).toString('hex')}.db`);
}

beforeEach(() => {
  process.env.BARAM_SESSION_JWT_SECRET = JWT_SECRET;
  process.env.BARAM_CHAT_SERVER_HMAC_SECRET = HMAC_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verifyJWT (HS256, alg-confusion safe)', () => {
  it('accepts a freshly-signed token', () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const r = verifyJWT(signJwt('sid-abc', exp));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sid).toBe('sid-abc');
  });

  it('rejects malformed tokens (wrong part count)', () => {
    expect(verifyJWT('a.b').ok).toBe(false);
  });

  it('rejects bad header (e.g. alg=none confusion)', () => {
    const noneHeader = b64url(Buffer.from('{"alg":"none","typ":"JWT"}', 'utf8'));
    const payload = b64url(
      Buffer.from(JSON.stringify({ sid: 'x', exp: Math.floor(Date.now() / 1000) + 300 }), 'utf8'),
    );
    const r = verifyJWT(`${noneHeader}.${payload}.`);
    expect(r).toEqual({ ok: false, reason: 'bad_header' });
  });

  it('rejects tampered signatures', () => {
    const t = signJwt('sid-x', Math.floor(Date.now() / 1000) + 300);
    const tampered = t.slice(0, -2) + 'AA';
    const r = verifyJWT(tampered);
    expect(r.ok).toBe(false);
  });

  it('rejects expired tokens', () => {
    const r = verifyJWT(signJwt('sid-x', Math.floor(Date.now() / 1000) - 1));
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('fails fast when secret is missing or too short', () => {
    delete process.env.BARAM_SESSION_JWT_SECRET;
    expect(verifyJWT('a.b.c')).toEqual({ ok: false, reason: 'no_secret' });
    process.env.BARAM_SESSION_JWT_SECRET = 'short';
    expect(verifyJWT('a.b.c')).toEqual({ ok: false, reason: 'no_secret' });
  });
});

describe('verifyHmac (timing-safe)', () => {
  it('accepts valid hex HMAC for given body', () => {
    const body = '{"hello":"world"}';
    expect(verifyHmac(body, hmac(body))).toBe(true);
  });

  it('rejects mismatched HMAC', () => {
    expect(verifyHmac('{"x":1}', hmac('{"x":2}'))).toBe(false);
  });

  it('rejects malformed hex', () => {
    expect(verifyHmac('{"x":1}', 'ZZZ')).toBe(false);
  });

  it('rejects when secret missing', () => {
    delete process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
    expect(verifyHmac('{}', hmac('{}'))).toBe(false);
  });
});

describe('IdempotencyStore (sqlite)', () => {
  let path: string;
  let store: IdempotencyStore;

  beforeEach(() => {
    path = tempDbPath();
    store = new IdempotencyStore(path);
  });

  afterEach(() => {
    store.close();
    if (existsSync(path)) unlinkSync(path);
  });

  it('returns null for unknown job_id', () => {
    expect(store.get('nope')).toBeNull();
  });

  it('persists outcome and is read-after-write', () => {
    store.put('job-1', 'agent-1', { ok: true, summary: 'done' });
    const r = store.get('job-1');
    expect(r?.outcome).toEqual({ ok: true, summary: 'done' });
    expect(r?.agent).toBe('agent-1');
  });

  it('treats put as insert-only (does not overwrite)', () => {
    store.put('job-1', 'agent-1', { ok: true, n: 1 });
    store.put('job-1', 'agent-2', { ok: false, n: 2 });
    const r = store.get('job-1');
    expect(r?.agent).toBe('agent-1');
    expect((r?.outcome as { n: number }).n).toBe(1);
  });
});

describe('dispatchWake (router)', () => {
  let store: IdempotencyStore;
  let dbPath: string;
  const baseConfig = { agentAddress: '0xagent' } as unknown as WakeRouterDeps['config'];

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new IdempotencyStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  function mkCtx(over: Partial<WakeContext> = {}): WakeContext {
    return {
      jobId: newIntentId(),
      triggerType: 'user_message',
      intentId: newIntentId(),
      sid: 'sid-1',
      nowMs: Date.now(),
      ...over,
    };
  }

  it('rejects inactive triggers (e.g. price_alert)', async () => {
    const r = await dispatchWake(mkCtx({ triggerType: 'price_alert' as never }), {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('rejected');
  });

  it('runs handler and persists outcome', async () => {
    const ctx = mkCtx();
    const r = await dispatchWake(ctx, {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
      runAnalystCycle: async () => ({ ok: true, status: 'processed', summary: 'hello' }),
    });
    expect(r.summary).toBe('hello');
    const prior = store.get(ctx.jobId);
    expect((prior?.outcome as { summary: string }).summary).toBe('hello');
  });

  it('returns prior outcome on duplicate job_id without re-running handler', async () => {
    const ctx = mkCtx();
    let calls = 0;
    const handler = async () => {
      calls++;
      return { ok: true, status: 'processed' as const, summary: `call-${calls}` };
    };
    await dispatchWake(ctx, {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
      runAnalystCycle: handler,
    });
    const second = await dispatchWake(ctx, {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
      runAnalystCycle: handler,
    });
    expect(calls).toBe(1);
    expect(second.summary).toBe('call-1');
    expect(second.reason).toBe('idempotent_replay');
  });

  it('captures handler exceptions as rejected outcomes', async () => {
    const ctx = mkCtx();
    const r = await dispatchWake(ctx, {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
      runAnalystCycle: async () => {
        throw new Error('boom');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/boom/);
    const prior = store.get(ctx.jobId);
    expect(prior).not.toBeNull();
  });

  it('returns queued when handler for trigger is not wired', async () => {
    const r = await dispatchWake(mkCtx({ triggerType: 'manual' }), {
      client: {} as never,
      config: baseConfig,
      idempotency: store,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('manual_handler_not_wired');
  });
});

describe('buildWakeApp (POST /wake end-to-end via fetch handler)', () => {
  let store: IdempotencyStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new IdempotencyStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  function buildApp(handler?: (ctx: WakeContext) => Promise<{ ok: true; status: 'processed'; summary: string }>) {
    return buildWakeApp({
      client: {} as never,
      config: { agentAddress: '0xagent' } as never,
      idempotency: store,
      port: 0,
      logger: () => undefined,
      runAnalystCycle: handler,
    });
  }

  async function post(app: ReturnType<typeof buildApp>, body: unknown, headers: Record<string, string>) {
    const bodyStr = JSON.stringify(body);
    return app.fetch(
      new Request('http://localhost/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: bodyStr,
      }),
    );
  }

  it('responds 200 to GET /health', async () => {
    const app = buildApp();
    const r = await app.fetch(new Request('http://localhost/health'));
    expect(r.status).toBe(200);
  });

  it('rejects missing HMAC with 401', async () => {
    const app = buildApp();
    const body = { job_id: newIntentId(), jwt: 'x', trigger_type: 'user_message', intent_id: newIntentId() };
    const r = await post(app, body, {});
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false, error: 'missing_hmac' });
  });

  it('rejects wrong HMAC with 401', async () => {
    const app = buildApp();
    const body = { job_id: newIntentId(), jwt: 'x', trigger_type: 'user_message', intent_id: newIntentId() };
    const r = await post(app, body, { 'X-HMAC': 'a'.repeat(64) });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false, error: 'bad_hmac' });
  });

  it('rejects bad JWT with 401 after valid HMAC', async () => {
    const app = buildApp();
    // shape-valid JWT (3 dot-separated parts, ≥20 chars) but signature is garbage
    const fakeJwt = 'aaaaaaaa.bbbbbbbb.cccccccccccccccccccc';
    const body = {
      job_id: newIntentId(),
      jwt: fakeJwt,
      trigger_type: 'user_message',
      intent_id: newIntentId(),
    };
    const bodyStr = JSON.stringify(body);
    const r = await app.fetch(
      new Request('http://localhost/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac(bodyStr) },
        body: bodyStr,
      }),
    );
    expect(r.status).toBe(401);
    const j = (await r.json()) as { error: string };
    expect(j.error).toMatch(/^jwt_/);
  });

  it('rejects invalid body schema with 400', async () => {
    const app = buildApp();
    const body = { job_id: 'not-a-ulid', jwt: 'x'.repeat(40), trigger_type: 'user_message', intent_id: newIntentId() };
    const bodyStr = JSON.stringify(body);
    const r = await app.fetch(
      new Request('http://localhost/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac(bodyStr) },
        body: bodyStr,
      }),
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'invalid_job_id' });
  });

  it('dispatches successfully when all checks pass', async () => {
    let dispatched: WakeContext | null = null;
    const app = buildApp(async (ctx) => {
      dispatched = ctx;
      return { ok: true, status: 'processed', summary: 'analyst ran' };
    });
    const body = {
      job_id: newIntentId(),
      jwt: signJwt('sid-xyz', Math.floor(Date.now() / 1000) + 300),
      trigger_type: 'user_message',
      intent_id: newIntentId(),
      message: 'NBTC 좀 사도 될까?',
    };
    const bodyStr = JSON.stringify(body);
    const r = await app.fetch(
      new Request('http://localhost/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac(bodyStr) },
        body: bodyStr,
      }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; summary?: string };
    expect(j.ok).toBe(true);
    expect(j.summary).toBe('analyst ran');
    expect(dispatched).not.toBeNull();
    expect(dispatched!.sid).toBe('sid-xyz');
    expect(dispatched!.message).toBe('NBTC 좀 사도 될까?');
  });

  it('returns prior outcome on duplicate job_id', async () => {
    const jobId = newIntentId();
    let calls = 0;
    const app = buildApp(async () => {
      calls++;
      return { ok: true, status: 'processed', summary: `n=${calls}` };
    });
    const body = {
      job_id: jobId,
      jwt: signJwt('sid-r', Math.floor(Date.now() / 1000) + 300),
      trigger_type: 'user_message' as const,
      intent_id: newIntentId(),
    };
    const bodyStr = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'X-HMAC': hmac(bodyStr) };
    await app.fetch(new Request('http://localhost/wake', { method: 'POST', headers, body: bodyStr }));
    const second = await app.fetch(
      new Request('http://localhost/wake', { method: 'POST', headers, body: bodyStr }),
    );
    const j = (await second.json()) as { reason?: string; summary?: string };
    expect(calls).toBe(1);
    expect(j.summary).toBe('n=1');
    expect(j.reason).toBe('idempotent_replay');
  });
});
