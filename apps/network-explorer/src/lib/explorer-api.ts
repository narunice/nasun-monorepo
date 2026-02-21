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
  chainId: string | null;
  expectedChainId?: string;
  chainResetDetected: boolean;
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

export interface TokenStats {
  coinType: string;
  holders: number;
  circulatingSupply: string | null;
}

export interface DailyGas {
  date: string;
  totalGasCost: string;
  avgGasPerTx: string;
  txCount: number;
}

// ============================================
// API Functions
// ============================================

export async function getApiHealth(): Promise<ApiHealth> {
  // Health endpoint returns valid JSON body even on 503 (chain reset), so parse directly
  const res = await fetch(`${API_BASE}/health`);
  return res.json() as Promise<ApiHealth>;
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

export async function getTokenStats(): Promise<TokenStats[]> {
  const res = await fetchApi<{ data: TokenStats[] }>('/stats/tokens');
  return res.data;
}

export async function getDailyGas(range: '7d' | '14d' | '30d' = '7d'): Promise<DailyGas[]> {
  const res = await fetchApi<{ data: DailyGas[]; range: string }>(
    `/stats/daily-gas?range=${range}`
  );
  return res.data;
}
