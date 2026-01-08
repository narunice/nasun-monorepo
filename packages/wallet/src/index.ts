/**
 * @nasun/wallet - Nasun Wallet Core Package
 *
 * Usage:
 * ```tsx
 * import { useWallet, useBalance, configureWallet } from '@nasun/wallet';
 *
 * // Configure wallet (optional, defaults to Nasun Devnet)
 * configureWallet({
 *   rpcUrl: 'https://rpc.devnet.nasun.io',
 *   faucetUrl: 'https://faucet.devnet.nasun.io',
 * });
 *
 * // Use wallet hooks
 * const { status, account, createWallet, unlockWallet } = useWallet();
 * const { data: balance } = useBalance();
 *
 * // Multi-token support
 * import { registerToken, useMultiBalance } from '@nasun/wallet';
 *
 * registerToken({ symbol: 'NBTC', name: 'NBTC', decimals: 8, type: '0x...' });
 * const { data: balances } = useMultiBalance();
 * ```
 */

// Hooks
export {
  useWallet,
  useWalletStatus,
  useWalletAccount,
  useWalletLoading,
  // Security hooks
  useSecuritySettings,
  initializeAutoLock,
  cleanupAutoLock,
} from './hooks/useWallet';

export {
  useBalance,
  useRefreshBalance,
  useInvalidateBalance,
} from './hooks/useBalance';

export { useTransaction } from './hooks/useTransaction';
export { useTokenTransaction } from './hooks/useTokenTransaction';

// Multi-token hooks
export {
  useMultiBalance,
  useTokenBalance,
  useNativeBalance,
  useRefreshMultiBalance,
  useInvalidateMultiBalance,
} from './hooks/useMultiBalance';
export type { UseMultiBalanceOptions } from './hooks/useMultiBalance';

// Types
export type {
  WalletStatus,
  WalletState,
  WalletActions,
  WalletAccount,
  WalletContextType,
  EncryptedKeystore,
  TransactionRequest,
  TransactionResult,
  FaucetResponse,
  BalanceInfo,
  WalletConfig,
  // Multi-token types
  TokenConfig,
  TokenBalance,
  MultiTokenBalanceInfo,
  // Security types
  SecuritySettings,
  // Network types
  NetworkType,
  NetworkInfo,
} from './types';

// Security defaults
export { DEFAULT_SECURITY_SETTINGS, LOCKOUT_TIERS, DEFAULT_UNLOCK_ATTEMPT_STATE } from './types';

// Rate Limiting Types
export type { UnlockAttemptState, LockoutTier } from './types';

// Rate Limiting Utilities
export {
  isLockedOut,
  getLockoutRemainingMs,
  getLockoutInfo,
  getUnlockAttemptState,
  resetUnlockAttempts,
} from './core/rate-limit';

// Address Book (Security Phase 2)
export { useAddressBook, useAddressStatus } from './hooks/useAddressBook';

// Address Book Types
export type { AddressBookEntry, AddressBook } from './types';

// Transaction Simulation Types
export type { TransactionSimulation, BalanceChange } from './types';

// SUI Utilities
export {
  configureWallet,
  getWalletConfig,
  getSuiClient,
  getBalance,
  formatBalance,
  parseAmount,
  isValidAddress,
  shortenAddress,
  // Multi-token utilities
  getAllBalances,
  getTokenBalance,
  // Session persistence utilities
  isSessionPersistEnabled,
  saveSessionPassword,
  getSessionPassword,
  clearSessionPassword,
  // Explorer URL utilities
  getExplorerTxUrl,
  getExplorerAddressUrl,
  getExplorerObjectUrl,
  // Transaction simulation
  simulateTransaction,
} from './sui/client';

export {
  requestFaucet,
  checkFaucetAvailable,
} from './sui/faucet';

// Token Registry
export {
  NATIVE_TOKEN,
  DEVNET_TOKENS,
  registerToken,
  registerTokens,
  getToken,
  getTokenByType,
  getAllTokens,
  isTokenRegistered,
  clearTokens,
} from './config/tokens';

// Network Configuration
export {
  NETWORKS,
  getNetworkInfo,
  getEnabledNetworks,
  hasNetworkFaucet,
  detectNetworkType,
} from './config/networks';

// Network Hook
export { useNetwork } from './hooks/useNetwork';
export type { UseNetworkResult } from './hooks/useNetwork';

