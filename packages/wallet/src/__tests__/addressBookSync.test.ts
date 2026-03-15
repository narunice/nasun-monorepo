/**
 * Address Book Sync Integration Tests
 * Tests configureAddressBookSync + fetchAddressBookFromServer + pushAddressBookToServer
 * with mocked fetch to verify auth header, request format, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('addressBookSync', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function importFresh() {
    return await import('../core/addressBookSync');
  }

  // ---- configureAddressBookSync ----

  it('should disable sync when not configured', async () => {
    const { isAddressBookSyncEnabled, fetchAddressBookFromServer } = await importFresh();

    expect(isAddressBookSyncEnabled()).toBe(false);

    const result = await fetchAddressBookFromServer();
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should enable sync after configuration', async () => {
    const { configureAddressBookSync, isAddressBookSyncEnabled } = await importFresh();

    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'test-token',
    });

    expect(isAddressBookSyncEnabled()).toBe(true);
  });

  it('should disable sync after reset', async () => {
    const { configureAddressBookSync, resetAddressBookSyncConfig, isAddressBookSyncEnabled } = await importFresh();

    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'test-token',
    });

    resetAddressBookSyncConfig();
    expect(isAddressBookSyncEnabled()).toBe(false);
  });

  // ---- fetchAddressBookFromServer ----

  it('should fetch address book with correct auth header', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        addressBook: { entries: { '0xabc': { address: '0xabc' } }, updatedAt: 123 },
        version: 5,
      }),
    });

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'my-jwt-token',
    });

    const result = await fetchAddressBookFromServer();

    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(result!.addressBook.entries['0xabc']).toBeDefined();

    // Verify Authorization header
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer my-jwt-token');
  });

  it('should return null when getToken returns null (not authenticated)', async () => {
    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => null,
    });

    const result = await fetchAddressBookFromServer();
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should support async getToken (Promise)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ addressBook: { entries: {}, updatedAt: 0 }, version: 0 }),
    });

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: async () => 'async-token',
    });

    await fetchAddressBookFromServer();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer async-token');
  });

  it('should return null on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'expired-token',
    });

    const result = await fetchAddressBookFromServer();
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const result = await fetchAddressBookFromServer();
    expect(result).toBeNull();
  });

  it('should handle abort signal', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const controller = new AbortController();
    const result = await fetchAddressBookFromServer(controller.signal);
    expect(result).toBeNull(); // Should not throw
  });

  it('should default version to 0 when server omits it', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ addressBook: { entries: {}, updatedAt: 0 } }),
    });

    const { configureAddressBookSync, fetchAddressBookFromServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const result = await fetchAddressBookFromServer();
    expect(result!.version).toBe(0);
  });

  // ---- pushAddressBookToServer ----

  it('should push address book with correct body format', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const { configureAddressBookSync, pushAddressBookToServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const addressBook = { entries: { '0x1': { address: '0x1' } as any }, updatedAt: 100 };
    const result = await pushAddressBookToServer(addressBook, 3);

    expect(result).toBe('success');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.addressBook).toEqual(addressBook);
    expect(body.version).toBe(3);
  });

  it('should return "conflict" on HTTP 409', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409 });

    const { configureAddressBookSync, pushAddressBookToServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const result = await pushAddressBookToServer({ entries: {}, updatedAt: 0 }, 0);
    expect(result).toBe('conflict');
  });

  it('should return null on non-409 HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const { configureAddressBookSync, pushAddressBookToServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    const result = await pushAddressBookToServer({ entries: {}, updatedAt: 0 }, 0);
    expect(result).toBeNull();
  });

  it('should return null when not authenticated (push)', async () => {
    const { configureAddressBookSync, pushAddressBookToServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => null,
    });

    const result = await pushAddressBookToServer({ entries: {}, updatedAt: 0 }, 0);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should support keepalive option for page unload', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const { configureAddressBookSync, pushAddressBookToServer } = await importFresh();
    configureAddressBookSync({
      apiEndpoint: 'https://api.example.com/prod',
      getToken: () => 'token',
    });

    await pushAddressBookToServer({ entries: {}, updatedAt: 0 }, 0, { keepalive: true });

    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });
});
