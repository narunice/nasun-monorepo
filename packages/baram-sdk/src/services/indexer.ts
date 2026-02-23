/**
 * Indexer fetch layer — queries the baram API server instead of RPC.
 * Falls back to RPC on 5xx/network errors; propagates 4xx as client errors.
 */

import type { AERRecord } from '../types/aer';
import type { PaginatedResult, QueryOptions } from '../types/filter';
import { AERError } from '../errors';

export class IndexerError extends AERError {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message, 'INDEXER_ERROR');
    this.name = 'IndexerError';
  }
}

/**
 * Returns true if this error should trigger RPC fallback.
 * 4xx errors are client bugs and should NOT fallback.
 */
export function shouldFallback(err: unknown): boolean {
  if (err instanceof IndexerError && err.status >= 400 && err.status < 500) {
    return false;
  }
  return true;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new IndexerError(
        `Indexer responded with ${res.status}: ${body}`,
        res.status,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof IndexerError) throw err;
    // Network error or timeout
    throw new IndexerError(
      err instanceof Error ? err.message : 'Indexer fetch failed',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

interface IndexerListResponse {
  data: AERRecord[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface IndexerSingleResponse {
  data: AERRecord;
}

interface IndexerChainResponse {
  data: AERRecord[];
  direction: string;
  maxDepth: number;
}

// === Public fetch functions ===

export async function indexerGetRecent(
  baseUrl: string,
  timeoutMs: number,
  options?: QueryOptions,
): Promise<PaginatedResult<AERRecord>> {
  const qs = buildQueryString({
    limit: options?.limit,
    cursor: options?.cursor,
    order: options?.order === 'ascending' ? 'asc' : 'desc',
  });
  const res = await fetchJson<IndexerListResponse>(`${baseUrl}/api/v1/aer${qs}`, timeoutMs);
  return { data: res.data, hasNextPage: res.hasNextPage, nextCursor: res.nextCursor };
}

export async function indexerGetByAddress(
  baseUrl: string,
  timeoutMs: number,
  address: string,
  role: 'initiator' | 'executor' | 'authorizer',
  options?: QueryOptions,
): Promise<AERRecord[]> {
  const qs = buildQueryString({
    [role]: address,
    limit: options?.limit,
    cursor: options?.cursor,
    order: options?.order === 'ascending' ? 'asc' : 'desc',
  });
  const res = await fetchJson<IndexerListResponse>(`${baseUrl}/api/v1/aer${qs}`, timeoutMs);
  return res.data;
}

export async function indexerGetByBudgetId(
  baseUrl: string,
  timeoutMs: number,
  budgetId: string,
  options?: QueryOptions,
): Promise<AERRecord[]> {
  const qs = buildQueryString({
    budget_id: budgetId,
    limit: options?.limit,
    cursor: options?.cursor,
    order: options?.order === 'ascending' ? 'asc' : 'desc',
  });
  const res = await fetchJson<IndexerListResponse>(`${baseUrl}/api/v1/aer${qs}`, timeoutMs);
  return res.data;
}

export async function indexerGetByRequestId(
  baseUrl: string,
  timeoutMs: number,
  requestId: number,
): Promise<AERRecord | null> {
  try {
    const res = await fetchJson<IndexerSingleResponse>(
      `${baseUrl}/api/v1/aer/request/${requestId}`,
      timeoutMs,
    );
    return res.data;
  } catch (err) {
    if (err instanceof IndexerError && err.status === 404) return null;
    throw err;
  }
}

export async function indexerGetByObjectId(
  baseUrl: string,
  timeoutMs: number,
  objectId: string,
): Promise<AERRecord | null> {
  try {
    const res = await fetchJson<IndexerSingleResponse>(
      `${baseUrl}/api/v1/aer/${objectId}`,
      timeoutMs,
    );
    return res.data;
  } catch (err) {
    if (err instanceof IndexerError && err.status === 404) return null;
    throw err;
  }
}

export async function indexerTraceChain(
  baseUrl: string,
  timeoutMs: number,
  objectId: string,
  direction: 'backward' | 'forward',
  maxDepth?: number,
): Promise<AERRecord[]> {
  const qs = buildQueryString({ direction, maxDepth });
  const res = await fetchJson<IndexerChainResponse>(
    `${baseUrl}/api/v1/aer/${objectId}/chain${qs}`,
    timeoutMs,
  );
  return res.data;
}
