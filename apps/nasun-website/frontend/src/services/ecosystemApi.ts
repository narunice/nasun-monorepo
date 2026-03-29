/**
 * Ecosystem API Client
 *
 * NFT activation management for ecosystem points.
 * Requires Cognito JWT authentication.
 */

const API_BASE = import.meta.env.VITE_ECOSYSTEM_API_URL;

export function isEcosystemApiConfigured(): boolean {
  return !!API_BASE;
}

export type NftType = "alliance" | "genesis-pass" | "battalion";

export interface Activation {
  nftType: NftType;
  walletAddress: string;
  status: "ACTIVE" | "INACTIVE";
  activatedAt?: string;
  lastVerifiedAt?: string;
  nftCount?: number;
}

export interface EcosystemStatusResponse {
  activations: Activation[];
}

export interface ActivateResponse {
  success: boolean;
  activation?: Activation;
  error?: string;
  message?: string;
}

export class EcosystemApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "EcosystemApiError";
  }
}

async function authFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<{ status: number; data: unknown }> {
  if (!API_BASE) throw new EcosystemApiError("Ecosystem API not configured", 0);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = data as Record<string, string> | null;
    throw new EcosystemApiError(
      body?.message || `Request failed: ${res.status}`,
      res.status,
      body?.error,
    );
  }

  return { status: res.status, data };
}

export async function getEcosystemStatus(
  token: string,
): Promise<EcosystemStatusResponse> {
  const { data } = await authFetch("/ecosystem/status", token);
  return data as EcosystemStatusResponse;
}

export async function activateNft(
  token: string,
  nftType: NftType,
): Promise<ActivateResponse> {
  const { data } = await authFetch("/ecosystem/activate", token, {
    method: "POST",
    body: JSON.stringify({ nftType }),
  });
  return data as ActivateResponse;
}

export async function deactivateNft(
  token: string,
  nftType: NftType,
): Promise<ActivateResponse> {
  const { data } = await authFetch("/ecosystem/deactivate", token, {
    method: "POST",
    body: JSON.stringify({ nftType }),
  });
  return data as ActivateResponse;
}
