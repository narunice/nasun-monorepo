import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';

// Mock pushUserMessage before importing the route so the route's import
// binds to the mock. Default return is true; individual tests override.
const pushMock = vi.fn<(wallet: string, html: string) => Promise<boolean>>();
vi.mock('../baram-telegram.js', () => ({
  pushUserMessage: (wallet: string, html: string) => pushMock(wallet, html),
}));

import { handleAgentPushRequest, __testing__ } from '../agent-push-routes.js';

const SECRET_HEX = 'a'.repeat(64); // 32 bytes
const WALLET = '0x' + '1'.repeat(64);
const PATH = __testing__.PATH;

let server: Server;
let baseUrl: string;
let prevSecret: string | undefined;

beforeAll(async () => {
  prevSecret = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  process.env.BARAM_CHAT_SERVER_HMAC_SECRET = SECRET_HEX;
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const handled = await handleAgentPushRequest(req, res, url, {
      'Access-Control-Allow-Origin': '*',
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
  if (prevSecret === undefined) delete process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  else process.env.BARAM_CHAT_SERVER_HMAC_SECRET = prevSecret;
});

beforeEach(() => {
  pushMock.mockReset();
  pushMock.mockResolvedValue(true);
});

function signPush(body: string): string {
  const input = Buffer.concat([Buffer.from('push:', 'utf8'), Buffer.from(body, 'utf8')]);
  return createHmac('sha256', Buffer.from(SECRET_HEX, 'hex')).update(input).digest('hex');
}

function signWake(body: string): string {
  // Wake direction uses raw body (no domain prefix). Used for cross-direction replay test.
  return createHmac('sha256', Buffer.from(SECRET_HEX, 'hex')).update(body, 'utf8').digest('hex');
}

async function post(path: string, body: string, hmac: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-HMAC': hmac },
    body,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe('handleAgentPushRequest', () => {
  it('returns false for unrelated paths', async () => {
    const res = await fetch(`${baseUrl}/api/something-else`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('rejects non-POST methods with 405', async () => {
    const res = await fetch(`${baseUrl}${PATH}`, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  it('responds to OPTIONS preflight with 204', async () => {
    const res = await fetch(`${baseUrl}${PATH}`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });

  it('rejects missing or short HMAC header with 401', async () => {
    const body = JSON.stringify({ wallet: WALLET, html: 'hi' });
    const r = await post(PATH, body, 'short');
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('bad_hmac');
  });

  it('rejects HMAC header with non-hex chars (correct length, wrong shape)', async () => {
    const body = JSON.stringify({ wallet: WALLET, html: 'hi' });
    // 64 chars but contains non-hex 'z'; verifyPushHmac regex-rejects pre-decode.
    const junkHex = 'z'.repeat(64);
    const r = await post(PATH, body, junkHex);
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('bad_hmac');
  });

  it('rejects wake-domain HMAC replayed against /push with 401', async () => {
    const body = JSON.stringify({ wallet: WALLET, html: 'hi' });
    const r = await post(PATH, body, signWake(body));
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('bad_hmac');
  });

  it('rejects malformed wallet with 400', async () => {
    const body = JSON.stringify({ wallet: '0xabc', html: 'hi' });
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('bad_wallet');
  });

  it('rejects html > 4096 bytes with 400', async () => {
    const html = 'a'.repeat(4097);
    const body = JSON.stringify({ wallet: WALLET, html });
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('bad_html');
  });

  it('rejects empty html with 400', async () => {
    const body = JSON.stringify({ wallet: WALLET, html: '' });
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('bad_html');
  });

  it('rejects body > 8 KiB (server destroys socket; client sees 413 or transport close)', async () => {
    // The server destroys the request socket as soon as the cap is exceeded,
    // so the client either receives the 413 response OR sees the socket
    // close mid-write. Both are acceptable evidence that the cap is enforced.
    const html = 'b'.repeat(9000);
    const body = JSON.stringify({ wallet: WALLET, html });
    try {
      const r = await post(PATH, body, 'ignored');
      expect(r.status).toBe(413);
      expect(r.json.error).toBe('body_too_large');
    } catch (err) {
      // SocketError "other side closed" — server cut us off after MAX_BODY_BYTES.
      expect((err as Error).message).toMatch(/fetch failed|socket|closed/i);
    }
  });

  it('returns 200 + delivered:true on successful push', async () => {
    pushMock.mockResolvedValueOnce(true);
    const body = JSON.stringify({ wallet: WALLET, html: '<b>hi</b>' });
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, delivered: true });
    expect(pushMock).toHaveBeenCalledWith(WALLET, '<b>hi</b>');
  });

  it('returns 200 + delivered:false + reason:no_session when push returns false', async () => {
    pushMock.mockResolvedValueOnce(false);
    const body = JSON.stringify({ wallet: WALLET, html: 'msg' });
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, delivered: false, reason: 'no_session' });
  });

  it('rejects invalid JSON body with 400', async () => {
    const body = 'not json';
    const r = await post(PATH, body, signPush(body));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_json');
  });
});
