/**
 * AddressBookSessionManager E2E Tests
 * Tests the challenge-sign-verify flow with mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddressBookSessionManager } from '../core/addressBookSession';

// Helper: create a mock JWT with custom exp
function createMockJwt(exp: number, sub = '0xabc123'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ sub, iss: 'nasun-ab', aud: 'address-book', exp }));
  return `${header}.${payload}.fake-signature`;
}

describe('AddressBookSessionManager', () => {
  const API_ENDPOINT = 'https://api.example.com/prod';
  const WALLET_ADDRESS = '0x' + 'ab'.repeat(32);
  const MOCK_NONCE = 'deadbeef'.repeat(8);
  const MOCK_MESSAGE = `Nasun Address Book Auth\n\nWallet: ${WALLET_ADDRESS}\nNonce: ${MOCK_NONCE}`;

  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));

    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  function setupSuccessfulFlow(tokenExpSeconds?: number) {
    const exp = tokenExpSeconds ?? Math.floor(Date.now() / 1000) + 3600;
    const token = createMockJwt(exp);

    // Challenge response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });
    // Verify response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token, walletAddress: WALLET_ADDRESS }),
    });

    return token;
  }

  function createManager(overrides: Partial<ConstructorParameters<typeof AddressBookSessionManager>[0]> = {}) {
    return new AddressBookSessionManager({
      apiEndpoint: API_ENDPOINT,
      getWalletAddress: () => WALLET_ADDRESS,
      signMessage: async () => 'base64-mock-signature',
      ...overrides,
    });
  }

  // ---- Happy path ----

  it('should perform challenge-sign-verify flow and return token', async () => {
    const expectedToken = setupSuccessfulFlow();
    const manager = createManager();

    const token = await manager.getToken();

    expect(token).toBe(expectedToken);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify challenge request
    const challengeCall = fetchMock.mock.calls[0];
    expect(challengeCall[0]).toBe(`${API_ENDPOINT}/challenge`);
    expect(JSON.parse(challengeCall[1].body)).toEqual({ walletAddress: WALLET_ADDRESS });

    // Verify verify request
    const verifyCall = fetchMock.mock.calls[1];
    expect(verifyCall[0]).toBe(`${API_ENDPOINT}/verify`);
    const verifyBody = JSON.parse(verifyCall[1].body);
    expect(verifyBody.signature).toBe('base64-mock-signature');
    expect(verifyBody.nonce).toBe(MOCK_NONCE);
    expect(verifyBody.walletAddress).toBe(WALLET_ADDRESS);
  });

  it('should cache token and not re-fetch on subsequent calls', async () => {
    setupSuccessfulFlow();
    const manager = createManager();

    const token1 = await manager.getToken();
    const token2 = await manager.getToken();

    expect(token1).toBe(token2);
    expect(fetchMock).toHaveBeenCalledTimes(2); // Only one flow
  });

  it('should refresh token when it is about to expire (within 5 min buffer)', async () => {
    // First token: expires in 4 minutes (within 5-min buffer)
    const nearExpiry = Math.floor(Date.now() / 1000) + 240;
    const firstToken = setupSuccessfulFlow(nearExpiry);
    const manager = createManager();

    const token1 = await manager.getToken();
    expect(token1).toBe(firstToken);

    // Second call should trigger refresh since token expires in < 5 min
    const newToken = setupSuccessfulFlow();
    const token2 = await manager.getToken();
    expect(token2).toBe(newToken);
    expect(fetchMock).toHaveBeenCalledTimes(4); // Two full flows
  });

  it('should not refresh token when it has > 5 min remaining', async () => {
    // Token expires in 30 minutes
    const farExpiry = Math.floor(Date.now() / 1000) + 1800;
    setupSuccessfulFlow(farExpiry);
    const manager = createManager();

    await manager.getToken();
    await manager.getToken();
    await manager.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2); // Only one flow
  });

  // ---- zkLogin path ----

  it('should include ephemeralPublicKey in verify request for zkLogin', async () => {
    setupSuccessfulFlow();
    const manager = createManager({
      getEphemeralPublicKey: () => 'base64-ephemeral-pubkey',
    });

    await manager.getToken();

    const verifyBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(verifyBody.ephemeralPublicKey).toBe('base64-ephemeral-pubkey');
  });

  it('should NOT include ephemeralPublicKey for self-custody signer', async () => {
    setupSuccessfulFlow();
    const manager = createManager(); // No getEphemeralPublicKey

    await manager.getToken();

    const verifyBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(verifyBody.ephemeralPublicKey).toBeUndefined();
  });

  // ---- Error handling ----

  it('should return null when wallet is not connected', async () => {
    const manager = createManager({
      getWalletAddress: () => null,
    });

    const token = await manager.getToken();
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return null when challenge request fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const manager = createManager();

    const token = await manager.getToken();
    expect(token).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should return null when verify request fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const manager = createManager();
    const token = await manager.getToken();
    expect(token).toBeNull();
  });

  it('should return null when signing fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });

    const manager = createManager({
      signMessage: async () => { throw new Error('User rejected'); },
    });

    const token = await manager.getToken();
    expect(token).toBeNull();
  });

  it('should return null when fetch throws network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const manager = createManager();

    const token = await manager.getToken();
    expect(token).toBeNull();
  });

  // ---- Race condition / mutex ----

  it('should deduplicate concurrent getToken calls (mutex pattern)', async () => {
    setupSuccessfulFlow();
    const manager = createManager();

    // Call getToken 3 times concurrently
    const [t1, t2, t3] = await Promise.all([
      manager.getToken(),
      manager.getToken(),
      manager.getToken(),
    ]);

    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
    expect(fetchMock).toHaveBeenCalledTimes(2); // Only one flow, not three
  });

  it('should allow new flow after previous one completes', async () => {
    // First flow succeeds
    setupSuccessfulFlow();
    const manager = createManager();
    await manager.getToken();

    // Invalidate
    manager.invalidate();

    // Second flow
    const token2 = setupSuccessfulFlow();
    const result = await manager.getToken();
    expect(result).toBe(token2);
    expect(fetchMock).toHaveBeenCalledTimes(4); // Two full flows
  });

  it('should allow retry after a failed flow', async () => {
    // First flow fails
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const manager = createManager();

    const result1 = await manager.getToken();
    expect(result1).toBeNull();

    // Second flow succeeds
    const token = setupSuccessfulFlow();
    const result2 = await manager.getToken();
    expect(result2).toBe(token);
  });

  // ---- invalidate() ----

  it('should clear cached token on invalidate', async () => {
    setupSuccessfulFlow();
    const manager = createManager();

    const token1 = await manager.getToken();
    expect(token1).not.toBeNull();

    manager.invalidate();

    // Next call should trigger a new flow
    setupSuccessfulFlow();
    await manager.getToken();
    expect(fetchMock).toHaveBeenCalledTimes(4); // Two full flows
  });

  // ---- JWT parsing edge cases ----

  it('should handle malformed JWT gracefully (trigger refresh)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'not-a-jwt', walletAddress: WALLET_ADDRESS }),
    });

    const manager = createManager();
    const token = await manager.getToken();
    expect(token).toBe('not-a-jwt');

    // Since exp is 0 (malformed), next call should trigger refresh
    setupSuccessfulFlow();
    await manager.getToken();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('should handle JWT with missing exp claim (treat as expired)', async () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ sub: WALLET_ADDRESS })); // No exp
    const noExpToken = `${header}.${payload}.sig`;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: noExpToken, walletAddress: WALLET_ADDRESS }),
    });

    const manager = createManager();
    await manager.getToken();

    // Next call should trigger refresh (no exp = always expired)
    setupSuccessfulFlow();
    await manager.getToken();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  // ---- Message signing verification ----

  it('should pass the exact challenge message bytes to signMessage', async () => {
    const signMessageSpy = vi.fn().mockResolvedValue('base64-sig');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nonce: MOCK_NONCE, message: MOCK_MESSAGE }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: createMockJwt(Math.floor(Date.now() / 1000) + 3600), walletAddress: WALLET_ADDRESS }),
    });

    const manager = createManager({ signMessage: signMessageSpy });
    await manager.getToken();

    expect(signMessageSpy).toHaveBeenCalledOnce();
    const passedBytes = signMessageSpy.mock.calls[0][0];
    expect(passedBytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(passedBytes)).toBe(MOCK_MESSAGE);
  });
});
