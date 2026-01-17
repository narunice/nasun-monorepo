/**
 * Nasun Devnet Faucet API
 */

import type { FaucetResponse, TokenFaucetHandler } from '../types';
import { getWalletConfig } from './client';

/**
 * Request test tokens from faucet
 * @param address Address to receive tokens
 * @returns Faucet response
 */
export async function requestFaucet(address: string): Promise<FaucetResponse> {
  const config = getWalletConfig();
  const faucetUrl = config.faucetUrl || 'https://faucet.devnet.nasun.io';

  try {
    const response = await fetch(`${faucetUrl}/gas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FixedAmountRequest: {
          recipient: address,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Faucet request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data as FaucetResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to request faucet');
  }
}

/**
 * Check if faucet is available
 */
export async function checkFaucetAvailable(): Promise<boolean> {
  const config = getWalletConfig();
  const faucetUrl = config.faucetUrl || 'https://faucet.devnet.nasun.io';

  try {
    const response = await fetch(faucetUrl, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Native NSN faucet handler
 * Use this with registerTokenFaucet('NSN', nativeFaucetHandler)
 */
export const nativeFaucetHandler: TokenFaucetHandler = {
  request: async (address: string): Promise<boolean> => {
    try {
      await requestFaucet(address);
      return true;
    } catch {
      return false;
    }
  },
};
