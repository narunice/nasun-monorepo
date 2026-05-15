// HTTP routes for Baram (Nasun AI) Telegram session management.
//
// Two-step wallet sig protocol:
//   1. POST /api/baram/telegram/challenge — server mints a canonical challenge
//      string bound to {wallet, purpose, optional agent/capability/sid} and
//      caches it in memory with 5-minute TTL.
//   2. POST /api/baram/telegram/{link-session,revoke-session,sessions} —
//      client returns {challenge, signature}. Server verifies the signature
//      recovers to the wallet stored in the challenge, then executes the
//      pre-bound action. Single-use: the challenge is deleted on success or
//      definitive failure.
//
// All wallet-bound parameters (agent, capability, sid) MUST appear in the
// challenge text — the user is signing those values explicitly, not just a
// random nonce. This prevents a phished challenge from being reused to bind
// to a different agent.

import { randomBytes } from 'node:crypto';
import { isValidSuiAddress } from './auth.js';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { SuiClient } from '@mysten/sui/client';
import {
  createSession,
  revokeSession,
  listActiveSessions,
  type BaramSessionRow,
} from './baram-session.js';
import { verifyWebhookToken, handleTelegramUpdate, type TelegramUpdate } from './baram-telegram.js';
import { handleHeartbeat } from './baram-agent-registry.js';

// SuiClient is required to verify zkLogin personal-message signatures: the SDK
// fetches the current epoch + Google JWK set off-chain to validate the proof.
// Without `client`, verifyPersonalMessageSignature falls through to non-zkLogin
// schemes only and rejects zkLogin sigs as bad_signature.
let zkLoginClient: SuiClient | null = null;
function getZkLoginClient(): SuiClient {
  if (!zkLoginClient) {
    zkLoginClient = new SuiClient({
      url: process.env.RPC_URL || 'https://rpc.devnet.nasun.io',
    });
  }
  return zkLoginClient;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5_000;
const MAX_BODY_BYTES = 16 * 1024;

type Purpose = 'link' | 'revoke' | 'list';

interface ChallengeEntry {
  wallet: string;
  purpose: Purpose;
  agent?: string;
  capabilityId?: string;
  sid?: string;
  expiresAt: number;
}

const pendingChallenges = new Map<string, ChallengeEntry>();

function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [k, v] of pendingChallenges) {
    if (v.expiresAt < now) pendingChallenges.delete(k);
  }
}

setInterval(cleanupExpiredChallenges, 60_000).unref();

function normalize(addr: string): string {
  return addr.toLowerCase();
}

