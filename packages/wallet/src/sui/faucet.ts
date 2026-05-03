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
      if (response.status === 429) {
        throw new Error(`Faucet cooldown active. ${errorText}`);
      }
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

import { getCooldownRemaining, setCooldownTimestamp } from './faucetCooldown';

/**
 * Native NSN faucet handler with 24h localStorage cooldown.
 * Uses optimistic locking: sets cooldown BEFORE the HTTP call to prevent
 * concurrent requests from multiple UI components. Lock is never rolled back
 * since we cannot know if the server processed the request on network/5xx failures.
 */
export const nativeFaucetHandler: TokenFaucetHandler = {
  request: async (address: string): Promise<boolean> => {
    // Check localStorage cooldown before HTTP request
    const remaining = getCooldownRemaining(address, 'NSN');
    if (remaining > 0) {
      const hours = Math.ceil(remaining / 3_600_000);
      throw new Error(`Faucet cooldown active (24h). Try again in ~${hours}h.`);
    }

    // Optimistic lock: set cooldown BEFORE HTTP call to block concurrent requests
    setCooldownTimestamp(address, 'NSN');

    try {
      await requestFaucet(address);
      return true;
    } catch (err) {
      // If server says cooldown active (429), preserve localStorage and re-throw
      if (err instanceof Error && err.message.includes('cooldown')) throw err;
      // Keep optimistic lock even on failure: the request may have reached the server
      // (network drop after send, 5xx after processing). Rolling back causes a misleading
      // "Faucet" button when the server already recorded the claim, leading to confusing
      // 429 errors on the next click. At worst, the user waits until the next daily reset.
      return false;
    }
  },
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NSN'),
};
