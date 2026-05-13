import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { initStore, closeStore } from '../store.js';
import {
  handleBaramTelegramRequest,
  __testing__ as routesTesting,
} from '../baram-telegram-routes.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'baram-routes-test-'));
  return { ...DEFAULT_CONFIG, port: 0, dbPath: join(dir, 'test.db'), allowedOrigins: ['http://localhost:5174'] };
}

let config: ChatServerConfig;
let server: Server;
let baseUrl: string;
let originalSecret: string | undefined;

const AGENT = '0x' + 'c'.repeat(64);
const CAPABILITY = '0x' + 'd'.repeat(64);

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const handled = await handleBaramTelegramRequest(req, res, url, {
      'Content-Type': 'application/json',
    });
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  config = makeConfig();
  initStore(config);
  routesTesting.pendingChallenges.clear();
  originalSecret = process.env.BARAM_SESSION_JWT_SECRET;
  process.env.BARAM_SESSION_JWT_SECRET = 'x'.repeat(64);
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
    rmSync(config.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch { /* ignore */ }
  if (originalSecret === undefined) {
    delete process.env.BARAM_SESSION_JWT_SECRET;
  } else {
    process.env.BARAM_SESSION_JWT_SECRET = originalSecret;
  }
});

async function postJson(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  return { status: res.status, body: parsed };
}

async function getChallenge(args: Record<string, unknown>): Promise<{ challenge: string; expiresAt: number }> {
  const r = await postJson('/api/baram/telegram/challenge', args);
  expect(r.status).toBe(200);
  return r.body;
}

async function signAndCall(
  path: string,
  challenge: string,
  kp: Ed25519Keypair,
): Promise<{ status: number; body: any }> {
  const messageBytes = new TextEncoder().encode(challenge);
  const { signature } = await kp.signPersonalMessage(messageBytes);
  return postJson(path, { challenge, signature });
}

