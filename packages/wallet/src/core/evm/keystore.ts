/**
 * EVM Keystore
 *
 * Encrypted storage for EVM private keys.
 * Parallels the Sui keystore but for EVM chains.
 */

import type { PrivateKeyAccount } from 'viem/accounts';
import {
  deriveEVMAccount,
  createEVMAccountFromPrivateKey,
  getPrivateKeyFromHDAccount,
  saveEVMWalletState,
  loadEVMWalletState,
  clearEVMWalletState,
  hasEVMWallet,
  type EVMWalletState,
} from './wallet';
import { encryptPrivateKey, decryptPrivateKey, secureZeroString } from '../crypto';

/**
 * Create EVM wallet from mnemonic
 *
 * @param mnemonic - BIP-39 mnemonic phrase
 * @param password - Encryption password
 * @param accountIndex - HD account index (default: 0)
 * @returns EVM address
 */
export async function createEVMWalletFromMnemonic(
  mnemonic: string,
  password: string,
  accountIndex: number = 0
): Promise<`0x${string}`> {
  const account = deriveEVMAccount(mnemonic, accountIndex);
  let privateKey: string | null = null;

  try {
    privateKey = getPrivateKeyFromHDAccount(account);

    // Encrypt private key
    const { encrypted, iv, salt } = await encryptPrivateKey(privateKey, password);

    // Save to localStorage
    const state: EVMWalletState = {
      encryptedPrivateKey: encrypted,
      address: account.address,
      salt,
      iv,
      createdAt: Date.now(),
    };

    saveEVMWalletState(state);

    return account.address;
  } finally {
    if (privateKey) {
      secureZeroString(privateKey);
    }
  }
}

/**
 * Create EVM wallet from private key
 *
 * @param privateKey - Hex private key (with or without 0x prefix)
 * @param password - Encryption password
 * @returns EVM address
 */
export async function createEVMWalletFromPrivateKey(
  privateKey: string,
  password: string
): Promise<`0x${string}`> {
  const account = createEVMAccountFromPrivateKey(privateKey);
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

  try {
    // Encrypt private key
    const { encrypted, iv, salt } = await encryptPrivateKey(normalizedKey, password);

    // Save to localStorage
    const state: EVMWalletState = {
      encryptedPrivateKey: encrypted,
      address: account.address,
      salt,
      iv,
      createdAt: Date.now(),
    };

    saveEVMWalletState(state);

    return account.address;
  } finally {
    secureZeroString(normalizedKey);
  }
}

/**
 * Unlock EVM wallet and return account
 *
 * @param password - Decryption password
 * @returns PrivateKeyAccount with signing capabilities
 * @throws Error if wallet doesn't exist or password is invalid
 */
export async function unlockEVMWallet(password: string): Promise<PrivateKeyAccount> {
  const state = loadEVMWalletState();
  if (!state) {
    throw new Error('No EVM wallet found');
  }

  let privateKey: string | null = null;

  try {
    privateKey = await decryptPrivateKey(
      state.encryptedPrivateKey,
      state.iv,
      state.salt,
      password
    );

    const account = createEVMAccountFromPrivateKey(privateKey);

    // Verify address matches
    if (account.address.toLowerCase() !== state.address.toLowerCase()) {
      throw new Error('Address mismatch - keystore may be corrupted');
    }

    return account;
  } finally {
    if (privateKey) {
      secureZeroString(privateKey);
    }
  }
}

/**
 * Get stored EVM address (available when locked)
 */
export function getStoredEVMAddress(): `0x${string}` | null {
  const state = loadEVMWalletState();
  return state?.address ?? null;
}

/**
 * Delete EVM wallet
 */
export function deleteEVMWallet(): void {
  clearEVMWalletState();
}

// Re-export for convenience
export { hasEVMWallet };
