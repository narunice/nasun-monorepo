import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface AccountFlagStatus {
  identityId: string;
  isAccountFlagged: boolean;
  flagReason: string | null;
  flaggedAt: string | null;
  flaggedBy: string | null;
}

export async function getAccountFlag(
  cognitoToken: string,
  identityId: string,
): Promise<AccountFlagStatus> {
  const url = `${ADMIN_API_URL}/users/${encodeURIComponent(identityId)}/flag`;
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || `Failed to read flag: ${res.status}`);
  }
  return res.json();
}

export async function setAccountFlag(
  cognitoToken: string,
  identityId: string,
  flagged: boolean,
  reason?: string,
): Promise<AccountFlagStatus> {
  const url = `${ADMIN_API_URL}/users/${encodeURIComponent(identityId)}/flag`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(cognitoToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagged, ...(flagged && reason ? { reason } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || `Failed to update flag: ${res.status}`);
  }
  return res.json();
}
