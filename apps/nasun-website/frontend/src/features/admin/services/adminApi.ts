import type { ExportOptions, WhitelistStats, HiddenProposalsResponse } from '../types';
import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

// Re-export types for backward compatibility
export type { ExportOptions, WhitelistStats, HiddenProposalsResponse } from '../types';

/**
 * Export Genesis NFT Whitelist as CSV
 */
export async function exportGenesisWhitelist(options: ExportOptions): Promise<Blob> {
  const { cognitoToken, status = 'ACTIVE', format } = options;

  const params = new URLSearchParams({ status });
  if (format) params.append('format', format);
  const url = `${ADMIN_API_URL}/export/genesis?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Export failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Export Genesis Pass Allowlist as CSV
 */
export async function exportGenesisPassAllowlist(options: ExportOptions): Promise<Blob> {
  const { cognitoToken, status = 'ACTIVE', format } = options;

  const params = new URLSearchParams({ status });
  if (format) params.append('format', format);
  const url = `${ADMIN_API_URL}/export/genesis-pass?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
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
  const { cognitoToken, startDate, endDate, batchId, format } = options;

  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (batchId) params.append('batchId', batchId);
  if (format) params.append('format', format);

  const url = `${ADMIN_API_URL}/export/battalion?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
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
export async function getWhitelistStats(cognitoToken: string): Promise<WhitelistStats> {
  const url = `${ADMIN_API_URL}/export/stats`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
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

/**
 * Get list of hidden proposal IDs
 */
export async function getHiddenProposals(cognitoToken: string): Promise<string[]> {
  const url = `${ADMIN_API_URL}/hidden-proposals`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
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
export async function hideProposal(cognitoToken: string, proposalId: string): Promise<void> {
  const url = `${ADMIN_API_URL}/hidden-proposals`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(cognitoToken),
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
export async function unhideProposal(cognitoToken: string, proposalId: string): Promise<void> {
  const url = `${ADMIN_API_URL}/hidden-proposals/${encodeURIComponent(proposalId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(cognitoToken),
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
