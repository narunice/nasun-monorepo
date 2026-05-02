import { useEffect } from 'react'
import { useWallet } from '@nasun/wallet'
import { useQuery } from '@tanstack/react-query'
import { getSuiClient } from '../lib/sui-client'
import { NUSDC_TYPE } from '../lib/gostop-config'
import { useBalanceStore } from '../store/useBalanceStore'
import { useActiveAddress } from './useActiveAddress'

/**
 * useBalanceSync - Background hook to keep BalanceStore in sync with chain.
 * Call this once in the root App component.
 */
export function useBalanceSync() {
  const address = useActiveAddress()
  const setBalance = useBalanceStore((s) => s.setBalance)

  const { data: balance, refetch } = useQuery({
    queryKey: ['nusdc-balance', address],
    queryFn: async () => {
      if (!address) return 0n
      const client = getSuiClient()
      const res = await client.getBalance({
        owner: address,
        coinType: NUSDC_TYPE,
      })
      return BigInt(res.totalBalance)
    },
    enabled: !!address,
    refetchInterval: 15_000, // Regular sync
  })

  useEffect(() => {
    if (balance !== undefined) {
      setBalance(balance)
    }
  }, [balance, setBalance])

  // Return trigger for manual refresh after transactions
  return { refetch }
}
