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
  // Mnemonic backup (module-level, survives component unmount)
  getPendingBackupMnemonic,
  clearPendingBackupMnemonic,
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

// Wallet Label (display alias)
export { useWalletLabel, useWalletLabelStore, isValidWalletLabel, MAX_LABEL_LENGTH } from './hooks/useWalletLabel';

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
  NFTSortBy,
} from './types/nft';

export { DEFAULT_NFT_SORT } from './types/nft';

// NFT Utilities
export {
  getOwnedNFTs,
  getNFT,
  buildNFTTransferTransaction,
  getCollectionFromType,
  getNFTImageUrl,
  resolveMediaUrl,
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
export { LocalSigner, ZkLoginSigner, EVMSigner, NsaSigner } from './core/signer/adapters';

// ============================================
// Nasun Smart Account (NSA)
// ============================================

// NSA Hooks
export { useNasunSmartAccount } from './hooks/useNasunSmartAccount';
export type { UseNasunSmartAccountResult } from './hooks/useNasunSmartAccount';
export { useNsaRecovery } from './hooks/useNsaRecovery';
export type { UseNsaRecoveryResult } from './hooks/useNsaRecovery';
export { useNsaBackup } from './hooks/useNsaBackup';
export type { UseNsaBackupResult } from './hooks/useNsaBackup';

// NSA Store
export { useNsaStore } from './stores/nsaStore';

// NSA Core Module
export {
  fetchAccountState,
  fetchRecoveryRequest,
  findAccountsForAddress,
  fetchSignerProposal,
  findActiveProposalsForAccount,
  findProposalsForPendingSigner,
  buildCreateAccount,
  buildDeposit,
  buildWithdraw,
  buildProposeAddSigner,
  buildAcceptSignerProposal,
  buildCancelSignerProposal,
  buildDeclineSignerProposal,
  buildRemoveSigner,
  buildSetGuardians,
  buildUpdateThreshold,
  buildInitiateRecovery,
  buildApproveRecovery,
  buildExecuteRecovery,
  buildCancelRecovery,
  createBackup,
  restoreFromBackup,
  validateBackupFormat,
  computeRecoveryStatus,
  getTimelockRemainingMs,
  formatTimelockRemaining,
  hasApproved,
  getRemainingApprovalsNeeded,
  canExecuteRecovery,
  canCancelRecovery,
  computeTimelockEnd,
  validateGuardianConfig,
} from './core/nsa';

// NSA Types
export type {
  NsaSignerType,
  NsaSignerInfo,
  NsaAccountState,
  NsaSignerProposal,
  NsaRecoveryRequestState,
  RecoveryTier,
  NsaBackupPackage,
  NsaRecoveryStatus,
  NsaErrorType,
  NsaBalanceEntry,
} from './types/nsa';
export { NsaError, NSA_PACKAGE_ID, NSA_TIMELOCK_MS, NSA_SIGNER_TYPE_MAP } from './types/nsa';

// NSA Internal Types
export type {
  CreateAccountParams,
  DepositParams,
  WithdrawParams,
  ProposeAddSignerParams,
  AcceptSignerProposalParams,
  CancelSignerProposalParams,
  DeclineSignerProposalParams,
  RemoveSignerParams,
  SetGuardiansParams,
  UpdateThresholdParams,
  InitiateRecoveryParams,
  ApproveRecoveryParams,
  ExecuteRecoveryParams,
  CancelRecoveryParams,
} from './core/nsa';

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

// EVM Gas Estimate Hook
export { useEVMGasEstimate } from './hooks/useEVMGasEstimate';
export type {
  EVMGasEstimate,
  UseEVMGasEstimateOptions,
  UseEVMGasEstimateResult,
} from './hooks/useEVMGasEstimate';

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
// ERC-4337 Account Abstraction (P1)
// ============================================

// Smart Account Hook
export {
  useSmartAccount,
  useSmartAccountAddress,
  useIsSmartAccountDeployed,
} from './hooks/useSmartAccount';
export type { UseSmartAccountResult } from './hooks/useSmartAccount';

// Smart Account Signer
export { SmartAccountSigner } from './core/signer/adapters/SmartAccountSigner';

// AA Core Utilities
export {
  // Bundler
  getBundlerClient,
  getEntryPoint,
  getDefaultEntryPoint,
  clearBundlerClients,
  isBundlerReachable,
  // Paymaster
  getPaymasterClient,
  clearPaymasterClients,
  hasPaymaster,
  // Account
  getSimpleSmartAccount,
  getSmartAccountAddress,
  isAccountDeployed,
  getSmartAccountState,
  clearAccountCache,
  getCachedAccount,
} from './core/aa';

// AA Types
export type {
  SmartAccountType,
  SmartAccountState,
  SmartAccountTxRequest,
  BatchCall,
  PaymasterMode,
  UserOperationReceipt,
  BundlerConfig,
  PaymasterConfig,
  SmartAccountOptions,
  UserOperationGasEstimate,
  // P2: Gasless by Default types
  GasCostEstimate,
  PaymasterStrategy,
  SponsorshipCondition,
  PaymasterContext,
  // P2: Session Key types
  SessionKeyPermission,
  SessionKeyConfig,
  SessionKeyState,
  SessionKeyValidation,
} from './core/aa/types';

// P2: Gas Utilities
export {
  getGasPrices,
  formatGasEstimate,
} from './core/aa/bundler';

// P2: Session Key Manager
export {
  SessionKeyManager,
  createERC20TransferPermission,
  createNativeTransferPermission,
  createContractPermission,
} from './core/aa/session-keys';

// P2: Session Key Signer
export { SessionKeySigner } from './core/signer/adapters/SessionKeySigner';

// P2: Gasless Transaction Hook
export {
  useGaslessTransaction,
  useIsGaslessAvailable,
} from './hooks/useGaslessTransaction';
export type { UseGaslessTransactionResult } from './hooks/useGaslessTransaction';

// P2: Session Key Hook
export {
  useSessionKey,
  useActiveSessionCount,
  useSessionKeyValidation,
} from './hooks/useSessionKey';
export type { UseSessionKeyResult } from './hooks/useSessionKey';

// ============================================
// Auto-register Token Faucets (Devnet)
// ============================================
// This ensures all apps using @nasun/wallet get faucet support for all tokens
// without needing to manually call registerTokenFaucet()

import { nativeFaucetHandler } from './sui/faucet';
import { nbtcFaucetHandler, nusdcFaucetHandler } from './sui/tokenFaucet';
import { registerTokenFaucet } from './config/tokens';

// NSN - Native token faucet (HTTP API)
registerTokenFaucet('NSN', nativeFaucetHandler);

// NBTC/NUSDC - Token faucet (Move contract, requires signing)
registerTokenFaucet('NBTC', nbtcFaucetHandler);
registerTokenFaucet('NUSDC', nusdcFaucetHandler);

// ============================================
// Nasun Link v2 (P1)
// ============================================

// Nasun Link Hooks
export {
  useNasunLink,
  useClaimFromUrl,
  useLinkStatus,
  useLinkBalance,
} from './hooks/useNasunLink';
export type { UseNasunLinkResult } from './hooks/useNasunLink';

// Nasun Link Utilities
export {
  // Generator
  createLink,
  createBatchLinks,
  estimateLinkCreationGas,
  validateLinkConfig,
  // Claim
  claimLink,
  validateClaim,
  parseLinkUrl,
  buildLinkUrl,
  checkLinkBalance,
  getClaimStatus,
  // Crypto
  generateEphemeralKeypair,
  generateSecret,
  generateLinkId,
  encryptPayload,
  decryptPayload,
  recoverKeypair,
  hashPassword,
  verifyPassword,
} from './core/link';

// Nasun Link Types
export type {
  LinkType,
  LinkStatus,
  LinkCoinType,
  LinkConfig,
  SerializableLinkConfig,
  LinkData,
  LinkURL,
  ClaimResult,
  ClaimValidation,
  ClaimCondition,
  CreateLinkRequest,
  CreateLinkResponse,
  LinkStorage,
} from './core/link/types';

export { serializeLinkConfig, deserializeLinkConfig } from './core/link/types';

// ============================================
// Payment UX (P2)
// ============================================

// Payment Hooks
export { usePayment, useCanPay } from './hooks/usePayment';
export type { UsePaymentOptions, UsePaymentResult } from './hooks/usePayment';

export { usePaymentIntent } from './hooks/usePaymentIntent';
export type { UsePaymentIntentResult, PaymentWCRequest } from './hooks/usePaymentIntent';

export { usePaymentLink, usePaymentLinkFromUrl } from './hooks/usePaymentLink';
export type { UsePaymentLinkOptions, UsePaymentLinkResult } from './hooks/usePaymentLink';

export { usePaymentQR, useQRCodeForUrl } from './hooks/usePaymentQR';
export type { UsePaymentQROptions, UsePaymentQRResult } from './hooks/usePaymentQR';

// Payment Types
export type {
  PaymentChainType,
  PaymentIntentStatus,
  PaymentStatus,
  PaymentMetadata,
  PaymentIntent,
  MovePaymentRequest,
  EVMPaymentRequest,
  PaymentRequest,
  PaymentResult,
  PaymentLink,
  ParsedPaymentLink,
  PaymentValidationError,
  PaymentValidationWarning,
  RecipientStatus,
  PaymentValidation,
} from './core/payment/types';

export {
  DEFAULT_INTENT_TTL_MS,
  NASUN_COIN_TYPE,
  DEFAULT_TOKEN_SYMBOL,
  URL_PARAMS,
} from './core/payment/types';

// Payment Validation
export {
  isValidMoveChainAddress,
  // Note: isValidEVMAddress already exported from ./core/evm
  isValidPaymentAddress,
  validateAmount,
  checkSufficientBalance,
  detectWarnings,
  validateMovePayment,
  validateEVMPayment,
  validatePayment,
  formatValidationErrors,
  formatValidationWarnings,
} from './core/payment/validation';

// Payment Link Utilities
export {
  buildPaymentUrl,
  generatePaymentLink,
  parsePaymentLink,
  parseCurrentUrl,
  intentToUrlParams,
  intentToRequest,
  parsedLinkToIntent,
  generateIntentId,
  encodePaymentData,
  decodePaymentData,
  formatPaymentLinkForSharing,
} from './core/payment/link';

// Payment QR Code Utilities
export type { QRCodeOptions, QRCodeResult } from './core/payment/qr';

export {
  generateQRCodeDataUrl,
  generateQRCodeSVG,
  generateQRCode,
  generatePaymentQRCode,
  isValidQRCodeContent,
  estimateQRVersion,
  getRecommendedQRSize,
} from './core/payment/qr';

// ============================================
// Ledger Integration (P2-3)
// ============================================

// Ledger Hook
export { useLedger, useIsLedgerActive } from './hooks/useLedger';
export type { UseLedgerResult } from './hooks/useLedger';

// Ledger Signer
export { LedgerSigner } from './core/signer/adapters/LedgerSigner';
export type { LedgerAccountOptions } from './core/signer/adapters/LedgerSigner';

// Ledger Types
export type {
  LedgerConnectionStatus,
  LedgerErrorCode,
  LedgerDeviceInfo,
  LedgerChainType,
  LedgerSignerOptions,
  LedgerAddressResult,
} from './core/ledger/types';

export {
  LedgerError,
  LEDGER_DERIVATION_PATHS,
} from './core/ledger/types';

// Ledger Transport Utilities
export {
  isWebHIDSupported,
  createTransport,
  closeTransport,
  parseLedgerError,
  getLedgerErrorMessage,
} from './core/ledger/transport';

// Ledger Chain Utilities
export {
  createSuiLedgerClient,
  deriveSuiAddress,
  getSuiAddress,
  signSuiTransaction,
  signSuiPersonalMessage,
} from './core/ledger/sui-ledger';

export {
  createEvmLedgerClient,
  getEvmAddress,
  signEvmTransaction,
  signEvmPersonalMessage,
  formatEvmSignature,
  parseVValue,
} from './core/ledger/evm-ledger';

// ============================================
// ZK-ID Module (P2-4)
// ============================================

// ZK-ID Types
export type {
  ZKClaimType,
  AgeThreshold,
  KYCLevel,
  CredentialSource,
  ZKProofPoints,
  NullifierInput,
  ClaimContext,
  ZKIDProof,
  ZKIDClaim,
  ProverType,
  ProverCapabilities,
  ZKProofInput,
  ZKProofParams,
  ZKProofOutput,
  ZKProver,
  ZKIDVerificationResult,
  NullifierRegistry,
  ZKIDConfig,
  ZKClaimRequirement,
  ZKIDProofEntry,
  ZKIDLoadingState,
  ZKIDErrorState,
  ZKIDErrorCode,
} from './core/zkid';

export { ZKIDError } from './core/zkid';

// ZK-ID Prover
export {
  configureZKID,
  getZKIDConfig,
  generateAgeProof,
  generateKYCProof,
  generateUniqueProof,
  createRemoteProver,
  createMockProver,
  getProver,
} from './core/zkid';

// ZK-ID Nullifier
export {
  calculateNullifier,
  isValidNullifier,
  createNullifierInput,
  InMemoryNullifierRegistry,
  APIBackedNullifierRegistry,
  NULLIFIER_DOMAINS,
  parseDomain,
} from './core/zkid';

// ZK-ID Verifier
export {
  verifyProof,
  validateProofStructure,
  validateContext,
  verifyAgainstCondition,
  type ZKIDConditionCheck,
  setDefaultNullifierRegistry,
  getDefaultNullifierRegistry,
  registerNullifier,
  isProofExpired,
  getProofRemainingTime,
  proofExpiresWithin,
} from './core/zkid';

// ZK-ID Credential
export type {
  RawCredential,
  CredentialData,
  EncryptedCredential,
  CredentialEntry,
} from './core/zkid';

export {
  encryptCredential,
  decryptCredential,
  isCredentialExpired as isZKIDCredentialExpired,
  getCredentialRemainingTime as getZKIDCredentialRemainingTime,
  validateRawCredential,
  getStoredCredentials as getZKIDCredentials,
  storeCredential as storeZKIDCredential,
  getCredentialById as getZKIDCredentialById,
  getCredentialsByType as getZKIDCredentialsByType,
  updateCredentialLastUsed as updateZKIDCredentialLastUsed,
  removeCredential as removeZKIDCredential,
  removeExpiredCredentials as removeExpiredZKIDCredentials,
  clearAllCredentials as clearAllZKIDCredentials,
  generateCredentialId as generateZKIDCredentialId,
} from './core/zkid';

// ZK-ID Store
export {
  useZKIDStore,
  useZKIDProof,
  useZKIDLoading,
  useZKIDError,
  useZKIDAnyLoading,
  useZKIDAllProofs,
} from './stores/zkidStore';

// ZK-ID Hook
export { useZKID, initZKID, type UseZKIDOptions, type UseZKIDResult } from './hooks/useZKID';

// ZK-ID Link Integration
export {
  validateClaimWithZKID,
  hasZKIDConditions,
  getZKIDConditions,
} from './core/link/claim';

export type { ZKIDAgeThreshold, ZKIDKYCLevel } from './core/link/types';

// ============================================
// Clear Signing (P2-5)
// ============================================

// Clear Signing Types
export type {
  TxChainType,
  TxCategory,
  TxRiskLevel,
  DecodedTx,
  MoveDecodedTx,
  EVMDecodedTx,
  MoveCall,
  MoveArg,
  MoveArgType,
  EVMCall,
  EVMParam,
  TokenBalanceChange,
  NFTChange,
  ApprovalChange,
  SimulationResult,
  RiskFactor,
  RiskCategory,
  RiskAssessment,
  TxSummary,
  TxAction,
  TxActionType,
  TxActionIcon,
  ClearSigningRequest,
  ClearSigningResponse,
  KnownContract,
  ContractType,
  ContractRegistry,
  ClearSigningConfig,
  ClearSigningErrorCode,
} from './core/clear-signing';

export { ClearSigningError, DEFAULT_CLEAR_SIGNING_CONFIG } from './core/clear-signing';

// Clear Signing Decoder
export {
  decodeTx,
  configureClearSigning,
  getClearSigningConfig,
  bytesToHex,
  hexToBytes,
  bytesToBigInt,
  decodeMoveArg,
  decodeAddress,
  isValidAddress as isClearSigningValidAddress,
  shortenAddress as clearSigningShortenAddress,
} from './core/clear-signing';

// Clear Signing Formatter
export {
  formatTransaction,
  assessRisk,
  setFormatterConfig,
  formatAmount,
  formatGasCost,
  formatUSD,
  formatBalanceChange,
  getActionIconClass,
  getRiskLevelClass,
  getCategoryIconClass,
} from './core/clear-signing';

// ============================================
// Transaction History (P2-6)
// ============================================

// Transaction History Hooks
export {
  useTransactionHistory,
  useRefreshTransactionHistory,
  useInvalidateTransactionHistory,
} from './hooks/useTransactionHistory';
export type {
  UseTransactionHistoryOptions,
  UseTransactionHistoryResult,
} from './hooks/useTransactionHistory';

// Transaction History Types
export type {
  TransactionDirection,
  TokenTransfer,
  TransactionHistoryItem,
  TransactionHistoryOptions,
  TransactionHistoryResult,
} from './types';

// ============================================
// Portfolio (P3)
// ============================================

// Portfolio Hooks
export {
  usePortfolio,
  useRefreshPortfolio,
  usePortfolioTotalValue,
  usePortfolio24hChange,
  configurePortfolio,
  getPortfolioConfig,
} from './hooks/usePortfolio';

// Portfolio Types
export type {
  TokenPrice,
  PriceProvider,
  TokenAsset,
  ChainPortfolio,
  PortfolioSummary,
  ERC20TokenConfig,
  PortfolioConfig,
  UsePortfolioOptions,
  UsePortfolioResult,
} from './types/portfolio';

// Price Provider
export { DefaultPriceProvider } from './core/portfolio/price-provider';
export type { DefaultPriceProviderOptions } from './core/portfolio/price-provider';

// ERC-20 Utilities
export {
  getERC20Balance,
  getERC20Balances,
  getERC20Metadata,
} from './core/evm/erc20';
export type { ERC20Balance } from './core/evm/erc20';
