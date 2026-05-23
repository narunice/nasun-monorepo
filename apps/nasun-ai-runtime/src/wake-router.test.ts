/**
 * Tests for the wake-router user_message branching introduced 2026-05-23.
 *
 * Trading messages route to the analyst preset; everything else routes
 * to chat. A shared per-sid/global rate limiter sits in front of both
 * so the free-tier LLM pool can't be drained by one session.
 */

import { describe, it, expect } from 'vitest';

import { dispatchWake, type WakeContext, type WakeRouterDeps } from './wake-router.js';
import { IdempotencyStore } from './idempotency.js';
import { RateLimiter, DEFAULT_RATE_LIMITS } from './rate-limit.js';

function makeCtx(overrides: Partial<WakeContext> = {}): WakeContext {
  return {
    jobId: `01HJOB${Math.random().toString(36).slice(2, 22).padEnd(20, '0').toUpperCase()}`.slice(0, 26),
    triggerType: 'user_message',
    intentId: '01HINTENT00000000000000000',
    sid: 'sid-test-1234567890',
    message: 'What is bitcoin?',
    nowMs: 1_000_000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<WakeRouterDeps> = {}): WakeRouterDeps {
  return {
    client: {} as never,
    config: { agentAddress: '0xagent' } as never,
    idempotency: new IdempotencyStore(':memory:'),
    log: () => {},
    ...overrides,
  };
}

describe('wake-router — user_message branching', () => {
  it('routes a non-trading message to runChatCycle', async () => {
    let chatCalled = false;
    let analystCalled = false;
    const out = await dispatchWake(makeCtx({ message: 'What is bitcoin?' }), makeDeps({
      runChatCycle: async () => {
        chatCalled = true;
        return { ok: true, status: 'processed', summary: 'chat ok' };
      },
      runAnalystCycle: async () => {
        analystCalled = true;
        return { ok: true, status: 'processed', summary: 'analyst' };
      },
    }));
    expect(chatCalled).toBe(true);
    expect(analystCalled).toBe(false);
    expect(out.summary).toBe('chat ok');
  });

  it('routes a trading message to runAnalystCycle', async () => {
    let chatCalled = false;
    let analystCalled = false;
    const out = await dispatchWake(makeCtx({ message: 'BUY 1 NBTC now' }), makeDeps({
      runChatCycle: async () => {
        chatCalled = true;
        return { ok: true, status: 'processed', summary: 'chat' };
      },
      runAnalystCycle: async () => {
        analystCalled = true;
        return { ok: true, status: 'processed', summary: 'analyst ok' };
      },
    }));
    expect(analystCalled).toBe(true);
    expect(chatCalled).toBe(false);
    expect(out.summary).toBe('analyst ok');
  });

  it('falls through to analyst when chat handler is unwired (backward compat)', async () => {
    let analystCalled = false;
    await dispatchWake(makeCtx({ message: 'random words' }), makeDeps({
      runAnalystCycle: async () => {
        analystCalled = true;
        return { ok: true, status: 'processed' };
      },
    }));
    expect(analystCalled).toBe(true);
  });
});

describe('wake-router — rate limiting', () => {
  it('returns rate_limited skip without calling any handler when limiter denies', async () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMITS, perSidPerMinute: 1 });
    let chatCalls = 0;
    let analystCalls = 0;
    const deps = makeDeps({
      rateLimiter: rl,
      runChatCycle: async () => {
        chatCalls += 1;
        return { ok: true, status: 'processed', summary: 'chat' };
      },
      runAnalystCycle: async () => {
        analystCalls += 1;
        return { ok: true, status: 'processed', summary: 'analyst' };
      },
    });
    // First call consumes the only slot.
    await dispatchWake(makeCtx({ message: 'hi' }), deps);
    // Second call from the same sid should be denied. Use a different
    // jobId so idempotency doesn't short-circuit the test.
    const out = await dispatchWake(makeCtx({ message: 'hi again', jobId: '01HJOB22222222222222222222' }), deps);
    expect(out.status).toBe('skipped');
    expect(out.reason).toMatch(/^rate_limited:/);
    expect(out.summary).toMatch(/messages a bit fast/i);
    expect(chatCalls).toBe(1);
    expect(analystCalls).toBe(0);
  });

  it('does NOT rate-limit trading-intent messages even when the chat window is full', async () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMITS, perSidPerMinute: 1 });
    let chatCalls = 0;
    let analystCalls = 0;
    const deps = makeDeps({
      rateLimiter: rl,
      runChatCycle: async () => {
        chatCalls += 1;
        return { ok: true, status: 'processed', summary: 'chat' };
      },
      runAnalystCycle: async () => {
        analystCalls += 1;
        return { ok: true, status: 'processed', summary: 'analyst' };
      },
    });
    // Burn the per-sid chat slot.
    await dispatchWake(makeCtx({ message: 'hi' }), deps);
    expect(chatCalls).toBe(1);
    // Trading wake from the SAME sid must still run even though the
    // chat window is exhausted. This is the load-bearing behavior of
    // the 2026-05-23 chat/trading split.
    const out = await dispatchWake(
      makeCtx({ message: 'BUY 1 NBTC now', jobId: '01HJOBTRADE00000000000000000' }),
      deps,
    );
    expect(out.status).toBe('processed');
    expect(out.summary).toBe('analyst');
    expect(analystCalls).toBe(1);
  });

  it('does not rate-limit when limiter is omitted', async () => {
    let calls = 0;
    const deps = makeDeps({
      runChatCycle: async () => {
        calls += 1;
        return { ok: true, status: 'processed', summary: 'chat' };
      },
    });
    for (let i = 0; i < 20; i++) {
      await dispatchWake(makeCtx({ message: 'hi', jobId: `01HJOB${String(i).padStart(20, '0')}` }), deps);
    }
    expect(calls).toBe(20);
  });
});
