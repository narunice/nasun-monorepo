/**
 * Coverage for the AWS-exit zkLogin-salt client (Stage 2 §A; zklogin-salt PG-ization).
 *
 * Mocks global fetch so the test pins the request contract (shared bearer + provider/sub body) and the
 * response handling for the issuer's POST /zklogin/salt. Lives in link-account/__tests__ to reuse the
 * ts-jest harness; the client itself is in _shared/auth so the zklogin-salt lambda shares it.
 */

import {
  isIssuerSaltEnabled,
  lookupSaltViaIssuer,
  createSaltViaIssuer,
} from '../../_shared/auth/issuer-salt';

const URL = 'http://127.0.0.1:3210/zklogin/salt';
const SECRET = 'test-mint-secret';

const originalFetch = global.fetch;

function mockFetchOnce(impl: (input: any, init: any) => Promise<any>) {
  const fn = jest.fn(impl);
  (global as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  process.env.ISSUER_SALT_URL = URL;
  process.env.ISSUER_MINT_SECRET = SECRET;
  delete process.env.ISSUER_MINT_TIMEOUT_MS;
});

afterEach(() => {
  (global as any).fetch = originalFetch;
  delete process.env.ISSUER_SALT_URL;
  delete process.env.ISSUER_MINT_SECRET;
  jest.restoreAllMocks();
});

describe('isIssuerSaltEnabled', () => {
  it('is false when ISSUER_SALT_URL is unset (DynamoDB fallback / pre-cutover no-op)', () => {
    delete process.env.ISSUER_SALT_URL;
    expect(isIssuerSaltEnabled()).toBe(false);
  });

  it('is true when ISSUER_SALT_URL is set', () => {
    expect(isIssuerSaltEnabled()).toBe(true);
  });
});

describe('lookupSaltViaIssuer', () => {
  it('sends the shared bearer + {provider, sub} and returns the stored row', async () => {
    const fetchMock = mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ salt: '123456789', address: '0xabc', isNewUser: false }),
    }));

    const result = await lookupSaltViaIssuer('google', 'sub-1');

    expect(result).toEqual({ salt: '123456789', address: '0xabc', isNewUser: false });
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body)).toEqual({ provider: 'google', sub: 'sub-1' });
  });

  it('returns exactly { salt: null } when the issuer has no row yet (no stray fields)', async () => {
    mockFetchOnce(async () => ({ ok: true, status: 200, json: async () => ({ salt: null }) }));
    const result = await lookupSaltViaIssuer('google', 'new-sub');
    expect(result).toEqual({ salt: null });
  });

  it('throws when a non-null salt arrives without an address (contract violation)', async () => {
    mockFetchOnce(async () => ({ ok: true, status: 200, json: async () => ({ salt: 'abc' }) }));
    await expect(lookupSaltViaIssuer('google', 'sub-1')).rejects.toThrow('unexpected response');
  });

  it('throws when the salt field is missing entirely', async () => {
    mockFetchOnce(async () => ({ ok: true, status: 200, json: async () => ({ address: '0xabc' }) }));
    await expect(lookupSaltViaIssuer('google', 'sub-1')).rejects.toThrow('unexpected response');
  });

  it('throws when ISSUER_SALT_URL is missing', async () => {
    delete process.env.ISSUER_SALT_URL;
    await expect(lookupSaltViaIssuer('google', 'sub-1')).rejects.toThrow('ISSUER_SALT_URL is not set');
  });

  it('throws on a non-2xx status (status only)', async () => {
    mockFetchOnce(async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }));
    await expect(lookupSaltViaIssuer('google', 'sub-1')).rejects.toThrow(
      'issuer /zklogin/salt returned HTTP 401'
    );
  });

  it('throws when salt is a non-string, non-null value', async () => {
    mockFetchOnce(async () => ({ ok: true, status: 200, json: async () => ({ salt: 42 }) }));
    await expect(lookupSaltViaIssuer('google', 'sub-1')).rejects.toThrow('unexpected response');
  });
});

describe('createSaltViaIssuer', () => {
  it('posts the candidate salt+address+profile and returns the authoritative row', async () => {
    const fetchMock = mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ salt: 'cand-salt', address: '0xnew', isNewUser: true }),
    }));

    const result = await createSaltViaIssuer({
      provider: 'google',
      sub: 'new-sub',
      salt: 'cand-salt',
      address: '0xnew',
      email: 'u@example.com',
    });

    expect(result).toEqual({ salt: 'cand-salt', address: '0xnew', isNewUser: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      provider: 'google',
      sub: 'new-sub',
      salt: 'cand-salt',
      address: '0xnew',
      email: 'u@example.com',
    });
  });

  it('returns the race winner row when a concurrent first-login already created one', async () => {
    // We sent candidate 'cand-salt' but the box returns a different stored salt -> use the stored one.
    mockFetchOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ salt: 'winner-salt', address: '0xwinner', isNewUser: false }),
    }));
    const result = await createSaltViaIssuer({
      provider: 'google',
      sub: 'racey',
      salt: 'cand-salt',
      address: '0xloser',
    });
    expect(result).toEqual({ salt: 'winner-salt', address: '0xwinner', isNewUser: false });
  });
});
