import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'

export type WalletKind = 'zk' | 'local' | 'passkey'

export function useCrashWallet() {
  const { account, status } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin()
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

  const isLocalActive = status === 'unlocked' && !!account?.address
  
  let walletAddress: string | undefined
  
  if (isZkLoggedIn && zkState?.address) {
    walletAddress = zkState.address
  } else if (isLocalActive) {
    walletAddress = account?.address
  } else if (isPasskeyUnlocked && passkeyAddress) {
    walletAddress = passkeyAddress
  }

  return {
    walletAddress,
    isWalletConnected: !!walletAddress,
  }
}
