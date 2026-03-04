import type { ListUsersResponse, UserDetailResponse } from '../types';
import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  provider?: string;
}

export async function listUsers(
  cognitoToken: string,
  params: ListUsersParams = {},
): Promise<ListUsersResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.provider) searchParams.append('provider', params.provider);

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
