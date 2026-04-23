import { authHeaders } from '../utils';
import { downloadBlob } from './adminApi';

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

export interface NasunStatsMeta {
  ready: boolean;
  generatedAt?: string;
  reportBaseDate?: string;
  rowCount?: number;
}

/**
 * Fetch metadata for the latest nasun-stats snapshot (admin only).
 * Returns { ready: false } when the collector has not yet produced a report.
 */
export async function fetchNasunStatsMeta(cognitoToken: string): Promise<NasunStatsMeta> {
  const response = await fetch(`${ADMIN_API_URL}/nasun-stats/download?format=meta`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch nasun-stats meta: ${response.status}`);
  }
  return (await response.json()) as NasunStatsMeta;
}

/**
 * Trigger browser download of the nasun-stats snapshot (CSV or TXT).
 */
export async function downloadNasunStats(
  cognitoToken: string,
  format: 'csv' | 'txt',
): Promise<void> {
  const response = await fetch(`${ADMIN_API_URL}/nasun-stats/download?format=${format}`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Nasun stats snapshot not generated yet. Try again after the daily collector runs (~01:00 UTC).');
    }
    throw new Error(`Failed to download nasun-stats: ${response.status}`);
  }
  const blob = await response.blob();
  const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
    ?? `nasun-stats.${format}`;
  downloadBlob(blob, filename);
}
