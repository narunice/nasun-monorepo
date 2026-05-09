import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { createRetryFetch } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../config/network';

let suiClient: SuiClient | null = null;

// Move package contents are immutable — package upgrades create a new packageId,
// so cached normalized definitions for a given (pkg, module, function) never go stale.
// SDK calls these implicitly during Transaction.build() for argument type resolution,
// generating ~2k req/min of sui_getNormalizedMoveFunction in production.
const moveFunctionCache = new Map<string, Promise<unknown>>();
const moveModuleCache = new Map<string, Promise<unknown>>();
const moveModulesByPackageCache = new Map<string, Promise<unknown>>();

function memoize<P extends { package: string; module?: string; function?: string }, R>(
  cache: Map<string, Promise<R>>,
  fn: (params: P) => Promise<R>,
  keyOf: (params: P) => string,
): (params: P) => Promise<R> {
  return (params: P) => {
    const key = keyOf(params);
    let entry = cache.get(key);
    if (!entry) {
      entry = fn(params).catch((err) => {
        cache.delete(key);
        throw err;
      });
      cache.set(key, entry);
    }
    return entry;
  };
}

export function getSuiClient(): SuiClient {
  if (!suiClient) {
    const client = new SuiClient({
      transport: new SuiHTTPTransport({
        url: NETWORK_CONFIG.rpcUrl,
        fetch: createRetryFetch(),
      }),
    });

    const origGetFn = client.getNormalizedMoveFunction.bind(client);
    client.getNormalizedMoveFunction = memoize(
      moveFunctionCache,
      origGetFn,
      (p) => `${p.package}::${p.module}::${p.function}`,
    ) as typeof client.getNormalizedMoveFunction;

    const origGetMod = client.getNormalizedMoveModule.bind(client);
    client.getNormalizedMoveModule = memoize(
      moveModuleCache,
      origGetMod,
      (p) => `${p.package}::${p.module}`,
    ) as typeof client.getNormalizedMoveModule;

    const origGetPkg = client.getNormalizedMoveModulesByPackage.bind(client);
    client.getNormalizedMoveModulesByPackage = memoize(
      moveModulesByPackageCache,
      origGetPkg,
      (p) => p.package,
    ) as typeof client.getNormalizedMoveModulesByPackage;

    suiClient = client;
  }
  return suiClient;
}

// Request tokens from faucet
export async function requestFaucet(address: string): Promise<boolean> {
  try {
    const response = await fetch(`${NETWORK_CONFIG.faucetUrl}/gas`, {
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
