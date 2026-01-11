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
  // Token faucet types
  TokenFaucetHandler,
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
  // Responsive address display
  shortenAddressResponsive,
  DEFAULT_ADDRESS_DISPLAY,
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

// Address display types
export type { AddressDisplayConfig } from './sui/client';

export {
  requestFaucet,
  checkFaucetAvailable,
  nativeFaucetHandler,
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
  // Token faucet registry
  registerTokenFaucet,
  getTokenFaucet,
  hasTokenFaucet,
  clearTokenFaucets,
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

// Token Faucet Hook
export { useTokenFaucet } from './hooks/useTokenFaucet';
export type { UseTokenFaucetResult } from './hooks/useTokenFaucet';

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

// ============================================
// Signer Abstraction Layer (P1)
// ============================================

// Signer Hook
export {
  useSigner,
  useSignerAddress,
  useIsSignerConnected,
} from './hooks/useSigner';
export type { UseSignerResult } from './hooks/useSigner';

// Signer Types
export type {
  SignerType,
  SignerAdapter,
  SignerCapabilities,
  SignatureResult,
  SignerEvent,
  SignerEventListener,
} from './core/signer/types';
export { DEFAULT_CAPABILITIES } from './core/signer/types';

// Signer Manager
export { SignerManager } from './core/signer/SignerManager';
export type { SignerManagerSnapshot } from './core/signer/SignerManager';

// Signer Adapters
export { LocalSigner, ZkLoginSigner, EVMSigner } from './core/signer/adapters';

// ============================================
// Multi-Chain Support (P1)
// ============================================

// Chain Configuration
export {
  CHAINS,
  DEFAULT_CHAIN_ID,
  getChain,
  getAllChains,
  getEVMChains,
  getMoveChains,
  getChainByEvmId,
} from './config/chains';
export type {
  ChainType,
  ChainConfig,
  NativeCurrency,
  AAConfig,
} from './config/chains';

// Chain Hook
export {
  useChain,
  useChainStore,
  useCurrentChainId,
  useIsEVMChain,
  useIsMoveChain,
} from './hooks/useChain';
export type { UseChainResult } from './hooks/useChain';

// EVM Balance Hook
export {
  useEVMBalance,
  useRefreshEVMBalance,
} from './hooks/useEVMBalance';
export type {
  EVMBalance,
  UseEVMBalanceResult,
} from './hooks/useEVMBalance';

// EVM Transaction Hook
export { useEVMTransaction } from './hooks/useEVMTransaction';
export type {
  EVMTransferRequest,
  EVMContractCallRequest,
  EVMTransactionResult,
  UseEVMTransactionResult,
} from './hooks/useEVMTransaction';

// EVM Utilities
export {
  // Client
  getEVMClient,
  getViemChain,
  clearClientCache,
  getEVMClientById,
  // Wallet
  deriveEVMAccount,
  createEVMAccountFromPrivateKey,
  getPrivateKeyFromHDAccount,
  isValidEVMAddress,
  shortenEVMAddress,
  // Keystore
  createEVMWalletFromMnemonic,
  createEVMWalletFromPrivateKey,
  unlockEVMWallet,
  getStoredEVMAddress,
  deleteEVMWallet,
  hasEVMWallet,
} from './core/evm';
export type { EVMWalletState } from './core/evm';

// ============================================
// WalletConnect v2 (P1)
// ============================================

// WalletConnect Hook
export {
  useWalletConnect,
  useWalletConnectSessionCount,
  useWalletConnectInitialized,
} from './hooks/useWalletConnect';
export type { UseWalletConnectResult } from './hooks/useWalletConnect';

// WalletConnect Client
export { WalletConnectClient } from './core/walletconnect';

// WalletConnect Handlers
export {
  handleWCRequest,
  getRequestDescription,
} from './core/walletconnect';

// WalletConnect Namespaces
export {
  EIP155_NAMESPACE,
  SUI_NAMESPACE,
  EVM_METHODS,
  SUI_METHODS,
  buildEIP155Namespace,
  buildSuiNamespace,
  buildSessionNamespaces,
  canSatisfyProposal,
  getChainIdFromCAIP2,
  isEVMChainId,
  isSuiChainId,
  getAllSupportedChainIds,
} from './core/walletconnect';

// WalletConnect Types
export type {
  WalletConnectConfig,
  WCMethod,
  EVMMethod,
  SuiMethod,
  WCRequest,
  EVMTransactionParams,
  SuiTransactionParams,
  WalletConnectState,
  WCEvent,
  WCEventListener,
  DAppMetadata,
} from './core/walletconnect';

export {
  getDAppMetadata,
  parseChainId,
  formatAccountId,
} from './core/walletconnect';

// ============================================
// Auto-register Token Faucets (Devnet)
// ============================================
// This ensures all apps using @nasun/wallet get faucet support for all tokens
// without needing to manually call registerTokenFaucet()

import { nativeFaucetHandler } from './sui/faucet';
import { nbtcFaucetHandler, nusdcFaucetHandler } from './sui/tokenFaucet';
import { registerTokenFaucet } from './config/tokens';

// NASUN - Native token faucet (HTTP API)
registerTokenFaucet('NASUN', nativeFaucetHandler);

// NBTC/NUSDC - Token faucet (Move contract, requires signing)
registerTokenFaucet('NBTC', nbtcFaucetHandler);
registerTokenFaucet('NUSDC', nusdcFaucetHandler);
