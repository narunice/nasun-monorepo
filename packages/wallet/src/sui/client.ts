/**
 * Nasun Wallet SUI Client Utilities
 */

import { SuiClient } from '@mysten/sui/client';
import type { BalanceInfo, WalletConfig } from '../types';

// NASUN token decimals (same as SUI: 9)
const NASUN_DECIMALS = 9;

// Default configuration
let walletConfig: WalletConfig = {
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
  networkName: 'Nasun Devnet',
};

// Cached SUI client
let suiClient: SuiClient | null = null;

/**
 * Configure wallet
 */
export function configureWallet(config: Partial<WalletConfig>): void {
  walletConfig = { ...walletConfig, ...config };
  suiClient = null; // Reset client to use new config
}

/**
 * Get wallet configuration
 */
export function getWalletConfig(): WalletConfig {
  return { ...walletConfig };
}

/**
 * Get SUI client (lazy initialization)
 */
export function getSuiClient(): SuiClient {
  if (!suiClient) {
    suiClient = new SuiClient({ url: walletConfig.rpcUrl });
  }
  return suiClient;
}

/**
 * Get NASUN balance for address
 */
export async function getBalance(address: string): Promise<BalanceInfo> {
  try {
    const client = getSuiClient();
    const balance = await client.getBalance({ owner: address });

    const totalBalance = balance.totalBalance;
    const formattedBalance = formatBalance(totalBalance);

    return {
      totalBalance,
      formattedBalance,
      coinCount: balance.coinObjectCount,
    };
  } catch (error) {
    console.error('Failed to get balance:', error);
    return {
      totalBalance: '0',
      formattedBalance: '0',
      coinCount: 0,
    };
  }
}

/**
 * Convert SOE (minimum unit) to NASUN
 */
export function formatBalance(soe: string | bigint): string {
  const value = BigInt(soe);
  const divisor = BigInt(10 ** NASUN_DECIMALS);

  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }

  // Show only significant digits (max 4)
  const fractionalStr = fractionalPart.toString().padStart(NASUN_DECIMALS, '0');
  const trimmed = fractionalStr.slice(0, 4).replace(/0+$/, '');

  if (trimmed === '') {
    return integerPart.toString();
  }

  return `${integerPart}.${trimmed}`;
}

/**
 * Convert NASUN to SOE (minimum unit)
 */
export function parseAmount(nasun: string): bigint {
  const parts = nasun.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';

  // Pad fractional part to 9 digits
  fractionalPart = fractionalPart.padEnd(NASUN_DECIMALS, '0').slice(0, NASUN_DECIMALS);

  return BigInt(integerPart + fractionalPart);
}

/**
 * Validate address format
 */
export function isValidAddress(address: string): boolean {
  // SUI address is 0x prefixed 64-char hex string
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars = 6): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
