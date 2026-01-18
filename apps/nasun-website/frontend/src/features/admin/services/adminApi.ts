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

// ============================================================================
// Hidden Proposals API
// ============================================================================

export interface HiddenProposalsResponse {
  proposalIds: string[];
}

/**
 * Get list of hidden proposal IDs
 */
export async function getHiddenProposals(identityId: string): Promise<string[]> {
  const url = `${ADMIN_API_URL}/hidden-proposals`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Identity-Id': identityId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get hidden proposals: ${response.status}`);
  }

  const data: HiddenProposalsResponse = await response.json();
  return data.proposalIds;
}

/**
 * Hide a proposal
 */
export async function hideProposal(identityId: string, proposalId: string): Promise<void> {
  const url = `${ADMIN_API_URL}/hidden-proposals`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Identity-Id': identityId,
    },
    body: JSON.stringify({ proposalId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to hide proposal: ${response.status}`);
  }
}

/**
 * Unhide a proposal
 */
export async function unhideProposal(identityId: string, proposalId: string): Promise<void> {
  const url = `${ADMIN_API_URL}/hidden-proposals/${encodeURIComponent(proposalId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Identity-Id': identityId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to unhide proposal: ${response.status}`);
  }
}

/**
 * Get list of hidden proposal IDs (public - no auth required)
 * This uses a simple GET endpoint that doesn't require admin auth
 */
export async function getHiddenProposalsPublic(): Promise<string[]> {
  const url = `${ADMIN_API_URL}/hidden-proposals`;

  const response = await fetch(url, {
    method: 'GET',
  });

  // Return empty array on error (non-admin users won't have access)
  if (!response.ok) {
    console.warn('[getHiddenProposalsPublic] Failed to fetch hidden proposals:', response.status);
    return [];
  }

  const data: HiddenProposalsResponse = await response.json();
  return data.proposalIds;
}
