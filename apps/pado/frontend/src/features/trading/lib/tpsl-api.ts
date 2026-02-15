/**
 * TP/SL Keeper API Client
 *
 * REST client for communicating with the server-side TP/SL Keeper Bot.
 * Includes API key authentication, request timeouts, and URL encoding.
 */

const KEEPER_URL = import.meta.env.VITE_TPSL_KEEPER_URL || '';
const API_KEY = import.meta.env.VITE_TPSL_API_KEY || '';
const REQUEST_TIMEOUT_MS = 10_000;

export interface TPSLOrderRequest {
  userAddress: string;
  poolId: string;
  marketSymbol: string;
  side: 'buy' | 'sell';
  triggerType: 'take_profit' | 'stop_loss';
  triggerPrice: number;
  quantity: number;
  tradeCapId: string;
  balanceManagerId: string;
}

export interface TPSLOrderResponse {
  id: string;
  userAddress: string;
  poolId: string;
  marketSymbol: string;
  side: 'buy' | 'sell';
  triggerType: 'take_profit' | 'stop_loss';
  triggerPrice: number;
  quantity: number;
  status: 'active' | 'executing' | 'filled' | 'canceled' | 'failed';
  createdAt: number;
  txDigest?: string;
  error?: string;
}

export interface KeeperStatus {
  status: string;
  uptime: number;
  orders: { total: number; active: number; filled: number; failed: number };
  prices: Record<string, number>;
  checkInterval: number;
}

// Build request headers with API key authentication
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return headers;
}

// Fetch with timeout via AbortController
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if keeper service is configured
 */
export function isKeeperConfigured(): boolean {
  return !!KEEPER_URL;
}

/**
 * Register a new TP/SL order with the keeper
 */
export async function registerTPSLOrder(order: TPSLOrderRequest): Promise<TPSLOrderResponse> {
  const response = await fetchWithTimeout(`${KEEPER_URL}/api/tpsl/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.order;
}

/**
 * Get user's TP/SL orders from the keeper
 */
export async function getUserTPSLOrders(address: string): Promise<TPSLOrderResponse[]> {
  const response = await fetchWithTimeout(
    `${KEEPER_URL}/api/tpsl/orders?address=${encodeURIComponent(address)}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.orders;
}

/**
 * Cancel a TP/SL order (with ownership verification via address param)
 */
export async function cancelTPSLOrder(orderId: string, userAddress: string): Promise<void> {
  const addressParam = `?address=${encodeURIComponent(userAddress)}`;
  const response = await fetchWithTimeout(
    `${KEEPER_URL}/api/tpsl/orders/${encodeURIComponent(orderId)}${addressParam}`,
    { method: 'DELETE', headers: authHeaders() },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

/**
 * Get keeper status (price data, uptime, order stats)
 */
export async function getKeeperStatus(): Promise<KeeperStatus> {
  const response = await fetchWithTimeout(
    `${KEEPER_URL}/api/tpsl/status`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}
