import { describe, it, expect, beforeEach, vi } from 'vitest';

// Helper: create a fake JWT from payload (no real signature)
function fakeJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key-id' },
): string {
  // Use Buffer for proper UTF-8 base64url encoding
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode(header)}.${encode(payload)}.fake-signature`;
}

describe('zklogin.ts core functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // zkLoginState lives in localStorage (persists across OAuth redirects on
    // a fresh tab), so clearing sessionStorage alone leaks state between
    // tests and breaks the "no state exists" case.
    localStorage.clear();
  });

  // =======================
  // parseJwt
  // =======================
  describe('parseJwt', () => {
    it('should parse a valid JWT', async () => {
      const { parseJwt } = await import('../core/zklogin');

      const jwt = fakeJwt({
        iss: 'https://accounts.google.com',
        sub: '12345',
        aud: 'client-id',
        exp: 9999999999,
        nonce: 'test-nonce',
        email: 'user@example.com',
        name: 'Test User',
      });

      const result = parseJwt(jwt);
      expect(result.header.alg).toBe('RS256');
      expect(result.header.kid).toBe('test-key-id');
      expect(result.payload.iss).toBe('https://accounts.google.com');
      expect(result.payload.sub).toBe('12345');
      expect(result.payload.aud).toBe('client-id');
      expect(result.payload.nonce).toBe('test-nonce');
      expect(result.payload.email).toBe('user@example.com');
      expect(result.payload.name).toBe('Test User');
    });

    it('should reject JWT with fewer than 3 parts', async () => {
      const { parseJwt } = await import('../core/zklogin');

      expect(() => parseJwt('only-one-part')).toThrow('Invalid JWT format: expected 3 parts, got 1');
      expect(() => parseJwt('two.parts')).toThrow('Invalid JWT format: expected 3 parts, got 2');
    });

    it('should reject JWT with more than 3 parts', async () => {
      const { parseJwt } = await import('../core/zklogin');

      expect(() => parseJwt('a.b.c.d')).toThrow('Invalid JWT format: expected 3 parts, got 4');
    });

    it('should reject empty string', async () => {
      const { parseJwt } = await import('../core/zklogin');

      expect(() => parseJwt('')).toThrow('Invalid JWT format');
    });

    it('should handle UTF-8 characters in payload', async () => {
      const { parseJwt } = await import('../core/zklogin');

      const jwt = fakeJwt({
        iss: 'https://accounts.google.com',
        sub: '12345',
        aud: 'client-id',
        exp: 9999999999,
        name: '테스트 사용자',
      });

      const result = parseJwt(jwt);
      expect(result.payload.name).toBe('테스트 사용자');
    });
  });

  // =======================
  // validateJwt
  // =======================
  describe('validateJwt', () => {
    it('should validate a JWT with matching nonce and future expiry', async () => {
      const { validateJwt } = await import('../core/zklogin');

      const jwt = fakeJwt({
        iss: 'https://accounts.google.com',
        sub: '12345',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: 'expected-nonce',
      });

      expect(validateJwt(jwt, 'expected-nonce')).toBe(true);
    });

    it('should throw on expired JWT', async () => {
      const { validateJwt } = await import('../core/zklogin');

      const jwt = fakeJwt({
        iss: 'https://accounts.google.com',
        sub: '12345',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) - 3600,
        nonce: 'test-nonce',
      });

      expect(() => validateJwt(jwt, 'test-nonce')).toThrow('JWT has expired');
    });

    it('should throw on nonce mismatch', async () => {
      const { validateJwt } = await import('../core/zklogin');

      const jwt = fakeJwt({
        iss: 'https://accounts.google.com',
        sub: '12345',
        aud: 'client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: 'actual-nonce',
      });

      expect(() => validateJwt(jwt, 'wrong-nonce')).toThrow('nonce does not match');
    });

    it('should throw on invalid JWT structure', async () => {
      const { validateJwt } = await import('../core/zklogin');

      expect(() => validateJwt('not-a-jwt', 'nonce')).toThrow();
    });
  });

  // =======================
  // detectProvider
  // =======================
  describe('detectProvider', () => {
    it('should detect Google from issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://accounts.google.com', sub: '1', aud: 'a', exp: 0 });
      expect(detectProvider(jwt)).toBe('google');
    });

    it('should detect Apple from issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://appleid.apple.com', sub: '1', aud: 'a', exp: 0 });
      expect(detectProvider(jwt)).toBe('apple');
    });

    it('should detect Twitch from issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://id.twitch.tv/oauth2', sub: '1', aud: 'a', exp: 0 });
      expect(detectProvider(jwt)).toBe('twitch');
    });

    it('should detect Facebook from issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://www.facebook.com', sub: '1', aud: 'a', exp: 0 });
      expect(detectProvider(jwt)).toBe('facebook');
    });

    it('should detect Kakao from issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://kauth.kakao.com', sub: '1', aud: 'a', exp: 0 });
      expect(detectProvider(jwt)).toBe('kakao');
    });

    it('should throw on unknown issuer', async () => {
      const { detectProvider } = await import('../core/zklogin');

      const jwt = fakeJwt({ iss: 'https://unknown-provider.com', sub: '1', aud: 'a', exp: 0 });
      expect(() => detectProvider(jwt)).toThrow('Unknown issuer');
    });
  });

  // =======================
  // CSRF state (generate / validate / clear)
  // =======================
  describe('OAuth CSRF state', () => {
    it('should generate and validate CSRF state', async () => {
      const { generateOAuthCsrfState, validateOAuthCsrfState } = await import('../core/zklogin');

      const state = generateOAuthCsrfState();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);

      // Validation should pass with matching state
      expect(validateOAuthCsrfState(state)).toBe(true);
    });

    it('should throw on mismatched CSRF state', async () => {
      const { generateOAuthCsrfState, validateOAuthCsrfState } = await import('../core/zklogin');

      generateOAuthCsrfState();

      expect(() => validateOAuthCsrfState('wrong-state')).toThrow('state mismatch');
    });

    it('should throw when no stored CSRF state exists', async () => {
      const { validateOAuthCsrfState } = await import('../core/zklogin');

      expect(() => validateOAuthCsrfState('any-state')).toThrow('state not found');
    });

    it('should clear CSRF state', async () => {
      const { generateOAuthCsrfState, validateOAuthCsrfState, clearOAuthCsrfState } =
        await import('../core/zklogin');

      generateOAuthCsrfState();
      clearOAuthCsrfState();

      // After clearing, validation should fail
      expect(() => validateOAuthCsrfState('any-state')).toThrow('state not found');
    });
  });

  // =======================
  // buildOAuthUrl
  // =======================
  describe('buildOAuthUrl', () => {
    it('should throw when zkLogin is not configured', async () => {
      // Reset module state to ensure no config
      vi.resetModules();
      const { buildOAuthUrl } = await import('../core/zklogin');

      expect(() => buildOAuthUrl('google', 'test-nonce')).toThrow('not configured');
    });

    it('should build Google OAuth URL with correct params', async () => {
      vi.resetModules();
      const { configureZkLogin, buildOAuthUrl } = await import('../core/zklogin');

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://prover.example.com',
        providers: {
          google: {
            provider: 'google',
            clientId: 'test-google-client-id',
            redirectUri: 'https://app.example.com/callback',
          },
        },
      });

      const url = buildOAuthUrl('google', 'test-nonce-123');
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-google-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('nonce=test-nonce-123');
      expect(url).toContain('response_type=id_token');
      expect(url).toContain('scope=openid');
      expect(url).toContain('state='); // CSRF state should be present
    });

    it('should throw for unconfigured provider', async () => {
      vi.resetModules();
      const { configureZkLogin, buildOAuthUrl } = await import('../core/zklogin');

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://prover.example.com',
        providers: {
          google: {
            provider: 'google',
            clientId: 'test-id',
            redirectUri: 'https://app.example.com/callback',
          },
        },
      });

      expect(() => buildOAuthUrl('apple', 'nonce')).toThrow('not configured');
    });

    it('should build Apple OAuth URL', async () => {
      vi.resetModules();
      const { configureZkLogin, buildOAuthUrl } = await import('../core/zklogin');

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://prover.example.com',
        providers: {
          apple: {
            provider: 'apple',
            clientId: 'test-apple-client-id',
            redirectUri: 'https://app.example.com/callback',
          },
        },
      });

      const url = buildOAuthUrl('apple', 'nonce-456');
      expect(url).toContain('https://appleid.apple.com/auth/authorize');
      expect(url).toContain('client_id=test-apple-client-id');
      expect(url).toContain('nonce=nonce-456');
      expect(url).toContain('response_mode=fragment');
    });

    it('should build Twitch OAuth URL', async () => {
      vi.resetModules();
      const { configureZkLogin, buildOAuthUrl } = await import('../core/zklogin');

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://prover.example.com',
        providers: {
          twitch: {
            provider: 'twitch',
            clientId: 'test-twitch-client-id',
            redirectUri: 'https://app.example.com/callback',
          },
        },
      });

      const url = buildOAuthUrl('twitch', 'nonce-789');
      expect(url).toContain('https://id.twitch.tv/oauth2/authorize');
      expect(url).toContain('client_id=test-twitch-client-id');
      expect(url).toContain('nonce=nonce-789');
    });
  });

  // =======================
  // Session storage (save / get / clear)
  // =======================
  describe('zkLogin state storage', () => {
    it('should save and retrieve zkLogin state', async () => {
      const { saveZkLoginState, getZkLoginState } = await import('../core/zklogin');

      const state = {
        address: '0xabc123',
        provider: 'google' as const,
        jwt: 'fake-jwt',
        salt: '12345',
        proof: null,
        maxEpoch: 100,
        ephemeralPrivateKey: 'key',
        ephemeralPublicKey: 'pub',
        addressSeed: 'seed',
        email: 'user@example.com',
        name: 'Test',
        picture: null,
      };

      saveZkLoginState(state as any);
      const retrieved = getZkLoginState();
      expect(retrieved).toEqual(state);
    });

    it('should return null when no state exists', async () => {
      const { getZkLoginState } = await import('../core/zklogin');
      expect(getZkLoginState()).toBeNull();
    });

    it('should clear zkLogin state', async () => {
      const { saveZkLoginState, getZkLoginState, clearZkLoginState } =
        await import('../core/zklogin');

      saveZkLoginState({ address: '0x1' } as any);
      clearZkLoginState();
      expect(getZkLoginState()).toBeNull();
    });
  });

  // =======================
  // Primary prover circuit breaker
  // =======================
  describe('fetchZkProof circuit breaker', () => {
    // Shared valid proof response used across circuit breaker cases
    const proofResponse = {
      proofPoints: { a: ['1'], b: [['1']], c: ['1'] },
      issBase64Details: { value: 'x', indexMod4: 0 },
      headerBase64: 'h',
      addressSeed: 'seed',
    };
    // Valid bech32-encoded ephemeral private key (Ed25519Keypair default)
    let ephemeralPrivateKey: string;

    beforeEach(async () => {
      vi.resetModules();
      vi.useRealTimers();
      const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
      ephemeralPrivateKey = new Ed25519Keypair().getSecretKey();
    });

    it('opens the circuit after 3 consecutive primary failures and skips primary next call', async () => {
      const {
        configureZkLogin,
        fetchZkProof,
        __resetPrimaryProverCircuitForTest,
      } = await import('../core/zklogin');
      __resetPrimaryProverCircuitForTest();

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://primary.example.com',
        providers: {},
      });

      // Primary always rejects, fallback always succeeds.
      const fetchMock = vi.fn(async (url: string | URL | Request) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('primary.example.com')) {
          return new Response('overloaded', { status: 503 });
        }
        return new Response(JSON.stringify(proofResponse), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const baseParams = {
        jwt: 'jwt',
        salt: '1',
        ephemeralPrivateKey,
        maxEpoch: 1,
        randomness: '1',
      };

      // 3 calls: all hit primary then fallback -> opens circuit on 3rd failure
      for (let i = 0; i < 3; i++) {
        const progress: string[] = [];
        await fetchZkProof({
          ...baseParams,
          onProgress: (e) => progress.push(e.phase),
        });
        expect(progress).toEqual(['primary', 'fallback']);
      }

      // 4th call must skip primary entirely
      const progress4: Array<{ phase: string; circuitOpen?: boolean }> = [];
      await fetchZkProof({
        ...baseParams,
        onProgress: (e) => progress4.push(e),
      });
      expect(progress4).toEqual([
        { phase: 'fallback', reason: expect.any(String), circuitOpen: true },
      ]);

      // fetch was called 3x primary + 3x fallback during warmup, + 1x fallback for 4th call = 7 total
      // (no 4th primary call = the key assertion)
      const primaryCalls = fetchMock.mock.calls.filter((c) =>
        (c[0] as string).includes('primary.example.com'),
      ).length;
      expect(primaryCalls).toBe(3);
    });

    it('closes the circuit on successful primary call', async () => {
      const {
        configureZkLogin,
        fetchZkProof,
        __resetPrimaryProverCircuitForTest,
      } = await import('../core/zklogin');
      __resetPrimaryProverCircuitForTest();

      configureZkLogin({
        saltApiUrl: 'https://salt.example.com',
        proverUrl: 'https://primary.example.com',
        providers: {},
      });

      let primaryShouldFail = true;
      const fetchMock = vi.fn(async (url: string | URL | Request) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('primary.example.com') && primaryShouldFail) {
          return new Response('overloaded', { status: 503 });
        }
        return new Response(JSON.stringify(proofResponse), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const baseParams = {
        jwt: 'jwt',
        salt: '1',
        ephemeralPrivateKey,
        maxEpoch: 1,
        randomness: '1',
      };

      // 2 failures -- below threshold, circuit still closed
      await fetchZkProof(baseParams);
      await fetchZkProof(baseParams);

      // Primary recovers -- success should reset failure counter
      primaryShouldFail = false;
      const progress: string[] = [];
      await fetchZkProof({
        ...baseParams,
        onProgress: (e) => progress.push(e.phase),
      });
      expect(progress).toEqual(['primary']);

      // Now make primary fail again. Counter was reset, so it takes 3 more
      // failures to open the circuit -- primary should still be called next.
      primaryShouldFail = true;
      await fetchZkProof(baseParams);
      const progress2: string[] = [];
      await fetchZkProof({
        ...baseParams,
        onProgress: (e) => progress2.push(e.phase),
      });
      expect(progress2).toEqual(['primary', 'fallback']);
    });
  });
});
