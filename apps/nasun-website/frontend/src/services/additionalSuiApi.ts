/**
 * Additional Sui Address API Client
 *
 * Backend endpoints for the per-app verified Sui binding flow. Mirror of
 * `additionalSolanaApi.ts` -- signs over UTF-8 bytes via Sui personal-message
 * (BCS intent prefix + Ed25519) using @mysten/dapp-kit's signPersonalMessage
 * on the wallet side. These endpoints require a Cognito JWT.
 *
 * Flow for adding a new wallet:
 *   1. requestAdditionalSuiChallenge(addr, appId?) -> { nonce, message }
 *   2. user signs `message` via wallet.signPersonalMessage(utf8Bytes)
 *   3. verifyAdditionalSuiChallenge({ signature, nonce })
 *      -> { walletAddress, primary, ... }
 *
 * Unlike Solana, the Sui personal-message signature itself carries the
 * public key, so the verify call does NOT need a separate `publicKey`
 * parameter -- the server recovers the signer address from the signature
 * bytes and asserts it matches the challenged address.
 */

const ADDITIONAL_API_URL = import.meta.env.VITE_SUI_ADDITIONAL_API as string | undefined;

function baseUrl(): string {
  if (!ADDITIONAL_API_URL) {
    throw new AdditionalSuiApiError('VITE_SUI_ADDITIONAL_API is not configured');
  }
  return ADDITIONAL_API_URL.replace(/\/$/, '');
}

export class AdditionalSuiApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'AdditionalSuiApiError';
  }
}

export interface SuiChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: number;
}

export interface SuiVerifyResponse {
  walletAddress: string;
  verifiedAt: number;
  /** True when this verify created the primary slot (no prior verified primary). */
  primary: boolean;
  appBinding?: { appId: string; walletAddress: string };
}

export interface SuiAppBindingResponse {
  appId: string;
  walletAddress?: string;
  removed?: boolean;
}

export interface SuiRemoveResponse {
  walletAddress: string;
  removed: boolean;
  clearedBindings: string[];
}

export interface SuiLabelResponse {
  walletAddress: string;
  label: string | null;
  additionalAddresses: Array<{ walletAddress: string; verifiedAt: number; label?: string }>;
}

export const ADDITIONAL_SUI_ADDRESS_LABEL_MAX = 32;

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
    throw new AdditionalSuiApiError(
      err instanceof Error ? err.message : 'Network error',
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // empty / non-JSON body
  }

  if (!response.ok) {
    throw new AdditionalSuiApiError(
      typeof data.message === 'string' ? data.message : 'Request failed',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      data,
    );
  }

  return data as unknown as T;
}

export async function requestAdditionalSuiChallenge(
  walletAddress: string,
  cognitoToken: string,
  appId?: string,
): Promise<SuiChallengeResponse> {
  return request<SuiChallengeResponse>(
    '/additional-address/challenge',
    'POST',
    cognitoToken,
    { walletAddress, appId },
  );
}

export async function verifyAdditionalSuiChallenge(
  args: { signature: string; nonce: string },
  cognitoToken: string,
): Promise<SuiVerifyResponse> {
  return request<SuiVerifyResponse>(
    '/additional-address/verify',
    'POST',
    cognitoToken,
    args,
  );
}

export async function patchSuiAppBinding(
  appId: string,
  walletAddress: string | null,
  cognitoToken: string,
): Promise<SuiAppBindingResponse> {
  return request<SuiAppBindingResponse>('/app-binding', 'PATCH', cognitoToken, {
    appId,
    walletAddress,
  });
}

export async function removeAdditionalSuiAddress(
  walletAddress: string,
  cognitoToken: string,
): Promise<SuiRemoveResponse> {
  return request<SuiRemoveResponse>('/additional-address', 'DELETE', cognitoToken, {
    walletAddress,
  });
}

export async function patchAdditionalSuiAddressLabel(
  walletAddress: string,
  label: string | null,
  cognitoToken: string,
): Promise<SuiLabelResponse> {
  return request<SuiLabelResponse>('/additional-address/label', 'PATCH', cognitoToken, {
    walletAddress,
    label,
  });
}