// Crypto utilities
export {
  generateMnemonicPhrase,
  isValidMnemonic,
  // Security utilities
  secureZero,
  secureZeroString,
} from './core/crypto';

// NFT Hooks
export {
  useNFTs,
  useRefreshNFTs,
  useInvalidateNFTs,
} from './hooks/useNFTs';
export type { UseNFTsOptions, UseNFTsResult } from './hooks/useNFTs';

export { useNFTTransfer } from './hooks/useNFTTransfer';

// NFT Types
export type {
  NFTDisplay,
  NFTInfo,
  NFTQueryOptions,
  NFTQueryResult,
  NFTTransferRequest,
} from './types/nft';

// NFT Utilities
export {
  getOwnedNFTs,
  getNFT,
  buildNFTTransferTransaction,
  getCollectionFromType,
  getNFTImageUrl,
  buildDisplayFromContent,
} from './sui/nft';

// Staking Hooks
export {
  useValidators,
  useValidator,
  useRefreshValidators,
} from './hooks/useValidators';
export type { UseValidatorsOptions, UseValidatorsResult } from './hooks/useValidators';

export {
  useStaking,
  useRefreshStaking,
  useInvalidateStaking,
} from './hooks/useStaking';
export type { UseStakingOptions, UseStakingResult } from './hooks/useStaking';

export { useStakeTransaction } from './hooks/useStakeTransaction';

// Staking Types
export type {
  ValidatorInfo,
  StakeStatus,
  StakeInfo,
  DelegatedStake,
  StakingSummary,
  StakeRequest,
  UnstakeRequest,
  StakeTransactionResult,
} from './types/staking';

// Staking Utilities
export {
  getValidators,
  getValidator,
  getStakes,
  calculateStakingSummary,
  buildStakeTransaction,
  buildUnstakeTransaction,
  formatApy,
  formatStakedAmount,
} from './sui/staking';

// ============================================
// zkLogin (Smart Account v2)
// ============================================

// zkLogin Store (Zustand)
export { useZkLoginStore } from './stores/zkLoginStore';

// zkLogin Hooks
export {
  useZkLogin,
  useZkLoginCallback,
  useZkLoginUser,
  initZkLogin,
} from './hooks/useZkLogin';
export type { UseZkLoginOptions, UseZkLoginResult } from './hooks/useZkLogin';

// zkLogin Types
export type {
  ZkLoginProvider,
  OAuthConfig,
  ZkLoginSession,
  ZkLoginProof,
  ZkLoginState,
  SaltResponse,
  ProverRequest,
  ProverResponse,
  ZkLoginConfig,
  ZkLoginErrorType,
} from './types/zklogin';
export { ZkLoginError } from './types/zklogin';

// zkLogin Utilities
export {
  configureZkLogin,
  getZkLoginConfig,
  createZkLoginSession,
  getZkLoginSession,
  clearZkLoginSession,
  getZkLoginState,
  saveZkLoginState,
  clearZkLoginState,
  buildOAuthUrl,
  parseJwt,
  validateJwt,
  detectProvider,
  fetchSalt,
  deriveAddress,
  computeAddressSeed,
  fetchZkProof,
  signWithZkLogin,
  startZkLogin,
  completeZkLogin,
  isZkLoginSessionValid,
  disconnectZkLogin,
} from './core/zklogin';

// ============================================
// Passkey Authentication (Phase 9.6)
// ============================================

// Passkey Hooks
export { usePasskey, hasPasskeyWallet } from './hooks/usePasskey';
export type { UsePasskeyOptions, UsePasskeyResult } from './hooks/usePasskey';

// Passkey Types
export type {
  PasskeyCredential,
  PasskeyRegistrationOptions,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResult,
  PasskeyAuthenticationResult,
  PasskeyWalletState,
  PasskeyErrorType,
} from './types/passkey';
export { PasskeyError, isWebAuthnSupported, isPlatformAuthenticatorAvailable } from './types/passkey';

// Passkey Utilities
export {
  registerPasskey,
  authenticateWithPasskey,
  createPasskeyWallet,
  unlockPasskeyWallet,
  getPasskeyWallet,
  savePasskeyWallet,
  clearPasskeyWallet,
  addCredentialToWallet,
  removeCredentialFromWallet,
  updateCredentialLastUsed,
} from './core/passkey';
