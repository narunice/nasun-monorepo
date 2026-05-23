import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import { assertEnabledOrExit } from './self-config.js';

const SECRET_HEX = 'a'.repeat(64); // 32 bytes hex
const AGENT = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const BASE_URL = 'https://chat.example.com';

function makeExit() {
  return vi.fn((_code: number) => {
    throw new Error('__exit__');
  }) as unknown as (code: number) => never;
}

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('assertEnabledOrExit', () => {
  it('skips when chatServerBaseUrl is empty (standalone mode)', async () => {
    const fetchImpl = vi.fn();
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: '',
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('skip');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('skips with warn when HMAC secret missing', async () => {
    const fetchImpl = vi.fn();
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL,
      agentAddress: AGENT,
      hmacSecretHex: '',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('skip');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('continues when server returns enabled:true', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // Verify HMAC header was computed correctly over the lowercase agent
      // address bytes (matches chat-server runtime endpoint contract).
      const expectedHmac = createHmac('sha256', Buffer.from(SECRET_HEX, 'hex'))
        .update(Buffer.from(AGENT.toLowerCase(), 'utf8'))
        .digest('hex');
      const header = (init?.headers as Record<string, string>)?.['X-HMAC'];
      expect(header).toBe(expectedHmac);
      return makeJsonResponse(200, { config: { enabled: true }, updatedAt: Date.now() });
    });
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL,
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('continue');
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('exits when server returns enabled:false', async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(200, { config: { enabled: false }, updatedAt: 1 }),
    );
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('exits when server returns 404 (no row for this agent)', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
    );
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('skips on HTTP 5xx (fail-open)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 502 }));
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL,
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('skip');
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('skips on HTTP 401 (auth drift, fail-open)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL,
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('skip');
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('skips on fetch throw (network flake, fail-open)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const exitImpl = makeExit();
    const result = await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL,
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl,
      log: () => {},
    });
    expect(result.decision).toBe('skip');
    expect(exitImpl).not.toHaveBeenCalled();
  });

  it('exits when config.enabled is missing/undefined (defense: default-off)', async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(200, { config: {}, updatedAt: 1 }),
    );
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('calls pm2 stop before exit when PM2 name is provided', async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(200, { config: { enabled: false }, updatedAt: 1 }),
    );
    const pm2StopImpl = vi.fn(() => ({ ok: true }));
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        pm2Name: 'nasun-ai-agent-test',
        pm2StopImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(pm2StopImpl).toHaveBeenCalledWith('nasun-ai-agent-test');
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('skips pm2 stop when no PM2 name (standalone mode)', async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(200, { config: { enabled: false }, updatedAt: 1 }),
    );
    const pm2StopImpl = vi.fn(() => ({ ok: true }));
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        pm2Name: '',
        pm2StopImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(pm2StopImpl).not.toHaveBeenCalled();
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('still exits even when pm2 stop fails', async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(200, { config: { enabled: false }, updatedAt: 1 }),
    );
    const pm2StopImpl = vi.fn(() => ({ ok: false }));
    const exitImpl = makeExit();
    await expect(
      assertEnabledOrExit({
        chatServerBaseUrl: BASE_URL,
        agentAddress: AGENT,
        hmacSecretHex: SECRET_HEX,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        exitImpl,
        pm2Name: 'agent-x',
        pm2StopImpl,
        log: () => {},
      }),
    ).rejects.toThrow('__exit__');
    expect(pm2StopImpl).toHaveBeenCalledOnce();
    expect(exitImpl).toHaveBeenCalledWith(0);
  });

  it('strips trailing slash from base URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(`${BASE_URL}/api/nasun-ai/config/${AGENT.toLowerCase()}`);
      return makeJsonResponse(200, { config: { enabled: true }, updatedAt: 1 });
    });
    await assertEnabledOrExit({
      chatServerBaseUrl: BASE_URL + '/',
      agentAddress: AGENT,
      hmacSecretHex: SECRET_HEX,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      exitImpl: makeExit(),
      log: () => {},
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
