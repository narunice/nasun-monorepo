/**
 * E2E coverage for POST /api/nasun-ai/chat/proposal/{confirm,cancel}.
 *
 * Drives `handleChatWakeRequest` (route lookup → auth → guards → SQL → JSON)
 * against an in-process SQLite DB, with only the outbound wake forwarded to a
 * mock. These two routes are what makes the web the first surface that can
 * answer a proposal: the Telegram deep link ProposalCard renders cannot work,
 * because /start reads its payload as a session sid.
 *
 * What is pinned here is the money-safety contract: a confirm executes at most
 * once, only the owning session can confirm, an expired or already-answered
 * proposal cannot execute, and a cancel always releases the on-chain lock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

const forwardToWake = vi.hoisted(() => vi.fn());
vi.mock('../wake-proxy.js', () => ({
  forwardToWake,
}));

import { initStore, closeStore } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import { handleChatWakeRequest } from '../chat-wake.js';
import { createSession, issueChatToken } from '../baram-session.js';
import { upsertEndpoint } from '../baram-agent-registry.js';
import { createPendingProposal, getProposalById } from '../baram-proposals.js';

const TEST_SECRET = 'x'.repeat(64);
const WALLET = '0x' + 'a'.repeat(64);
const AGENT = '0x' + 'c'.repeat(64);
const OTHER_AGENT = '0x' + 'e'.repeat(64);
const CAPABILITY = '0x' + 'd'.repeat(64);
const ULID_P = '01HQZX3VFKJ8QW9N2M4P5R6S7T';
const ULID_INTENT = '01HQZX3VFKJ8QW9N2M4P5R6S8V';
const HASH = '0x' + 'f'.repeat(64);
const IDEM = 'idem-key-0001';

// === mock req/res ===

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined> = {};
  socket = { remoteAddress: '127.0.0.1' } as { remoteAddress?: string };
  private payload: string;
  constructor(method: string, path: string, body?: unknown) {
    super();
    this.method = method;
    this.url = path;
    this.payload = body === undefined ? '' : JSON.stringify(body);
    // readJsonBody attaches its listeners synchronously after the call, so
    // emit on the next tick.
    setImmediate(() => {
      if (this.payload) this.emit('data', Buffer.from(this.payload));
      this.emit('end');
    });
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
    if (headers) for (const [k, v] of Object.entries(headers)) this.headers[k] = String(v);
    this.headersSent = true;
    return this;
  }
  end(payload?: string): void {
    if (payload) this.body = payload;
  }
}

async function post(
  action: 'confirm' | 'cancel',
  body: unknown,
): Promise<{ status: number; body: any }> {
  const path = `/api/nasun-ai/chat/proposal/${action}`;
  const req = new MockReq('POST', path, body);
  const res = new MockRes();
  await handleChatWakeRequest(
    req as unknown as import('node:http').IncomingMessage,
    res as unknown as import('node:http').ServerResponse,
    new URL(`http://localhost${path}`),
    {},
  );
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

/** Let the setImmediate dispatch inside the handler run. */
async function drainDispatch(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: ULID_P,
    intent_id: ULID_INTENT,
    action_type: 'spot_swap_v1',
    summary: 'Buy 10 NUSDC of NBTC.',
    side: 'BUY' as const,
    symbol: 'NBTC',
    size_quote_raw: '10000000',
    max_slippage_bps: 100,
    confidence: 0.7,
    reasoning_hash: HASH,
    market_snapshot_hash: HASH,
    model_version: 'llama-3.3-70b-versatile',
    prompt_template_hash: HASH,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function seedProposal(
  agent = AGENT,
  overrides: Record<string, unknown> = {},
  expiresAtMsOverride?: number,
): void {
  const proposal = makeProposal(overrides);
  createPendingProposal({
    proposalId: proposal.proposal_id,
    agent,
    sessionId: 'seed-sid',
    intentId: proposal.intent_id,
    proposal: proposal as never,
    expiresAtMs: expiresAtMsOverride ?? new Date(proposal.expires_at).getTime(),
  });
}

let config: ChatServerConfig;
let originalSecret: string | undefined;
let chatToken: string;

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'chat-proposal-test-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(dir, 'test.db'),
    allowedOrigins: ['http://localhost:5174'],
  };
}

