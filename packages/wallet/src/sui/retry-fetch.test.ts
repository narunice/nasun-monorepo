import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRetryFetch } from './retry-fetch';

function rpcBody(method: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] });
}

function makeResponse(
  status: number,
  body = '{}',
  headers?: Record<string, string>
): Response {
  return new Response(body, { status, headers });
}

describe('createRetryFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('retriable method detection', () => {
    it('retries sui_getObject on 502', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(502))
        .mockResolvedValueOnce(makeResponse(200, '{"result":1}'));

      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(500);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not retry sui_executeTransactionBlock on 502', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const res = await retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_executeTransactionBlock'),
      });

      expect(res.status).toBe(502);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry JSON-RPC batch requests', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const res = await retryFetch('http://x', {
        method: 'POST',
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'sui_getObject', params: [] },
          { jsonrpc: '2.0', id: 2, method: 'sui_getBalance', params: [] },
        ]),
      });

      expect(res.status).toBe(502);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry when body is non-JSON', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const res = await retryFetch('http://x', { method: 'POST', body: 'raw' });

      expect(res.status).toBe(502);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry when no body is present', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const res = await retryFetch('http://x');

      expect(res.status).toBe(502);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP status policy', () => {
    it.each([429, 502, 503, 504])('retries %i', async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(status))
        .mockResolvedValueOnce(makeResponse(200));

      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(500);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it.each([400, 401, 404, 500])('does not retry %i', async (status) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(status));
      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const res = await retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      expect(res.status).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('returns the last 5xx response after maxAttempts', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const retryFetch = createRetryFetch({
        fetchImpl,
        maxAttempts: 3,
        onRetry: vi.fn(),
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const res = await promise;

      expect(res.status).toBe(502);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry-After header', () => {
    it('uses delta-seconds from Retry-After when present', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(503, '', { 'retry-after': '1' }))
        .mockResolvedValueOnce(makeResponse(200));

      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({ fetchImpl, onRetry, jitter: 0 });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(1_500);
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry.mock.calls[0][0].delayMs).toBe(1000);
    });

    it('clamps Retry-After to 10 seconds', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(503, '', { 'retry-after': '9999' }))
        .mockResolvedValueOnce(makeResponse(200));

      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({ fetchImpl, onRetry, jitter: 0 });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(11_000);
      await promise;

      expect(onRetry.mock.calls[0][0].delayMs).toBe(10_000);
    });

    it('falls back to exponential delay when Retry-After is malformed', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(502, '', { 'retry-after': 'garbage' }))
        .mockResolvedValueOnce(makeResponse(200));

      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({
        fetchImpl,
        onRetry,
        initialDelayMs: 200,
        jitter: 0,
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(onRetry.mock.calls[0][0].delayMs).toBe(200);
    });

    it('falls back to exponential when Retry-After is blank/whitespace', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(503, '', { 'retry-after': '   ' }))
        .mockResolvedValueOnce(makeResponse(200));

      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({
        fetchImpl,
        onRetry,
        initialDelayMs: 200,
        jitter: 0,
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(500);
      await promise;

      // Regression guard: Number('   ') === 0 previously caused an immediate retry.
      expect(onRetry.mock.calls[0][0].delayMs).toBe(200);
    });

    it('parses HTTP-date Retry-After into a future delay', async () => {
      vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          makeResponse(503, '', { 'retry-after': 'Wed, 22 Apr 2026 12:00:02 GMT' })
        )
        .mockResolvedValueOnce(makeResponse(200));

      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({ fetchImpl, onRetry, jitter: 0 });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(3_000);
      await promise;

      // 2 seconds in the future → 2000 ms
      expect(onRetry.mock.calls[0][0].delayMs).toBe(2000);
    });
  });

  describe('backoff and cap', () => {
    it('caps exponential delay at capDelayMs', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({
        fetchImpl,
        onRetry,
        maxAttempts: 6,
        initialDelayMs: 100,
        backoffFactor: 2,
        capDelayMs: 500,
        jitter: 0,
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;

      const delays = onRetry.mock.calls.map((c) => c[0].delayMs);
      expect(delays).toEqual([100, 200, 400, 500, 500]);
    });

    it('applies jitter within ±ratio', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      // Math.random → 0 gives jitterFactor = 0.8 (lower bound), → 1 gives 1.2 (upper).
      const randomSpy = vi
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1);
      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({
        fetchImpl,
        onRetry,
        maxAttempts: 3,
        initialDelayMs: 1_000,
        capDelayMs: 10_000,
        jitter: 0.2,
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;

      const delays = onRetry.mock.calls.map((c) => c[0].delayMs);
      // delay 1000 * 0.8 = 800; then delay doubles to 2000 * 1.2 = 2400.
      // Float multiplication produces ~2400.0000000000005, so compare loosely.
      expect(delays[0]).toBeCloseTo(800, 6);
      expect(delays[1]).toBeCloseTo(2400, 6);
      randomSpy.mockRestore();
    });
  });

  describe('onRetry callback', () => {
    it('provides method, attempt, and reason fields', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse(502))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(makeResponse(200));
      const onRetry = vi.fn();
      const retryFetch = createRetryFetch({ fetchImpl, onRetry, jitter: 0 });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_queryEvents'),
      });
      await vi.advanceTimersByTimeAsync(2_000);
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry.mock.calls[0][0]).toMatchObject({
        method: 'sui_queryEvents',
        attempt: 1,
        reason: 'HTTP 502',
      });
      expect(onRetry.mock.calls[1][0]).toMatchObject({
        method: 'sui_queryEvents',
        attempt: 2,
        reason: 'fetch failed',
      });
    });
  });

  describe('AbortSignal', () => {
    it('propagates AbortError from fetch without retrying', async () => {
      const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abortError);

      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      await expect(
        retryFetch('http://x', {
          method: 'POST',
          body: rpcBody('sui_getObject'),
        })
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('retries non-abort TypeError (fetch failed)', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(makeResponse(200));

      const retryFetch = createRetryFetch({ fetchImpl, onRetry: vi.fn() });
      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await vi.advanceTimersByTimeAsync(500);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('aborts mid-sleep and cleans up the pending timer', async () => {
      vi.useRealTimers(); // real delays so we can reliably abort mid-sleep
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const controller = new AbortController();
      const retryFetch = createRetryFetch({
        fetchImpl,
        initialDelayMs: 1_000,
        onRetry: vi.fn(),
      });

      const promise = retryFetch('http://x', {
        method: 'POST',
        body: rpcBody('sui_getObject'),
        signal: controller.signal,
      });

      await new Promise((r) => setTimeout(r, 20));
      controller.abort();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      // Only one attempt went out; the retry never fired.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('extracts signal from Request when init.signal is absent', async () => {
      vi.useRealTimers();
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(502));
      const controller = new AbortController();
      const retryFetch = createRetryFetch({
        fetchImpl,
        initialDelayMs: 1_000,
        onRetry: vi.fn(),
      });

      const request = new Request('http://x', { signal: controller.signal });
      const promise = retryFetch(request, {
        method: 'POST',
        body: rpcBody('sui_getObject'),
      });

      await new Promise((r) => setTimeout(r, 20));
      controller.abort();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });
  });
});
