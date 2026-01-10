/**
 * Token Registry
 * Centralized token configuration management for multi-token support
 */

import type { TokenConfig, TokenFaucetHandler } from '../types';

// Token registry storage
const tokenRegistry = new Map<string, TokenConfig>();
const tokensByType = new Map<string, TokenConfig>();

/**
 * Native token (NASUN)
 * This is always registered by default
 */
export const NATIVE_TOKEN: TokenConfig = {
  symbol: 'NASUN',
  name: 'Nasun',
  decimals: 9,
  type: '0x2::sui::SUI',
};

/**
 * Devnet default tokens
 * These tokens are auto-registered for Nasun Devnet to ensure consistent
 * wallet UI across all apps using @nasun/wallet.
 *
 * Apps can override these by calling registerTokens() with custom types.
 */
export const DEVNET_TOKENS: TokenConfig[] = [
  {
    symbol: 'NBTC',
    name: 'Nasun BTC',
    decimals: 8,
    type: '0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nbtc::NBTC',
  },
  {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: 6,
    type: '0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nusdc::NUSDC',
  },
];

// Register native token by default (always available)
tokenRegistry.set(NATIVE_TOKEN.symbol, NATIVE_TOKEN);
tokensByType.set(NATIVE_TOKEN.type, NATIVE_TOKEN);

// Auto-register devnet tokens for consistent wallet UI across all apps
for (const token of DEVNET_TOKENS) {
  tokenRegistry.set(token.symbol, token);
  tokensByType.set(token.type, token);
}

/**
 * Register a new token
 * @param config Token configuration
 */
export function registerToken(config: TokenConfig): void {
  tokenRegistry.set(config.symbol, config);
  tokensByType.set(config.type, config);
}

/**
 * Register multiple tokens at once
 * @param configs Array of token configurations
 */
export function registerTokens(configs: TokenConfig[]): void {
  for (const config of configs) {
    registerToken(config);
  }
}

/**
 * Get token by symbol
 * @param symbol Token symbol (e.g., 'NASUN', 'NBTC')
 */
export function getToken(symbol: string): TokenConfig | undefined {
  return tokenRegistry.get(symbol);
}

/**
 * Get token by coin type
 * @param type Coin type (e.g., '0x2::sui::SUI')
 */
export function getTokenByType(type: string): TokenConfig | undefined {
  return tokensByType.get(type);
}

/**
 * Get all registered tokens
 */
export function getAllTokens(): TokenConfig[] {
  return Array.from(tokenRegistry.values());
}

/**
 * Check if a token is registered
 * @param symbol Token symbol
 */
export function isTokenRegistered(symbol: string): boolean {
  return tokenRegistry.has(symbol);
}

/**
 * Clear all tokens except native token
 * Useful for testing or network switching
 */
export function clearTokens(): void {
  tokenRegistry.clear();
  tokensByType.clear();
  // Re-register native token
  tokenRegistry.set(NATIVE_TOKEN.symbol, NATIVE_TOKEN);
  tokensByType.set(NATIVE_TOKEN.type, NATIVE_TOKEN);
}

// ============================================
// Faucet Handler Registry
// ============================================

const faucetRegistry = new Map<string, TokenFaucetHandler>();

/**
 * Register a faucet handler for a token
 * @param symbol Token symbol (e.g., 'NASUN', 'NBTC')
 * @param handler Faucet handler implementation
 */
export function registerTokenFaucet(symbol: string, handler: TokenFaucetHandler): void {
  faucetRegistry.set(symbol, handler);
}

/**
 * Get faucet handler for a token
 * @param symbol Token symbol
 */
export function getTokenFaucet(symbol: string): TokenFaucetHandler | undefined {
  return faucetRegistry.get(symbol);
}

/**
 * Check if a token has a faucet handler
 * @param symbol Token symbol
 */
export function hasTokenFaucet(symbol: string): boolean {
  return faucetRegistry.has(symbol);
}

/**
 * Clear all faucet handlers
 * Useful for testing
 */
export function clearTokenFaucets(): void {
  faucetRegistry.clear();
}
