/**
 * Resolves the active wallet address with priority zk > local > passkey.
 * Single source of truth for downstream features (game-history first; LT-5
 * will unify the duplicated wallet-pickup pattern in 5 game hooks here).
 *
 * Inline-copied from pado/src/features/game-history/hooks/useActiveAddress.ts
 * during PR2 — gostop is the second consumer that triggers extraction.
 */

import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'

export function useActiveAddress(): string | undefined {
  const { status, account } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin()
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

  const isLocalActive = status === 'unlocked' && !!account?.address

  if (isZkLoggedIn) return zkState?.address
  if (isLocalActive) return account?.address
  if (isPasskeyUnlocked) return passkeyAddress ?? undefined
  return undefined
}
