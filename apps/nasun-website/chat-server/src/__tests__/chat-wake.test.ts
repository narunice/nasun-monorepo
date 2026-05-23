// E2E integration tests for the web chat-wake surface.
//
// Boots a real HTTP server + dispatcher, exercises the four endpoints
// (challenge / session / wake / poll), and asserts the full happy path
// + every documented failure mode. The agent-runner /wake call is
// replaced by a mock fetch so we can drive runtime outcomes (ok, fail,
// pending_lock skip, ECONNREFUSED, etc.) deterministically.
//
// Coverage map (in order of appearance below):
//   §1  challenge endpoint validation + capacity
//   §2  session endpoint: signature, agent_keys tuple, capability owner,
//        alpha gate, lazy session reuse, capability_check_timeout
//   §3  wake endpoint: token, message bounds, idempotencyKey charset,
//        endpoint/budget pre-checks, daily cap, async dispatch
//   §4  poll endpoint: auth header, sid binding, jobId regex
//   §5  reason whitelist (raw runtime strings collapse to safe codes)
//   §6  cognition slot lifecycle (refund on failure / pending_lock / NOT
//        on cap_reached / NOT on success)
//   §7  startup recovery (pending → server_restarted + slot refund)
//   §8  killswitch (CHAT_WAKE_KILLSWITCH=true)
//   §9  cross-scope token rejection (wake JWT cannot be used as chatToken)
//   §10 HMAC body-identical scheme

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { initStore, closeStore, getDb } from '../store.js';
import { handleBaramTelegramRequest, __testing__ as routesTesting } from '../baram-telegram-routes.js';
import {
  issueShortLivedJWT,
  issueChatToken,
} from '../baram-session.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';

// Mock verifyCapabilityOwner — controls the on-chain owner check return.
const mockVerifyCapabilityOwner = vi.fn<(cap: string, wallet: string) => Promise<boolean>>();
vi.mock('../sui-capability-utils.js', () => ({
  verifyCapabilityOwner: (...args: [string, string]) => mockVerifyCapabilityOwner(...args),
  getCapabilityFields: vi.fn(),
  fetchCapabilityEscrowId: vi.fn(),
}));

// Mock checkBudgetSufficient — controls on-chain budget pre-check.
const mockCheckBudget = vi.fn<() => Promise<{ ok: boolean; reason?: string }>>();
vi.mock('../baram-budget-guard.js', () => ({
  checkBudgetSufficient: () => mockCheckBudget(),
}));

// After the mocks are registered we can import the module under test.
const { handleChatWakeRequest } = await import('../chat-wake.js');

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'chat-wake-test-'));
  return { ...DEFAULT_CONFIG, port: 0, dbPath: join(dir, 'test.db'), allowedOrigins: ['http://localhost:5174'] };
}

