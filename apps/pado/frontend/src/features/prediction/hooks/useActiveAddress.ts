/**
 * useActiveAddress: returns the currently signed-in address from whichever
 * wallet path is active (local keystore, zkLogin, passkey). Used by
 * read-only UI surfaces that just need to know "who am I" — e.g. to
 * highlight the user's own trades in market-wide feeds.
 *
 * Returns undefined when no wallet is connected.
 */

import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';

export function useActiveAddress(): string | undefined {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);

  if (isZkConnected) return zkState?.address;
  if (status === 'unlocked') return account?.address;
  if (isPasskeyUnlocked) return passkeyAddress ?? undefined;
  return undefined;
}