describe('challenge endpoint', () => {
  it('rejects invalid wallet', async () => {
    const r = await postJson('/api/baram/telegram/challenge', { wallet: 'nope', purpose: 'list' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_wallet');
  });

  it('rejects invalid purpose', async () => {
    const kp = new Ed25519Keypair();
    const r = await postJson('/api/baram/telegram/challenge', { wallet: kp.toSuiAddress(), purpose: 'whatever' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_purpose');
  });

  it('rejects link without agent', async () => {
    const kp = new Ed25519Keypair();
    const r = await postJson('/api/baram/telegram/challenge', {
      wallet: kp.toSuiAddress(),
      purpose: 'link',
      capabilityId: CAPABILITY,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_agent');
  });

  it('rejects revoke with bad sid', async () => {
    const kp = new Ed25519Keypair();
    const r = await postJson('/api/baram/telegram/challenge', {
      wallet: kp.toSuiAddress(),
      purpose: 'revoke',
      sid: 'not-a-uuid',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_sid');
  });

  it('mints a link challenge containing all bound params', async () => {
    const kp = new Ed25519Keypair();
    const c = await getChallenge({
      wallet: kp.toSuiAddress(),
      purpose: 'link',
      agent: AGENT,
      capabilityId: CAPABILITY,
    });
    expect(c.challenge).toContain('Nasun AI: Link Telegram session');
    expect(c.challenge).toContain(kp.toSuiAddress().toLowerCase());
    expect(c.challenge).toContain(AGENT.toLowerCase());
    expect(c.challenge).toContain(CAPABILITY.toLowerCase());
    expect(c.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('link-session happy path', () => {
  it('signs link challenge → returns sid + deep link', async () => {
    const kp = new Ed25519Keypair();
    const wallet = kp.toSuiAddress();
    const c = await getChallenge({ wallet, purpose: 'link', agent: AGENT, capabilityId: CAPABILITY });
    const r = await signAndCall('/api/baram/telegram/link-session', c.challenge, kp);
    expect(r.status).toBe(200);
    expect(r.body.sid).toMatch(/^[0-9a-f-]+$/);
    expect(r.body.deepLink).toMatch(/^https:\/\/t\.me\/[^?]+\?start=/);
    expect(r.body.deepLink.endsWith(r.body.sid)).toBe(true);
    expect(r.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('creates multiple sessions for the same wallet (multi-device)', async () => {
    const kp = new Ed25519Keypair();
    const wallet = kp.toSuiAddress();
    const c1 = await getChallenge({ wallet, purpose: 'link', agent: AGENT, capabilityId: CAPABILITY });
    const r1 = await signAndCall('/api/baram/telegram/link-session', c1.challenge, kp);
    const c2 = await getChallenge({ wallet, purpose: 'link', agent: AGENT, capabilityId: CAPABILITY });
    const r2 = await signAndCall('/api/baram/telegram/link-session', c2.challenge, kp);
    expect(r1.body.sid).not.toBe(r2.body.sid);
  });
});

describe('signature enforcement', () => {
  it('rejects wallet B signing wallet A challenge', async () => {
    const kpA = new Ed25519Keypair();
    const kpB = new Ed25519Keypair();
    const c = await getChallenge({
      wallet: kpA.toSuiAddress(), purpose: 'link', agent: AGENT, capabilityId: CAPABILITY,
    });
    const r = await signAndCall('/api/baram/telegram/link-session', c.challenge, kpB);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('bad_signature');
  });

  it('rejects calling link with a list challenge (wrong purpose)', async () => {
    const kp = new Ed25519Keypair();
    const c = await getChallenge({ wallet: kp.toSuiAddress(), purpose: 'list' });
    const r = await signAndCall('/api/baram/telegram/link-session', c.challenge, kp);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('wrong_purpose');
  });

  it('challenge is single-use', async () => {
    const kp = new Ed25519Keypair();
    const c = await getChallenge({
      wallet: kp.toSuiAddress(), purpose: 'link', agent: AGENT, capabilityId: CAPABILITY,
    });
    const r1 = await signAndCall('/api/baram/telegram/link-session', c.challenge, kp);
    expect(r1.status).toBe(200);
    const r2 = await signAndCall('/api/baram/telegram/link-session', c.challenge, kp);
    expect(r2.status).toBe(400);
    expect(r2.body.error).toBe('unknown_challenge');
  });

  it('rejects expired challenge', async () => {
    const kp = new Ed25519Keypair();
    const c = await getChallenge({
      wallet: kp.toSuiAddress(), purpose: 'link', agent: AGENT, capabilityId: CAPABILITY,
    });
    // Manually expire it in the in-memory store.
    const entry = routesTesting.pendingChallenges.get(c.challenge);
    if (entry) {
      routesTesting.pendingChallenges.set(c.challenge, { ...entry, expiresAt: Date.now() - 1 });
    }
    const r = await signAndCall('/api/baram/telegram/link-session', c.challenge, kp);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('expired');
  });
});

describe('list-sessions and revoke', () => {
  it('returns active sessions and excludes revoked ones', async () => {
    const kp = new Ed25519Keypair();
    const wallet = kp.toSuiAddress();
    // Create two sessions
    const c1 = await getChallenge({ wallet, purpose: 'link', agent: AGENT, capabilityId: CAPABILITY });
    const link1 = await signAndCall('/api/baram/telegram/link-session', c1.challenge, kp);
    const c2 = await getChallenge({ wallet, purpose: 'link', agent: AGENT, capabilityId: CAPABILITY });
    const link2 = await signAndCall('/api/baram/telegram/link-session', c2.challenge, kp);

    // List → 2 active
    const cList1 = await getChallenge({ wallet, purpose: 'list' });
    const list1 = await signAndCall('/api/baram/telegram/sessions', cList1.challenge, kp);
    expect(list1.status).toBe(200);
    expect(list1.body.sessions).toHaveLength(2);
    const sids = list1.body.sessions.map((s: { sid: string }) => s.sid).sort();
    expect(sids).toEqual([link1.body.sid, link2.body.sid].sort());

    // Revoke one
    const cRevoke = await getChallenge({ wallet, purpose: 'revoke', sid: link1.body.sid });
    const revoke = await signAndCall('/api/baram/telegram/revoke-session', cRevoke.challenge, kp);
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(true);

    // List → 1 active
    const cList2 = await getChallenge({ wallet, purpose: 'list' });
    const list2 = await signAndCall('/api/baram/telegram/sessions', cList2.challenge, kp);
    expect(list2.body.sessions).toHaveLength(1);
    expect(list2.body.sessions[0].sid).toBe(link2.body.sid);
  });

  it('revoke returns revoked=false when sid belongs to a different wallet', async () => {
    const kpA = new Ed25519Keypair();
    const kpB = new Ed25519Keypair();
    // A creates a session
    const cLink = await getChallenge({
      wallet: kpA.toSuiAddress(), purpose: 'link', agent: AGENT, capabilityId: CAPABILITY,
    });
    const link = await signAndCall('/api/baram/telegram/link-session', cLink.challenge, kpA);
    // B tries to revoke it (B signs a revoke challenge with A's sid)
    const cRev = await getChallenge({
      wallet: kpB.toSuiAddress(), purpose: 'revoke', sid: link.body.sid,
    });
    const rev = await signAndCall('/api/baram/telegram/revoke-session', cRev.challenge, kpB);
    expect(rev.status).toBe(200);
    expect(rev.body.revoked).toBe(false);
  });
});

describe('routing edge cases', () => {
  it('returns 405 for GET', async () => {
    const res = await fetch(`${baseUrl}/api/baram/telegram/challenge`);
    expect(res.status).toBe(405);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const res = await fetch(`${baseUrl}/api/baram/telegram/challenge`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown sub-path', async () => {
    const res = await fetch(`${baseUrl}/api/baram/telegram/nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
