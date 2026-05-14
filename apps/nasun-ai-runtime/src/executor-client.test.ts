/**
 * Tests for executor-client.ts — executeRequest, recordRequest, 409 handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { executeRequest, recordRequest } from './executor-client.js';

function makeResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('executeRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls /execute with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      result: 'AI response text',
      digest: 'abc123',
    }));

    const result = await executeRequest(
      'https://lambda.example.com/prod',
      'api-key-123',
      42,
      'What is AI?',
      'llama-3.3-70b-versatile'
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://lambda.example.com/prod/execute');
    expect(options.headers['x-api-key']).toBe('api-key-123');

    const body = JSON.parse(options.body);
    expect(body.requestId).toBe(42);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    // encryptedPrompt is base64-encoded
    expect(Buffer.from(body.encryptedPrompt, 'base64').toString()).toBe('What is AI?');

    expect(result.success).toBe(true);
    expect(result.result).toBe('AI response text');
    expect(result.digest).toBe('abc123');
  });

  it('retries on HTTP 500 and eventually succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'internal error' }, 500))
      .mockResolvedValueOnce(makeResponse({ result: 'ok', digest: 'xyz' }));

    const promise = executeRequest('https://lambda.example.com/prod', 'key', 1, 'prompt', 'model');
    await vi.advanceTimersByTimeAsync(5_000); // RETRY_DELAY_MS * 1

    const result = await promise;
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns failure after all retries exhausted', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500));

    const promise = executeRequest('https://lambda.example.com/prod', 'key', 1, 'prompt', 'model');
    await vi.advanceTimersByTimeAsync(5_000);  // attempt 1 retry
    await vi.advanceTimersByTimeAsync(10_000); // attempt 2 retry

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('retries on network error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(makeResponse({ result: 'ok' }));

    const promise = executeRequest('https://lambda.example.com/prod', 'key', 1, 'prompt', 'model');
    await vi.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result.success).toBe(true);
  });

  it('truncates long error text', async () => {
    const longError = 'x'.repeat(500);
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(longError),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(longError),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(longError),
      } as Response);

    const promise = executeRequest('https://lambda.example.com/prod', 'key', 1, 'prompt', 'model');
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error!.length).toBeLessThan(longError.length);
    expect(result.error).toContain('...');
  });
});

describe('recordRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls /record with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      txDigest: 'digest123',
    }));

    const result = await recordRequest(
      'https://lambda.example.com/prod',
      'api-key-123',
      42,
      'LLM generated result text...',
      'a'.repeat(64),
      1500
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://lambda.example.com/prod/record');
    expect(options.headers['x-api-key']).toBe('api-key-123');

    const body = JSON.parse(options.body);
    expect(body.requestId).toBe(42);
    expect(body.result).toBe('LLM generated result text...');
    expect(body.promptHash).toBe('a'.repeat(64));
    expect(body.executionTimeMs).toBe(1500);

    expect(result.success).toBe(true);
    expect(result.digest).toBe('digest123');
  });

  it('treats 409 as idempotent success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve('Request already completed'),
    } as Response);

    const result = await recordRequest(
      'https://lambda.example.com/prod',
      'key',
      42,
      'result',
      'a'.repeat(64),
      1000
    );

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce(); // No retry on 409
  });

  it('retries on HTTP 500 (not 409)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
      .mockResolvedValueOnce(makeResponse({ txDigest: 'ok' }));

    const promise = recordRequest(
      'https://lambda.example.com/prod', 'key', 1,
      'result', 'a'.repeat(64), 1000
    );
    await vi.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns failure after all retries exhausted', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
      .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500));

    const promise = recordRequest(
      'https://lambda.example.com/prod', 'key', 1,
      'result', 'a'.repeat(64), 1000
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.success).toBe(false);
  });

  it('retries on network error before 409 check', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: () => Promise.resolve('already done'),
      } as Response);

    const promise = recordRequest(
      'https://lambda.example.com/prod', 'key', 1,
      'result', 'a'.repeat(64), 1000
    );
    await vi.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result.success).toBe(true); // 409 on second attempt = success
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles text() rejection on error response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error('body stream consumed')),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error('body stream consumed')),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error('body stream consumed')),
      } as Response);

    const promise = recordRequest(
      'https://lambda.example.com/prod', 'key', 1,
      'result', 'a'.repeat(64), 1000
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown error');
  });
});
