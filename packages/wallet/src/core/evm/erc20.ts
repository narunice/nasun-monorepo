/**
 * ERC-20 Token Balance Utilities
 *
 * Utilities for fetching ERC-20 token balances using multicall.
 */

import { erc20Abi, formatUnits } from 'viem';
import type { PublicClient } from 'viem';
import type { ERC20TokenConfig } from '../../types/portfolio';

/** ERC-20 balance result */
export interface ERC20Balance {
  /** Contract address */
  address: `0x${string}`;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Balance in minimum units */
  balance: bigint;
  /** Formatted balance (display units) */
  formattedBalance: string;
}

/**
 * Get ERC-20 token balance for a single token
 */
export async function getERC20Balance(
  client: PublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  tokenConfig: ERC20TokenConfig
): Promise<ERC20Balance> {
  const balance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  return {
    address: tokenAddress,
    symbol: tokenConfig.symbol,
    name: tokenConfig.name,
    decimals: tokenConfig.decimals,
    balance,
    formattedBalance: formatUnits(balance, tokenConfig.decimals),
  };
}

/**
 * Get multiple ERC-20 balances using multicall for efficiency
 */
export async function getERC20Balances(
  client: PublicClient,
  tokens: ERC20TokenConfig[],
  ownerAddress: `0x${string}`
): Promise<ERC20Balance[]> {
  if (tokens.length === 0) {
    return [];
  }

  // Use multicall for batch fetching
  const results = await client.multicall({
    contracts: tokens.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [ownerAddress],
    })),
    allowFailure: true,
  });

  return results.map((result, index) => {
    const token = tokens[index];
    const balance = result.status === 'success' ? (result.result as bigint) : 0n;

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance,
      formattedBalance: formatUnits(balance, token.decimals),
    };
  });
}

/**
 * Get ERC-20 token metadata (symbol, name, decimals)
 * Useful for discovering unknown tokens
 */
export async function getERC20Metadata(
  client: PublicClient,
  tokenAddress: `0x${string}`
): Promise<{ symbol: string; name: string; decimals: number } | null> {
  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'name',
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
    ]);

    return { symbol, name, decimals };
  } catch {
    return null;
  }
}
