/**
 * Nasun Wallet SUI Client Utilities
 */

import { SuiClient } from '@mysten/sui/client';
import type { BalanceInfo, WalletConfig, TokenBalance, MultiTokenBalanceInfo } from '../types';
import { getTokenByType, NATIVE_TOKEN } from '../config/tokens';
import { AllBalancesSchema, CoinBalanceSchema, safeParseRpc } from '../schemas/rpc';

// NASUN token decimals (same as SUI: 9)
const NASUN_DECIMALS = 9;

// Session storage key for password persistence
const SESSION_KEY = 'nasun_wallet_session';

// Session expiry time (30 minutes)
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

// Session data structure for secure storage
interface SecureSessionData {
  /** Obfuscated password */
  p: string;
  /** Creation timestamp */
  c: number;
  /** Expiry timestamp */
  e: number;
  /** Domain binding */
  d: string;
  /** Session version (for future migrations) */
  v: number;
}

// Default configuration
let walletConfig: WalletConfig = {
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
  networkName: 'Nasun Devnet',
  explorerUrl: 'https://explorer.devnet.nasun.io',
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
    const rawBalance = await client.getBalance({ owner: address });

    // Validate RPC response
    const balance = safeParseRpc(CoinBalanceSchema, rawBalance, 'getBalance');
    if (!balance) {
      throw new Error('Invalid balance response from RPC');
    }

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
 * Convert minimum unit to display unit
 * @param amount Amount in minimum unit
 * @param decimals Token decimals (default: 9 for NASUN)
 */
export function formatBalance(amount: string | bigint, decimals: number = NASUN_DECIMALS): string {
  const value = BigInt(amount);
  if (value === 0n) return '0';

  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  // Show only significant digits (max 6)
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, 6).replace(/0+$/, '');

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

// ============================================
// Multi-Token Support Functions
// ============================================

/**
 * Get all token balances for an address
 * Returns balances for native token and all registered tokens
 */
export async function getAllBalances(address: string): Promise<MultiTokenBalanceInfo> {
  try {
    const client = getSuiClient();
    const rawBalances = await client.getAllBalances({ owner: address });

    // Validate RPC response
    const balances = safeParseRpc(AllBalancesSchema, rawBalances, 'getAllBalances');
    if (!balances) {
      throw new Error('Invalid balances response from RPC');
    }

    // Initialize native token balance
    const nativeBalance: TokenBalance = {
      symbol: NATIVE_TOKEN.symbol,
      balance: 0n,
      formatted: '0',
      decimals: NATIVE_TOKEN.decimals,
      type: NATIVE_TOKEN.type,
    };

    // Map for additional tokens
    const tokens: Record<string, TokenBalance> = {};

    // Process all balances
    for (const balance of balances) {
      const tokenConfig = getTokenByType(balance.coinType);
      const balanceValue = BigInt(balance.totalBalance);

      if (balance.coinType === NATIVE_TOKEN.type) {
        // Native token (NASUN)
        nativeBalance.balance = balanceValue;
        nativeBalance.formatted = formatBalance(balanceValue, NATIVE_TOKEN.decimals);
      } else if (tokenConfig) {
        // Registered token
        tokens[tokenConfig.symbol] = {
          symbol: tokenConfig.symbol,
          balance: balanceValue,
          formatted: formatBalance(balanceValue, tokenConfig.decimals),
          decimals: tokenConfig.decimals,
          type: balance.coinType,
        };
      }
      // Ignore unregistered tokens
    }

    return {
      native: nativeBalance,
      tokens,
    };
  } catch (error) {
    console.error('Failed to get all balances:', error);
    return {
      native: {
        symbol: NATIVE_TOKEN.symbol,
        balance: 0n,
        formatted: '0',
        decimals: NATIVE_TOKEN.decimals,
        type: NATIVE_TOKEN.type,
      },
      tokens: {},
    };
  }
}

/**
 * Get balance for a specific token type
 */
export async function getTokenBalance(address: string, tokenType: string): Promise<TokenBalance | null> {
  try {
    const client = getSuiClient();
    const rawBalance = await client.getBalance({ owner: address, coinType: tokenType });

    // Validate RPC response
    const balance = safeParseRpc(CoinBalanceSchema, rawBalance, 'getTokenBalance');
    if (!balance) {
      console.warn('Invalid balance response from RPC');
      return null;
    }

    const tokenConfig = getTokenByType(tokenType);

    if (!tokenConfig) {
      console.warn(`Token type not registered: ${tokenType}`);
      return null;
    }

    const balanceValue = BigInt(balance.totalBalance);
    return {
      symbol: tokenConfig.symbol,
      balance: balanceValue,
      formatted: formatBalance(balanceValue, tokenConfig.decimals),
      decimals: tokenConfig.decimals,
      type: tokenType,
    };
  } catch (error) {
    console.error(`Failed to get token balance for ${tokenType}:`, error);
    return null;
  }
}

// ============================================
// Session Persistence Functions
// ============================================

/**
 * Check if session persistence is enabled
 */
export function isSessionPersistEnabled(): boolean {
  return walletConfig.sessionPersist === true;
}

/**
 * Simple obfuscation for session password
 * Not cryptographically secure, but provides minimal protection
 * against casual inspection. Real security comes from:
 * - Session expiry (30 minutes)
 * - Domain binding
 * - sessionStorage clearing on tab close
 */
function obfuscatePassword(password: string): string {
  // Convert to UTF-8 bytes, XOR with key, then base64
  const key = window.location.origin.length;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(password);
  const xored = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    xored[i] = bytes[i] ^ ((key + i) % 256);
  }
  // Convert to base64-safe string
  return btoa(String.fromCharCode(...xored));
}

