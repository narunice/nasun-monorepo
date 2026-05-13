import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac } from 'node:crypto';
import { initStore, closeStore, getDb } from '../store.js';
import {
  createSession,
  getSession,
  revokeSession,
  listActiveSessions,
  bindTelegramUser,
  issueShortLivedJWT,
  verifyJWT,
  SessionInactiveError,
  __testing__,
} from '../baram-session.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'baram-session-test-'));
  return { ...DEFAULT_CONFIG, port: 0, dbPath: join(dir, 'test.db'), allowedOrigins: ['http://localhost:5174'] };
}

const TEST_SECRET = 'x'.repeat(64);
const WALLET_A = '0x' + 'a'.repeat(64);
const WALLET_B = '0x' + 'b'.repeat(64);
const AGENT = '0x' + 'c'.repeat(64);
const CAPABILITY = '0x' + 'd'.repeat(64);

let config: ChatServerConfig;
let originalSecret: string | undefined;

beforeEach(() => {
  config = makeConfig();
  initStore(config);
  originalSecret = process.env.BARAM_SESSION_JWT_SECRET;
  process.env.BARAM_SESSION_JWT_SECRET = TEST_SECRET;
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

describe('createSession', () => {
  it('creates a session row with normalized addresses and a UUID sid', () => {
    const s = createSession({ wallet: WALLET_A.toUpperCase(), agent: AGENT, capabilityId: CAPABILITY });
    expect(s.sid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(s.wallet).toBe(WALLET_A);
    expect(s.agent).toBe(AGENT);
    expect(s.capabilityId).toBe(CAPABILITY);
    expect(s.tgUserId).toBeNull();
    expect(s.revokedAt).toBeNull();
    expect(s.expiresAt).toBeGreaterThan(Date.now());
    expect(s.expiresAt - s.createdAt).toBe(__testing__.SESSION_TTL_MS);
  });

  it('persists the row so getSession round-trips', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const got = getSession(s.sid);
    expect(got).not.toBeNull();
    expect(got?.sid).toBe(s.sid);
    expect(got?.wallet).toBe(WALLET_A);
  });

  it('returns null for unknown sid', () => {
    expect(getSession('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('listActiveSessions', () => {
  it('returns multi-device sessions for the same wallet, newest first', async () => {
    const s1 = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    // tiny sleep to guarantee created_at ordering on systems with coarse clocks
    await new Promise((r) => setTimeout(r, 5));
    const s2 = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const list = listActiveSessions(WALLET_A);
    expect(list.map((r) => r.sid)).toEqual([s2.sid, s1.sid]);
  });

  it('omits revoked sessions', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    revokeSession(s.sid, WALLET_A);
    expect(listActiveSessions(WALLET_A)).toHaveLength(0);
  });

  it('omits expired sessions', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    getDb().prepare('UPDATE baram_sessions SET expires_at = ? WHERE sid = ?').run(Date.now() - 1000, s.sid);
    expect(listActiveSessions(WALLET_A)).toHaveLength(0);
  });

  it('does not leak sessions across wallets', () => {
    createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    createSession({ wallet: WALLET_B, agent: AGENT, capabilityId: CAPABILITY });
    expect(listActiveSessions(WALLET_A)).toHaveLength(1);
    expect(listActiveSessions(WALLET_B)).toHaveLength(1);
  });
});

describe('revokeSession', () => {
  it('marks revoked_at and is idempotent', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    expect(revokeSession(s.sid, WALLET_A).changed).toBe(true);
    expect(revokeSession(s.sid, WALLET_A).changed).toBe(false);
    expect(getSession(s.sid)?.revokedAt).not.toBeNull();
  });

  it('refuses to revoke when wallet does not match', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    expect(revokeSession(s.sid, WALLET_B).changed).toBe(false);
    expect(getSession(s.sid)?.revokedAt).toBeNull();
  });
});

describe('bindTelegramUser', () => {
  it('binds once, refuses second bind', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    expect(bindTelegramUser(s.sid, '111111')).toBe(true);
    expect(getSession(s.sid)?.tgUserId).toBe('111111');
    expect(bindTelegramUser(s.sid, '222222')).toBe(false);
    expect(getSession(s.sid)?.tgUserId).toBe('111111');
  });

  it('refuses bind on revoked session', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    revokeSession(s.sid, WALLET_A);
    expect(bindTelegramUser(s.sid, '111111')).toBe(false);
  });

  it('refuses bind on expired session', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    getDb().prepare('UPDATE baram_sessions SET expires_at = ? WHERE sid = ?').run(Date.now() - 1, s.sid);
    expect(bindTelegramUser(s.sid, '111111')).toBe(false);
  });
});

describe('issueShortLivedJWT / verifyJWT', () => {
  it('round-trips a valid token', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const tok = issueShortLivedJWT(s.sid);
    const result = verifyJWT(tok);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sid).toBe(s.sid);
      expect(result.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it('refuses to issue for an unknown sid', () => {
    expect(() => issueShortLivedJWT('00000000-0000-4000-8000-000000000000'))
      .toThrowError(SessionInactiveError);
  });

  it('refuses to issue for a revoked sid', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    revokeSession(s.sid, WALLET_A);
    let caught: unknown;
    try { issueShortLivedJWT(s.sid); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SessionInactiveError);
    expect((caught as SessionInactiveError).reason).toBe('revoked');
  });

  it('refuses to issue for an expired sid', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    getDb().prepare('UPDATE baram_sessions SET expires_at = ? WHERE sid = ?').run(Date.now() - 1, s.sid);
    let caught: unknown;
    try { issueShortLivedJWT(s.sid); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SessionInactiveError);
    expect((caught as SessionInactiveError).reason).toBe('expired');
  });

  it('rejects tampered signature', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const tok = issueShortLivedJWT(s.sid);
    const [h, p, sig] = tok.split('.');
    // Flip the last char of the signature
    const flipped = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A');
    const result = verifyJWT(`${h}.${p}.${flipped}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects malformed token', () => {
    const r = verifyJWT('not.a.jwt.too.many.parts');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('rejects tokens signed with a different secret', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const tok = issueShortLivedJWT(s.sid);
    process.env.BARAM_SESSION_JWT_SECRET = 'y'.repeat(64);
    const result = verifyJWT(tok);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects expired tokens', () => {
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    const tok = issueShortLivedJWT(s.sid);
    // Forge a JWT with an exp in the past, using the same secret. Verifies the
    // exp check fires before any sid lookup.
    const [headerB64] = tok.split('.');
    const past = Math.floor(Date.now() / 1000) - 60;
    const payload = JSON.stringify({ sid: s.sid, iat: past - 10, exp: past, jti: 'deadbeef' });
    const payloadB64 = __testing__.b64urlEncode(Buffer.from(payload, 'utf8'));
    const sigBuf = createHmac('sha256', Buffer.from(TEST_SECRET, 'utf8'))
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const expired = `${headerB64}.${payloadB64}.${__testing__.b64urlEncode(sigBuf)}`;
    const result = verifyJWT(expired);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });
});

describe('JWT_SECRET enforcement', () => {
  it('throws when secret is missing', () => {
    delete process.env.BARAM_SESSION_JWT_SECRET;
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    expect(() => issueShortLivedJWT(s.sid)).toThrowError(/BARAM_SESSION_JWT_SECRET/);
  });

  it('throws when secret is too short', () => {
    process.env.BARAM_SESSION_JWT_SECRET = 'short';
    const s = createSession({ wallet: WALLET_A, agent: AGENT, capabilityId: CAPABILITY });
    expect(() => issueShortLivedJWT(s.sid)).toThrowError(/too short/);
  });
});
