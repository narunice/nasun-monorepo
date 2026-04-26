/**
 * Imperative cache invalidator for game-history. Game pages call this after
 * a tx success so the just-played round shows up without waiting for the
 * staleTime window.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveAddress } from '../../../hooks/useActiveAddress'

export function useInvalidateGameHistory(): () => void {
  const queryClient = useQueryClient()
  const address = useActiveAddress()
  return useCallback(() => {
    if (!address) return
    queryClient.invalidateQueries({ queryKey: ['game-history', address] })
  }, [queryClient, address])
}
