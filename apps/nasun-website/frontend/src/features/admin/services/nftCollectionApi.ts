import type {
  NftCollection,
  NftCollectionsResponse,
  CreateNftCollectionRequest,
  UpdateNftCollectionRequest,
} from '../types';
import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

/**
 * Get enabled NFT collections (public — no auth required)
 */
export async function getEnabledNftCollections(): Promise<NftCollection[]> {
  const url = `${ADMIN_API_URL}/nft-collections`;

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    console.warn('[getEnabledNftCollections] Failed:', response.status);
    return [];
  }

  const data: NftCollectionsResponse = await response.json();
  return data.collections;
}

/**
 * Get all NFT collections (admin — includes disabled)
 */
export async function getAdminNftCollections(cognitoToken: string): Promise<NftCollection[]> {
  const url = `${ADMIN_API_URL}/nft-collections?admin=true`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get collections: ${response.status}`);
  }

  const data: NftCollectionsResponse = await response.json();
  return data.collections;
}

/**
 * Create a new NFT collection (admin only)
 */
export async function createNftCollection(
  cognitoToken: string,
  request: CreateNftCollectionRequest
): Promise<NftCollection> {
  const url = `${ADMIN_API_URL}/nft-collections`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(cognitoToken),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create collection: ${response.status}`);
  }

  const data = await response.json();
  return data.collection;
}

/**
 * Update an NFT collection (admin only)
 */
export async function updateNftCollection(
  cognitoToken: string,
  collectionId: string,
  updates: UpdateNftCollectionRequest
): Promise<NftCollection> {
  const url = `${ADMIN_API_URL}/nft-collections/${encodeURIComponent(collectionId)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(cognitoToken),
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update collection: ${response.status}`);
  }

  const data = await response.json();
  return data.collection;
}

/**
 * Delete an NFT collection (admin only)
 */
export async function deleteNftCollection(
  cognitoToken: string,
  collectionId: string
): Promise<void> {
  const url = `${ADMIN_API_URL}/nft-collections/${encodeURIComponent(collectionId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to delete collection: ${response.status}`);
  }
}
