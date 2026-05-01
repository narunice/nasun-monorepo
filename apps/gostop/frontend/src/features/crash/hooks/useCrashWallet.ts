import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'

export type WalletKind = 'zk' | 'local' | 'passkey'

export function useCrashWallet() {
  const { account, status, getKeypair } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSign } = useZkLogin()
  const passkeyKeypair = usePasskeyStore((s) => s.keypair)
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

  const isLocalActive = status === 'unlocked' && !!account?.address
  
  let kind: WalletKind | null = null
  let walletAddress: string | undefined
  
  if (isZkLoggedIn && zkState?.address) {
    kind = 'zk'
    walletAddress = zkState.address
  } else if (isLocalActive) {
    kind = 'local'
    walletAddress = account?.address
  } else if (isPasskeyUnlocked && passkeyAddress) {
    kind = 'passkey'
    walletAddress = passkeyAddress
  }

  return {
    walletAddress,
    kind,
    zkSign,
    getKeypair,
    passkeyKeypair,
    isWalletConnected: !!walletAddress,
  }
}
