/**
 * EVM Wallet Utilities
 *
 * Handles EVM wallet creation and key derivation from mnemonic.
 * Uses BIP-44 derivation path for Ethereum (m/44'/60'/0'/0/0).
 */

import {
  mnemonicToAccount,
  privateKeyToAccount,
  type PrivateKeyAccount,
  type HDAccount,
} from 'viem/accounts';
import { toHex } from 'viem';

/**
 * Derive EVM account from mnemonic phrase
 *
 * @param mnemonic - BIP-39 mnemonic phrase
 * @param index - Account index (default: 0)
 * @returns HDAccount with signing capabilities
 */
export function deriveEVMAccount(
  mnemonic: string,
  index: number = 0
): HDAccount {
  const path = `m/44'/60'/0'/0/${index}` as const;
  return mnemonicToAccount(mnemonic, { path });
}

/**
 * Create EVM account from private key
 *
 * @param privateKey - Hex-encoded private key (with or without 0x prefix)
 * @returns PrivateKeyAccount with signing capabilities
 */
export function createEVMAccountFromPrivateKey(
  privateKey: string
): PrivateKeyAccount {
  const key = privateKey.startsWith('0x')
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);
  return privateKeyToAccount(key);
}

/**
 * Get the private key from an HDAccount (for storage)
 *
 * Note: This extracts the private key for encrypted storage.
 * The key should be encrypted before persisting.
 */
export function getPrivateKeyFromHDAccount(account: HDAccount): `0x${string}` {
  // HDAccount exposes getHdKey() which contains the private key
  const hdKey = account.getHdKey();
  if (!hdKey.privateKey) {
    throw new Error('Could not extract private key from HD account');
  }
  return toHex(hdKey.privateKey);
}

/**
 * Validate an Ethereum address
 *
 * @param address - Address to validate
 * @returns true if valid Ethereum address
 */
export function isValidEVMAddress(address: string): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Shorten an EVM address for display
 *
 * @param address - Full address
 * @param chars - Number of characters to show on each side (default: 4)
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function shortenEVMAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length < chars * 2 + 4) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * EVM wallet state stored in localStorage
 */
export interface EVMWalletState {
  /** Encrypted private key */
  encryptedPrivateKey: string;
  /** Wallet address */
  address: `0x${string}`;
  /** Salt for encryption */
  salt: string;
  /** IV for AES encryption */
  iv: string;
  /** Creation timestamp */
  createdAt: number;
}

const EVM_WALLET_KEY = 'nasun_evm_wallet';

/**
 * Save EVM wallet state to localStorage
 */
export function saveEVMWalletState(state: EVMWalletState): void {
  localStorage.setItem(EVM_WALLET_KEY, JSON.stringify(state));
}

/**
 * Load EVM wallet state from localStorage
 */
export function loadEVMWalletState(): EVMWalletState | null {
  const data = localStorage.getItem(EVM_WALLET_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as EVMWalletState;
  } catch {
    return null;
  }
}

/**
 * Clear EVM wallet state from localStorage
 */
export function clearEVMWalletState(): void {
  localStorage.removeItem(EVM_WALLET_KEY);
}

/**
 * Check if EVM wallet exists in localStorage
 */
export function hasEVMWallet(): boolean {
  return localStorage.getItem(EVM_WALLET_KEY) !== null;
}
