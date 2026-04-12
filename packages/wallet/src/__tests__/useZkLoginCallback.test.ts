import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useZkLoginCallback } from '../hooks/useZkLogin';

const SESSION_KEY = 'nasun:zklogin:session';
const STATE_KEY = 'nasun:zklogin:state';
const CSRF_KEY = 'nasun:zklogin:oauth_csrf_state';

function setHash(hash: string) {
  // happy-dom supports direct assignment
  window.location.hash = hash;
}

function seedPersistedProof() {
  localStorage.setItem(
    STATE_KEY,
    JSON.stringify({
      provider: 'google',
      address: '0xabc',
      proof: { proofPoints: [], issBase64Details: {}, headerBase64: '' },
      ephemeralPrivateKey: 'epk',
      maxEpoch: 100,
      addressSeed: '1',
      randomness: 'r',
      expiresAt: Date.now() + 86400000,
    }),
  );
}

function seedPendingSession() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      ephemeralPrivateKey: 'epk',
      ephemeralPublicKey: 'epb',
      randomness: 'r',
      maxEpoch: 100,
      nonce: 'n',
      createdAt: Date.now(),
    }),
  );
}

function seedValidCsrfState(stateValue: string) {
  sessionStorage.setItem(CSRF_KEY, stateValue);
}

describe('useZkLoginCallback', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setHash('');
    // reset search too
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    setHash('');
    window.history.replaceState({}, '', '/');
  });

  describe('guard truth table (persistedProof × pendingSession)', () => {
    it('proof O + pending X + clean URL → isCallback false (existing guard)', () => {
      seedPersistedProof();
      const result = useZkLoginCallback();
      expect(result).toEqual({ isCallback: false, jwt: null, error: null });
    });

    it('proof O + pending O + callback URL → isCallback true (JWT parsed)', () => {
      seedPersistedProof();
      seedPendingSession();
      seedValidCsrfState('STATE1');
      setHash('#id_token=FAKE_JWT&state=STATE1');

      const result = useZkLoginCallback();

      expect(result.isCallback).toBe(true);
      expect(result.jwt).toBe('FAKE_JWT');
      expect(result.error).toBeNull();
    });

    it('proof X + pending O + callback URL → isCallback true', () => {
      seedPendingSession();
      seedValidCsrfState('STATE1');
      setHash('#id_token=FAKE_JWT&state=STATE1');

      const result = useZkLoginCallback();

      expect(result.isCallback).toBe(true);
      expect(result.jwt).toBe('FAKE_JWT');
    });

    it('proof X + pending X + clean URL → isCallback false', () => {
      const result = useZkLoginCallback();
      expect(result).toEqual({ isCallback: false, jwt: null, error: null });
    });
  });

  describe('error-hash edge case', () => {
    it('proof O + pending X + #error=access_denied → bypasses early-return and surfaces error', () => {
      seedPersistedProof();
      setHash('#error=access_denied&error_description=User%20denied');

      const result = useZkLoginCallback();

      expect(result.isCallback).toBe(true);
      expect(result.jwt).toBeNull();
      expect(result.error).toContain('denied');
    });
  });

  describe('CSRF state validation', () => {
    it('missing state param → returns error', () => {
      seedPendingSession();
      setHash('#id_token=FAKE_JWT');

      const result = useZkLoginCallback();

      expect(result.isCallback).toBe(true);
      expect(result.jwt).toBeNull();
      expect(result.error).toMatch(/state/i);
    });

    it('mismatched state param → returns error', () => {
      seedPendingSession();
      seedValidCsrfState('EXPECTED');
      setHash('#id_token=FAKE_JWT&state=WRONG');

      const result = useZkLoginCallback();

      expect(result.isCallback).toBe(true);
      expect(result.jwt).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe('garbage URL', () => {
    it('hash without id_token or error → isCallback false', () => {
      setHash('#random=stuff');
      const result = useZkLoginCallback();
      expect(result).toEqual({ isCallback: false, jwt: null, error: null });
    });
  });
});
