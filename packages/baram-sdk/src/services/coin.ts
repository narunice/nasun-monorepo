/**
 * Coin selection service for NUSDC payments
 */

import { SuiClient } from '@mysten/sui/client';
import type { CoinRef } from '../types';

/**
 * Get NUSDC coins for payment.
 * Selects coins that sum to at least the required amount.
 *
 * @param client - Sui client instance
 * @param owner - Owner address
 * @param amount - Required amount in smallest units (1e6 = 1 NUSDC)
 * @param nusdcType - Full coin type string for NUSDC
 * @returns Array of coin references
 * @throws Error if insufficient balance
 */
export async function getNusdcCoins(
  client: SuiClient,
  owner: string,
  amount: number,
  nusdcType: string,
): Promise<CoinRef[]> {
  const coins = await client.getCoins({
    owner,
    coinType: nusdcType,
  });

  if (coins.data.length === 0) {
    throw new Error('No NUSDC coins found. Please get some from the Token Faucet.');
  }

  let total = 0;
  const selected: CoinRef[] = [];
  for (const coin of coins.data) {
    selected.push({
      objectId: coin.coinObjectId,
      version: coin.version,
      digest: coin.digest,
    });
    total += Number(coin.balance);
    if (total >= amount) break;
  }

  if (total < amount) {
    const needed = amount / 1e6;
    const have = total / 1e6;
    throw new Error(`Insufficient NUSDC balance. Need ${needed} NUSDC, have ${have} NUSDC.`);
  }

  return selected;
}
