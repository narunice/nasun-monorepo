/**
 * Hooks exports
 */

export { useWallet, useWalletStatus, useWalletAccount, useWalletLoading } from './useWallet';
export { useBalance, useRefreshBalance, useInvalidateBalance } from './useBalance';
export { useTransaction } from './useTransaction';

// Multi-token support
export {
  useMultiBalance,
  useTokenBalance,
  useNativeBalance,
  useRefreshMultiBalance,
  useInvalidateMultiBalance,
} from './useMultiBalance';
export type { UseMultiBalanceOptions } from './useMultiBalance';

// Staking support
export {
  useValidators,
  useValidator,
  useRefreshValidators,
} from './useValidators';
export type { UseValidatorsOptions, UseValidatorsResult } from './useValidators';

export {
  useStaking,
  useRefreshStaking,
  useInvalidateStaking,
} from './useStaking';
export type { UseStakingOptions, UseStakingResult } from './useStaking';

export { useStakeTransaction } from './useStakeTransaction';

// Address book (Security Phase 2)
export { useAddressBook, useAddressStatus } from './useAddressBook';
