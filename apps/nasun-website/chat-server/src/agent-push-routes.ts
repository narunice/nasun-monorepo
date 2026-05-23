// Thin push relay: runtime → chat-server → user Telegram.
//
// Why a chat-server route instead of the runtime calling Telegram directly:
//   wallet → tg_user_id mapping lives in chat-server SQLite (`baram_sessions`)
//   and `pushUserMessage` resolves it at push time. Going through chat-server
//   means an unlink/re-link is reflected on the next cycle with zero staleness,
//   whereas any runtime-side env injection of chat_id would carry a stale
//   value until the agent process is respawned.
//
// HMAC scheme — DIFFERS from the /wake direction on purpose:
//   /wake (chat-server → runtime) signs raw body bytes. This endpoint signs
//   `"push:" || body` so a sniffed wake response cannot be replayed against
//   /push and vice versa. Domain prefix is applied to /push side only;
//   the existing /wake/registry/config HMAC sites are untouched.
//
// Body shape: { wallet: 0x-hex (64 chars), html: string ≤ 4096 bytes }.
// Body cap: 8 KiB before HMAC verification (DoS bound).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { pushUserMessage } from './baram-telegram.js';

const PATH = '/api/nasun-ai/agent/push';
const MAX_BODY_BYTES = 8 * 1024;
const MAX_HTML_BYTES = 4096;
const DOMAIN_PREFIX = Buffer.from('push:', 'utf8');
// Lowercase-only by design. Runtime calls toLowerCase() before sending, and
// pushUserMessage lowercases again at the SQLite boundary. Rejecting mixed
// case at the route layer surfaces caller bugs early.
const WALLET_RE = /^0x[0-9a-f]{64}$/;
// SHA-256 hex = 64 chars exactly. Stricter than `< 16` floor to reject
// obviously malformed headers before reaching the hex decoder (which
// silently truncates on invalid chars).
const HMAC_HEX_RE = /^[0-9a-f]{64}$/i;

function getHmacSecret(): Buffer {
  const raw = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('BARAM_CHAT_SERVER_HMAC_SECRET missing or too short');
  }
  return Buffer.from(raw, 'hex');
}

function verifyPushHmac(body: Buffer, header: string): boolean {
  // Reject anything that isn't exactly 64 lowercase/uppercase hex chars
  // before touching the hex decoder. Buffer.from(..., 'hex') silently drops
  // odd-length or invalid chars, so an explicit shape gate keeps the
  // failure path predictable.
  if (!HMAC_HEX_RE.test(header)) return false;
  try {
    const input = Buffer.concat([DOMAIN_PREFIX, body]);
    const expected = createHmac('sha256', getHmacSecret()).update(input).digest();
    const provided = Buffer.from(header, 'hex');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

async function readRawBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Local writeJson sets Content-Type, which the shared baram-telegram-routes
// helper does not. Kept local so this route has self-contained response
// formatting (important: runtime parses `delivered`/`reason` from json body).
function writeJson(
  res: import('node:http').ServerResponse,
  status: number,
  headers: Record<string, string>,
  payload: unknown,
): void {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export async function handleAgentPushRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
): Promise<boolean> {
  if (url.pathname !== PATH) return false;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-HMAC',
    });
    res.end();
    return true;
  }
  if (req.method !== 'POST') {
    writeJson(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  let body: Buffer;
  try {
    body = await readRawBody(req);
  } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { ok: false, error: (err as Error).message });
    return true;
  }

  const hmacHeader = req.headers['x-hmac'];
  if (typeof hmacHeader !== 'string' || !verifyPushHmac(body, hmacHeader)) {
    writeJson(res, 401, corsHeaders, { ok: false, error: 'bad_hmac' });
    return true;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch {
    writeJson(res, 400, corsHeaders, { ok: false, error: 'invalid_json' });
    return true;
  }

  const wallet = typeof parsed.wallet === 'string' ? parsed.wallet : '';
  const html = typeof parsed.html === 'string' ? parsed.html : '';
  if (!WALLET_RE.test(wallet)) {
    writeJson(res, 400, corsHeaders, { ok: false, error: 'bad_wallet' });
    return true;
  }
  if (html.length === 0 || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    writeJson(res, 400, corsHeaders, { ok: false, error: 'bad_html' });
    return true;
  }

  const delivered = await pushUserMessage(wallet, html);
  writeJson(res, 200, corsHeaders, {
    ok: true,
    delivered,
    ...(delivered ? {} : { reason: 'no_session' }),
  });
  return true;
}

export const __testing__ = {
  DOMAIN_PREFIX,
  MAX_BODY_BYTES,
  MAX_HTML_BYTES,
  WALLET_RE,
  PATH,
};
