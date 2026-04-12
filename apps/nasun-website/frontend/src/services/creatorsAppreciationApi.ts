/**
 * Creators Appreciation Bonus API Client
 *
 * One-time +60 ecosystem points self-claim for Top 500 creators of
 * Community Leaderboard v3 Season 1.
 *
 * Backend: explorer-api at VITE_EXPLORER_API_URL.
 * Auth: Cognito Identity Pool JWT (Bearer token).
 */

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;

export interface CreatorsAppreciationStatus {
  bonusName: string;
  bonusPoints: number;
  claimDeadline: string;
  expired: boolean;
  eligible: boolean;
  rank?: number;
  handle?: string;
  claimed: boolean;
  claimedAt?: string | null;
}

export interface CreatorsAppreciationClaimResult {
  success: true;
  created: boolean;
  bonusPoints: number;
  rank: number;
  handle: string;
}

export class CreatorsAppreciationApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "CreatorsAppreciationApiError";
  }
}

async function authFetch(path: string, token: string, method: "GET" | "POST"): Promise<unknown> {
  if (!API_BASE) {
    throw new CreatorsAppreciationApiError("Explorer API not configured", 0);
  }
  const res = await fetch(`${API_BASE}/creators-appreciation${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body as Record<string, string> | null;
    throw new CreatorsAppreciationApiError(
      err?.message || `Request failed: ${res.status}`,
      res.status,
      err?.error,
    );
  }
  return body;
}

export async function getCreatorsAppreciationStatus(
  token: string,
): Promise<CreatorsAppreciationStatus> {
  return (await authFetch("/status", token, "GET")) as CreatorsAppreciationStatus;
}

export async function claimCreatorsAppreciationBonus(
  token: string,
): Promise<CreatorsAppreciationClaimResult> {
  return (await authFetch("/claim", token, "POST")) as CreatorsAppreciationClaimResult;
}
