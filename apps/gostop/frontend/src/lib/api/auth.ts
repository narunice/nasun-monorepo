/**
 * Gostop API wallet-signature auth flow.
 *
 * Backend contract (`apps/gostop/backend/src/api/routes/auth.ts`):
 *   POST /api/gostop/auth/challenge -> { challenge }
 *   POST /api/gostop/auth/verify    body { challenge, signature, wallet }
 *                                    -> { token, expires_in }
 *
 * Challenge body is a fixed-format string with `Purpose: gostop-api` so a
 * signature collected on chat or my-account cannot be replayed against this
 * surface. Backend uses `verifyPersonalMessageSignature` (intent scope 3),
 * which accepts both Sui-keypair and zkLogin-wrapped personal signatures.
 *
 * `signPersonal` must return a base64-encoded Sui personal-message signature.
 * The signer adapters in @nasun/wallet all return this format.
 */

import { apiRequest } from './client';
import { setToken } from './tokenStore';

interface ChallengeResponse {
  challenge: string;
}

interface VerifyResponse {
  token: string;
  expires_in: number;
}

export type SignPersonalFn = (message: Uint8Array) => Promise<string>;

/**
 * Run the full challenge/verify cycle and persist the resulting token.
 * Throws ApiError on either step; caller decides whether to retry or surface
 * the error to UI.
 */
export async function acquireToken(walletAddress: string, signPersonal: SignPersonalFn): Promise<string> {
  const { challenge } = await apiRequest<ChallengeResponse>('/api/gostop/auth/challenge', {
    method: 'POST',
    noAuth: true,
  });

  const messageBytes = new TextEncoder().encode(challenge);
  const signature = await signPersonal(messageBytes);

  const { token, expires_in } = await apiRequest<VerifyResponse>('/api/gostop/auth/verify', {
    method: 'POST',
    body: { challenge, signature, wallet: walletAddress },
    noAuth: true,
  });

  setToken(walletAddress, token, expires_in);
  return token;
}
