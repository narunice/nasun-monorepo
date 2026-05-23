/**
 * Tests for the multi-provider chat LLM pool. The pool's job is to
 * stretch ~9 free-tier keys across concurrent chats without bricking a
 * session when one provider hits its per-minute window.
 *
 * We don't hit real APIs here -- ChatLLMPool calls llm-client.callLLM
 * which we intercept via vitest's `vi.spyOn` on the imported module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ChatLLMPool, parseProvidersEnv } from './chat-llm-pool.js';
import * as llmClient from './llm-client.js';

function provider(name: string) {
  return {
    name,
    url: `https://${name}.example.test/v1`,
    key: `key-${name}`,
    model: 'test-model',
  };
}

describe('parseProvidersEnv', () => {
  it('returns empty array when env is undefined or empty', () => {
    expect(parseProvidersEnv(undefined)).toEqual([]);
    expect(parseProvidersEnv('')).toEqual([]);
  });

  it('parses a valid JSON array', () => {
    const raw = JSON.stringify([
      { name: 'groq-1', url: 'https://g.example/v1', key: 'k1', model: 'm1' },
      { name: 'cerebras', url: 'https://c.example/v1', key: 'k2', model: 'm2' },
    ]);
    expect(parseProvidersEnv(raw)).toEqual([
      { name: 'groq-1', url: 'https://g.example/v1', key: 'k1', model: 'm1' },
      { name: 'cerebras', url: 'https://c.example/v1', key: 'k2', model: 'm2' },
    ]);
  });

  it('skips malformed entries without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = JSON.stringify([
      { name: 'good', url: 'https://g/v1', key: 'k', model: 'm' },
      { name: 'no-key', url: 'https://x/v1' },
      'not-an-object',
      null,
    ]);
    const out = parseProvidersEnv(raw);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('good');
    warn.mockRestore();
  });

  it('returns empty on invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseProvidersEnv('{not json')).toEqual([]);
    warn.mockRestore();
  });
});

describe('ChatLLMPool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when there are no providers', async () => {
    const pool = new ChatLLMPool([]);
    expect(await pool.call('hi')).toBeNull();
  });

  it('returns the first provider on a fresh pool', async () => {
    const spy = vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
      content: 'reply',
      model: 'm',
      totalTokens: 1,
      durationMs: 1,
    });
    const pool = new ChatLLMPool([provider('a'), provider('b')]);
    const r = await pool.call('hi');
    expect(r?.providerName).toBe('a');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('round-robins across providers on consecutive calls', async () => {
    vi.spyOn(llmClient, 'callLLM').mockResolvedValue({
      content: 'reply',
      model: 'm',
      totalTokens: 1,
      durationMs: 1,
    });
    const pool = new ChatLLMPool([provider('a'), provider('b'), provider('c')]);
    expect((await pool.call('1'))?.providerName).toBe('a');
    expect((await pool.call('2'))?.providerName).toBe('b');
    expect((await pool.call('3'))?.providerName).toBe('c');
    expect((await pool.call('4'))?.providerName).toBe('a');
  });

  it('falls back to the next provider when one fails, and puts the failing one in cooldown', async () => {
    const spy = vi.spyOn(llmClient, 'callLLM')
      .mockImplementationOnce(async () => { throw new Error('429 rate limit'); })
      .mockResolvedValue({ content: 'ok', model: 'm', totalTokens: 1, durationMs: 1 });
    const pool = new ChatLLMPool([provider('a'), provider('b')]);
    const t0 = 1_000_000;
    const r = await pool.call('hi', t0);
    expect(r?.providerName).toBe('b');
    expect(spy).toHaveBeenCalledTimes(2);
    const state = pool.inspectState();
    expect(state[0].cooldownUntilMs).toBeGreaterThan(t0);
    expect(state[1].cooldownUntilMs).toBe(0);
  });

  it('skips providers that are in cooldown without spending an LLM call', async () => {
    const spy = vi.spyOn(llmClient, 'callLLM')
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockResolvedValue({ content: 'ok', model: 'm', totalTokens: 1, durationMs: 1 });
    const pool = new ChatLLMPool([provider('a'), provider('b')]);
    const t0 = 1_000_000;
    // First call: a fails, b succeeds. (2 LLM calls)
    await pool.call('1', t0);
    // Second call right after: cursor is now at a again, a is in cooldown,
    // so the pool should skip a and call only b. (1 LLM call -> total 3)
    await pool.call('2', t0 + 10);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('returns null when every provider failed', async () => {
    vi.spyOn(llmClient, 'callLLM').mockRejectedValue(new Error('nope'));
    const pool = new ChatLLMPool([provider('a'), provider('b')]);
    const r = await pool.call('hi');
    expect(r).toBeNull();
  });

  it('lets a provider re-enter rotation after its cooldown expires', async () => {
    const spy = vi.spyOn(llmClient, 'callLLM')
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockResolvedValue({ content: 'ok', model: 'm', totalTokens: 1, durationMs: 1 });
    const pool = new ChatLLMPool([provider('a')]);
    const t0 = 1_000_000;
    await pool.call('1', t0); // a fails, returns null
    const after = await pool.call('2', t0 + 61_000); // cooldown expired
    expect(after?.providerName).toBe('a');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
