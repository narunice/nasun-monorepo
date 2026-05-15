/**
 * Authenticated user-profile API (nasun-website only).
 *
 * The Lambda handles all HTTP methods on the same endpoint and dispatches by
 * httpMethod / path. PATCH returns the unified profile (same shape as GET);
 * the client can `setQueryData` directly to avoid a follow-up GET race.
 */
import type { EcosystemProfile } from '@nasun/profile-core';

const USER_PROFILE_API = import.meta.env.VITE_USER_PROFILE_API as string | undefined;

export class UserProfileApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'UserProfileApiError';
  }
}

function requireEndpoint(): string {
  if (!USER_PROFILE_API) {
    throw new UserProfileApiError('User Profile API is not configured');
  }
  return USER_PROFILE_API;
}

export function getUserProfileEndpoint(): string {
  return requireEndpoint();
}

/**
 * GET own profile (authenticated by Cognito JWT).
 */
export async function getMyProfile(token: string, identityId: string): Promise<EcosystemProfile> {
  const endpoint = requireEndpoint();
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint.replace(/\/+$/, '')}${sep}identityId=${encodeURIComponent(identityId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new UserProfileApiError(
      `Failed to fetch profile (${res.status})`,
      res.status,
    );
  }
  return res.json() as Promise<EcosystemProfile>;
}

export type LinkPasteChain = 'sui' | 'solana';

export interface PatchProfileBody {
  displayName?: string;
  avatarKey?: string | null;
  /**
   * Paste-based external chain wallets. `null` clears the field.
   * Cross-account collisions return HTTP 409 (`ADDRESS_ALREADY_LINKED`).
   * The user must unlink the address from the other account first; the
   * server no longer silently displaces a prior owner.
   *
   * EVM addresses are intentionally absent — paste-link was deprecated
   * 2026-05-16. EVM wallets are linked via the verified MetaMask flow
   * (auth-metamask Lambda → linkedAccounts.metamask) only.
   */
  linkedSuiAddress?: string | null;
  linkedSolanaAddress?: string | null;
}

export type PatchProfileResponse = EcosystemProfile;

/**
 * PATCH the profile. Returns the unified EcosystemProfile (same shape as GET)
 * so the caller can put it into a react-query cache directly.
 */
export async function patchProfile(
  token: string,
  patch: PatchProfileBody,
): Promise<PatchProfileResponse> {
  const endpoint = requireEndpoint();
  const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg = (body as any)?.message || `Profile update failed (${res.status})`;
    const code = (body as any)?.code as string | undefined;
    throw new UserProfileApiError(msg, res.status, code);
  }
  return body as PatchProfileResponse;
}

/** Convenience wrapper: paste-link an external chain wallet. */
export async function linkPasteAddress(
  token: string,
  chain: LinkPasteChain,
  address: string | null,
): Promise<PatchProfileResponse> {
  const field = chain === 'sui' ? 'linkedSuiAddress' : 'linkedSolanaAddress';
  return patchProfile(token, { [field]: address });
}

/**
 * Backward-compat alias for legacy callers. Prefer `patchProfile`.
 */
export async function updateDisplayName(token: string, displayName: string): Promise<EcosystemProfile> {
  return patchProfile(token, { displayName });
}

// ============================================================================
// Avatar upload
// ============================================================================

const ALLOWED_AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AvatarContentType = typeof ALLOWED_AVATAR_CONTENT_TYPES[number];
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface PresignedAvatarUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
}

function inferAvatarContentType(file: File): AvatarContentType | null {
  const ct = file.type;
  if ((ALLOWED_AVATAR_CONTENT_TYPES as readonly string[]).includes(ct)) {
    return ct as AvatarContentType;
  }
  // Some browsers report "image/jpg" or empty type — guess from extension.
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

/**
 * Step 1: get a presigned POST URL for uploading an avatar to S3.
 * The Lambda derives the storage key from the authenticated identityId in
 * the JWT — the client never sees or chooses the key prefix.
 */
export async function getAvatarUploadUrl(
  token: string,
  contentType: AvatarContentType,
  fileSize: number,
): Promise<PresignedAvatarUpload> {
  const endpoint = requireEndpoint();
  const url = `${endpoint.replace(/\/+$/, '')}/upload-avatar-url`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ contentType, fileSize }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg = (body as any)?.message || `Upload URL failed (${res.status})`;
    const code = (body as any)?.code as string | undefined;
    throw new UserProfileApiError(msg, res.status, code);
  }
  return body as PresignedAvatarUpload;
}

/**
 * Step 2: PUT (POST multipart) the file to S3 using the presigned URL.
 * Throws on any non-2xx response.
 */
export async function uploadAvatarToS3(
  presigned: PresignedAvatarUpload,
  file: File,
): Promise<void> {
  const formData = new FormData();
  for (const [k, v] of Object.entries(presigned.fields)) {
    formData.append(k, v);
  }
  formData.append('file', file);
  const res = await fetch(presigned.url, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new UserProfileApiError(
      `S3 upload failed (${res.status}): ${text.slice(0, 200)}`,
      res.status,
    );
  }
}

/**
 * Full upload flow: validates file, requests presigned URL, uploads to S3,
 * and returns the storage key. Caller still needs to PATCH the profile with
 * `{ avatarKey: key }` to commit it.
 */
export async function uploadAvatarFile(token: string, file: File): Promise<string> {
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new UserProfileApiError(`Image too large (max ${MAX_AVATAR_SIZE_BYTES} bytes)`, 400);
  }
  const contentType = inferAvatarContentType(file);
  if (!contentType) {
    throw new UserProfileApiError('Only PNG, JPEG, or WebP images are allowed', 400);
  }
  const presigned = await getAvatarUploadUrl(token, contentType, file.size);
  await uploadAvatarToS3(presigned, file);
  return presigned.key;
}
