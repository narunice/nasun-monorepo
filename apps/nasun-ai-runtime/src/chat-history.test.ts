/**
 * Tests for the in-memory chat history store + prompt renderer.
 *
 * Goal: prove the chat preset can stitch multi-turn context together
 * without leaking older turns past the cap or across the idle TTL.
 */

import { describe, it, expect } from 'vitest';

import { ChatHistoryStore, renderChatPrompt } from './chat-history.js';

const MIN = 60_000;

describe('ChatHistoryStore', () => {
  it('returns an empty list for an unknown sid', () => {
    const s = new ChatHistoryStore();
    expect(s.load('nope')).toEqual([]);
  });

  it('appends user + agent turns and returns them in order', () => {
    const s = new ChatHistoryStore();
    const t0 = 1_000_000;
    s.append('sid', 'user', 'hi', t0);
    s.append('sid', 'agent', 'hello', t0 + 1);
    s.append('sid', 'user', 'lunch?', t0 + 2);
    const out = s.load('sid', t0 + 3);
    expect(out.map((t) => `${t.role}:${t.content}`)).toEqual([
      'user:hi',
      'agent:hello',
      'user:lunch?',
    ]);
  });

  it('isolates sessions per sid', () => {
    const s = new ChatHistoryStore();
    const t0 = 1_000_000;
    s.append('a', 'user', 'first', t0);
    s.append('b', 'user', 'second', t0 + 1);
    expect(s.load('a', t0 + 2)[0].content).toBe('first');
    expect(s.load('b', t0 + 2)[0].content).toBe('second');
  });

  it('drops the oldest pairs when above the cap', () => {
    const s = new ChatHistoryStore();
    // Push 14 messages (7 pairs) — cap is 6 pairs = 12 messages.
    for (let i = 0; i < 7; i++) {
      s.append('sid', 'user', `u${i}`, i * 2);
      s.append('sid', 'agent', `a${i}`, i * 2 + 1);
    }
    const out = s.load('sid', 100);
    expect(out.length).toBeLessThanOrEqual(12);
    // First remaining turn must be a user turn (renderer assumes that).
    expect(out[0].role).toBe('user');
    // Oldest pair should be gone (u0/a0).
    expect(out.map((t) => t.content)).not.toContain('u0');
  });

  it('resets a session that has been idle past the TTL', () => {
    const s = new ChatHistoryStore();
    const t0 = 1_000_000;
    s.append('sid', 'user', 'hi', t0);
    s.append('sid', 'agent', 'yo', t0 + 1);
    // 31 minutes later -> idle eviction.
    const later = t0 + 31 * MIN;
    expect(s.load('sid', later)).toEqual([]);
    // And a new append starts a fresh session.
    s.append('sid', 'user', 'still there?', later + 1);
    const out = s.load('sid', later + 2);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('still there?');
  });

  it('clear() drops a session', () => {
    const s = new ChatHistoryStore();
    s.append('sid', 'user', 'hi', 1);
    expect(s.size()).toBe(1);
    s.clear('sid');
    expect(s.size()).toBe(0);
    expect(s.load('sid')).toEqual([]);
  });
});

describe('renderChatPrompt', () => {
  it('appends the current user message and trailing Agent: cue', () => {
    const out = renderChatPrompt('PERSONA', [], 'what is bitcoin?');
    expect(out).toContain('PERSONA');
    expect(out).toContain('User: what is bitcoin?');
    expect(out.endsWith('Agent:')).toBe(true);
  });

  it('interleaves prior history turns in order', () => {
    const out = renderChatPrompt(
      'PERSONA',
      [
        { role: 'user', content: 'lunch ideas?', ts: 1 },
        { role: 'agent', content: 'cooking or going out?', ts: 2 },
      ],
      'home',
    );
    const lines = out.split('\n');
    const userIdx = lines.findIndex((l) => l === 'User: lunch ideas?');
    const agentIdx = lines.findIndex((l) => l === 'Agent: cooking or going out?');
    const currentIdx = lines.findIndex((l) => l === 'User: home');
    expect(userIdx).toBeGreaterThan(-1);
    expect(agentIdx).toBeGreaterThan(userIdx);
    expect(currentIdx).toBeGreaterThan(agentIdx);
    expect(lines[lines.length - 1]).toBe('Agent:');
  });
});
