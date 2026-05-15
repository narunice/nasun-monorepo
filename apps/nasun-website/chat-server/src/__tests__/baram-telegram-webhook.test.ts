// Unit tests for D-2: Telegram webhook handler + intent classifier + agent registry.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { initStore, closeStore } from '../store.js';
import { handleBaramTelegramRequest } from '../baram-telegram-routes.js';
import { classifyIntent } from '../baram-intent-classifier.js';
import { upsertEndpoint, getEndpoint, isEndpointFresh, pruneStaleEndpoints } from '../baram-agent-registry.js';
import { createSession, bindTelegramUser, getActiveSessionByTgUser } from '../baram-session.js';
import { getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';

// ===== Test helpers =====

function makeTmpConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'baram-webhook-test-'));
  return { ...DEFAULT_CONFIG, port: 0, dbPath: join(dir, 'test.db'), allowedOrigins: [] };
}

const AGENT = '0x' + 'a1'.repeat(32);
const CAPABILITY = '0x' + 'b2'.repeat(32);
const WALLET = '0x' + 'c3'.repeat(32);
const HMAC_SECRET_HEX = 'a'.repeat(64); // 32-byte key in hex

// PR2.A: HMAC binds X-Timestamp + body. Tests must call signBodyWithTs
// and pass both X-HMAC + X-Timestamp headers; legacy body-only signing
// (signBody) is rejected by chat-server.
function signBodyWithTs(body: string, ts: string): string {
  const hmacInput = Buffer.concat([
    Buffer.from(ts + '\n', 'utf8'),
    Buffer.from(Buffer.from(body, 'utf8').toString('hex'), 'utf8'),
  ]);
  return createHmac('sha256', Buffer.from(HMAC_SECRET_HEX, 'hex')).update(hmacInput).digest('hex');
}

async function post(url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const bodyStr = JSON.stringify(body);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: bodyStr,
  });
}

// ===== Intent classifier =====

describe('classifyIntent', () => {
  it('classifies capability change — pause agent', () => {
    expect(classifyIntent('pause agent please')).toBe('capability_change');
  });

  it('classifies capability change — change risk', () => {
    expect(classifyIntent('I want to change my risk settings')).toBe('capability_change');
  });

  it('classifies capability change — set stop-loss', () => {
    expect(classifyIntent('set stop-loss to 5%')).toBe('capability_change');
  });

  it('classifies capability change — resume trading', () => {
    expect(classifyIntent('resume trading')).toBe('capability_change');
  });

  it('classifies capability change — kill switch', () => {
    expect(classifyIntent('activate kill switch')).toBe('capability_change');
  });

  it('forwards normal queries', () => {
    expect(classifyIntent('should I buy NBTC now?')).toBe('forward');
  });

  it('forwards market analysis questions', () => {
    expect(classifyIntent('what do you think about the NBTC price trend?')).toBe('forward');
  });

  it('forwards HOLD/why questions', () => {
    expect(classifyIntent('why did you HOLD last time?')).toBe('forward');
  });

  it('forwards empty-ish messages', () => {
    expect(classifyIntent('hi')).toBe('forward');
  });
});

// ===== Agent registry =====

describe('baram-agent-registry', () => {
  let config: ChatServerConfig;

  beforeEach(() => {
    config = makeTmpConfig();
    initStore(config);
  });

  afterEach(() => {
    closeStore();
    rmSync(config.dbPath.replace('/test.db', ''), { recursive: true, force: true });
  });

  it('upserts and retrieves an endpoint', () => {
    upsertEndpoint(AGENT, 'http://127.0.0.1:4400');
    const ep = getEndpoint(AGENT);
    expect(ep).not.toBeNull();
    expect(ep!.httpUrl).toBe('http://127.0.0.1:4400');
    expect(ep!.agent).toBe(AGENT.toLowerCase());
  });

  it('updates http_url on repeat upsert', () => {
    upsertEndpoint(AGENT, 'http://127.0.0.1:4400');
    upsertEndpoint(AGENT, 'http://127.0.0.1:4401');
    const ep = getEndpoint(AGENT);
    expect(ep!.httpUrl).toBe('http://127.0.0.1:4401');
  });

  it('returns null for unknown agent', () => {
    expect(getEndpoint('0x' + '9'.repeat(64))).toBeNull();
  });

  it('isEndpointFresh returns true for just-upserted endpoint', () => {
    upsertEndpoint(AGENT, 'http://127.0.0.1:4400');
    const ep = getEndpoint(AGENT)!;
    expect(isEndpointFresh(ep)).toBe(true);
  });

  it('isEndpointFresh returns false for old endpoint', () => {
    upsertEndpoint(AGENT, 'http://127.0.0.1:4400');
    const ep = getEndpoint(AGENT)!;
    expect(isEndpointFresh(ep, ep.lastSeen + 200_000)).toBe(false);
  });

  it('pruneStaleEndpoints removes old rows', () => {
    upsertEndpoint(AGENT, 'http://127.0.0.1:4400');
    // Manually age the row
    getDb().prepare(`UPDATE baram_agent_endpoints SET last_seen = 1 WHERE agent = ?`)
      .run(AGENT.toLowerCase());
    const pruned = pruneStaleEndpoints();
    expect(pruned).toBe(1);
    expect(getEndpoint(AGENT)).toBeNull();
  });
});