function deobfuscatePassword(obfuscated: string): string {
  const key = window.location.origin.length;
  const decoded = atob(obfuscated);
  const xored = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    xored[i] = decoded.charCodeAt(i) ^ ((key + i) % 256);
  }
  const decoder = new TextDecoder();
  return decoder.decode(xored);
}

/**
 * Save password to session storage (for auto-unlock on page refresh)
 * Only works when sessionPersist is enabled.
 *
 * Security features:
 * - 30-minute expiry time
 * - Domain binding (prevents use on other domains)
 * - XOR obfuscation (minimal protection against casual inspection)
 * - sessionStorage clears on tab close
 *
 * Note: This is a convenience feature with security trade-offs.
 * For maximum security, disable sessionPersist.
 */
export function saveSessionPassword(password: string): void {
  if (!isSessionPersistEnabled()) return;
  try {
    const now = Date.now();
    const sessionData: SecureSessionData = {
      p: obfuscatePassword(password),
      c: now,
      e: now + SESSION_EXPIRY_MS,
      d: window.location.origin,
      v: 1,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.warn('Failed to save session:', error);
  }
}

/**
 * Get password from session storage
 * Returns null if:
 * - Session persistence is disabled
 * - No session exists
 * - Session has expired (30 minutes)
 * - Domain mismatch
 */
export function getSessionPassword(): string | null {
  if (!isSessionPersistEnabled()) return null;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    // Try to parse as new format
    try {
      const sessionData: SecureSessionData = JSON.parse(stored);

      // Validate version
      if (sessionData.v !== 1) {
        clearSessionPassword();
        return null;
      }

      // Check domain binding
      if (sessionData.d !== window.location.origin) {
        clearSessionPassword();
        return null;
      }

      // Check expiry
      if (Date.now() > sessionData.e) {
        clearSessionPassword();
        return null;
      }

      return deobfuscatePassword(sessionData.p);
    } catch {
      // Legacy format (plain base64) - migrate or clear
      clearSessionPassword();
      return null;
    }
  } catch (error) {
    console.warn('Failed to get session:', error);
    return null;
  }
}

/**
 * Clear session password
 */
export function clearSessionPassword(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear session:', error);
  }
}

// ============================================
// Explorer URL Functions
// ============================================

/**
 * Get Explorer URL for a transaction
 * @param digest Transaction digest
 */
export function getExplorerTxUrl(digest: string): string {
  const baseUrl = walletConfig.explorerUrl || 'https://explorer.devnet.nasun.io';
  return `${baseUrl}/tx/${digest}`;
}

/**
 * Get Explorer URL for an address
 * @param address Wallet address
 */
export function getExplorerAddressUrl(address: string): string {
  const baseUrl = walletConfig.explorerUrl || 'https://explorer.devnet.nasun.io';
  return `${baseUrl}/address/${address}`;
}

/**
 * Get Explorer URL for an object
 * @param objectId Object ID
 */
export function getExplorerObjectUrl(objectId: string): string {
  const baseUrl = walletConfig.explorerUrl || 'https://explorer.devnet.nasun.io';
  return `${baseUrl}/object/${objectId}`;
}

// ============================================
// Transaction Simulation Functions
// ============================================

import type { TransactionSimulation, BalanceChange } from '../types';
import type { Transaction } from '@mysten/sui/transactions';

/**
 * Simulate a transaction to preview its effects
 * Uses devInspectTransactionBlock to dry-run without signing
 * @param transaction The transaction to simulate
 * @param sender The sender address
 */
export async function simulateTransaction(
  transaction: Transaction,
  sender: string
): Promise<TransactionSimulation> {
  try {
    const client = getSuiClient();

    // Use devInspectTransactionBlock for dry-run simulation
    const result = await client.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender,
    });

    // Check if simulation succeeded
    const success = result.effects?.status?.status === 'success';
    const error = result.effects?.status?.error;

    // Calculate gas estimate
    const gasUsed = result.effects?.gasUsed;
    const gasEstimate = gasUsed
      ? (
          BigInt(gasUsed.computationCost) +
          BigInt(gasUsed.storageCost) -
          BigInt(gasUsed.storageRebate)
        ).toString()
      : '0';

    // Parse balance changes from effects
    // Note: DevInspectResults doesn't include balanceChanges directly,
    // so we provide an empty array. For actual balance changes,
    // users should compare balances before/after or use dryRunTransactionBlock.
    const balanceChanges: BalanceChange[] = [];

    return {
      success,
      error,
      gasEstimate,
      balanceChanges,
      effects: result.effects,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation failed';
    return {
      success: false,
      error: message,
      gasEstimate: '0',
      balanceChanges: [],
    };
  }
}
