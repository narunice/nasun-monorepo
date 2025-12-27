/**
 * Pado Wallet Module
 * Embedded wallet for Pado trading app
 */

// Types
export type {
  WalletStatus,
  EncryptedKeystore,
  WalletAccount,
  WalletState,
  WalletActions,
  WalletContextType,
  TransactionRequest,
  TransactionResult,
  FaucetResponse,
  BalanceInfo,
} from './types/wallet';

// Hooks
export {
  useWallet,
  useWalletStatus,
  useWalletAccount,
  useWalletLoading,
} from './hooks/useWallet';

// Keystore utilities
export {
  hasKeystore,
  loadKeystore,
  saveKeystore,
  deleteKeystore,
  getStoredAddress,
  createAndSaveWallet,
  createWalletWithMnemonic,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  unlockKeystore,
} from './lib/keystore';

// Crypto utilities
export {
  generateKeypair,
  generateMnemonicPhrase,
  isValidMnemonic,
  keypairFromMnemonic,
  keypairFromSecretKey,
  getAddressFromKeypair,
  getPublicKeyFromKeypair,
  getSecretKeyFromKeypair,
  encryptPrivateKey,
  decryptPrivateKey,
} from './lib/crypto';
