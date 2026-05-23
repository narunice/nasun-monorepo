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
import type { WakeContext } from '../wake-router.js';

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
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe('rejected');
    expect(out.reason).toMatch(/chat_llm_failed/);
    expect(out.summary).toMatch(/trouble thinking/i);
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
    });
    expect((out.summary ?? '').length).toBeLessThanOrEqual(610);
  });
});
