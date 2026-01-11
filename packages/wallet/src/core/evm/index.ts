/**
 * EVM Module
 *
 * Utilities for EVM chain interactions.
 */

export {
  getEVMClient,
  getViemChain,
  clearClientCache,
  getEVMClientById,
} from './client';

export {
  deriveEVMAccount,
  createEVMAccountFromPrivateKey,
  getPrivateKeyFromHDAccount,
  isValidEVMAddress,
  shortenEVMAddress,
  saveEVMWalletState,
  loadEVMWalletState,
  clearEVMWalletState,
  hasEVMWallet,
} from './wallet';
export type { EVMWalletState } from './wallet';

export {
  createEVMWalletFromMnemonic,
  createEVMWalletFromPrivateKey,
  unlockEVMWallet,
  getStoredEVMAddress,
  deleteEVMWallet,
} from './keystore';
