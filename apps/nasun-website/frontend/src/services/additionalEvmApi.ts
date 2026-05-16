/**
 * Additional EVM Address API Client
 *
 * Backend endpoints for the per-app verified EVM binding flow. Companion
 * to `metamaskApi.ts` (which mints the primary metamask identity). These
 * endpoints require a Cognito JWT in the Authorization header — the user
 * must already be signed in.
 *
 * Flow for adding a new wallet:
 *   1. requestAdditionalChallenge(addr, appId?) -> { nonce, message }
 *   2. user signs `message` via personal_sign
 *   3. verifyAdditionalChallenge(signature, nonce) -> { walletAddress, ... }
 *
 * Then `patchAppBinding` and `removeAdditionalAddress` are simple JWT
 * mutations on the persisted profile.
 */

const ADDITIONAL_API_URL = import.meta.env.VITE_METAMASK_ADDITIONAL_API as string | undefined;

function baseUrl(): string {
  if (!ADDITIONAL_API_URL) {
    throw new AdditionalEvmApiError('VITE_METAMASK_ADDITIONAL_API is not configured');
  }
  return ADDITIONAL_API_URL.replace(/\/$/, '');
}

export class AdditionalEvmApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'AdditionalEvmApiError';
  }
}

export interface ChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: number;
}

export interface VerifyResponse {
  walletAddress: string;
  verifiedAt: number;
  appBinding?: { appId: string; walletAddress: string };
}

export interface AppBindingResponse {
  appId: string;
  walletAddress?: string;
  removed?: boolean;
}

export interface RemoveResponse {
  walletAddress: string;
  removed: boolean;
  clearedBindings: string[];
}

async function request<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  cognitoToken: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cognitoToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure — wrap in our error class so callers do not
    // need to distinguish DOMException vs TypeError.
    throw new AdditionalEvmApiError(
      err instanceof Error ? err.message : 'Network error',
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // Empty / non-JSON body — fall through with empty `data`.
  }

  if (!response.ok) {
    throw new AdditionalEvmApiError(
      typeof data.message === 'string' ? data.message : 'Request failed',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      data,
    );
  }

  return data as unknown as T;
}

export async function requestAdditionalChallenge(
  walletAddress: string,
  cognitoToken: string,
  appId?: string,
): Promise<ChallengeResponse> {
  return request<ChallengeResponse>(
    '/additional-address/challenge',
    'POST',
    cognitoToken,
    { walletAddress, appId },
  );
}

export async function verifyAdditionalChallenge(
  signature: string,
  nonce: string,
  cognitoToken: string,
): Promise<VerifyResponse> {
  return request<VerifyResponse>(
    '/additional-address/verify',
    'POST',
    cognitoToken,
    { signature, nonce },
  );
}

/**
 * Set or clear the binding for `appId`. Pass `walletAddress: null` to
 * remove an existing binding and fall back to the primary address.
 */
export async function patchAppBinding(
  appId: string,
  walletAddress: string | null,
  cognitoToken: string,
): Promise<AppBindingResponse> {
  return request<AppBindingResponse>('/app-binding', 'PATCH', cognitoToken, {
    appId,
    walletAddress,
  });
}

export async function removeAdditionalAddress(
  walletAddress: string,
  cognitoToken: string,
): Promise<RemoveResponse> {
  return request<RemoveResponse>('/additional-address', 'DELETE', cognitoToken, {
    walletAddress,
  });
}

export interface LabelResponse {
  walletAddress: string;
  /** Sanitized label that was persisted, or null if the label was cleared. */
  label: string | null;
  /** Updated additionalAddresses array (so callers can locally refresh state). */
  additionalAddresses: Array<{ walletAddress: string; verifiedAt: number; label?: string }>;
}

/** Max label length enforced server-side (must stay in sync with Lambda). */
export const ADDITIONAL_ADDRESS_LABEL_MAX = 32;

/**
 * Set or clear the user-supplied label on a verified additional EVM
 * address. Pass `label = null` (or empty string after trim) to clear.
 * Primary address has no label slot — server rejects.
 */
export async function patchAdditionalAddressLabel(
  walletAddress: string,
  label: string | null,
  cognitoToken: string,
): Promise<LabelResponse> {
  return request<LabelResponse>('/additional-address/label', 'PATCH', cognitoToken, {
    walletAddress,
    label,
  });
}
