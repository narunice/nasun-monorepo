/**
 * Ecosystem ban API client.
 *
 * Calls the network-explorer api-server endpoint
 *   {VITE_EXPLORER_API_URL}/internal/ecosystem-ban
 * directly from the browser using the operator's Cognito Bearer token.
 * The api-server's requireAdmin middleware verifies role=ADMIN against
 * UserProfiles before applying the ban.
 *
 * Replaces the legacy account-flag flow (which only excluded users from
 * airdrops). A ban here removes the user from all ecosystem points
 * accrual, leaderboards, snapshots, and Pado live aggregations.
 */

const EXPLORER_API_URL = import.meta.env.VITE_EXPLORER_API_URL;
const ENDPOINT = `${EXPLORER_API_URL}/internal/ecosystem-ban`;

function authHeaders(cognitoToken: string): Record<string, string> {
  return { Authorization: `Bearer ${cognitoToken}` };
}

export interface BanResolution {
  handle: string;
  identityId?: string;
  walletAddress?: string;
  status: 'mapped' | 'no-profile' | 'no-wallet' | 'lookup-error' | 'invalid-handle';
  note?: string;
}

export interface BanApplyResult {
  identityId: string;
  walletAddress?: string;
  handle: string;
  flaggedRows: number;
  source?: string;
}

export interface BanResponse {
  success: boolean;
  resolutions: BanResolution[];
  applied: BanApplyResult[];
  cacheRefresh: { ok: boolean; status?: number; error?: string };
}

export interface BannedAccount {
  identityId: string;
  walletAddress: string | null;
  xHandle: string | null;
  reason: string;
  bannedAt: string;
  bannedBy: string;
}

export interface BannedListResponse {
  bans: BannedAccount[];
  generatedAt: number;
}

export async function listBans(cognitoToken: string): Promise<BannedListResponse> {
  const res = await fetch(ENDPOINT, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || `Failed to list bans: ${res.status}`);
  }
  return res.json();
}

export async function banAccount(
  cognitoToken: string,
  params: { identityId?: string; handle?: string; reason: string },
): Promise<BanResponse> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...authHeaders(cognitoToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || err.message || `Ban failed: ${res.status}`);
  }
  return res.json();
}

export async function unbanAccount(
  cognitoToken: string,
  params: { identityId?: string; handle?: string; reason?: string },
): Promise<BanResponse> {
  const res = await fetch(ENDPOINT, {
    method: 'DELETE',
    headers: { ...authHeaders(cognitoToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || err.message || `Unban failed: ${res.status}`);
  }
  return res.json();
}
