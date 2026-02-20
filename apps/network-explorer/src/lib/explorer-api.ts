/**
 * Explorer API client for indexer-backed endpoints.
 * API is served at /api/v1/ on the same domain (nginx reverse proxy).
 */

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL || '/api/v1';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Explorer API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ============================================
// Types
// ============================================

export interface ApiHealth {
  status: string;
  latestCheckpoint: string | null;
  earliestCheckpoint: string | null;
  totalCheckpoints: number;
  totalTransactions: number;
  timestamp: string;
}

export interface TopAccount {
  address: string;
  balance: string;
  coinCount: number;
}

export interface DailyTransaction {
  date: string;
  transactions: number;
}

export interface DailyActiveAddress {
  date: string;
  activeAddresses: number;
}

export interface NetworkSummary {
  totalTransactions: number;
  totalCheckpoints: number;
  uniqueAddresses: number;
  totalPackages: number;
  totalEvents: number;
  latestCheckpoint: string | null;
  latestTimestamp: string | null;
}

// ============================================
// API Functions
// ============================================

export async function getApiHealth(): Promise<ApiHealth> {
  return fetchApi<ApiHealth>('/health');
}

export async function getTopAccounts(limit = 50): Promise<TopAccount[]> {
  const res = await fetchApi<{ data: TopAccount[]; count: number }>(
    `/stats/top-accounts?limit=${limit}`
  );
  return res.data;
}

export async function getDailyTransactions(range: '7d' | '14d' | '30d' = '7d'): Promise<DailyTransaction[]> {
  const res = await fetchApi<{ data: DailyTransaction[]; range: string }>(
    `/stats/daily-transactions?range=${range}`
  );
  return res.data;
}

export async function getActiveAddresses(range: '7d' | '14d' | '30d' = '7d'): Promise<DailyActiveAddress[]> {
  const res = await fetchApi<{ data: DailyActiveAddress[]; range: string }>(
    `/stats/active-addresses?range=${range}`
  );
  return res.data;
}

export async function getNetworkSummary(): Promise<NetworkSummary> {
  const res = await fetchApi<{ data: NetworkSummary }>('/stats/network-summary');
  return res.data;
}
