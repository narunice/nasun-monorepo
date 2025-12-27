import { SuiClient } from '@mysten/sui/client';
import { NETWORK_CONFIG } from '../config/network';

// Singleton SuiClient instance
let suiClient: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!suiClient) {
    suiClient = new SuiClient({
      url: NETWORK_CONFIG.rpcUrl,
    });
  }
  return suiClient;
}

// Request tokens from faucet
export async function requestFaucet(address: string): Promise<boolean> {
  try {
    const response = await fetch(NETWORK_CONFIG.faucetUrl, {
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
      throw new Error(`Faucet request failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Faucet request error:', error);
    return false;
  }
}

// Get balance for an address
export async function getBalance(address: string): Promise<bigint> {
  const client = getSuiClient();
  const balance = await client.getBalance({
    owner: address,
  });
  return BigInt(balance.totalBalance);
}

// Get all coin balances for an address
export async function getAllBalances(address: string) {
  const client = getSuiClient();
  return client.getAllBalances({
    owner: address,
  });
}

// Format balance with decimals
export function formatBalance(balance: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = balance / divisor;
  const fractionalPart = balance % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional) {
    return `${integerPart}.${trimmedFractional}`;
  }
  return integerPart.toString();
}
