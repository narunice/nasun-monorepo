import { useActiveAddress } from '../../../hooks/useActiveAddress'

export type WalletKind = 'zk' | 'local' | 'passkey'

export function useCrashWallet() {
  const walletAddress = useActiveAddress()

  return {
    walletAddress,
    isWalletConnected: !!walletAddress,
  }
}
