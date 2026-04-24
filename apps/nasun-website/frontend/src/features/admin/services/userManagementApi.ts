import type { ListUsersResponse, UserDetailResponse, SearchUsersParams, SearchUsersResponse } from '../types';
import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface ListUsersParams {
  limit?: number;
  nextToken?: string;
}

export async function listUsers(
  cognitoToken: string,
  params: ListUsersParams = {},
): Promise<ListUsersResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.nextToken) searchParams.append('nextToken', params.nextToken);

  const query = searchParams.toString();
  const url = `${ADMIN_API_URL}/users${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to list users: ${response.status}`);
  }

  return response.json();
}

export async function searchUsers(
  cognitoToken: string,
  params: SearchUsersParams,
): Promise<SearchUsersResponse> {
  const sp = new URLSearchParams({ q: params.q });
  if (params.field && params.field !== 'auto') sp.set('field', params.field);
  if (params.resolvePrimary === false) sp.set('resolvePrimary', 'false');

  // Uses GET /users?q=... (same endpoint as list, search mode activated by q param)
  const response = await fetch(`${ADMIN_API_URL}/users?${sp}`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to search users: ${response.status}`);
  }

  return response.json();
}

export async function getUserDetail(
  cognitoToken: string,
  identityId: string,
): Promise<UserDetailResponse> {
  const url = `${ADMIN_API_URL}/users/${encodeURIComponent(identityId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get user: ${response.status}`);
  }

  return response.json();
}
