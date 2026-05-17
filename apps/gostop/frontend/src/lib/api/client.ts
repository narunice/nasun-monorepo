/**
 * Gostop API fetch wrapper.
 *
 * - Bearer token auto-attach when a wallet is connected and a non-expired
 *   token is in sessionStorage.
 * - 401 → clears the stored token so the next call goes through the
 *   challenge/verify cycle. Caller decides whether to retry.
 * - JSON-only. Non-2xx responses throw `ApiError` with the parsed body when
 *   present so callers can branch on `error.body.error` (backend uses string
 *   codes like 'unauthorized', 'no_fields').
 *
 * Base URL is `VITE_GOSTOP_API_URL`. All routes mounted under `/api/gostop`.
 */

import { getToken, clearToken } from './tokenStore';

const API_BASE = import.meta.env.VITE_GOSTOP_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `gostop api ${status}`);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  // When set, attach the Bearer token for this wallet (if available).
  authWallet?: string;
  signal?: AbortSignal;
  // Bypass token attach even if `authWallet` is provided (used by auth routes
  // that should never carry an existing token).
  noAuth?: boolean;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(0, null, 'VITE_GOSTOP_API_URL not configured');
  }
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (opts.authWallet && !opts.noAuth) {
    const stored = getToken(opts.authWallet);
    if (stored) headers['Authorization'] = `Bearer ${stored.token}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: 'omit',
  });

  // 204 / empty body
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && opts.authWallet) {
      clearToken(opts.authWallet);
    }
    throw new ApiError(res.status, parsed);
  }

  return parsed as T;
}