function isValidUuid(s: unknown): s is string {
  return typeof s === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

function buildChallengeText(entry: Omit<ChallengeEntry, 'expiresAt'>, nonce: string, issuedIso: string): string {
  const lines: string[] = [];
  switch (entry.purpose) {
    case 'link':
      lines.push('Nasun AI: Link Telegram session');
      lines.push(`Wallet: ${entry.wallet}`);
      lines.push(`Agent: ${entry.agent}`);
      lines.push(`Capability: ${entry.capabilityId}`);
      break;
    case 'revoke':
      lines.push('Nasun AI: Revoke Telegram session');
      lines.push(`Wallet: ${entry.wallet}`);
      lines.push(`Session: ${entry.sid}`);
      break;
    case 'list':
      lines.push('Nasun AI: List Telegram sessions');
      lines.push(`Wallet: ${entry.wallet}`);
      break;
  }
  lines.push(`Nonce: ${nonce}`);
  lines.push(`Issued: ${issuedIso}`);
  return lines.join('\n');
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('body_too_large'));
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (body.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function writeJson(
  res: import('node:http').ServerResponse,
  status: number,
  headers: Record<string, string>,
  payload: unknown,
): void {
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

async function handleChallenge(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;
  const purpose = b.purpose;
  const wallet = typeof b.wallet === 'string' ? b.wallet : null;
  if (!wallet || !isValidSuiAddress(wallet)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_wallet' });
    return;
  }
  if (purpose !== 'link' && purpose !== 'revoke' && purpose !== 'list') {
    writeJson(res, 400, corsHeaders, { error: 'invalid_purpose' });
    return;
  }

  const entry: Omit<ChallengeEntry, 'expiresAt'> = {
    wallet: normalize(wallet),
    purpose,
  };

  if (purpose === 'link') {
    const agent = typeof b.agent === 'string' ? b.agent : null;
    const capabilityId = typeof b.capabilityId === 'string' ? b.capabilityId : null;
    if (!agent || !isValidSuiAddress(agent)) {
      writeJson(res, 400, corsHeaders, { error: 'invalid_agent' });
      return;
    }
    if (!capabilityId || !isValidSuiAddress(capabilityId)) {
      writeJson(res, 400, corsHeaders, { error: 'invalid_capability_id' });
      return;
    }
    entry.agent = normalize(agent);
    entry.capabilityId = normalize(capabilityId);
  } else if (purpose === 'revoke') {
    if (!isValidUuid(b.sid)) {
      writeJson(res, 400, corsHeaders, { error: 'invalid_sid' });
      return;
    }
    entry.sid = b.sid;
  }

  if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    cleanupExpiredChallenges();
    if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
      writeJson(res, 503, corsHeaders, { error: 'challenge_capacity' });
      return;
    }
  }

  const now = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const issuedIso = new Date(now).toISOString();
  const challenge = buildChallengeText(entry, nonce, issuedIso);
  const expiresAt = now + CHALLENGE_TTL_MS;
  pendingChallenges.set(challenge, { ...entry, expiresAt });

  writeJson(res, 200, corsHeaders, { challenge, expiresAt });
}

interface ConsumeChallengeResult {
  ok: true;
  entry: ChallengeEntry;
  challenge: string;
}

type ConsumeFailReason = 'missing_fields' | 'unknown_challenge' | 'expired' | 'bad_signature' | 'wrong_purpose';

async function consumeChallenge(
  body: Record<string, unknown>,
  expectedPurpose: Purpose,
): Promise<ConsumeChallengeResult | { ok: false; reason: ConsumeFailReason }> {
  const challenge = typeof body.challenge === 'string' ? body.challenge : null;
  const signature = typeof body.signature === 'string' ? body.signature : null;
  if (!challenge || !signature) return { ok: false, reason: 'missing_fields' };

  const entry = pendingChallenges.get(challenge);
  if (!entry) return { ok: false, reason: 'unknown_challenge' };

  // Single-use: delete unconditionally so a verified-but-action-failed call
  // can't be retried with the same nonce.
  pendingChallenges.delete(challenge);

  if (entry.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  if (entry.purpose !== expectedPurpose) return { ok: false, reason: 'wrong_purpose' };

  try {
    const messageBytes = new TextEncoder().encode(challenge);
    const publicKey = await verifyPersonalMessageSignature(messageBytes, signature, {
      client: getZkLoginClient(),
    });
    const recovered = normalize(publicKey.toSuiAddress());
    if (recovered !== entry.wallet) return { ok: false, reason: 'bad_signature' };
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true, entry, challenge };
}

function getBotUsername(): string {
  return process.env.BARAM_TG_BOT_USERNAME || 'nasun_ai_bot';
}

function sessionRowToJson(row: BaramSessionRow) {
  return {
    sid: row.sid,
    wallet: row.wallet,
    agent: row.agent,
    capabilityId: row.capabilityId,
    tgUserId: row.tgUserId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

async function handleLinkSession(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'link');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const { entry } = result;
  if (!entry.agent || !entry.capabilityId) {
    // Shouldn't happen — challenge validation guarantees presence for link.
    writeJson(res, 500, corsHeaders, { error: 'internal_state' });
    return;
  }
  const session = createSession({
    wallet: entry.wallet,
    agent: entry.agent,
    capabilityId: entry.capabilityId,
  });
  const deepLink = `https://t.me/${getBotUsername()}?start=${session.sid}`;
  writeJson(res, 200, corsHeaders, {
    sid: session.sid,
    expiresAt: session.expiresAt,
    deepLink,
  });
}

async function handleRevokeSession(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'revoke');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const { entry } = result;
  if (!entry.sid) {
    writeJson(res, 500, corsHeaders, { error: 'internal_state' });
    return;
  }
  const { changed } = revokeSession(entry.sid, entry.wallet);
  // changed=false on an already-revoked or non-matching sid is intentionally
  // not surfaced as an error — the caller's intent (no active session bound
  // to that sid+wallet) is satisfied either way.
  writeJson(res, 200, corsHeaders, { revoked: changed });
}

async function handleListSessions(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'list');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const sessions = listActiveSessions(result.entry.wallet).map(sessionRowToJson);
  writeJson(res, 200, corsHeaders, { sessions });
}

const BARAM_TG_PREFIX = '/api/baram/telegram/';
const BARAM_AGENT_PREFIX = '/api/baram/agent/';
const NASUN_AI_TG_PREFIX = '/api/nasun-ai/telegram/';
const NASUN_AI_AGENT_PREFIX = '/api/nasun-ai/agent/';

/**
 * Returns true if the URL matched a baram/nasun-ai route (telegram or agent).
 * Caller should not continue routing.
 *
 * `/api/nasun-ai/*` is the canonical alias; `/api/baram/*` is kept for ~2 weeks
 * to support already-deployed clients (Additive-first rename pattern). After
 * cutover both frontend + runtime call /api/nasun-ai/*. Remove the legacy
 * prefix only after telemetry confirms zero traffic on it.
 */
export async function handleBaramTelegramRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  baseCorsHeaders: Record<string, string>,
): Promise<boolean> {
  // Normalize aliased prefix so the rest of routing stays in one place.
  if (url.pathname.startsWith(NASUN_AI_TG_PREFIX)) {
    url.pathname = BARAM_TG_PREFIX + url.pathname.slice(NASUN_AI_TG_PREFIX.length);
  } else if (url.pathname.startsWith(NASUN_AI_AGENT_PREFIX)) {
    url.pathname = BARAM_AGENT_PREFIX + url.pathname.slice(NASUN_AI_AGENT_PREFIX.length);
  }

  const isTg = url.pathname.startsWith(BARAM_TG_PREFIX);
  const isAgent = url.pathname.startsWith(BARAM_AGENT_PREFIX);
  if (!isTg && !isAgent) return false;

  const corsHeaders: Record<string, string> = {
    ...baseCorsHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  if (req.method !== 'POST') {
    writeJson(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return true;
  }

  try {
    // Agent-runner heartbeat
    if (url.pathname === '/api/baram/agent/heartbeat') {
      await handleHeartbeat(req, res, { 'Content-Type': 'application/json' });
      return true;
    }

    // Telegram webhook (inbound updates from Telegram Bot API)
    if (url.pathname === '/api/baram/telegram/webhook') {
      const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
      if (!verifyWebhookToken(secretHeader)) {
        writeJson(res, 401, corsHeaders, { error: 'bad_webhook_secret' });
        return true;
      }
      // Respond 200 immediately; process update asynchronously.
      let body: unknown;
      try { body = await readJsonBody(req); } catch {
        res.writeHead(200); res.end(); return true; // Telegram must always get 200
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      // Fire-and-forget background processing
      const update = body as TelegramUpdate;
      setImmediate(() => {
        handleTelegramUpdate(update).catch((err: Error) => {
          console.error('[baram-tg] update handler error:', err.message);
        });
      });
      return true;
    }

    // Telegram session management routes
    switch (url.pathname) {
      case '/api/baram/telegram/challenge':
        await handleChallenge(req, res, corsHeaders);
        return true;
      case '/api/baram/telegram/link-session':
        await handleLinkSession(req, res, corsHeaders);
        return true;
      case '/api/baram/telegram/revoke-session':
        await handleRevokeSession(req, res, corsHeaders);
        return true;
      case '/api/baram/telegram/sessions':
        await handleListSessions(req, res, corsHeaders);
        return true;
      default:
        writeJson(res, 404, corsHeaders, { error: 'not_found' });
        return true;
    }
  } catch (err) {
    console.error('[baram-telegram] handler error:', (err as Error).message);
    if (!res.headersSent) {
      writeJson(res, 500, corsHeaders, { error: 'internal_error' });
    }
    return true;
  }
}

// === Test helpers ===
export const __testing__ = {
  pendingChallenges,
  buildChallengeText,
  CHALLENGE_TTL_MS,
};
