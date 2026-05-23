/**
 * Tests for the user_message intent classifier. The goal is for the
 * keyword pass to keep the failure mode reported on 2026-05-23 from
 * happening again: "What is bitcoin?" must NOT be classified as
 * trading, because the analyst path forces it into a HOLD JSON.
 */

import { describe, it, expect } from 'vitest';

import { classifyIntent } from './intent-classifier.js';

describe('classifyIntent — chat (general conversation)', () => {
  const chatSamples = [
    'What is bitcoin?',
    'How is the crypto market sentiment?',
    '점심 메뉴 추천해줘',
    'tell me a joke',
    'how are you',
    "what's your name",
    'explain decentralization',
    'is ethereum a good investment',
    'bitcoin price feels interesting',
  ];

  for (const msg of chatSamples) {
    it(`routes "${msg}" to chat`, () => {
      const d = classifyIntent(msg);
      expect(d.intent).toBe('chat');
    });
  }

  it('routes empty message to chat (the chat preset handles the empty case explicitly)', () => {
    expect(classifyIntent('').intent).toBe('chat');
    expect(classifyIntent('   ').intent).toBe('chat');
  });
});

describe('classifyIntent — trading', () => {
  const tradingSamples = [
    'BUY 1 NBTC',
    'buy now',
    'sell everything',
    'swap NUSDC to NBTC',
    'should I buy at this level',
    'should we sell here?',
    'when to buy',
    '매수 좀',
    '매도해줘',
    '사줘',
    '팔아',
    '살까',
    '팔까',
    '익절해',
    '청산',
    'go long',
    'open position now',
    'take profit',
    'stop loss the trade',
  ];

  for (const msg of tradingSamples) {
    it(`routes "${msg}" to trading`, () => {
      const d = classifyIntent(msg);
      expect(d.intent).toBe('trading');
      expect(d.matchedRule).toBeDefined();
    });
  }
});

describe('classifyIntent — no false positives from substrings', () => {
  it('"buyer" alone is not a buy command', () => {
    expect(classifyIntent('the buyer was happy').intent).toBe('chat');
  });

  it('"selling" inside a noun phrase is not a sell command', () => {
    expect(classifyIntent('this product is best-selling').intent).toBe('chat');
  });

  it('"longer" does not match "long"', () => {
    expect(classifyIntent('longer term outlook').intent).toBe('chat');
  });
});
