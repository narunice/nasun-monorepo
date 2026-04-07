/**
 * Genesis Pass Allowlist API Client
 *
 * Register: JWT-authenticated, server reads wallet address from profile.
 * Check: Public, queries by wallet address.
 */

import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

const API_BASE = import.meta.env.VITE_GENESIS_PASS_API;

export type GenesisPassStatus = "ACTIVE" | "APPLIED" | "LEGACY" | "WITHDRAWN" | null;

export interface MintSignatureResponse {
  success: boolean;
  data: {
    signature: string;
    deadline: number;
    walletAddress: string;
    stage: number;
    maxQuantity: number;
  };
}

export interface GenesisPassCheckResponse {
  success: boolean;
  data: {
    registered: boolean;
    applied?: boolean;
    status?: GenesisPassStatus;
    walletAddress?: string;
    registeredAt?: string;
    walletConflict?: boolean;
    mintType?: string | null;
    eligibleStage?: number;
    eligibleStageLabel?: string;
    currentStage?: number;
    currentStageLabel?: string;
    eligible?: boolean;
  };
}

export interface GenesisPassRegisterResponse {
  success: boolean;
  data?: {
    walletAddress: string;
    registeredAt: string;
    replaced?: boolean;
  };
  error?: string;
  message?: string;
}

export class GenesisPassApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "GenesisPassApiError";
  }
}

/**
 * Register for Genesis Pass allowlist.
 * Server reads the linked MetaMask address from UserProfiles (no client-side address needed).
 */
export async function registerGenesisPass(cognitoToken: string): Promise<GenesisPassRegisterResponse> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/register`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({}),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to register for allowlist",
      response.status,
      data.error,
    );
  }

  return data as GenesisPassRegisterResponse;
}

/**
 * Withdraw from Genesis Pass allowlist.
 * Server resolves the registered wallet via identityId from JWT.
 */
export async function withdrawGenesisPass(cognitoToken: string): Promise<{ success: boolean; data?: { walletAddress: string } }> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/register`;

  const response = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to withdraw from allowlist",
      response.status,
      data.error,
    );
  }

  return data;
}

/**
 * Check own Genesis Pass registration status via JWT identity.
 * Used when wallet address is not available (e.g., MetaMask unlinked).
 */
export async function getMyGenesisPassStatus(cognitoToken: string): Promise<GenesisPassCheckResponse> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/register`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to check registration status",
      response.status,
      data.error,
    );
  }

  return data as GenesisPassCheckResponse;
}

/**
 * Request an EIP-712 mint signature from the server.
 * Server verifies the wallet against the allowlist and returns a signature
 * that authorizes the connected wallet to mint.
 * Includes a single retry with jittered delay on 429.
 */
export async function requestMintSignature(walletAddress: string): Promise<MintSignatureResponse> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/mint-signature`;

  const doFetch = () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ walletAddress }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  };

  let response = await doFetch();

  // Single retry with jittered delay on 429
  if (response.status === 429) {
    await response.body?.cancel();
    const delay = 2000 + Math.random() * 3000;
    await new Promise((r) => setTimeout(r, delay));
    response = await doFetch();
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new GenesisPassApiError(
      "Unexpected server response. Please try again.",
      response.status,
    );
  }

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to request mint signature",
      response.status,
      data.error,
    );
  }

  return data as MintSignatureResponse;
}

/**
 * Check if a wallet address is registered on the Genesis Pass allowlist (public).
 */
export async function checkGenesisPass(walletAddress: string): Promise<GenesisPassCheckResponse> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/check?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to check registration status",
      response.status,
      data.error,
    );
  }

  return data as GenesisPassCheckResponse;
}

/**
 * Sync on-chain stage to SSM parameter (admin only).
 * Called after a successful setStage transaction.
 */
export async function syncStageToSSM(cognitoToken: string, stage: number): Promise<{ success: boolean }> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/admin/sync-stage`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({ stage }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GenesisPassApiError(
      data.message || "Failed to sync stage",
      response.status,
      data.error,
    );
  }

  return data;
}
