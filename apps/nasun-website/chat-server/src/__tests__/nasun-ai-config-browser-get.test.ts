/**
 * Coverage for the browser-facing `GET /api/nasun-ai/config/:agentAddress`
 * mode added 2026-05-23 (Phase 2 of agent config single-source-of-truth
 * refactor). The runtime path (HMAC-authed) must remain unchanged; the
 * new path is no-auth + per-IP rate-limited and only triggers when the
 * `X-HMAC` header is absent.
 *
 * The browser path exists so SettingsTab/Quickstart can read the
 * authoritative server-side config without forcing a wallet signature
 * on every form open. Configs are operational metadata only (no secrets).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { createHmac, randomBytes } from 'node:crypto';

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import { handleNasunAiConfigRequest } from '../nasun-ai-config-routes.js';

const WALLET = '0x' + 'a'.repeat(64);
const AGENT = '0x' + '1'.repeat(64);
const AGENT_OTHER = '0x' + '2'.repeat(64);

const HMAC_SECRET_HEX = randomBytes(32).toString('hex');

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined> = {};
  socket = { remoteAddress: '127.0.0.1' } as { remoteAddress?: string };
  constructor(method: string, path: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = path;
    this.headers = { ...headers };
  }
  destroy(): void {
    /* noop */
  }
}

class MockRes {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';
  headersSent = false;
  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) this.headers[k] = String(v);
    }
    this.headersSent = true;
    return this;
  }
  end(payload?: string): void {
    if (payload) this.body = payload;
  }
}

async function callGet(
  agent: string,
  opts: { hmac?: string; ip?: string } = {},
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const path = `/api/nasun-ai/config/${agent}`;
  const url = new URL(`http://localhost${path}`);
  const headers: Record<string, string> = {};
  if (opts.hmac) headers['x-hmac'] = opts.hmac;
  const req = new MockReq('GET', path, headers);
  if (opts.ip) req.socket = { remoteAddress: opts.ip };
  const res = new MockRes();
  const matched = await handleNasunAiConfigRequest(
    req as unknown as any,
    res as unknown as any,
    url,
    {},
  );
  expect(matched).toBe(true);
  const body = res.body ? JSON.parse(res.body) : null;
  return { status: res.statusCode, body, headers: res.headers };
}

function seedConfig(agent: string, wallet: string, configFields: Record<string, unknown>): void {
  const json = JSON.stringify({
    id: agent,
    walletAddress: wallet,
    agentAddress: agent,
    ...configFields,
  });
  getDb()
    .prepare(
      `INSERT INTO nasun_ai_trader_configs (agent_address, wallet_address, config_json, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(agent.toLowerCase(), wallet.toLowerCase(), json, Date.now());
}

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'nasun-cfg-test-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(dir, 'test.db'),
    allowedOrigins: ['http://localhost:5174'],
  };
}

let cfg: ChatServerConfig;
let origHmacSecret: string | undefined;

beforeEach(() => {
  origHmacSecret = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  process.env.BARAM_CHAT_SERVER_HMAC_SECRET = HMAC_SECRET_HEX;
  cfg = makeConfig();
  initStore(cfg);
});

afterEach(() => {
  closeStore();
  try {
    rmSync(cfg.dbPath, { force: true });
    rmSync(cfg.dbPath + '-wal', { force: true });
    rmSync(cfg.dbPath + '-shm', { force: true });
    rmSync(cfg.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (origHmacSecret === undefined) delete process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  else process.env.BARAM_CHAT_SERVER_HMAC_SECRET = origHmacSecret;
});

describe('GET /api/nasun-ai/config/:agentAddress — browser path (no X-HMAC)', () => {
  it('returns the stored config without auth', async () => {
    seedConfig(AGENT, WALLET, { name: 'Santa', enabled: false, strategyPresetId: 'aggressive_scalper' });
    const r = await callGet(AGENT);
    expect(r.status).toBe(200);
    expect(r.body.config.name).toBe('Santa');
    expect(r.body.config.strategyPresetId).toBe('aggressive_scalper');
    expect(r.body.config.enabled).toBe(false);
    expect(typeof r.body.updatedAt).toBe('number');
  });

  it('returns 404 for unknown agent', async () => {
    const r = await callGet(AGENT);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('returns 400 for invalid agent address', async () => {
    const r = await callGet('not-an-address');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_agent_address');
  });

  it('rate-limits at 60/min per IP', async () => {
    seedConfig(AGENT, WALLET, { name: 'Santa' });
    const ip = '10.0.0.1';
    // 60 requests should all succeed.
    for (let i = 0; i < 60; i++) {
      const r = await callGet(AGENT, { ip });
      expect(r.status).toBe(200);
    }
    // 61st from the same IP is rate-limited.
    const r = await callGet(AGENT, { ip });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
    // Different IP unaffected.
    const r2 = await callGet(AGENT, { ip: '10.0.0.2' });
    expect(r2.status).toBe(200);
  });

  it('CORS headers include GET and X-HMAC', async () => {
    seedConfig(AGENT, WALLET, { name: 'Santa' });
    const r = await callGet(AGENT);
    expect(r.headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(r.headers['Access-Control-Allow-Headers']).toContain('X-HMAC');
  });
});

describe('GET /api/nasun-ai/config/:agentAddress — runtime path (with X-HMAC)', () => {
  function correctHmac(agent: string): string {
    return createHmac('sha256', Buffer.from(HMAC_SECRET_HEX, 'hex'))
      .update(Buffer.from(agent.toLowerCase(), 'utf8'))
      .digest('hex');
  }

  it('accepts a correct HMAC and returns config', async () => {
    seedConfig(AGENT, WALLET, { enabled: true, strategyPresetId: 'conservative_dca' });
    const r = await callGet(AGENT, { hmac: correctHmac(AGENT) });
    expect(r.status).toBe(200);
    expect(r.body.config.enabled).toBe(true);
  });

  it('rejects an incorrect HMAC with 401', async () => {
    seedConfig(AGENT, WALLET, {});
    const r = await callGet(AGENT, { hmac: 'deadbeef'.repeat(8) });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('bad_hmac');
  });

  it('returns 404 for unknown agent even with valid HMAC over agent address', async () => {
    const r = await callGet(AGENT_OTHER, { hmac: correctHmac(AGENT_OTHER) });
    expect(r.status).toBe(404);
  });

  it('runtime path is not rate-limited (no IP bucket touched)', async () => {
    seedConfig(AGENT, WALLET, {});
    const hmac = correctHmac(AGENT);
    // 100 runtime calls from the same IP: all should pass.
    for (let i = 0; i < 100; i++) {
      const r = await callGet(AGENT, { hmac, ip: '10.0.0.99' });
      expect(r.status).toBe(200);
    }
  });
});

describe('OPTIONS preflight on /api/nasun-ai/config/:agentAddress', () => {
  it('returns 204 with GET in Allow-Methods', async () => {
    const path = `/api/nasun-ai/config/${AGENT}`;
    const url = new URL(`http://localhost${path}`);
    const req = new MockReq('OPTIONS', path);
    const res = new MockRes();
    const matched = await handleNasunAiConfigRequest(
      req as unknown as any,
      res as unknown as any,
      url,
      {},
    );
    expect(matched).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('GET');
  });
});
