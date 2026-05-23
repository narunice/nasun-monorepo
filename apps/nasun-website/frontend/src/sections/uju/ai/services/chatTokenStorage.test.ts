/**
 * chatTokenStorage tests — sessionStorage CRUD + capability isolation +
 * expiry-skew rejection.
 *
 * Why capability isolation matters: a wallet may rotate caps on the same
 * (wallet, agent). Without the cap segment in the key, a stale token from
 * the previous cap would trip `agent_capability_mismatch` 403 and lock the
 * input — see plan R10.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearAllTokens,
  clearToken,
  getToken,
  saveToken,
  type StoredChatToken,
} from './chatTokenStorage';

function payload(overrides: Partial<StoredChatToken> = {}): StoredChatToken {
  return {
    chatToken: 'TOKEN',
    sid: 'SID',
    expiresAt: Date.now() + 60_000,
    wallet: '0xWallet',
    agentAddress: '0xAgent',
    capabilityId: '0xCap',
    ...overrides,
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('saveToken / getToken happy path', () => {
  it('round-trips a payload', () => {
    const p = payload();
    saveToken(p);
    const got = getToken(p.wallet, p.agentAddress, p.capabilityId);
    expect(got).toEqual(p);
  });

  it('is case-insensitive on wallet/agent/cap', () => {
    saveToken(payload({ wallet: '0xWallet', agentAddress: '0xAgent', capabilityId: '0xCap' }));
    const got = getToken('0xWALLET', '0xAGENT', '0xCAP');
    expect(got?.chatToken).toBe('TOKEN');
  });
});

describe('capabilityId isolation (R10 guard)', () => {
  it('a different capability misses the cache', () => {
    saveToken(payload({ capabilityId: '0xCapA' }));
    const got = getToken('0xWallet', '0xAgent', '0xCapB');
    expect(got).toBeNull();
  });

  it('a different agent misses the cache', () => {
    saveToken(payload({ agentAddress: '0xAgentA' }));
    const got = getToken('0xWallet', '0xAgentB', '0xCap');
    expect(got).toBeNull();
  });

  it('a different wallet misses the cache', () => {
    saveToken(payload({ wallet: '0xA' }));
    const got = getToken('0xB', '0xAgent', '0xCap');
    expect(got).toBeNull();
  });

  it('payload capability mismatch invalidates and clears', () => {
    // Simulate a hand-edited / cross-key collision where storage contains
    // a payload whose capabilityId doesn't match the requested one.
    const key = 'nasun-ai-chat-token::0xwallet::0xagent::0xcap';
    sessionStorage.setItem(
      key,
      JSON.stringify(payload({ capabilityId: '0xOTHER' })),
    );
    expect(getToken('0xWallet', '0xAgent', '0xCap')).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});

describe('expiry skew', () => {
  it('drops tokens within the 30s skew window', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    saveToken(payload({ expiresAt: now + 10_000 })); // 10s left, skew is 30s
    expect(getToken('0xWallet', '0xAgent', '0xCap')).toBeNull();
    vi.restoreAllMocks();
  });

  it('keeps tokens outside the skew window', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    saveToken(payload({ expiresAt: now + 90_000 }));
    expect(getToken('0xWallet', '0xAgent', '0xCap')?.chatToken).toBe('TOKEN');
    vi.restoreAllMocks();
  });
});

describe('clearToken / clearAllTokens', () => {
  it('clearToken removes one key', () => {
    saveToken(payload());
    clearToken('0xWallet', '0xAgent', '0xCap');
    expect(getToken('0xWallet', '0xAgent', '0xCap')).toBeNull();
  });

  it('clearAllTokens removes every chat token but leaves siblings', () => {
    saveToken(payload({ capabilityId: '0xC1' }));
    saveToken(payload({ capabilityId: '0xC2' }));
    sessionStorage.setItem('unrelated', 'keep-me');
    clearAllTokens();
    expect(getToken('0xWallet', '0xAgent', '0xC1')).toBeNull();
    expect(getToken('0xWallet', '0xAgent', '0xC2')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep-me');
  });
});

describe('malformed payload', () => {
  it('returns null and clears when JSON is corrupt', () => {
    const key = 'nasun-ai-chat-token::0xwallet::0xagent::0xcap';
    sessionStorage.setItem(key, '{not valid json');
    expect(getToken('0xWallet', '0xAgent', '0xCap')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const key = 'nasun-ai-chat-token::0xwallet::0xagent::0xcap';
    sessionStorage.setItem(key, JSON.stringify({ chatToken: '' }));
    expect(getToken('0xWallet', '0xAgent', '0xCap')).toBeNull();
  });
});
