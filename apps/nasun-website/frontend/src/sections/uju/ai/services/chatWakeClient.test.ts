/**
 * chatWakeClient unit tests.
 *
 * Scope: HTTP shape + error mapping + ULID mint. The state-machine / lease
 * / polling logic is covered by useChatWake / usePollWakeJob tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentChatApiError,
  ULID_REGEX,
  isUlid,
  mintIdempotencyKey,
  postChatChallenge,
  postChatSession,
  postChatWake,
  getChatWakeStatus,
} from './chatWakeClient';

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  global.fetch = vi.fn().mockResolvedValue(res);
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('mintIdempotencyKey', () => {
  it('returns a 26-char Crockford string', () => {
    const k = mintIdempotencyKey();
    expect(k).toHaveLength(26);
    expect(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(k)).toBe(true);
  });

  it('is unique across many calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i += 1) set.add(mintIdempotencyKey());
    expect(set.size).toBe(50);
  });
});

describe('ULID validator', () => {
  it('accepts a 26-char Crockford ULID', () => {
    expect(isUlid('01HWGAH7XJW7CCNMPVQAB8YN3K')).toBe(true);
  });
  it('rejects shorter strings', () => {
    expect(isUlid('01HWGAH7XJW7CCNMPVQAB8YN3')).toBe(false);
  });
  it('rejects forbidden chars (I, L, O, U)', () => {
    expect(ULID_REGEX.test('01HWGAH7XJW7ICNMPVQAB8YN3K')).toBe(false);
    expect(ULID_REGEX.test('01HWGAH7XJW7LCNMPVQAB8YN3K')).toBe(false);
    expect(ULID_REGEX.test('01HWGAH7XJW7OCNMPVQAB8YN3K')).toBe(false);
    expect(ULID_REGEX.test('01HWGAH7XJW7UCNMPVQAB8YN3K')).toBe(false);
  });
});

describe('postChatChallenge', () => {
  it('returns parsed body on 200', async () => {
    mockFetchOnce(200, { challenge: 'abc', expiresAt: 12345 });
    const res = await postChatChallenge({
      wallet: '0xa',
      agent: '0xb',
      capabilityId: '0xc',
    });
    expect(res).toEqual({ challenge: 'abc', expiresAt: 12345 });
  });

  it('throws AgentChatApiError with server code on 4xx', async () => {
    mockFetchOnce(400, { error: 'invalid_wallet' });
    await expect(
      postChatChallenge({ wallet: 'bad', agent: '0xb', capabilityId: '0xc' }),
    ).rejects.toMatchObject({
      name: 'AgentChatApiError',
      code: 'invalid_wallet',
      httpStatus: 400,
    });
  });

  it('falls back to status-derived code when body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('not json', { status: 503 }),
    );
    await expect(
      postChatChallenge({ wallet: '0xa', agent: '0xb', capabilityId: '0xc' }),
    ).rejects.toMatchObject({ code: 'http_503', httpStatus: 503 });
  });

  it('throws client_network_error on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      postChatChallenge({ wallet: '0xa', agent: '0xb', capabilityId: '0xc' }),
    ).rejects.toMatchObject({ code: 'client_network_error', httpStatus: 0 });
  });
});

describe('postChatSession', () => {
  it('passes {challenge, signature} only (no wallet field)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ chatToken: 't', sid: 's', expiresAt: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await postChatSession({ challenge: 'c', signature: 'sig' });
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    // The chat-server's consumeChallenge derives the wallet from the
    // signature recovery, so the client must not redundantly send it.
    expect(body).toEqual({ challenge: 'c', signature: 'sig' });
    expect(body).not.toHaveProperty('wallet');
  });

  it('maps 423 agent_paused', async () => {
    mockFetchOnce(423, { error: 'agent_paused' });
    await expect(
      postChatSession({ challenge: 'c', signature: 's' }),
    ).rejects.toMatchObject({ code: 'agent_paused', httpStatus: 423 });
  });
});

describe('postChatWake', () => {
  it('accepts 202 with body', async () => {
    mockFetchOnce(202, { jobId: '01HWGAH7XJW7CCNMPVQAB8YN3K', status: 'pending' });
    const res = await postChatWake({
      chatToken: 't',
      message: 'hi',
      idempotencyKey: mintIdempotencyKey(),
    });
    expect(res.status).toBe('pending');
    expect(isUlid(res.jobId)).toBe(true);
  });

  it('surfaces 402 budget code verbatim', async () => {
    mockFetchOnce(402, { error: 'budget_insufficient' });
    await expect(
      postChatWake({ chatToken: 't', message: 'hi', idempotencyKey: 'A'.repeat(26) }),
    ).rejects.toMatchObject({ code: 'budget_insufficient', httpStatus: 402 });
  });
});

describe('getChatWakeStatus', () => {
  it('sends chatToken as Bearer header (not body/query)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ jobId: 'j', status: 'done', outcome: { ok: true } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await getChatWakeStatus('01HWGAH7XJW7CCNMPVQAB8YN3K', 'TOKEN123');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/api/nasun-ai/chat/wake/01HWGAH7XJW7CCNMPVQAB8YN3K');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer TOKEN123' });
    // No body, no query token leak.
    expect((init as RequestInit).body).toBeUndefined();
    expect(String(url)).not.toContain('TOKEN123');
  });

  it('returns the outcome envelope as-is', async () => {
    const expected = {
      jobId: '01HWGAH7XJW7CCNMPVQAB8YN3K',
      status: 'done' as const,
      outcome: { ok: true, summary: 'Done.' },
      userMessage: 'Done.',
    };
    mockFetchOnce(200, expected);
    const res = await getChatWakeStatus('01HWGAH7XJW7CCNMPVQAB8YN3K', 'TOKEN');
    expect(res).toEqual(expected);
  });
});

describe('AgentChatApiError', () => {
  it('preserves code + httpStatus', () => {
    const e = new AgentChatApiError('agent_offline', 503);
    expect(e.code).toBe('agent_offline');
    expect(e.httpStatus).toBe(503);
    expect(e.message).toBe('agent_offline');
    expect(e).toBeInstanceOf(Error);
  });
});
