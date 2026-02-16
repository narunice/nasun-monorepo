/**
 * Nasun Wallet SUI Client Utilities
 */

import { SuiClient } from '@mysten/sui/client';
import type { SuiTransport, SuiTransportRequestOptions, SuiTransportSubscribeOptions } from '@mysten/sui/client';
import type { BalanceInfo, WalletConfig, TokenBalance, MultiTokenBalanceInfo } from '../types';
import { getTokenByType, NATIVE_TOKEN } from '../config/tokens';
import { AllBalancesSchema, CoinBalanceSchema, safeParseRpc } from '../schemas/rpc';

// ============================================
// CORS-Compatible Transport for External Chains
// ============================================

/**
 * Minimal JSON-RPC transport that avoids Sui SDK custom headers.
 *
 * The default SuiHTTPTransport sends Client-Request-Method, Client-Sdk-Type,
 * Client-Sdk-Version, and Client-Target-Api-Version headers. Some external
 * RPC servers (e.g. IOTA testnet) reject these in CORS preflight.
 * This transport sends only Content-Type which is sufficient for JSON-RPC.
 *
 * Also supports RPC method name remapping for Sui forks that renamed
 * their JSON-RPC methods (e.g. IOTA: sui_* → iota_*, suix_* → iotax_*).
 */
class CorsCompatibleTransport implements SuiTransport {
  #url: string;
  #requestId = 0;
  #remapMethod: (method: string) => string;
  /** Non-null when the chain's native coin type differs from 0x2::sui::SUI */
  #nativeCoinType: string | null;

  constructor(url: string, methodPrefix?: string, nativeCoinType?: string) {
    this.#url = url;

    // Build method remapper: replaces sui_/suix_ prefixes with the chain's prefix
    if (methodPrefix && methodPrefix !== 'sui') {
      this.#remapMethod = (m: string) => {
        if (m.startsWith('suix_')) return `${methodPrefix}x_${m.slice(5)}`;
        if (m.startsWith('sui_')) return `${methodPrefix}_${m.slice(4)}`;
        return m;
      };
    } else {
      this.#remapMethod = (m: string) => m;
    }

    // Coin type remapping: only needed when native coin differs from Sui default.
    // The Sui SDK hardcodes '0x2::sui::SUI' as the gas coin type when building
    // transactions (e.g., getCoins calls during tx.build()). Chains like IOTA
    // that renamed their native coin module need this remapped in params.
    this.#nativeCoinType =
      nativeCoinType && nativeCoinType !== '0x2::sui::SUI' ? nativeCoinType : null;
  }

  async request<T>(input: SuiTransportRequestOptions): Promise<T> {
    this.#requestId += 1;

    const params = this.#nativeCoinType
      ? this.#remapCoinType(input.params)
      : input.params;

    const res = await fetch(this.#url, {
      method: 'POST',
      signal: input.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.#requestId,
        method: this.#remapMethod(input.method),
        params,
      }),
    });

    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if ('error' in data && data.error != null) {
      throw new Error(data.error.message);
    }

    return data.result;
  }

  /**
   * Recursively replace '0x2::sui::SUI' with the chain's native coin type
   * in JSON-RPC request parameters.
   *
   * Handles both standalone values (coinType field) and type parameters
   * embedded in longer strings (e.g., '0x2::coin::Coin<0x2::sui::SUI>').
   */
  #remapCoinType(params: unknown): unknown {
    if (typeof params === 'string') {
      return params.replaceAll('0x2::sui::SUI', this.#nativeCoinType!);
    }
    if (Array.isArray(params)) {
      return params.map((p) => this.#remapCoinType(p));
    }
    if (params !== null && typeof params === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
        result[key] = this.#remapCoinType(value);
      }
      return result;
    }
    return params;
  }

  async subscribe<T>(_input: SuiTransportSubscribeOptions<T>): Promise<() => Promise<boolean>> {
    throw new Error('WebSocket subscriptions not supported for external chains');
  }
}

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
  explorerUrl: 'https://explorer.nasun.io/devnet',
};

// Cached SUI client (Nasun default)
let suiClient: SuiClient | null = null;

// Cached Move clients keyed by RPC URL (for external chains like Sui/IOTA)
const moveClients = new Map<string, SuiClient>();
const MAX_MOVE_CLIENTS = 20;

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
 * Get a Move-compatible client for a specific RPC URL (cached).
 * Used for external Move chains (Sui testnet, IOTA testnet, etc.)
 * @param rpcUrl RPC endpoint URL
 * @param chainId Optional chain ID to resolve RPC method prefix (e.g., IOTA remaps sui_* to iota_*)
 */
export function getMoveClient(rpcUrl: string, chainId?: string): SuiClient {
  // Cache key includes chainId because the same URL with different chain configs
  // produces different transports (method prefix, coin type remapping).
  const cacheKey = chainId ? `${rpcUrl}::${chainId}` : rpcUrl;
  let client = moveClients.get(cacheKey);
  if (client) {
    // LRU: move to end to prevent eviction of frequently used clients
    moveClients.delete(cacheKey);
    moveClients.set(cacheKey, client);
    return client;
  }
  // Evict oldest entry when at capacity
  if (moveClients.size >= MAX_MOVE_CLIENTS) {
    const oldest = moveClients.keys().next().value;
    if (oldest) moveClients.delete(oldest);
  }
  const chain = chainId ? getChain(chainId) : undefined;
  client = new SuiClient({
    transport: new CorsCompatibleTransport(rpcUrl, chain?.rpcMethodPrefix, chain?.nativeCoinType),
  });
  moveClients.set(cacheKey, client);
  return client;
}

