/**
 * Wallet Authentication API Client
 *
 * Backend wallet auth endpoints for the 1-trip connect-and-sign flow:
 * prepareChallenge() → signMessage → connectVerify()
 *
 * The server recovers the wallet address from the signature (ecrecover),
 * so the client never sends the address to the prepare endpoint.
 */

import i18n from '../i18n';

// Backend API base URL
const WALLET_AUTH_API_URL = import.meta.env.VITE_METAMASK_AUTH_API;

if (!WALLET_AUTH_API_URL) {
  console.error('VITE_METAMASK_AUTH_API is not defined in environment variables');
}

// Inline types (previously in types/metamask.d.ts)
interface ChallengeResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  identityId: string;
  token: string;
}

interface ErrorResponse {
  message?: string;
  error?: string;
}

export class MetaMaskApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: ErrorResponse
  ) {
    super(message);
    this.name = 'MetaMaskApiError';
  }
}

export interface ConnectVerifyResponse extends VerifyResponse {
  walletAddress: string;
}

/**
 * Prepare: Get nonce + message from server (no wallet address needed).
 * First step of the 1-trip connect-and-sign flow.
 */
export async function prepareChallenge(): Promise<ChallengeResponse> {
  const url = `${WALLET_AUTH_API_URL}/prepare`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: i18n.language }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new MetaMaskApiError(
        data.message || 'Failed to prepare challenge',
        response.status,
        data
      );
    }

    return data as ChallengeResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) throw error;

    console.error('Failed to prepare challenge:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * Connect-verify: Send signature + nonce to server.
 * Server recovers wallet address from signature and issues Cognito identity.
 * Final step of the 1-trip connect-and-sign flow.
 */
export async function connectVerify(
  signature: string,
  nonce: string,
): Promise<ConnectVerifyResponse> {
  const url = `${WALLET_AUTH_API_URL}/connect-verify`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, nonce }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new MetaMaskApiError(
        data.message || 'Failed to verify connect signature',
        response.status,
        data
      );
    }

    return data as ConnectVerifyResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) throw error;

    console.error('Failed to connect-verify:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}
