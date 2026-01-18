const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface ExportOptions {
  identityId: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  batchId?: string;
  format?: 'default' | 'opensea';
}

export interface WhitelistStats {
  genesis: { active: number; withdrawn: number; total: number };
  battalion: { active: number; withdrawn: number; total: number };
}

/**
 * Export Genesis NFT Whitelist as CSV
 */
export async function exportGenesisWhitelist(options: ExportOptions): Promise<Blob> {
  const { identityId, status = 'ACTIVE', format } = options;

  const params = new URLSearchParams({ status });
  if (format) params.append('format', format);
  const url = `${ADMIN_API_URL}/export/genesis?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Identity-Id': identityId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Export failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Export Battalion NFT Allowlist as CSV
 */
export async function exportBattalionAllowlist(options: ExportOptions): Promise<Blob> {
  const { identityId, startDate, endDate, batchId, format } = options;

  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (batchId) params.append('batchId', batchId);
  if (format) params.append('format', format);

  const url = `${ADMIN_API_URL}/export/battalion?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Identity-Id': identityId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Export failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Get whitelist statistics
 */
export async function getWhitelistStats(identityId: string): Promise<WhitelistStats> {
  const url = `${ADMIN_API_URL}/export/stats`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Identity-Id': identityId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get stats: ${response.status}`);
  }

  return response.json();
}

/**
 * Trigger file download from Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
