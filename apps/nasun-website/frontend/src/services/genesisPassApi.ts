/**
 * Genesis Pass Allowlist API Client
 *
 * Register: JWT-authenticated, server reads wallet address from profile.
 * Check: Public, queries by wallet address.
 */

const API_BASE = import.meta.env.VITE_GENESIS_PASS_API;

export interface GenesisPassCheckResponse {
  success: boolean;
  data: {
    registered: boolean;
    walletAddress?: string;
    registeredAt?: string;
  };
}

export interface GenesisPassRegisterResponse {
  success: boolean;
  data?: {
    walletAddress: string;
    registeredAt: string;
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

  const response = await fetch(url, {
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
 * Check if a wallet address is registered on the Genesis Pass allowlist.
 */
export async function checkGenesisPass(walletAddress: string): Promise<GenesisPassCheckResponse> {
  if (!API_BASE) throw new GenesisPassApiError("Genesis Pass API is not configured");

  const url = `${API_BASE}/genesis-pass/check?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}`;

  const response = await fetch(url, {
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
