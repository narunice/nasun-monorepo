/**
 * Airdrop API Client
 *
 * April 16th Airdrop registration.
 * Requires Cognito JWT authentication.
 */

const API_BASE = import.meta.env.VITE_AIRDROP_API_URL;

export type AirdropStatus = "not_applied" | "pending" | "approved";

export interface AirdropStatusResponse {
  status: AirdropStatus;
  registeredAt?: string;
  walletAddress?: string;
  approvedAt?: string;
}

export class AirdropApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "AirdropApiError";
  }
}

async function authFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<{ status: number; data: unknown }> {
  if (!API_BASE) throw new AirdropApiError("Airdrop API not configured", 0);

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
    throw new AirdropApiError(
      body?.message || `Request failed: ${res.status}`,
      res.status,
      body?.error,
    );
  }

  return { status: res.status, data };
}

export async function getAirdropStatus(token: string): Promise<AirdropStatusResponse> {
  const { data } = await authFetch("/airdrop/register", token);
  return (data as { data: AirdropStatusResponse }).data;
}

export async function registerForAirdrop(token: string): Promise<AirdropStatusResponse> {
  const { data } = await authFetch("/airdrop/register", token, { method: "POST" });
  return (data as { data: AirdropStatusResponse }).data;
}
