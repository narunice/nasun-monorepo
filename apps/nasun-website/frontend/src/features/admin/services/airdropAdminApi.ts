import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface AirdropRegistration {
  identityId: string;
  status: string;
  walletAddress: string;
  twitterHandle: string;
  registeredAt: string;
  approvedAt: string;
}

export async function listAirdropRegistrations(cognitoToken: string): Promise<AirdropRegistration[]> {
  const response = await fetch(`${ADMIN_API_URL}/airdrop/registrations`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch: ${response.status}`);
  }

  const data = await response.json();
  return data.items;
}

export async function updateAirdropStatus(
  cognitoToken: string,
  identityId: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<void> {
  const response = await fetch(`${ADMIN_API_URL}/airdrop/registrations/${encodeURIComponent(identityId)}`, {
    method: 'PUT',
    headers: {
      ...authHeaders(cognitoToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update: ${response.status}`);
  }
}
