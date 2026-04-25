/**
 * On-Chain Activity Points API Client
 *
 * Public API - no authentication required.
 * Calls explorer-api endpoints at VITE_EXPLORER_API_URL.
 */

import type { UserPoints } from "@/types/points";

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

class PointsApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "PointsApiError";
  }
}

export async function getPointsUser(
  walletAddress: string,
): Promise<UserPoints | null> {
  if (!API_BASE) return null;
  if (!SUI_ADDRESS_RE.test(walletAddress)) return null;

  const encoded = encodeURIComponent(walletAddress.toLowerCase());
  const res = await fetch(`${API_BASE}/points/user/${encoded}`);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new PointsApiError(`User points fetch failed: ${res.status}`, res.status);
  }

  const json = await res.json();
  return json.data ?? null;
}
