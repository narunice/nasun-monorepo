import { describe, it, expect, beforeEach } from 'vitest';
import { clearPendingZkLoginFlow } from '../core/zklogin';

const SESSION_KEY = 'nasun:zklogin:session';
const STATE_KEY = 'nasun:zklogin:state';
const CSRF_KEY = 'nasun:zklogin:oauth_csrf_state';
const RETURN_URL_KEY = 'nasun:zklogin:return_url';

describe('clearPendingZkLoginFlow', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('clears all three in-flight artifacts', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ createdAt: Date.now() }));
    sessionStorage.setItem(CSRF_KEY, 'csrf123');
    sessionStorage.setItem(RETURN_URL_KEY, '/my-account');

    clearPendingZkLoginFlow();

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(CSRF_KEY)).toBeNull();
    expect(sessionStorage.getItem(RETURN_URL_KEY)).toBeNull();
  });

  it('preserves persisted login state', () => {
    const persisted = JSON.stringify({ address: '0xabc', proof: { proofPoints: [] } });
    localStorage.setItem(STATE_KEY, persisted);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ createdAt: Date.now() }));

    clearPendingZkLoginFlow();

    expect(localStorage.getItem(STATE_KEY)).toBe(persisted);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('is idempotent when nothing is set', () => {
    expect(() => clearPendingZkLoginFlow()).not.toThrow();
    expect(sessionStorage.length).toBe(0);
  });
});