/**
 * Get native token balance for a Move chain address.
 * @param address Wallet address
 * @param rpcUrl Optional RPC URL for external chains. If omitted, uses Nasun default.
 * @param chainId Optional chain ID for RPC method prefix resolution
 */
export async function getBalance(address: string, rpcUrl?: string, chainId?: string): Promise<BalanceInfo> {
  try {
    const client = rpcUrl ? getMoveClient(rpcUrl, chainId) : getSuiClient();
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
      formattedBalance: '0.000000',
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
 * @param address - The address to shorten
 * @param startChars - Number of characters after 0x prefix (default: 6)
 *                     If 0, only shows end characters with "..." prefix
 * @param endChars - Number of characters at the end (default: same as startChars)
 */
export function shortenAddress(address: string, startChars = 6, endChars?: number): string {
  if (!address) return '';
  const end = endChars ?? startChars;

  // Mobile-optimized: show only last N chars when startChars is 0
  if (startChars === 0) {
    return `...${address.slice(-end)}`;
  }

  return `${address.slice(0, startChars + 2)}...${address.slice(-end)}`;
}

/**
 * Configuration for responsive address display
 */
export interface AddressDisplayConfig {
  desktop: { start: number; end: number };
  mobile: { start: number; end: number };
}

/**
 * Default address display configuration
 * - Desktop: 0xc2...cdb8 (2 chars + 4 chars)
 * - Mobile: ...cdb8 (only last 4 chars)
 */
export const DEFAULT_ADDRESS_DISPLAY: AddressDisplayConfig = {
  desktop: { start: 2, end: 4 },
  mobile: { start: 0, end: 4 },
};

/**
 * Shorten address with responsive configuration
 * Automatically selects display format based on viewport
 * @param address - The address to shorten
 * @param isMobile - Whether the viewport is mobile size
 * @param config - Optional custom configuration (default: DEFAULT_ADDRESS_DISPLAY)
 */
export function shortenAddressResponsive(
  address: string,
  isMobile: boolean,
  config: AddressDisplayConfig = DEFAULT_ADDRESS_DISPLAY
): string {
  if (!address) return '';
  const { start, end } = isMobile ? config.mobile : config.desktop;
  return shortenAddress(address, start, end);
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
 * Encode password for session storage.
 * Uses base64 encoding — NOT cryptographic protection.
 *
 * Actual security relies on:
 * - sessionStorage isolation (same-origin, cleared on tab close)
 * - 30-minute expiry
 * - Domain binding check on read
 *
 * If XSS exists, no client-side obfuscation can prevent extraction.
 * The correct mitigation is CSP + XSS prevention, not encoding tricks.
 */
function encodePassword(password: string): string {
  return btoa(new TextEncoder().encode(password).reduce(
    (s, b) => s + String.fromCharCode(b), ''
  ));
}

function decodePassword(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Save password to session storage (for auto-unlock on page refresh)
 * Only works when sessionPersist is enabled.
 *
 * Security features:
 * - 30-minute expiry time
 * - Domain binding (prevents use on other domains)
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
      p: encodePassword(password),
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

      return decodePassword(sessionData.p);
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

import { getChain, isNasunChain } from '../config/chains';

/**
 * Resolve the block explorer base URL for the given chain.
 * External chains (Sui, IOTA, EVM) use their own blockExplorer URL.
 * Nasun chains use the configured wallet explorer URL.
 */
function resolveExplorerBase(chainId?: string): string {
  if (chainId && !isNasunChain(chainId)) {
    const chain = getChain(chainId);
    if (chain?.blockExplorer) return chain.blockExplorer;
  }
  return walletConfig.explorerUrl || 'https://explorer.nasun.io/devnet';
}

/**
 * Get Explorer URL for a transaction
 * @param digest Transaction digest
 * @param chainId Optional chain ID (defaults to Nasun explorer)
 */
export function getExplorerTxUrl(digest: string, chainId?: string): string {
  const baseUrl = resolveExplorerBase(chainId);
  return `${baseUrl}/tx/${digest}`;
}

/**
 * Get Explorer URL for an address
 * @param address Wallet address
 * @param chainId Optional chain ID (defaults to Nasun explorer)
 */
export function getExplorerAddressUrl(address: string, chainId?: string): string {
  const baseUrl = resolveExplorerBase(chainId);
  return `${baseUrl}/address/${address}`;
}

/**
 * Get Explorer URL for an object
 * @param objectId Object ID
 * @param chainId Optional chain ID (defaults to Nasun explorer)
 */
export function getExplorerObjectUrl(objectId: string, chainId?: string): string {
  const baseUrl = resolveExplorerBase(chainId);
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
