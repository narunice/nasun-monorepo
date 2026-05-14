import { SuiClient } from '@mysten/sui/client';
import { TOKEN_CONFIG } from './network';

export interface CoinRef {
  objectId: string;
  version: string;
  digest: string;
}

export async function getNusdcCoins(
  client: SuiClient,
  owner: string,
  amount: number,
): Promise<CoinRef[]> {
  const coins = await client.getCoins({ owner, coinType: TOKEN_CONFIG.nusdcType });
  if (coins.data.length === 0) {
    throw new Error('No NUSDC coins found. Please get some from the Token Faucet.');
  }

  let total = 0;
  const selected: CoinRef[] = [];
  for (const coin of coins.data) {
    selected.push({ objectId: coin.coinObjectId, version: coin.version, digest: coin.digest });
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
