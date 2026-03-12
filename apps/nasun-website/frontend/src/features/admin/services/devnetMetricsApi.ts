import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface DevnetMetricEntry {
  date: string;
  dau: number;
  newAddresses: number;
  cumulativeAddresses: number;
  transactionCount?: number;
  collectedAt: string;
}

interface DevnetMetricsResponse {
  metrics: DevnetMetricEntry[];
}

/**
 * Fetch all devnet daily metrics (admin only)
 */
export async function fetchDevnetMetrics(cognitoToken: string): Promise<DevnetMetricEntry[]> {
  const response = await fetch(`${ADMIN_API_URL}/devnet-metrics`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch devnet metrics: ${response.status}`);
  }

  const data: DevnetMetricsResponse = await response.json();
  return data.metrics;
}
