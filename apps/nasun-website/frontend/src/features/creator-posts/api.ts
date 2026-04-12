import type {
  CreatorPost,
  CreatorPostSubmitResponse,
  CreatorPostListResponse,
  AdminCreatorPostListResponse,
  CreatorPostStatus,
} from './types';

const BASE_URL = import.meta.env.VITE_BUG_REPORT_API_URL;

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(
      payload.error || `HTTP ${res.status}`,
      res.status,
      payload,
    );
    throw err;
  }
  return payload as T;
}

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

// ============================================
// User-facing
// ============================================

export function submitCreatorPost(
  postUrl: string,
  token: string,
): Promise<CreatorPostSubmitResponse> {
  return request<CreatorPostSubmitResponse>(
    'POST',
    '/v1/creator-posts',
    token,
    { postUrl },
  );
}

export function listMyCreatorPosts(
  token: string,
  params: { limit?: number; cursor?: string } = {},
): Promise<CreatorPostListResponse> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const search = qs.toString();
  return request<CreatorPostListResponse>(
    'GET',
    `/v1/creator-posts/my${search ? `?${search}` : ''}`,
    token,
  );
}

// ============================================
// Admin
// ============================================

export function listAdminCreatorPosts(
  token: string,
  params: { status?: CreatorPostStatus; limit?: number; cursor?: string } = {},
): Promise<AdminCreatorPostListResponse> {
  const qs = new URLSearchParams();
  qs.set('status', params.status || 'PENDING');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  return request<AdminCreatorPostListResponse>(
    'GET',
    `/admin/creator-posts?${qs.toString()}`,
    token,
  );
}

export function scoreCreatorPost(
  postId: string,
  points: number,
  token: string,
): Promise<CreatorPost> {
  return request<CreatorPost>(
    'PATCH',
    `/admin/creator-posts/${encodeURIComponent(postId)}/score`,
    token,
    { points },
  );
}

export function rejectCreatorPost(
  postId: string,
  reason: string,
  token: string,
): Promise<CreatorPost> {
  return request<CreatorPost>(
    'PATCH',
    `/admin/creator-posts/${encodeURIComponent(postId)}/reject`,
    token,
    { reason },
  );
}

export function grantCreatorPost(
  postId: string,
  token: string,
): Promise<CreatorPost & { duplicate?: boolean; idempotent?: boolean }> {
  return request(
    'POST',
    `/admin/creator-posts/${encodeURIComponent(postId)}/grant`,
    token,
  );
}
