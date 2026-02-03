/**
 * BalanceManager on-chain validation utility
 */

import { getSuiClient } from '../../../lib/sui-client';

/**
 * Validate that a BalanceManager object exists on-chain
 */
export async function validateBalanceManagerExists(id: string): Promise<boolean> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({ id });
    return obj.data !== null && obj.error === undefined;
  } catch {
    return false;
  }
}
