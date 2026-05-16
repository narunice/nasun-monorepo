/**
 * Additional Solana Address API Client
 *
 * Backend endpoints for the per-app verified Solana binding flow. Mirror of
 * `additionalEvmApi.ts` but signs over UTF-8 bytes with Ed25519 (Phantom /
 * Solflare signMessage) instead of secp256k1 ECDSA. These endpoints require
 * a Cognito JWT -- the user must already be signed in.
 *
 * Flow for adding a new wallet:
 *   1. requestAdditionalSolChallenge(addr, appId?) -> { nonce, message }
 *   2. user signs `message` via wallet.signMessage(utf8Bytes)
 *   3. verifyAdditionalSolChallenge({ signature, nonce, publicKey })
 *      -> { walletAddress, primary, ... }
 */

const ADDITIONAL_API_URL = import.meta.env.VITE_SOLANA_ADDITIONAL_API as string | undefined;

function baseUrl(): string {
  if (!ADDITIONAL_API_URL) {
    throw new AdditionalSolanaApiError('VITE_SOLANA_ADDITIONAL_API is not configured');
  }
  return ADDITIONAL_API_URL.replace(/\/$/, '');
}

export class AdditionalSolanaApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'AdditionalSolanaApiError';
  }
}

export interface SolChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: number;
}

export interface SolVerifyResponse {
  walletAddress: string;
  verifiedAt: number;
  /** True when this verify created the primary slot (no prior verified primary). */
  primary: boolean;
  appBinding?: { appId: string; walletAddress: string };
}

export interface SolAppBindingResponse {
  appId: string;
  walletAddress?: string;
  removed?: boolean;
}

export interface SolRemoveResponse {
  walletAddress: string;
  removed: boolean;
  clearedBindings: string[];
}

export interface SolLabelResponse {
  walletAddress: string;
  label: string | null;
  additionalAddresses: Array<{ walletAddress: string; verifiedAt: number; label?: string }>;
}

export const ADDITIONAL_SOL_ADDRESS_LABEL_MAX = 32;

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
    throw new AdditionalSolanaApiError(
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
    throw new AdditionalSolanaApiError(
      typeof data.message === 'string' ? data.message : 'Request failed',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      data,
    );
  }

  return data as unknown as T;
}

export async function requestAdditionalSolChallenge(
  walletAddress: string,
  cognitoToken: string,
  appId?: string,
): Promise<SolChallengeResponse> {
  return request<SolChallengeResponse>(
    '/additional-address/challenge',
    'POST',
    cognitoToken,
    { walletAddress, appId },
  );
}

export async function verifyAdditionalSolChallenge(
  args: { signature: string; nonce: string; publicKey: string },
  cognitoToken: string,
): Promise<SolVerifyResponse> {
  return request<SolVerifyResponse>(
    '/additional-address/verify',
    'POST',
    cognitoToken,
    args,
  );
}

export async function patchSolAppBinding(
  appId: string,
  walletAddress: string | null,
  cognitoToken: string,
): Promise<SolAppBindingResponse> {
  return request<SolAppBindingResponse>('/app-binding', 'PATCH', cognitoToken, {
    appId,
    walletAddress,
  });
}

export async function removeAdditionalSolAddress(
  walletAddress: string,
  cognitoToken: string,
): Promise<SolRemoveResponse> {
  return request<SolRemoveResponse>('/additional-address', 'DELETE', cognitoToken, {
    walletAddress,
  });
}

export async function patchAdditionalSolAddressLabel(
  walletAddress: string,
  label: string | null,
  cognitoToken: string,
): Promise<SolLabelResponse> {
  return request<SolLabelResponse>('/additional-address/label', 'PATCH', cognitoToken, {
    walletAddress,
    label,
  });
}
