/**
 * Tests for llm-client.ts — callLLM with mocked fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import { callLLM } from './llm-client.js';

function makeResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('callLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls OpenAI-compatible endpoint with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      choices: [{ message: { content: 'AI response' } }],
      model: 'llama-3.3-70b-versatile',
      usage: { total_tokens: 150 },
    }));

    const result = await callLLM(
      'https://api.groq.com/openai/v1',
      'gsk_test_key',
      'llama-3.3-70b-versatile',
      'What is AI?'
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gsk_test_key',
    });
    const body = JSON.parse(options.body);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.messages).toEqual([{ role: 'user', content: 'What is AI?' }]);
    expect(body.max_tokens).toBe(2048);

    expect(result.content).toBe('AI response');
    expect(result.model).toBe('llama-3.3-70b-versatile');
    expect(result.totalTokens).toBe(150);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 tokens when usage is missing', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      choices: [{ message: { content: 'response' } }],
      model: 'test-model',
    }));

    const result = await callLLM('https://api.example.com/v1', 'key', 'test-model', 'prompt');
    expect(result.totalTokens).toBe(0);
  });

  it('uses provided model name when response model is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      choices: [{ message: { content: 'response' } }],
      model: '',
    }));

    const result = await callLLM('https://api.example.com/v1', 'key', 'my-model', 'prompt');
    expect(result.model).toBe('my-model');
  });

  // Non-retryable errors: these throw immediately without retry (no timer needed)
  it('throws on empty response (no choices)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      choices: [],
      model: 'test',
    }));

    await expect(callLLM('https://api.example.com/v1', 'key', 'model', 'prompt'))
      .rejects.toThrow('empty response');

    expect(mockFetch).toHaveBeenCalledOnce(); // No retry
  });

  it('throws on empty content in choice', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      choices: [{ message: { content: '' } }],
      model: 'test',
    }));

    await expect(callLLM('https://api.example.com/v1', 'key', 'model', 'prompt'))
      .rejects.toThrow('empty response');

    expect(mockFetch).toHaveBeenCalledOnce(); // No retry
  });

  it('does not retry on 400 client error', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'bad request' }, 400));

    await expect(callLLM('https://api.example.com/v1', 'key', 'model', 'prompt'))
      .rejects.toThrow('LLM API error');

    expect(mockFetch).toHaveBeenCalledOnce(); // No retry
  });

  it('does not retry on 401 auth error', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'unauthorized' }, 401));

    await expect(callLLM('https://api.example.com/v1', 'key', 'model', 'prompt'))
      .rejects.toThrow('LLM API error');

    expect(mockFetch).toHaveBeenCalledOnce(); // No retry
  });

  it('does not retry on 403 forbidden', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'forbidden' }, 403));

    await expect(callLLM('https://api.example.com/v1', 'key', 'model', 'prompt'))
      .rejects.toThrow('LLM API error');

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // Retryable errors: use fake timers to advance sleep
  describe('retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse({ error: 'rate limited' }, 429))
        .mockResolvedValueOnce(makeResponse({
          choices: [{ message: { content: 'ok' } }],
          model: 'test',
          usage: { total_tokens: 10 },
        }));

      const promise = callLLM('https://api.example.com/v1', 'key', 'model', 'prompt');
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;
      expect(result.content).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server error', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse({ error: 'server error' }, 500))
        .mockResolvedValueOnce(makeResponse({
          choices: [{ message: { content: 'recovered' } }],
          model: 'test',
        }));

      const promise = callLLM('https://api.example.com/v1', 'key', 'model', 'prompt');
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;
      expect(result.content).toBe('recovered');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retries on server error', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
        .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500))
        .mockResolvedValueOnce(makeResponse({ error: 'error' }, 500));

      const promise = callLLM('https://api.example.com/v1', 'key', 'model', 'prompt');

      // Attach rejection handler BEFORE running timers to prevent unhandled rejection
      const assertion = expect(promise).rejects.toThrow('failed after 3 attempts');

      await vi.runAllTimersAsync();

      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on network error (fetch rejected)', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(makeResponse({
          choices: [{ message: { content: 'ok' } }],
          model: 'test',
        }));

      const promise = callLLM('https://api.example.com/v1', 'key', 'model', 'prompt');
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;
      expect(result.content).toBe('ok');
    });
  });
});