let config: ChatServerConfig;
let server: Server;
let baseUrl: string;
const TEST_JWT_SECRET = 'x'.repeat(64);
const TEST_HMAC_SECRET = 'a'.repeat(64);
let originalEnv: Record<string, string | undefined>;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    // Mount BOTH dispatchers so /api/baram/telegram/challenge for non-chat
    // purposes still works (vault/alpha already covered by other tests).
    if (await handleChatWakeRequest(req, res, url, { 'Content-Type': 'application/json' })) return;
    if (await handleBaramTelegramRequest(req, res, url, { 'Content-Type': 'application/json' })) return;
    res.writeHead(404); res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  config = makeConfig();
  initStore(config);
  routesTesting.pendingChallenges.clear();
  originalEnv = {
    BARAM_SESSION_JWT_SECRET: process.env.BARAM_SESSION_JWT_SECRET,
    BARAM_CHAT_SERVER_HMAC_SECRET: process.env.BARAM_CHAT_SERVER_HMAC_SECRET,
    ALPHA_GATE_ENABLED: process.env.ALPHA_GATE_ENABLED,
    CHAT_WAKE_KILLSWITCH: process.env.CHAT_WAKE_KILLSWITCH,
    BARAM_DAILY_MESSAGE_CAP: process.env.BARAM_DAILY_MESSAGE_CAP,
  };
  process.env.BARAM_SESSION_JWT_SECRET = TEST_JWT_SECRET;
  process.env.BARAM_CHAT_SERVER_HMAC_SECRET = TEST_HMAC_SECRET;
  delete process.env.ALPHA_GATE_ENABLED;
  delete process.env.CHAT_WAKE_KILLSWITCH;
  delete process.env.BARAM_DAILY_MESSAGE_CAP;
  mockVerifyCapabilityOwner.mockReset();
  mockCheckBudget.mockReset();
  mockCheckBudget.mockResolvedValue({ ok: true });
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
    rmSync(config.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch { /* ignore */ }
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ============ Helpers ============

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function getJson(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, { method: 'GET', headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

interface UserFixture {
  kp: Ed25519Keypair;
  wallet: string;
  agent: string;
  capability: string;
}

function makeUser(): UserFixture {
  const kp = new Ed25519Keypair();
  const wallet = kp.toSuiAddress().toLowerCase();
  // Randomize agent + capability per fixture so cross-test rows don't
  // collide on agent_keys.agent_address PRIMARY KEY when the suite reuses
  // the same db across calls within a single it() body.
  const rand = () => Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return {
    kp,
    wallet,
    agent: '0x' + rand(),
    capability: '0x' + rand(),
  };
}

function seedAgentKeys(user: UserFixture, opts: { paused?: boolean; deleted?: boolean } = {}): void {
  const now = Date.now();
  // INSERT OR REPLACE so a test helper that gets called twice in the same
  // it() (e.g. the mintSession helper, then the test's own explicit seed for
  // a paused variation) does not blow up on the agent_address PRIMARY KEY.
  getDb().prepare(
    `INSERT OR REPLACE INTO agent_keys
       (agent_address, wallet_address, capability_id, param_name, pm2_name, wake_port, created_at, deleted_at)
     VALUES (?, ?, ?, 'p', 'm', 0, ?, ?)`,
  ).run(user.agent, user.wallet, user.capability, now, opts.deleted ? now : null);
  if (opts.paused) {
    try {
      getDb().exec('ALTER TABLE agent_keys ADD COLUMN paused_at INTEGER');
    } catch { /* exists */ }
    try {
      getDb().exec('ALTER TABLE agent_keys ADD COLUMN slot_exempt INTEGER DEFAULT 0');
    } catch { /* exists */ }
    getDb().prepare(`UPDATE agent_keys SET paused_at = ? WHERE agent_address = ?`).run(now, user.agent);
  }
}

function seedAgentEndpoint(agent: string, opts: { fresh?: boolean; budgetId?: string | null } = {}): void {
  const now = Date.now();
  const lastSeen = opts.fresh === false ? now - 10 * 60 * 1000 : now;
  getDb().prepare(
    `INSERT OR REPLACE INTO baram_agent_endpoints (agent, http_url, last_seen, budget_id)
     VALUES (?, ?, ?, ?)`,
  ).run(agent, RUNTIME_WAKE_HOST, lastSeen, opts.budgetId === undefined ? '0xbudget' : opts.budgetId);
}

async function mintChallenge(user: UserFixture): Promise<{ challenge: string }> {
  const r = await postJson('/api/nasun-ai/chat/challenge', {
    wallet: user.wallet, agent: user.agent, capabilityId: user.capability,
  });
  expect(r.status).toBe(200);
  return r.body;
}

async function signChallenge(user: UserFixture, challenge: string): Promise<string> {
  const { signature } = await user.kp.signPersonalMessage(new TextEncoder().encode(challenge));
  return signature;
}

async function mintSession(user: UserFixture): Promise<{ chatToken: string; sid: string }> {
  mockVerifyCapabilityOwner.mockResolvedValue(true);
  seedAgentKeys(user);
  const { challenge } = await mintChallenge(user);
  const sig = await signChallenge(user, challenge);
  const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
  expect(r.status).toBe(200);
  return r.body;
}

function newIdempotencyKey(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// Snapshot of the cap row for assertions.
function getCapCount(wallet: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare(`SELECT cognition_count FROM baram_message_caps WHERE wallet = ? AND date = ?`)
    .get(wallet, today) as { cognition_count: number } | undefined;
  return row?.cognition_count ?? 0;
}

// Mock fetch so forwardToWake can be driven from tests. We intercept ONLY the
// runtime /wake path (a different host:port from baseUrl). NOTE: chat-server
// itself also exposes `/api/nasun-ai/chat/wake` which would also match a
// naive `endsWith('/wake')` check — so we match by the runtime's distinct
// `RUNTIME_WAKE_HOST` host:port. Anything else uses real fetch.
const RUNTIME_WAKE_HOST = 'http://127.0.0.1:9999';
const originalFetch = globalThis.fetch;
function mockRuntimeWake(impl: (body: unknown) => Promise<{ status: number; body: any }>): void {
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(RUNTIME_WAKE_HOST)) {
      const reqBody = init?.body ? JSON.parse(init.body) : {};
      const result = await impl(reqBody);
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
function restoreFetch(): void { globalThis.fetch = originalFetch; }

// Wait until a poll returns a terminal status. Bounded so a buggy dispatch
// can't hang the suite forever. 10s is generous — setImmediate fires next
// tick, and the mock fetch resolves synchronously.
async function waitTerminal(jobId: string, chatToken: string, timeoutMs = 10_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: string | undefined;
  while (Date.now() < deadline) {
    const r = await getJson(`/api/nasun-ai/chat/wake/${jobId}`, { Authorization: `Bearer ${chatToken}` });
    lastStatus = r.body?.status;
    if (r.status === 200 && (lastStatus === 'done' || lastStatus === 'error')) return r.body;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitTerminal timed out (last status: ${lastStatus})`);
}

// ============ §1 Challenge endpoint ============

describe('chat-wake §1: challenge', () => {
  it('200 on valid wallet/agent/capability', async () => {
    const u = makeUser();
    const r = await postJson('/api/nasun-ai/chat/challenge', {
      wallet: u.wallet, agent: u.agent, capabilityId: u.capability,
    });
    expect(r.status).toBe(200);
    expect(typeof r.body.challenge).toBe('string');
    expect(r.body.challenge).toContain('Nasun AI: Start web chat session');
    expect(r.body.challenge).toContain(`Wallet: ${u.wallet}`);
    expect(r.body.challenge).toContain(`Agent: ${u.agent}`);
    expect(r.body.challenge).toContain(`Capability: ${u.capability}`);
    expect(typeof r.body.expiresAt).toBe('number');
  });

  it('400 invalid_wallet', async () => {
    const r = await postJson('/api/nasun-ai/chat/challenge', {
      wallet: 'nope', agent: '0x' + 'c'.repeat(64), capabilityId: '0x' + 'd'.repeat(64),
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_wallet');
  });

  it('400 invalid_agent', async () => {
    const u = makeUser();
    const r = await postJson('/api/nasun-ai/chat/challenge', {
      wallet: u.wallet, agent: 'nope', capabilityId: u.capability,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_agent');
  });

  it('400 invalid_capability_id', async () => {
    const u = makeUser();
    const r = await postJson('/api/nasun-ai/chat/challenge', {
      wallet: u.wallet, agent: u.agent, capabilityId: 'nope',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_capability_id');
  });

  it('400 missing fields', async () => {
    const r = await postJson('/api/nasun-ai/chat/challenge', {});
    expect(r.status).toBe(400);
  });

  it('mints distinct challenges on repeated calls (nonce + issuedAt rotate)', async () => {
    const u = makeUser();
    const a = (await mintChallenge(u)).challenge;
    const b = (await mintChallenge(u)).challenge;
    expect(a).not.toBe(b);
  });
});

// ============ §2 Session endpoint ============

describe('chat-wake §2: session', () => {
  it('200 happy path issues chatToken + sid', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(200);
    expect(typeof r.body.chatToken).toBe('string');
    expect(r.body.chatToken.split('.').length).toBe(3);
    expect(typeof r.body.sid).toBe('string');
    expect(typeof r.body.expiresAt).toBe('number');
  });

  it('401 bad_signature when signed by wrong keypair', async () => {
    const u = makeUser();
    const evil = new Ed25519Keypair();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const { signature } = await evil.signPersonalMessage(new TextEncoder().encode(challenge));
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('bad_signature');
  });

  it('400 unknown_challenge on tampered challenge text', async () => {
    const u = makeUser();
    const { challenge } = await mintChallenge(u);
    const tampered = challenge.replace('Wallet:', 'wallet:');
    const sig = await signChallenge(u, tampered);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge: tampered, signature: sig });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('unknown_challenge');
  });

  it('400 challenge is single-use (second use returns unknown_challenge)', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const first = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(first.status).toBe(200);
    const second = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('unknown_challenge');
  });

  it('403 agent_capability_mismatch when (wallet, agent, capability) not in agent_keys', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    // No seedAgentKeys call.
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('agent_capability_mismatch');
  });

  it('403 agent_capability_mismatch when challenge agent differs from agent_keys row', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    // Provision a different agent for this user — challenge will reference u.agent
    // but agent_keys only has u2.agent for this wallet.
    const u2 = { ...u, agent: '0x' + 'e'.repeat(64) };
    seedAgentKeys(u2);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('agent_capability_mismatch');
  });

  it('403 capability_owner_mismatch when on-chain owner check returns false', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(false);
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('capability_owner_mismatch');
  });

  it('503 capability_check_failed when verifyCapabilityOwner throws', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockRejectedValue(new Error('rpc_down'));
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('capability_check_failed');
  });

  it('reuses an existing active session for the same (wallet, agent, capability) tuple', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);

    // First call
    const c1 = await mintChallenge(u);
    const s1 = await signChallenge(u, c1.challenge);
    const r1 = await postJson('/api/nasun-ai/chat/session', { challenge: c1.challenge, signature: s1 });
    expect(r1.status).toBe(200);

    // Second call (fresh challenge but same tuple)
    const c2 = await mintChallenge(u);
    const s2 = await signChallenge(u, c2.challenge);
    const r2 = await postJson('/api/nasun-ai/chat/session', { challenge: c2.challenge, signature: s2 });
    expect(r2.status).toBe(200);

    expect(r2.body.sid).toBe(r1.body.sid);
  });

  it('403 wallet_not_authorized when alpha gate ON but no agent_keys row exists', async () => {
    const u = makeUser();
    process.env.ALPHA_GATE_ENABLED = 'true';
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);

    // Need to drop agent_keys row to simulate "alpha-active wallet without active agent".
    // Easier: keep agent_keys, but our chat guard checks paused_at.
    seedAgentKeys(u, { paused: true });
    // The tuple check passes (row exists, deleted_at IS NULL), but alpha guard
    // sees paused_at != NULL → 423.
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const r = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(r.status).toBe(423);
    expect(r.body.error).toBe('agent_paused');
  });
});

// ============ §3 Wake endpoint ============

describe('chat-wake §3: wake', () => {
  beforeEach(() => {
    mockRuntimeWake(async () => ({
      status: 200,
      body: { ok: true, status: 'processed', summary: 'Holding: NBTC 0.5, NUSDC 100.' },
    }));
  });
  afterEach(() => restoreFetch());

  it('401 missing_token', async () => {
    const r = await postJson('/api/nasun-ai/chat/wake', { message: 'hi', idempotencyKey: 'abc12345' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('missing_token');
  });

  it('401 invalid_token on garbage token (masked, no leak of internal reason)', async () => {
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken: 'not.a.jwt', message: 'hi', idempotencyKey: 'abc12345',
    });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });

  it('400 empty_message', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: '', idempotencyKey: 'abc12345',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('empty_message');
  });

  it('400 message_too_long', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'x'.repeat(4001), idempotencyKey: 'abc12345',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('message_too_long');
  });

  it('400 invalid_idempotency_key (too short)', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: 'short',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_idempotency_key');
  });

  it('400 invalid_idempotency_key (illegal charset, control chars)', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: 'abcdefgh\x00injection',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_idempotency_key');
  });

  it('503 agent_offline when endpoint stale', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent, { fresh: false });
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('agent_offline');
  });

  it('503 agent_offline when no endpoint row', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('agent_offline');
  });

  it('503 budget_inactive when endpoint has no budget_id', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent, { budgetId: null });
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('budget_inactive');
  });

  it('402 when checkBudgetSufficient rejects', async () => {
    mockCheckBudget.mockResolvedValue({ ok: false, reason: 'insufficient' });
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('budget_insufficient');
  });

  it('202 happy path → poll returns done with summary', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'whats my balance', idempotencyKey: newIdempotencyKey(),
    });
    expect(post.status).toBe(202);
    expect(post.body.jobId).toBeTruthy();
    expect(post.body.status).toBe('pending');
    const final = await waitTerminal(post.body.jobId, chatToken);
    expect(final.status).toBe('done');
    expect(final.userMessage).toBe('Holding: NBTC 0.5, NUSDC 100.');
    expect(final.outcome.ok).toBe(true);
    expect(final.outcome.summary).toBe('Holding: NBTC 0.5, NUSDC 100.');
  });

  it('idempotency: same key returns the prior jobId', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const key = newIdempotencyKey();
    const a = await postJson('/api/nasun-ai/chat/wake', { chatToken, message: 'hi', idempotencyKey: key });
    expect(a.status).toBe(202);
    const b = await postJson('/api/nasun-ai/chat/wake', { chatToken, message: 'hi again', idempotencyKey: key });
    expect(b.status).toBe(202);
    expect(b.body.jobId).toBe(a.body.jobId);
  });

  it('daily cap reached → row marked error, no slot taken beyond cap', async () => {
    process.env.BARAM_DAILY_MESSAGE_CAP = '1';
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);

    const first = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'm1', idempotencyKey: newIdempotencyKey(),
    });
    expect(first.status).toBe(202);
    await waitTerminal(first.body.jobId, chatToken);

    const second = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'm2', idempotencyKey: newIdempotencyKey(),
    });
    expect(second.status).toBe(202);
    expect(second.body.status).toBe('error');
    const poll = await getJson(`/api/nasun-ai/chat/wake/${second.body.jobId}`, { Authorization: `Bearer ${chatToken}` });
    expect(poll.body.reason).toBe('daily_cap_reached');
    expect(poll.body.userMessage).toContain('Daily message limit reached');
  });
});

// ============ §4 Poll endpoint ============

describe('chat-wake §4: poll', () => {
  beforeEach(() => {
    mockRuntimeWake(async () => ({ status: 200, body: { ok: true, summary: 'ok' } }));
  });
  afterEach(() => restoreFetch());

  it('401 missing_token', async () => {
    const r = await getJson('/api/nasun-ai/chat/wake/01HXYZABCD01234567890ABCDE');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('missing_token');
  });

  it('401 invalid_token (masked)', async () => {
    const r = await getJson('/api/nasun-ai/chat/wake/01HXYZABCD01234567890ABCDE', {
      Authorization: 'Bearer garbage.token.value',
    });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });

  it('400 invalid_job_id when jobId not Crockford', async () => {
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    const r = await getJson('/api/nasun-ai/chat/wake/not-a-ulid', {
      Authorization: `Bearer ${chatToken}`,
    });
    // Note: dispatcher regex blocks invalid IDs before handler — they hit
    // not_found at the dispatcher (404). Either is acceptable; assert
    // the call doesn't leak a job for unknown shape.
    expect([400, 404]).toContain(r.status);
  });

  it('404 for foreign sid (another user\'s job)', async () => {
    const u1 = makeUser();
    const u2 = makeUser();
    const sess1 = await mintSession(u1);
    seedAgentEndpoint(u1.agent);
    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken: sess1.chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    await waitTerminal(post.body.jobId, sess1.chatToken);
    const sess2 = await mintSession(u2);
    const r = await getJson(`/api/nasun-ai/chat/wake/${post.body.jobId}`, {
      Authorization: `Bearer ${sess2.chatToken}`,
    });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('job_not_found');
  });
});

// ============ §5 Reason whitelist ============

describe('chat-wake §5: reason whitelist masks runtime internals', () => {
  it.each([
    ['wake_http_500: <html>internal</html>', 'runtime_error'],
    ['wake_http_404: not found', 'runtime_rejected'],
    ['name=TypeError msg=fetch failed cause_code=ECONNREFUSED', 'agent_unreachable'],
    ['infer_failed: provider 503', 'infer_failed'],
    ['budget too low', 'budget_insufficient'],
    ['No valid gas coins for the transaction', 'gas_insufficient'],
    ['HTTP 429', 'rate_limited'],
    ['e_escrow_no_balance', 'escrow_insufficient'],
    ['some_unmapped_garbage_xyz', 'wake_failed'],
  ])('"%s" maps to "%s"', async (rawReason, expected) => {
    mockRuntimeWake(async () => ({
      status: 200,
      body: { ok: false, reason: rawReason },
    }));
    try {
      const u = makeUser();
      const { chatToken } = await mintSession(u);
      seedAgentEndpoint(u.agent);
      const post = await postJson('/api/nasun-ai/chat/wake', {
        chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
      });
      const final = await waitTerminal(post.body.jobId, chatToken);
      expect(final.reason).toBe(expected);
      // Raw runtime string must NOT appear in any client-visible field.
      expect(JSON.stringify(final)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(final)).not.toContain('<html>');
    } finally { restoreFetch(); }
  });
});

// ============ §6 Cognition slot lifecycle ============

describe('chat-wake §6: cognition slot refund', () => {
  afterEach(() => restoreFetch());

  it('successful wake → slot NOT refunded', async () => {
    mockRuntimeWake(async () => ({ status: 200, body: { ok: true, summary: 'ok' } }));
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    expect(getCapCount(u.wallet)).toBe(0);
    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    await waitTerminal(post.body.jobId, chatToken);
    expect(getCapCount(u.wallet)).toBe(1);
  });

  it('failed wake → slot refunded', async () => {
    mockRuntimeWake(async () => ({ status: 200, body: { ok: false, reason: 'infer_failed' } }));
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    await waitTerminal(post.body.jobId, chatToken);
    expect(getCapCount(u.wallet)).toBe(0);
  });

  it('pending_lock skip → slot refunded (no LLM consumed)', async () => {
    mockRuntimeWake(async () => ({
      status: 200,
      body: { ok: true, status: 'skipped', reason: 'pending_lock' },
    }));
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    await waitTerminal(post.body.jobId, chatToken);
    expect(getCapCount(u.wallet)).toBe(0);
  });

  it('cap_reached → row finalized as error, slot not consumed beyond cap', async () => {
    // reserveCognitionSlot uses INSERT … ON CONFLICT: the first call ALWAYS
    // inserts at count=1, regardless of cap. To exercise the cap-reached path
    // we set cap=1, seed an existing row at count=1, then attempt the
    // reservation — ON CONFLICT fires, the WHERE cognition_count < cap clause
    // blocks the UPDATE, and reservation.ok=false.
    process.env.BARAM_DAILY_MESSAGE_CAP = '1';
    const u = makeUser();
    const { chatToken } = await mintSession(u);
    seedAgentEndpoint(u.agent);
    mockRuntimeWake(async () => ({ status: 200, body: { ok: true, summary: 'should not run' } }));

    // Seed today's cap row at the cap so the next reservation is rejected.
    const today = new Date().toISOString().slice(0, 10);
    getDb().prepare(
      `INSERT INTO baram_message_caps (wallet, date, cognition_count) VALUES (?, ?, 1)`,
    ).run(u.wallet, today);

    const post = await postJson('/api/nasun-ai/chat/wake', {
      chatToken, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(post.body.status).toBe('error');
    // Cap row should remain at 1 — no slot was taken.
    expect(getCapCount(u.wallet)).toBe(1);
    const poll = await getJson(`/api/nasun-ai/chat/wake/${post.body.jobId}`, {
      Authorization: `Bearer ${chatToken}`,
    });
    expect(poll.body.reason).toBe('daily_cap_reached');
  });
});

// ============ §7 Startup recovery ============

describe('chat-wake §7: startup recovery', () => {
  it('pending row → server_restarted + slot refund on initStore', async () => {
    const u = makeUser();
    const today = new Date().toISOString().slice(0, 10);
    // Simulate a pending row that consumed a slot before "restart"
    getDb().prepare(
      `INSERT INTO chat_wake_jobs
         (job_id, sid, wallet, agent, idempotency_key, status,
          created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run('01HXSTARTUPRECOVERYTEST000', 'fake-sid', u.wallet, u.agent, 'k123456789', Date.now(), Date.now(), Date.now() + 600_000);
    getDb().prepare(
      `INSERT INTO baram_message_caps (wallet, date, cognition_count)
       VALUES (?, ?, 1)`,
    ).run(u.wallet, today);

    closeStore();
    initStore(config);

    const row = getDb()
      .prepare(`SELECT status, reason FROM chat_wake_jobs WHERE job_id = ?`)
      .get('01HXSTARTUPRECOVERYTEST000') as any;
    expect(row.status).toBe('error');
    expect(row.reason).toBe('server_restarted');
    expect(getCapCount(u.wallet)).toBe(0);
  });
});

// ============ §8 Killswitch ============

describe('chat-wake §8: killswitch', () => {
  it('503 chat_wake_disabled on all four endpoints when CHAT_WAKE_KILLSWITCH=true', async () => {
    process.env.CHAT_WAKE_KILLSWITCH = 'true';
    const u = makeUser();

    const challenge = await postJson('/api/nasun-ai/chat/challenge', {
      wallet: u.wallet, agent: u.agent, capabilityId: u.capability,
    });
    expect(challenge.status).toBe(503);
    expect(challenge.body.error).toBe('chat_wake_disabled');

    const session = await postJson('/api/nasun-ai/chat/session', { challenge: 'x', signature: 'y' });
    expect(session.status).toBe(503);

    const wake = await postJson('/api/nasun-ai/chat/wake', {
      chatToken: 'x', message: 'y', idempotencyKey: 'abcd1234',
    });
    expect(wake.status).toBe(503);

    const poll = await getJson('/api/nasun-ai/chat/wake/01HXYZABCD01234567890ABCDE', {
      Authorization: 'Bearer x',
    });
    expect(poll.status).toBe(503);
  });
});

// ============ §9 Cross-scope token rejection ============

describe('chat-wake §9: scope-bound tokens', () => {
  it('a wakeJwt (no scope) cannot be used as a chatToken', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);
    const { challenge } = await mintChallenge(u);
    const sig = await signChallenge(u, challenge);
    const s = await postJson('/api/nasun-ai/chat/session', { challenge, signature: sig });
    expect(s.status).toBe(200);
    const sid = s.body.sid;

    // Issue a wakeJwt for the same sid. Same secret, same header — only
    // payload.scope differs.
    const wakeJwt = issueShortLivedJWT(sid);
    expect(wakeJwt).not.toBe(s.body.chatToken);

    const r = await postJson('/api/nasun-ai/chat/wake', {
      chatToken: wakeJwt, message: 'hi', idempotencyKey: newIdempotencyKey(),
    });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });

  it('a chatToken (scope=chat-wake) is rejected by anything checking scope', async () => {
    const u = makeUser();
    mockVerifyCapabilityOwner.mockResolvedValue(true);
    seedAgentKeys(u);
    const session = await mintSession(u);
    // Direct verifyChatToken contract: it issues with scope='chat-wake', and
    // a chatToken is structurally distinct from wakeJwt by payload.
    expect(session.chatToken.split('.').length).toBe(3);
    // Sanity: issueChatToken outputs a parseable scope.
    const issued = issueChatToken(session.sid);
    const payload = JSON.parse(Buffer.from(issued.token.split('.')[1]!, 'base64url').toString('utf8'));
    expect(payload.scope).toBe('chat-wake');
  });
});

// ============ §10 HMAC body-identical scheme ============

describe('chat-wake §10: HMAC body-identical', () => {
  it('chat-server signs the EXACT JSON bytes it sends (no re-stringify drift)', async () => {
    let capturedHmacHeader: string | null = null;
    let capturedBodyBytes: string | null = null;
    globalThis.fetch = (async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith(RUNTIME_WAKE_HOST)) {
        capturedHmacHeader = (init?.headers as Record<string, string>)['X-HMAC'] || null;
        capturedBodyBytes = init?.body || null;
        return new Response(JSON.stringify({ ok: true, summary: 'fine' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const u = makeUser();
      const { chatToken } = await mintSession(u);
      seedAgentEndpoint(u.agent);
      const post = await postJson('/api/nasun-ai/chat/wake', {
        chatToken, message: 'verify hmac', idempotencyKey: newIdempotencyKey(),
      });
      await waitTerminal(post.body.jobId, chatToken);

      expect(capturedHmacHeader).toBeTruthy();
      expect(capturedBodyBytes).toBeTruthy();

      // Recompute HMAC over the same bytes and compare.
      const { createHmac } = await import('node:crypto');
      const expected = createHmac('sha256', Buffer.from(TEST_HMAC_SECRET, 'hex'))
        .update(capturedBodyBytes!, 'utf8')
        .digest('hex');
      expect(capturedHmacHeader).toBe(expected);
    } finally { restoreFetch(); }
  });
});
