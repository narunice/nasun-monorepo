/**
 * Shared wallet address resolution hook.
 * Priority: zkLogin > local wallet > passkey.
 *
 * TODO: Extract to src/hooks/useActiveAddress.ts when a second consumer appears.
 * Existing duplicates: useMyScratchCards, useCostBasis, useTradeHistory,
 * useBalanceManagerBalance, useMarginAccount, useNetWorth, useTotalValue.
 */
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';

export function useActiveAddress(): string | undefined {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;

  return isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? (passkeyAddress ?? undefined)
        : undefined;
}