beforeEach(() => {
  forwardToWake.mockReset();
  forwardToWake.mockResolvedValue({ ok: true, status: 'executed', summary: 'Filled 10 NUSDC.' });
  config = makeConfig();
  initStore(config);
  originalSecret = process.env.BARAM_SESSION_JWT_SECRET;
  process.env.BARAM_SESSION_JWT_SECRET = TEST_SECRET;

  const session = createSession({ wallet: WALLET, agent: AGENT, capabilityId: CAPABILITY });
  chatToken = issueChatToken(session.sid).token;
  // Fresh heartbeat so the wake has somewhere to land.
  upsertEndpoint(AGENT, 'http://127.0.0.1:4401', '0x' + '9'.repeat(64));
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
  } catch { /* ignore */ }
  if (originalSecret === undefined) delete process.env.BARAM_SESSION_JWT_SECRET;
  else process.env.BARAM_SESSION_JWT_SECRET = originalSecret;
});

describe('POST /chat/proposal/confirm', () => {
  it('claims the proposal and dispatches a manual wake carrying it', async () => {
    seedProposal();

    const res = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(getProposalById(ULID_P)!.status).toBe('confirmed');

    await drainDispatch();
    expect(forwardToWake).toHaveBeenCalledTimes(1);
    const [wakeUrl, wakeBody] = forwardToWake.mock.calls[0];
    expect(wakeUrl).toBe('http://127.0.0.1:4401/wake');
    expect(wakeBody.trigger_type).toBe('manual');
    expect(wakeBody.parent_intent_id).toBe(ULID_INTENT);
    // The runtime builds the execution from this artifact, so it must be the
    // whole proposal, not a reference to it.
    expect(JSON.parse(wakeBody.message).proposal_id).toBe(ULID_P);
    expect(JSON.parse(wakeBody.message).size_quote_raw).toBe('10000000');
  });

  it('executes once when the same click is submitted twice', async () => {
    seedProposal();

    const first = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    const second = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId);
    await drainDispatch();
    expect(forwardToWake).toHaveBeenCalledTimes(1);
  });

  it('rejects a second confirm under a fresh idempotency key', async () => {
    seedProposal();

    await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    const again = await post('confirm', {
      chatToken, proposalId: ULID_P, idempotencyKey: 'idem-key-0002',
    });

    // Already answered: a new key must not buy a second execution.
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('proposal_not_pending');
    await drainDispatch();
    expect(forwardToWake).toHaveBeenCalledTimes(1);
  });

  it('hides another agent\'s proposal behind a 404', async () => {
    seedProposal(OTHER_AGENT);

    const res = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('proposal_not_found');
    expect(getProposalById(ULID_P)!.status).toBe('pending');
    await drainDispatch();
    expect(forwardToWake).not.toHaveBeenCalled();
  });

  it('refuses an expired proposal', async () => {
    seedProposal(AGENT, { expires_at: new Date(Date.now() - 60_000).toISOString() });

    const res = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('proposal_expired');
    await drainDispatch();
    expect(forwardToWake).not.toHaveBeenCalled();
  });

  it('refuses to execute when the agent is not heartbeating', async () => {
    seedProposal();
    // Endpoint older than the staleness threshold.
    upsertEndpoint(AGENT, 'http://127.0.0.1:4401');
    const { getDb } = await import('../store.js');
    getDb()
      .prepare('UPDATE baram_agent_endpoints SET last_seen = ? WHERE agent = ?')
      .run(Date.now() - 10 * 60 * 1000, AGENT.toLowerCase());

    const res = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('agent_offline');
    // Must not be claimed: the user has to be able to retry once the agent
    // reconnects, and the proposal may still be inside its window.
    expect(getProposalById(ULID_P)!.status).toBe('pending');
  });

  it('rejects a missing or malformed token and proposal id', async () => {
    seedProposal();

    expect((await post('confirm', { proposalId: ULID_P, idempotencyKey: IDEM })).status).toBe(401);
    expect((await post('confirm', { chatToken, proposalId: 'not-a-ulid', idempotencyKey: IDEM })).status).toBe(400);
    expect((await post('confirm', { chatToken, proposalId: ULID_P })).status).toBe(400);
    expect((await post('confirm', { chatToken: 'garbage', proposalId: ULID_P, idempotencyKey: IDEM })).status).toBe(401);

    await drainDispatch();
    expect(forwardToWake).not.toHaveBeenCalled();
    expect(getProposalById(ULID_P)!.status).toBe('pending');
  });

  it('releases the on-chain lock when the wake was never accepted', async () => {
    seedProposal();
    forwardToWake.mockResolvedValue({
      ok: false,
      error: 'name=TypeError msg=fetch failed cause_code=ECONNREFUSED',
    });

    await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    await drainDispatch();

    // The proposal is terminal, so without this the agent would skip every
    // cycle until the TTL ran out, with neither route able to unblock it.
    expect(forwardToWake).toHaveBeenCalledTimes(2);
    const sentinel = JSON.parse(forwardToWake.mock.calls[1][1].message);
    expect(sentinel.__nasun_cancel__).toBe(true);
    expect(sentinel.proposal_id).toBe(ULID_P);
  });

  it('keeps the lock when the wake may still be executing', async () => {
    seedProposal();
    forwardToWake.mockResolvedValue({
      ok: false,
      error: 'name=TimeoutError msg=The operation was aborted due to timeout',
    });

    await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    await drainDispatch();

    // Clearing the lock under a still-running execution would let a
    // heartbeat cycle trade concurrently with the manual one. The TTL is the
    // safe release here.
    expect(forwardToWake).toHaveBeenCalledTimes(1);
  });

  it('keeps the lock when the runtime itself reported the failure', async () => {
    seedProposal();
    forwardToWake.mockResolvedValue({ ok: false, status: 'failed', error: 'infer_failed' });

    await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });
    await drainDispatch();

    // The runtime answered, so it is alive and owns its own lock lifecycle.
    expect(forwardToWake).toHaveBeenCalledTimes(1);
  });

  it('refuses a proposal whose stored expires_at cannot be parsed', async () => {
    // A NaN cannot reach the expires_at COLUMN: better-sqlite3 binds it as
    // NULL and the NOT NULL constraint rejects the insert. What is reachable
    // is a row whose column is fine while the artifact JSON the gate reads
    // carries an unparseable string. NaN <= now is false, so without a
    // finite-check such a row stays confirmable forever.
    seedProposal(AGENT, { expires_at: 'not-a-date' }, Date.now() + 15 * 60 * 1000);

    const res = await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('proposal_expired');
    await drainDispatch();
    expect(forwardToWake).not.toHaveBeenCalled();
  });

  it('reports a 404 for a proposal that does not exist', async () => {
    const res = await post('confirm', {
      chatToken, proposalId: '01HQZX3VFKJ8QW9N2M4P5R6S9W', idempotencyKey: IDEM,
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /chat/proposal/cancel', () => {
  it('cancels and fires the lock-releasing sentinel', async () => {
    seedProposal();

    const res = await post('cancel', { chatToken, proposalId: ULID_P });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: 'cancelled' });
    expect(getProposalById(ULID_P)!.status).toBe('cancelled');

    await drainDispatch();
    expect(forwardToWake).toHaveBeenCalledTimes(1);
    const sentinel = JSON.parse(forwardToWake.mock.calls[0][1].message);
    expect(sentinel.__nasun_cancel__).toBe(true);
    expect(sentinel.proposal_id).toBe(ULID_P);
  });

  it('needs no idempotency key and answers a repeated cancel with success', async () => {
    seedProposal();

    expect((await post('cancel', { chatToken, proposalId: ULID_P })).status).toBe(200);
    const again = await post('cancel', { chatToken, proposalId: ULID_P });

    // A retry after a lost 200 must not surface a successful cancel as an
    // error. The intent already holds, so the answer is the same answer.
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, status: 'cancelled' });
    await drainDispatch();
    // ...but the lock is released once, not once per retry.
    expect(forwardToWake).toHaveBeenCalledTimes(1);
  });

  it('still cancels when the agent is offline', async () => {
    seedProposal();
    const { getDb } = await import('../store.js');
    getDb()
      .prepare('UPDATE baram_agent_endpoints SET last_seen = ? WHERE agent = ?')
      .run(Date.now() - 10 * 60 * 1000, AGENT.toLowerCase());

    const res = await post('cancel', { chatToken, proposalId: ULID_P });

    // A stale endpoint must not strand the user on a proposal they declined;
    // the lock then lapses on its own TTL.
    expect(res.status).toBe(200);
    expect(getProposalById(ULID_P)!.status).toBe('cancelled');
    await drainDispatch();
    expect(forwardToWake).not.toHaveBeenCalled();
  });

  it('cannot cancel a proposal already confirmed', async () => {
    seedProposal();
    await post('confirm', { chatToken, proposalId: ULID_P, idempotencyKey: IDEM });

    const res = await post('cancel', { chatToken, proposalId: ULID_P });

    expect(res.status).toBe(409);
    expect(getProposalById(ULID_P)!.status).toBe('confirmed');
  });

  it('hides another agent\'s proposal behind a 404', async () => {
    seedProposal(OTHER_AGENT);

    const res = await post('cancel', { chatToken, proposalId: ULID_P });

    expect(res.status).toBe(404);
    expect(getProposalById(ULID_P)!.status).toBe('pending');
  });
});
