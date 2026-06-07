/**
 * Regression coverage for the AWS-exit grace issuer-mint client (Stage 2 §A.3).
 *
 * Mocks the global fetch (the only external dependency) so the test verifies the request contract and
 * response handling without a live issuer. Located in link-account/__tests__ to reuse the established
 * ts-jest harness; the helper lives in _shared/auth so every login lambda shares one implementation.
 */

import {
  isIssuerMintEnabled,
  mintViaIssuer,
} from '../../_shared/auth/issuer-mint';

const URL = 'http://127.0.0.1:3210/mint';
const SECRET = 'test-mint-secret';

const originalFetch = global.fetch;

function mockFetchOnce(impl: (input: any, init: any) => Promise<any>) {
  const fn = jest.fn(impl);
  (global as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  process.env.ISSUER_MINT_URL = URL;
  process.env.ISSUER_MINT_SECRET = SECRET;
  delete process.env.ISSUER_MINT_TIMEOUT_MS;
});

afterEach(() => {
  (global as any).fetch = originalFetch;
  delete process.env.ISSUER_MINT_URL;
  delete process.env.ISSUER_MINT_SECRET;
  jest.restoreAllMocks();
});

describe('isIssuerMintEnabled', () => {
  it('is false when ISSUER_MINT_URL is unset (Cognito fallback / pre-cutover no-op)', () => {
    delete process.env.ISSUER_MINT_URL;
    expect(isIssuerMintEnabled()).toBe(false);
  });

  it('is true when ISSUER_MINT_URL is set', () => {
    expect(isIssuerMintEnabled()).toBe(true);
  });
});

describe('mintViaIssuer', () => {
  it('POSTs the bearer secret + identifier/provider and returns { identityId, token }', async () => {
    const fetchMock = mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ identityId: 'ap-northeast-2:abc-123', token: 'jwt.value.here' }),
    }));

    const result = await mintViaIssuer('nasun_0xdeadbeef', 'sui');

    expect(result).toEqual({ identityId: 'ap-northeast-2:abc-123', token: 'jwt.value.here' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      developerUserIdentifier: 'nasun_0xdeadbeef',
      provider: 'sui',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws when ISSUER_MINT_URL is missing', async () => {
    delete process.env.ISSUER_MINT_URL;
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('ISSUER_MINT_URL is not set');
  });

  it('throws when ISSUER_MINT_SECRET is missing', async () => {
    delete process.env.ISSUER_MINT_SECRET;
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('ISSUER_MINT_SECRET is not set');
  });

  it('throws on a non-2xx status without echoing the response body', async () => {
    mockFetchOnce(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    }));
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('issuer /mint returned HTTP 401');
  });

  it('throws when the issuer omits identityId or token', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ identityId: 'ap-northeast-2:abc-123' }), // no token
    }));
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('incomplete response');
  });

  it('throws on a 200 with an unparseable body (json() rejects -> null)', async () => {
    mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    }));
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('unparseable response');
  });

  it('propagates fetch network/timeout errors (caller maps to auth failure)', async () => {
    mockFetchOnce(async () => {
      throw new Error('fetch failed');
    });
    await expect(mintViaIssuer('nasun_0x1', 'sui')).rejects.toThrow('fetch failed');
  });
});
