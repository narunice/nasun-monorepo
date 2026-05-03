/**
 * Shared wallet address resolution hook.
 * Priority: zkLogin > local wallet (unlocked) > passkey (unlocked).
 *
 * Use this whenever a component needs "the wallet address that will sign
 * the next transaction." Avoids the priority drift that happens when
 * different hooks pick different addresses (display vs sign).
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
