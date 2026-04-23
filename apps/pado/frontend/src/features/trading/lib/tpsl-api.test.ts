import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock import.meta.env before importing the module
vi.stubEnv('VITE_TPSL_KEEPER_URL', 'https://keeper.test.com');

// Dynamic import after env setup
const tpslApiModule = await import('./tpsl-api');
const {
  isKeeperConfigured,
  registerTPSLOrder,
  getUserTPSLOrders,
  cancelTPSLOrder,
  getKeeperStatus,
} = tpslApiModule;

// ========================================
// Mock fetch
// ========================================
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ========================================
// isKeeperConfigured
// ========================================
describe('isKeeperConfigured', () => {
  it('returns true when KEEPER_URL is set', () => {
    expect(isKeeperConfigured()).toBe(true);
  });
});

// ========================================
// registerTPSLOrder
// ========================================
describe('registerTPSLOrder', () => {
  const validRequest = {
    userAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    poolId: '0xaabbccdd',
    marketSymbol: 'NBTC',
    side: 'sell' as const,
    triggerType: 'take_profit' as const,
    triggerPrice: 100000,
    quantity: 0.5,
    tradeCapId: '0x5678',
    balanceManagerId: '0x9abc',
  };

  it('sends POST with correct URL, JSON headers, and body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        order: { id: 'order-1', ...validRequest, status: 'active', createdAt: 1000 },
      }),
    });

    await registerTPSLOrder(validRequest);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://keeper.test.com/api/tpsl/register');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.headers['X-API-Key']).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual(validRequest);
  });

  it('returns order response on success', async () => {
    const responseOrder = {
      id: 'order-1',
      userAddress: validRequest.userAddress,
      poolId: validRequest.poolId,
      marketSymbol: 'NBTC',
      side: 'sell',
      triggerType: 'take_profit',
      triggerPrice: 100000,
      quantity: 0.5,
      status: 'active',
      createdAt: 1000,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ order: responseOrder }),
    });

    const result = await registerTPSLOrder(validRequest);
    expect(result).toEqual(responseOrder);
  });

  it('throws on HTTP error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid trigger price' }),
    });

    await expect(registerTPSLOrder(validRequest)).rejects.toThrow('Invalid trigger price');
  });

  it('throws generic error when error body cannot be parsed', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(registerTPSLOrder(validRequest)).rejects.toThrow('Unknown error');
  });
});

// ========================================
// getUserTPSLOrders
// ========================================
describe('getUserTPSLOrders', () => {
  it('sends GET with encoded address and JSON headers only', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ orders: [] }),
    });

    await getUserTPSLOrders('0xabc123');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://keeper.test.com/api/tpsl/orders?address=0xabc123');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-API-Key']).toBeUndefined();
  });

  it('URL-encodes special characters in address', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ orders: [] }),
    });

    await getUserTPSLOrders('0x+abc&def');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('address=0x%2Babc%26def');
  });

  it('returns orders array', async () => {
    const orders = [
      { id: '1', status: 'active', triggerPrice: 100000 },
      { id: '2', status: 'filled', triggerPrice: 90000 },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ orders }),
    });

    const result = await getUserTPSLOrders('0xabc');
    expect(result).toEqual(orders);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(getUserTPSLOrders('0xabc')).rejects.toThrow('HTTP 401');
  });
});

// ========================================
// cancelTPSLOrder
// ========================================
describe('cancelTPSLOrder', () => {
  it('sends DELETE with correct URL and JSON headers only', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await cancelTPSLOrder('order-123', '0xowner');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://keeper.test.com/api/tpsl/orders/order-123?address=0xowner');
    expect(options.method).toBe('DELETE');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-API-Key']).toBeUndefined();
  });

  it('encodes orderId in URL path', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await cancelTPSLOrder('order/with/slashes', '0xowner');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('order%2Fwith%2Fslashes');
  });

  it('always includes address param for ownership verification', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await cancelTPSLOrder('order-123', '0xowner');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://keeper.test.com/api/tpsl/orders/order-123?address=0xowner');
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Not authorized' }),
    });

    await expect(cancelTPSLOrder('order-123', '0xwrong')).rejects.toThrow('Not authorized');
  });
});

// ========================================
// getKeeperStatus
// ========================================
describe('getKeeperStatus', () => {
  it('returns keeper status', async () => {
    const status = {
      status: 'running',
      uptime: 3600,
      orders: { total: 10, active: 3, filled: 5, failed: 2 },
      prices: { NBTC: 97000 },
      checkInterval: 10000,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(status),
    });

    const result = await getKeeperStatus();
    expect(result).toEqual(status);
  });
});