// ===== getActiveSessionByTgUser =====

describe('getActiveSessionByTgUser', () => {
  let config: ChatServerConfig;

  beforeEach(() => {
    config = makeTmpConfig();
    vi.stubEnv('BARAM_SESSION_JWT_SECRET', 'a'.repeat(32));
    initStore(config);
  });

  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
    rmSync(config.dbPath.replace('/test.db', ''), { recursive: true, force: true });
  });

  it('returns null before linking', () => {
    expect(getActiveSessionByTgUser('12345678')).toBeNull();
  });

  it('returns session after binding tg_user_id', () => {
    const session = createSession({ wallet: WALLET, agent: AGENT, capabilityId: CAPABILITY });
    const bound = bindTelegramUser(session.sid, '12345678');
    expect(bound).toBe(true);
    const found = getActiveSessionByTgUser('12345678');
    expect(found).not.toBeNull();
    expect(found!.sid).toBe(session.sid);
  });
});

// ===== Heartbeat route =====

describe('POST /api/baram/agent/heartbeat', () => {
  let config: ChatServerConfig;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const handled = await handleBaramTelegramRequest(req, res, url, { 'Content-Type': 'application/json' });
      if (!handled) { res.writeHead(404); res.end(); }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    config = makeTmpConfig();
    vi.stubEnv('BARAM_CHAT_SERVER_HMAC_SECRET', HMAC_SECRET_HEX);
    initStore(config);
  });

  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
    rmSync(config.dbPath.replace('/test.db', ''), { recursive: true, force: true });
  });

  it('rejects missing HMAC', async () => {
    const res = await post(`${baseUrl}/api/baram/agent/heartbeat`, { agent: AGENT, http_url: 'http://127.0.0.1:4400' });
    expect(res.status).toBe(401);
  });

  it('rejects bad HMAC', async () => {
    const body = JSON.stringify({ agent: AGENT, http_url: 'http://127.0.0.1:4400' });
    const res = await post(`${baseUrl}/api/baram/agent/heartbeat`, JSON.parse(body), { 'X-HMAC': 'bad' });
    expect(res.status).toBe(401);
  });

  it('rejects non-loopback http_url', async () => {
    const body = JSON.stringify({ agent: AGENT, http_url: 'http://evil.com/wake' });
    const ts = String(Date.now());
    const hmac = signBodyWithTs(body, ts);
    const res = await fetch(`${baseUrl}/api/baram/agent/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac, 'X-Timestamp': ts },
      body,
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_http_url');
  });

  it('accepts valid heartbeat and upserts endpoint', async () => {
    const body = JSON.stringify({ agent: AGENT, http_url: 'http://127.0.0.1:4400' });
    const ts = String(Date.now());
    const hmac = signBodyWithTs(body, ts);
    const res = await fetch(`${baseUrl}/api/baram/agent/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac, 'X-Timestamp': ts },
      body,
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
    // Verify persisted
    const ep = getEndpoint(AGENT);
    expect(ep).not.toBeNull();
    expect(ep!.httpUrl).toBe('http://127.0.0.1:4400');
  });
});

// ===== Webhook route =====

describe('POST /api/baram/telegram/webhook', () => {
  let config: ChatServerConfig;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const handled = await handleBaramTelegramRequest(req, res, url, { 'Content-Type': 'application/json' });
      if (!handled) { res.writeHead(404); res.end(); }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    config = makeTmpConfig();
    vi.stubEnv('BARAM_SESSION_JWT_SECRET', 'a'.repeat(32));
    vi.stubEnv('BARAM_TG_BOT_TOKEN', '12345:FAKE_TOKEN');
    vi.stubEnv('BARAM_TG_WEBHOOK_SECRET', ''); // empty = dev mode (no secret check)
    initStore(config);
  });

  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
    rmSync(config.dbPath.replace('/test.db', ''), { recursive: true, force: true });
  });

  it('returns 200 immediately for any valid update', async () => {
    const update = { update_id: 1, message: { message_id: 1, from: { id: 999 }, chat: { id: 999 }, text: 'hello' } };
    const res = await post(`${baseUrl}/api/baram/telegram/webhook`, update);
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 401 when webhook secret is wrong', async () => {
    process.env.BARAM_TG_WEBHOOK_SECRET = 'correct-secret';
    const update = { update_id: 2, message: { message_id: 2, from: { id: 999 }, chat: { id: 999 }, text: 'hi' } };
    const res = await post(`${baseUrl}/api/baram/telegram/webhook`, update, {
      'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 and accepts update when webhook secret matches', async () => {
    process.env.BARAM_TG_WEBHOOK_SECRET = 'my-secret';
    const update = { update_id: 3, message: { message_id: 3, from: { id: 999 }, chat: { id: 999 }, text: 'hi' } };
    const res = await post(`${baseUrl}/api/baram/telegram/webhook`, update, {
      'X-Telegram-Bot-Api-Secret-Token': 'my-secret',
    });
    expect(res.status).toBe(200);
  });

  it('ignores non-message updates gracefully', async () => {
    const update = { update_id: 4 }; // no message field
    const res = await post(`${baseUrl}/api/baram/telegram/webhook`, update);
    expect(res.status).toBe(200);
  });
});
