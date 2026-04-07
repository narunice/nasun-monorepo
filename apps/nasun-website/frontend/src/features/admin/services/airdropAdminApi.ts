import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface AirdropRegistration {
  identityId: string;
  status: string;
  walletAddress: string;
  twitterHandle: string;
  registeredAt: string;
  approvedAt: string;
  probableBot?: boolean;
  botTier?: number;
}

export async function listAirdropRegistrations(cognitoToken: string): Promise<AirdropRegistration[]> {
  const allItems: AirdropRegistration[] = [];
  let cursor: string | undefined;

  const maxPages = 50;
  let page = 0;

  do {
    const url = new URL(`${ADMIN_API_URL}/airdrop/registrations`);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: authHeaders(cognitoToken),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    allItems.push(...data.items);
    cursor = data.nextCursor;
    page++;
  } while (cursor && page < maxPages);

  return allItems;
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
