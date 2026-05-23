// Baram (Nasun AI) Telegram session token model.
//
// Foundation v4 §결정 2: user-owned wallet + capability-scoped delegation.
// A session links one wallet to one Telegram identity for the limited purpose
// of wake + notify; it never grants the bot authority to mutate capabilities
// or move funds (those still require Dashboard wallet sig).
//
// sid = source of truth. revoked_at NULL = active. JWT is a 5-min cache
// issued per-message by the bot, verified by agent-runner. The token holds
// only the sid — the receiver must re-look up the row to enforce revocation
// and expiry. (Plan D Detail v3 §A1.)

import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from './store.js';

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const JWT_TTL_SEC = 300; // 5 minutes — wake-server JWT (chat-server → runtime)
const CHAT_TOKEN_TTL_SEC = 600; // 10 minutes — chatToken (browser → chat-server)

// SQLite TEXT can store full 64-hex Sui addresses fine. We normalize on write
// so the wallet index is deterministic regardless of caller casing.
function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

export interface BaramSessionRow {
  sid: string;
  wallet: string;
  agent: string;
  capabilityId: string;
  tgUserId: string | null;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
}

interface RawRow {
  sid: string;
  wallet: string;
  agent: string;
  capability_id: string;
  tg_user_id: string | null;
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
}

