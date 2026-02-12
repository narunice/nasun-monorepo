/**
 * Known ERC-20 Token Registry
 *
 * Pre-configured ERC-20 tokens per EVM chain.
 * Primarily testnet tokens for prototype usage.
 */

import type { ERC20TokenConfig } from '../types/portfolio';

/** Known ERC-20 tokens per chain ID */
export const KNOWN_ERC20_TOKENS: Record<string, ERC20TokenConfig[]> = {
  'arbitrum-sepolia': [
    { address: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E', symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
    { address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  'sepolia': [
    { address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
    { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  ],
  'optimism-sepolia': [
    { address: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410', symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  ],
};

/** Get known ERC-20 tokens for a chain */
export function getKnownERC20Tokens(chainId: string): ERC20TokenConfig[] {
  return KNOWN_ERC20_TOKENS[chainId] ?? [];
}
