/**
 * Custom ERC-20 Token Storage
 *
 * Manages user-added ERC-20 tokens in localStorage.
 * Merges with known tokens from erc20-tokens.ts.
 */

import type { ERC20TokenConfig } from '../types/portfolio';
import { getKnownERC20Tokens } from './erc20-tokens';

const STORAGE_KEY = 'nasun_custom_erc20_tokens';

/** Validate a single token config object from untrusted storage */
function isValidTokenConfig(t: unknown): t is ERC20TokenConfig {
  if (typeof t !== 'object' || t === null) return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.address === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(obj.address) &&
    typeof obj.symbol === 'string' &&
    obj.symbol.length > 0 &&
    obj.symbol.length <= 12 &&
    typeof obj.name === 'string' &&
    obj.name.length <= 64 &&
    typeof obj.decimals === 'number' &&
    Number.isInteger(obj.decimals) &&
    obj.decimals >= 0 &&
    obj.decimals <= 18
  );
}

/** Get user-added custom ERC-20 tokens for a chain */
export function getCustomERC20Tokens(chainId: string): ERC20TokenConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
    const all = parsed as Record<string, unknown>;
    const chain = all[chainId];
    if (!Array.isArray(chain)) return [];
    return chain.filter(isValidTokenConfig);
  } catch {
    return [];
  }
}

/** Add a custom ERC-20 token for a chain */
export function addCustomERC20Token(chainId: string, token: ERC20TokenConfig): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: Record<string, ERC20TokenConfig[]> = raw ? JSON.parse(raw) : {};
    const chain = all[chainId] ?? [];

    // Prevent duplicates (case-insensitive address match)
    const exists = chain.some(
      (t) => t.address.toLowerCase() === token.address.toLowerCase()
    );
    if (exists) return;

    chain.push(token);
    all[chainId] = chain;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore localStorage errors
  }
}

/** Remove a custom ERC-20 token for a chain */
export function removeCustomERC20Token(chainId: string, address: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const all: Record<string, ERC20TokenConfig[]> = JSON.parse(raw);
    const chain = all[chainId] ?? [];
    all[chainId] = chain.filter(
      (t) => t.address.toLowerCase() !== address.toLowerCase()
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore localStorage errors
  }
}

/** Get all ERC-20 tokens for a chain (known + custom, deduplicated) */
export function getAllERC20Tokens(chainId: string): ERC20TokenConfig[] {
  const known = getKnownERC20Tokens(chainId);
  const custom = getCustomERC20Tokens(chainId);

  // Merge: known first, then custom (skip duplicates)
  const knownAddresses = new Set(known.map((t) => t.address.toLowerCase()));
  const unique = custom.filter(
    (t) => !knownAddresses.has(t.address.toLowerCase())
  );

  return [...known, ...unique];
}