function rowToSession(row: RawRow): BaramSessionRow {
  return {
    sid: row.sid,
    wallet: row.wallet,
    agent: row.agent,
    capabilityId: row.capability_id,
    tgUserId: row.tg_user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export interface CreateSessionInput {
  wallet: string;
  agent: string;
  capabilityId: string;
}

export function createSession(input: CreateSessionInput): BaramSessionRow {
  const sid = randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const wallet = normalizeAddress(input.wallet);
  const agent = normalizeAddress(input.agent);
  const capabilityId = normalizeAddress(input.capabilityId);

  getDb()
    .prepare(
      `INSERT INTO baram_sessions
         (sid, wallet, agent, capability_id, tg_user_id, expires_at, revoked_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)`,
    )
    .run(sid, wallet, agent, capabilityId, expiresAt, now);

  return {
    sid,
    wallet,
    agent,
    capabilityId,
    tgUserId: null,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };
}

export function getSession(sid: string): BaramSessionRow | null {
  const row = getDb()
    .prepare(
      `SELECT sid, wallet, agent, capability_id, tg_user_id, expires_at, revoked_at, created_at
       FROM baram_sessions WHERE sid = ?`,
    )
    .get(sid) as RawRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listActiveSessions(wallet: string): BaramSessionRow[] {
  const w = normalizeAddress(wallet);
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT sid, wallet, agent, capability_id, tg_user_id, expires_at, revoked_at, created_at
       FROM baram_sessions
       WHERE wallet = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC`,
    )
    .all(w, now) as RawRow[];
  return rows.map(rowToSession);
}

export interface RevokeResult {
  changed: boolean;
}

export function revokeSession(sid: string, wallet: string): RevokeResult {
  // Wallet binding enforced at SQL: a stolen sid can't be revoked from a
  // different wallet sig, and the call is idempotent — calling twice still
  // returns changed=false the second time.
  const w = normalizeAddress(wallet);
  const result = getDb()
    .prepare(
      `UPDATE baram_sessions
         SET revoked_at = ?
       WHERE sid = ? AND wallet = ? AND revoked_at IS NULL`,
    )
    .run(Date.now(), sid, w);
  return { changed: result.changes > 0 };
}

/**
 * Look up an active session for (wallet, agent, capability) — the lookup used
 * by the web chat surface to find an existing row before lazy-creating a new
 * one. Returns the most recently created active row, or null if none.
 *
 * Unlike `getActiveSessionByTgUser`, the result here may have tg_user_id=NULL
 * (web-only sessions are never bound to a Telegram user).
 */
export function getActiveSessionByWalletAgent(
  wallet: string,
  agent: string,
  capabilityId: string,
): BaramSessionRow | null {
  const w = normalizeAddress(wallet);
  const a = normalizeAddress(agent);
  const c = normalizeAddress(capabilityId);
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT sid, wallet, agent, capability_id, tg_user_id, expires_at, revoked_at, created_at
       FROM baram_sessions
       WHERE wallet = ? AND agent = ? AND capability_id = ?
         AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(w, a, c, now) as RawRow | undefined;
  return row ? rowToSession(row) : null;
}

export function getActiveSessionByTgUser(tgUserId: string): BaramSessionRow | null {
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT sid, wallet, agent, capability_id, tg_user_id, expires_at, revoked_at, created_at
       FROM baram_sessions
       WHERE tg_user_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(tgUserId, now) as RawRow | undefined;
  return row ? rowToSession(row) : null;
}

export function bindTelegramUser(sid: string, tgUserId: string): boolean {
  // Called after the user opens the deep link and the bot routes /start <sid>
  // through the Telegram webhook handler (D-2). One-shot bind: refuses if the
  // row already has a tg_user_id OR if the session is revoked/expired.
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE baram_sessions
         SET tg_user_id = ?
       WHERE sid = ?
         AND tg_user_id IS NULL
         AND revoked_at IS NULL
         AND expires_at > ?`,
    )
    .run(tgUserId, sid, now);
  return result.changes > 0;
}

// === JWT (HS256) ===

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

interface JwtPayload {
  sid: string;
  iat: number;
  exp: number;
  jti: string;
}

function getJwtSecret(): Buffer {
  const raw = process.env.BARAM_SESSION_JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('BARAM_SESSION_JWT_SECRET missing or too short (need >= 32 chars)');
  }
  return Buffer.from(raw, 'utf8');
}

// Static header (always HS256). Base64url-encoded ahead of time so signing has
// one less encode step per call.
const JWT_HEADER_B64 = b64urlEncode(Buffer.from('{"alg":"HS256","typ":"JWT"}', 'utf8'));

export class SessionInactiveError extends Error {
  constructor(public reason: 'unknown' | 'revoked' | 'expired') {
    super(`session inactive: ${reason}`);
  }
}

export function issueShortLivedJWT(sid: string): string {
  const session = getSession(sid);
  if (!session) throw new SessionInactiveError('unknown');
  if (session.revokedAt !== null) throw new SessionInactiveError('revoked');
  const nowMs = Date.now();
  if (session.expiresAt <= nowMs) throw new SessionInactiveError('expired');
  const nowSec = Math.floor(nowMs / 1000);

  const payload: JwtPayload = {
    sid,
    iat: nowSec,
    exp: nowSec + JWT_TTL_SEC,
    jti: randomBytes(8).toString('hex'),
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${JWT_HEADER_B64}.${payloadB64}`;
  const sig = createHmac('sha256', getJwtSecret()).update(signingInput).digest();
  return `${signingInput}.${b64urlEncode(sig)}`;
}

export interface VerifyJwtResult {
  ok: true;
  sid: string;
  exp: number;
}

export type VerifyJwtFailure =
  | { ok: false; reason: 'malformed' }
  | { ok: false; reason: 'bad_header' }
  | { ok: false; reason: 'bad_signature' }
  | { ok: false; reason: 'bad_payload' }
  | { ok: false; reason: 'expired' };

export function verifyJWT(token: string): VerifyJwtResult | VerifyJwtFailure {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== JWT_HEADER_B64) return { ok: false, reason: 'bad_header' };

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', getJwtSecret()).update(signingInput).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (providedSig.length !== expectedSig.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(providedSig, expectedSig)) return { ok: false, reason: 'bad_signature' };

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (typeof payload.sid !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'bad_payload' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' };

  return { ok: true, sid: payload.sid, exp: payload.exp };
}

// === chat-wake scoped token (web chat surface) ===
//
// Distinct from issueShortLivedJWT (wake-server JWT) in two ways:
//   1. TTL is 10 minutes so the browser only needs one wallet signature per
//      casual chat session (5 min wake JWT is fine for runtime->server, but
//      forcing the user to popup re-sign every 5 minutes is hostile UX).
//   2. payload.scope = 'chat-wake' so a token minted for the web surface
//      cannot be presented to /wake directly — runtime's verifyJWT does not
//      check scope (back-compat), but our chat-server verifyChatToken DOES,
//      so a stolen wake JWT cannot be used to poll/issue web chat traffic.
//
// Same HMAC key + same algorithm as the wake JWT, so secret rotation is one
// operation.

interface ChatJwtPayload {
  sid: string;
  scope: 'chat-wake';
  iat: number;
  exp: number;
  jti: string;
}

export function issueChatToken(sid: string): { token: string; expiresAt: number } {
  const session = getSession(sid);
  if (!session) throw new SessionInactiveError('unknown');
  if (session.revokedAt !== null) throw new SessionInactiveError('revoked');
  const nowMs = Date.now();
  if (session.expiresAt <= nowMs) throw new SessionInactiveError('expired');
  const nowSec = Math.floor(nowMs / 1000);
  const expSec = nowSec + CHAT_TOKEN_TTL_SEC;

  const payload: ChatJwtPayload = {
    sid,
    scope: 'chat-wake',
    iat: nowSec,
    exp: expSec,
    jti: randomBytes(8).toString('hex'),
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${JWT_HEADER_B64}.${payloadB64}`;
  const sig = createHmac('sha256', getJwtSecret()).update(signingInput).digest();
  return { token: `${signingInput}.${b64urlEncode(sig)}`, expiresAt: expSec * 1000 };
}

export interface VerifyChatTokenSuccess {
  ok: true;
  sid: string;
  exp: number;
}

export type VerifyChatTokenFailure =
  | { ok: false; reason: 'malformed' }
  | { ok: false; reason: 'bad_header' }
  | { ok: false; reason: 'bad_signature' }
  | { ok: false; reason: 'bad_payload' }
  | { ok: false; reason: 'bad_scope' }
  | { ok: false; reason: 'expired' };

export function verifyChatToken(token: string): VerifyChatTokenSuccess | VerifyChatTokenFailure {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== JWT_HEADER_B64) return { ok: false, reason: 'bad_header' };

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', getJwtSecret()).update(signingInput).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (providedSig.length !== expectedSig.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(providedSig, expectedSig)) return { ok: false, reason: 'bad_signature' };

  let payload: ChatJwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as ChatJwtPayload;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (typeof payload.sid !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'bad_payload' };
  }
  if (payload.scope !== 'chat-wake') return { ok: false, reason: 'bad_scope' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' };

  return { ok: true, sid: payload.sid, exp: payload.exp };
}

// === Test helpers ===
// Exposed only for unit tests; production callers should rely on the public
// surface above.
export const __testing__ = {
  SESSION_TTL_MS,
  JWT_TTL_SEC,
  CHAT_TOKEN_TTL_SEC,
  b64urlEncode,
  b64urlDecode,
};
