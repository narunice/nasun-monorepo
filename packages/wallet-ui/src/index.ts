/**
 * @nasun/wallet-ui - Nasun Wallet UI Components
 *
 * Usage:
 * ```tsx
 * import { WalletProvider, WalletConnect, BalanceDisplay } from '@nasun/wallet-ui';
 *
 * // App.tsx
 * <WalletProvider>
 *   <App />
 * </WalletProvider>
 *
 * // Header.tsx
 * <WalletConnect />
 * <BalanceDisplay compact />
 *
 * // Multi-token support
 * import { MultiBalanceDisplay, TokenSelector } from '@nasun/wallet-ui';
 *
 * <MultiBalanceDisplay tokens={['NSN', 'NBTC']} />
 * <TokenSelector value={token} onChange={setToken} />
 * ```
 */

// Connect components
export { WalletProvider } from './connect/WalletProvider';
export { WalletConnect } from './connect/WalletConnect';

// Balance components
export { BalanceDisplay } from './balance/BalanceDisplay';
export { FaucetButton } from './balance/FaucetButton';
export { TokenFaucetButton } from './balance/TokenFaucetButton';
export { MultiBalanceDisplay } from './balance/MultiBalanceDisplay';
export { TokenSelector } from './balance/TokenSelector';

// Transaction components
export { SendTransaction } from './transaction/SendTransaction';
export { TransactionHistoryPanel } from './transaction/TransactionHistoryPanel';

// Security components
export { MnemonicBackup } from './security/MnemonicBackup';
export { ImportWallet } from './security/ImportWallet';
export { ExportPrivateKey } from './security/ExportPrivateKey';
export { SecuritySettings } from './security/SecuritySettings';
export { SecurityProgress } from './security/SecurityProgress';
export type { SecurityProgressProps } from './security/SecurityProgress';

// NFT components
export { NFTCard } from './nft/NFTCard';
export { NFTGallery } from './nft/NFTGallery';
export { NFTDetail } from './nft/NFTDetail';
export { NFTTransfer } from './nft/NFTTransfer';

// Staking components
export { ValidatorList } from './staking/ValidatorList';
export { StakingStatus } from './staking/StakingStatus';
export { StakingPanel } from './staking/StakingPanel';

// Portfolio components
export { PortfolioPanel } from './portfolio/PortfolioPanel';
export type { PortfolioPanelProps } from './portfolio/PortfolioPanel';

// Nasun Link components
export { NasunLinkWizard } from './link/NasunLinkWizard';
export type { NasunLinkWizardProps } from './link/NasunLinkWizard';
export { LinkClaimPage } from './link/LinkClaimPage';
export type { LinkClaimPageProps } from './link/LinkClaimPage';
export { ReceivePanel } from './link/ReceivePanel';

// Advanced Mode components
export { AdvancedToggle } from './advanced/AdvancedToggle';
export type { AdvancedToggleProps } from './advanced/AdvancedToggle';
export { SessionKeyPanel } from './advanced/SessionKeyPanel';
export type { SessionKeyPanelProps } from './advanced/SessionKeyPanel';
export { PurposeSelector } from './advanced/PurposeSelector';
export type { PurposeSelectorProps } from './advanced/PurposeSelector';

// Address components
export { CopyableAddress } from './address/CopyableAddress';
export type { CopyableAddressProps } from './address/CopyableAddress';
export { AddressBookPanel } from './address/AddressBookPanel';

// Social/zkLogin components
export { SocialLoginButtons, SocialLoginIconButtons } from './social/SocialLoginButtons';
export type { SocialLoginButtonsProps } from './social/SocialLoginButtons';
export { ZkLoginCallback } from './social/ZkLoginCallback';
export type { ZkLoginCallbackProps } from './social/ZkLoginCallback';
export { PasskeyButton } from './social/PasskeyButton';
export type { PasskeyButtonProps } from './social/PasskeyButton';
export { ZKIDManager } from './social/ZKIDManager';
export type { ZKIDManagerProps } from './social/ZKIDManager';

// Network components
export { NetworkBadge } from './network/NetworkBadge';
export type { NetworkBadgeProps } from './network/NetworkBadge';
export { NetworkSelector } from './network/NetworkSelector';
export type { NetworkSelectorProps } from './network/NetworkSelector';
export { ChainSelector } from './network/ChainSelector';
export type { ChainSelectorProps } from './network/ChainSelector';

// Clear Signing components
export {
  TransactionPreview,
  StatusBadge,
  ActionsList,
  BalancePreview,
  SafetyChecklist,
  ErrorMessage,
  GenericErrorMessage,
  getStatusLabel,
  getStatusTooltip,
  getActionConfig,
  getActionIcon,
  getSafetyCheckSummary,
  getErrorMessage,
} from './clear-signing';
export type {
  TransactionPreviewProps,
  StatusBadgeProps,
  ActionsListProps,
  BalancePreviewProps,
  SafetyChecklistProps,
  ErrorMessageProps,
  GenericError,
} from './clear-signing';

// Ledger components
export {
  LedgerConnect,
  LedgerSigningPrompt,
  LedgerSigningIndicator,
  LedgerErrorDisplay,
  LedgerAddressSelector,
  LedgerAddressDropdown,
  LedgerBrowserWarning,
  isWebHIDSupported,
  getLedgerErrorMessage,
} from './ledger';
export type {
  LedgerConnectProps,
  LedgerSigningPromptProps,
  LedgerErrorDisplayProps,
  LedgerAddressSelectorProps,
  LedgerAddress,
} from './ledger';

// NSA (Smart Account) components
export {
  NsaSetupWizard,
  NsaAccountInfo,
  NsaAddSigner,
  NsaBackupPanel,
  NsaGuardianSetup,
  NsaRecoveryPanel,
} from './nsa';

// Shared components and design tokens
export { Tooltip, InlineTooltip, WALLET_STYLES } from './shared';
export type { TooltipProps, InlineTooltipProps } from './shared';

// UI Settings (stores and hooks)
export {
  useUISettingsStore,
  useAdvancedMode,
  useToggleAdvancedMode,
  useUserPurpose,
  useHasCompletedOnboarding,
  useNavigation,
  useCurrentSection,
  useCurrentView,
  useUISettings,
} from './stores';
export type { UseUISettingsResult } from './stores';

// Navigation types
export type {
  Section,
  HomeView,
  SendView,
  InvestView,
  NFTView,
  ActivityView,
  SettingsView,
  OnboardingView,
  View,
  NavigationState,
  UserPurpose,
} from './types';
export { DEFAULT_VIEWS, LEGACY_VIEW_MODE_MAP } from './types';
