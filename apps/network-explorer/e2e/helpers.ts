/**
 * E2E test helpers for Network Explorer
 * Tests run against production endpoints (explorer.nasun.io)
 *
 * IMPORTANT: The API server runs on a small EC2 instance (PM2 + Hono).
 * All requests include automatic retry with backoff to handle transient 503s.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value.replace(/\/$/, '');
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value ? value.replace(/\/$/, '') : undefined;
}

// Base URLs
export const RPC_URL = requireEnv('VITE_SUI_RPC_URL');
export const FAUCET_URL = requireEnv('VITE_FAUCET_URL');
export const CHAIN_ID = requireEnv('VITE_CHAIN_ID');
export const DEEPBOOK_PACKAGE = optionalEnv('VITE_DEEPBOOK_PACKAGE');

// Explorer API (production nginx proxy)
export const API_BASE = 'https://explorer.nasun.io/api/v1';

// Frontend URL
export const FRONTEND_URL = 'https://explorer.nasun.io/devnet';

// CORS allowed origin
export const ALLOWED_ORIGIN = 'https://explorer.nasun.io';

// Known coin types (short form, as returned by API)
export const COIN_TYPES = {
  NSN: '0x2::sui::SUI',
  NBTC: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC',
  NUSDC: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC',
  NETH: '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31::neth::NETH',
  NSOL: '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2::nsol::NSOL',
} as const;

// Test addresses (known to exist on devnet)
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const SYSTEM_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000005';

/** Small delay to avoid overwhelming the API server */
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimum interval between API requests (ms)
const MIN_REQUEST_INTERVAL = 100;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - elapsed);
  }
  lastRequestTime = Date.now();
}

/**
 * HTTP request helper with automatic retry for 503 responses.
 * Returns status, headers, and parsed body.
 */
export async function apiRequest(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<{ status: number; headers: Headers; body: unknown; raw: Response }> {
  await throttle();

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body: unknown;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  // Retry on 502/503 (nginx upstream unavailable) with exponential backoff
  if ((res.status === 502 || res.status === 503) && retries > 0) {
    const backoff = (3 - retries) * 2000; // 2s, 4s
    await delay(backoff);
    return apiRequest(url, options, retries - 1);
  }

  return { status: res.status, headers: res.headers, body, raw: res };
}

/** GET helper */
export function get(url: string, headers?: Record<string, string>) {
  return apiRequest(url, { method: 'GET', headers });
}

/**
 * GET helper without retries - use for edge case tests where we want the raw response
 */
export async function getRaw(url: string, headers?: Record<string, string>) {
  await throttle();
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  let body: unknown;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body, raw: res };
}

/** POST helper (for RPC calls) */
export function post(url: string, data: unknown, headers?: Record<string, string>) {
  return apiRequest(url, { method: 'POST', body: JSON.stringify(data), headers });
}

/** OPTIONS helper for CORS preflight */
export function options(url: string, origin: string = ALLOWED_ORIGIN) {
  return apiRequest(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
}

/**
 * Sui JSON-RPC call helper
 */
export async function rpcCall<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await post(RPC_URL, {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });
  const body = res.body as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  return body.result as T;
}

/**
 * Assert response body has no internal error details leaking
 */
export function assertSanitizedError(body: unknown) {
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    expect(obj).not.toHaveProperty('stack');
    expect(obj).not.toHaveProperty('details');
    if ('message' in obj && typeof obj.message === 'string') {
      expect(obj.message).not.toMatch(/postgres|postgresql|hono|node_modules/i);
    }
    if ('error' in obj && typeof obj.error === 'string') {
      expect(obj.error).not.toMatch(/postgres|postgresql|hono|node_modules/i);
    }
  }
}

/**
 * Assert Cache-Control header is present and valid
 */
export function assertCacheControl(headers: Headers, expectedMaxAge?: number) {
  const cc = headers.get('cache-control');
  expect(cc).toBeTruthy();
  if (expectedMaxAge !== undefined) {
    expect(cc).toContain(`max-age=${expectedMaxAge}`);
  }
}

/**
 * Assert valid date string (YYYY-MM-DD or ISO 8601 format)
 * Some endpoints return "2026-02-21" (::text cast), others return "2026-02-21T00:00:00.000Z"
 */
export function assertDateString(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}/);
}

/**
 * Assert numeric string (integer or decimal)
 * SQL division may produce decimals: "112115825020.05759162"
 */
export function assertNumericString(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^-?\d+(\.\d+)?$/);
}

/**
 * Assert BigInt-safe string (integer digits only, no decimals)
 */
export function assertBigIntString(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^-?\d+$/);
}
