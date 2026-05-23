/**
 * Tests for the chat preset. Goal is that:
 *   - With CHAT_LLM_PROVIDERS pool OR single-key LLM_API_URL+KEY,
 *     the user's message goes through callLLM and the model's reply
 *     comes back as the wake summary.
 *   - Without any creds, the preset soft-fails with a canned message
 *     instead of throwing or escalating.
 *   - LLM errors are caught and surfaced as a Telegram-safe summary.
 *
 * ANTHROPIC_API_KEY is intentionally not exercised here: it is reserved
 * for Pado's Wavi chatbot and must never be consumed by the trading
 * agent. See chat.ts header.
 */

import { describe, it, expect } from 'vitest';

import { runChatPreset } from './chat.js';
import { ChatHistoryStore } from '../chat-history.js';
import type { WakeContext } from '../wake-router.js';

// Each test gets a fresh history store to avoid cross-test bleed via
// the module-level singleton in chat.ts.
function freshHistory() {
  return new ChatHistoryStore();
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    chatLlmProviders: [],
    llmApiUrl: 'https://api.example.test',
    llmApiKey: 'key',
    llmModel: 'test-model',
    ...overrides,
  } as unknown as Parameters<typeof runChatPreset>[0];
}

function makeCtx(message: string | undefined): WakeContext {
  return {
    jobId: '01HTESTJOBID000000000000000',
    triggerType: 'user_message',
    intentId: '01HTESTINTENT00000000000000',
    sid: 'session-abc1234567',
    message,
    nowMs: 1_000_000,
  };
}

describe('runChatPreset', () => {
  it('returns the LLM reply as summary when single-key creds are present', async () => {
    let capturedPrompt = '';
    const out = await runChatPreset(makeConfig(), makeCtx('What is bitcoin?'), {
      callLLM: async (_url, _key, _model, prompt) => {
        capturedPrompt = prompt;
        return {
          content: 'Bitcoin is a digital currency. Want me to explain more?',
          model: 'test-model',
          totalTokens: 42,
          durationMs: 100,
        };
      },
      log: () => {},
      history: freshHistory(),
    });
    expect(out.ok).toBe(true);
    expect(out.status).toBe('processed');
    expect(out.summary).toBe('Bitcoin is a digital currency. Want me to explain more?');
    expect(capturedPrompt).toContain('User: What is bitcoin?');
  });

  it('soft-fails with a canned message when no LLM creds are configured', async () => {
    let called = false;
    const out = await runChatPreset(
      makeConfig({ chatLlmProviders: [], llmApiUrl: '', llmApiKey: '' }),
      makeCtx('hi there'),
      {
        callLLM: async () => {
          called = true;
          throw new Error('should not be called');
        },
        log: () => {},
      history: freshHistory(),
      },
    );
    expect(out.ok).toBe(true);
    expect(out.summary).toMatch(/not configured/i);
    expect(called).toBe(false);
  });

  it('returns a friendly summary when message is empty', async () => {
    const out = await runChatPreset(makeConfig(), makeCtx(''), {
      callLLM: async () => {
        throw new Error('should not be called for empty message');
      },
      log: () => {},
      history: freshHistory(),
    });
    expect(out.ok).toBe(true);
    expect(out.summary).toMatch(/did not catch/i);
  });

  it('catches LLM errors and surfaces a Telegram-safe summary', async () => {
    const out = await runChatPreset(makeConfig(), makeCtx('hi'), {
      callLLM: async () => {
        throw new Error('LLM API timeout (60000ms)');
      },
      log: () => {},
      history: freshHistory(),
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe('rejected');
    expect(out.reason).toMatch(/chat_llm_failed/);
    expect(out.summary).toMatch(/trouble thinking/i);
  });

  it('feeds prior turns from the same sid into the next prompt', async () => {
    const history = freshHistory();
    // Turn 1.
    let capturedTurn2Prompt = '';
    const out1 = await runChatPreset(makeConfig(), makeCtx('lunch ideas?'), {
      callLLM: async () => ({
        content: 'Cooking at home or going out?',
        model: 'test-model',
        totalTokens: 10,
        durationMs: 5,
      }),
      log: () => {},
      history,
    });
    expect(out1.ok).toBe(true);
    expect(out1.summary).toBe('Cooking at home or going out?');

    // Turn 2 from the SAME sid -> prompt should include both prior turns.
    const out2 = await runChatPreset(makeConfig(), makeCtx('home'), {
      callLLM: async (_url, _key, _model, prompt) => {
        capturedTurn2Prompt = prompt;
        return {
          content: 'Try a quick pasta then?',
          model: 'test-model',
          totalTokens: 12,
          durationMs: 6,
        };
      },
      log: () => {},
      history,
    });
    expect(out2.ok).toBe(true);
    expect(capturedTurn2Prompt).toContain('User: lunch ideas?');
    expect(capturedTurn2Prompt).toContain('Agent: Cooking at home or going out?');
    expect(capturedTurn2Prompt).toContain('User: home');
    expect(capturedTurn2Prompt.trimEnd().endsWith('Agent:')).toBe(true);
  });

  it('does NOT append a turn to history when the LLM call fails', async () => {
    const history = freshHistory();
    await runChatPreset(makeConfig(), makeCtx('hi'), {
      callLLM: async () => { throw new Error('LLM API failed'); },
      log: () => {},
      history,
    });
    // Failed reply -> session must stay empty so a retry doesn't see
    // an orphan user line the model never answered.
    expect(history.load('session-abc1234567')).toEqual([]);
  });

  it('trims long replies to fit Telegram bubbles', async () => {
    const longText = 'a'.repeat(2000);
    const out = await runChatPreset(makeConfig(), makeCtx('go'), {
      callLLM: async () => ({
        content: longText,
        model: 'test-model',
        totalTokens: 0,
        durationMs: 1,
      }),
      log: () => {},
      history: freshHistory(),
    });
    expect((out.summary ?? '').length).toBeLessThanOrEqual(610);
  });
});
