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

import { getCooldownRemaining, setCooldownTimestamp, clearCooldownTimestamp } from './faucetCooldown';

/**
 * Native NSN faucet handler with 24h localStorage cooldown.
 * Uses optimistic locking: sets cooldown BEFORE the HTTP call to prevent
 * concurrent requests from multiple UI components, then rolls back on failure.
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
      // Rollback cooldown on failure — user didn't receive tokens
      clearCooldownTimestamp(address, 'NSN');
      if (err instanceof Error && err.message.includes('cooldown')) throw err;
      return false;
    }
  },
  getCooldownRemaining: (address: string) => getCooldownRemaining(address, 'NSN'),
};
