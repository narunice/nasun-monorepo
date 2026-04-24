import { useCallback, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import { getSuiClient } from '../../lib/sui-client'
import { LOTTERY_TICKET_PRICE, NUSDC_TYPE } from '../../lib/gostop-config'
import {
  buildBuyTicket,
  buildBuyTicketBulk,
  buildBurnTicket,
  buildClaimPrize,
} from './transactions'
import { autoPickNumbers } from './lottery-utils'
import { humanizeLotteryError } from './errors'

export interface UseLotteryActionsResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buyTicket: (roundId: string, numbers: number[]) => Promise<boolean>
  buyTicketBulk: (roundId: string, count: number) => Promise<boolean>
  claimPrize: (roundId: string, ticketId: string) => Promise<boolean>
  burnTicket: (roundId: string, ticketId: string) => Promise<boolean>
  isBuying: boolean
  isClaiming: boolean
  error: string | null
  clearError: () => void
}

export function useLotteryActions(): UseLotteryActionsResult {
  const { status, account, getKeypair } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSign } =
    useZkLogin()
  const passkeyKeypair = usePasskeyStore((s) => s.keypair)
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

  // Wallet selection: zk > local > passkey. SAME priority must be used both
  // for address resolution and for signing — otherwise we'd build a tx for
  // address A and sign with B (silent failure with cryptic error).
  const isLocalActive = status === 'unlocked' && !!account?.address
  type WalletKind = 'zk' | 'local' | 'passkey'
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
  const isWalletConnected = !!walletAddress

  const [isBuying, setIsBuying] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  const signAndExecute = useCallback(
    async (tx: Transaction) => {
      if (!walletAddress) throw new Error('Wallet not connected')

      const client = getSuiClient()
      tx.setSender(walletAddress)
      const bytes = await tx.build({ client })

      // Sign with the same wallet that owns walletAddress.
      let signature: string
      if (kind === 'zk') {
        signature = await zkSign(bytes)
      } else if (kind === 'local') {
        const kp = getKeypair()
        if (!kp) throw new Error('Local keypair unavailable')
        const r = await kp.signTransaction(bytes)
        signature = r.signature
      } else if (kind === 'passkey') {
        if (!passkeyKeypair) throw new Error('Passkey keypair unavailable')
        const r = await passkeyKeypair.signTransaction(bytes)
        signature = r.signature
      } else {
        throw new Error('No active wallet to sign with')
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true },
      })
      if (result.effects?.status?.status !== 'success') {
        throw new Error(humanizeLotteryError(result.effects?.status?.error || 'Transaction failed'))
      }
      // Wait so subsequent reads see the effect.
      await client.waitForTransaction({ digest: result.digest })
      return result
    },
    [walletAddress, kind, zkSign, getKeypair, passkeyKeypair],
  )

  /**
   * Returns coin ids whose total balance is >= `amount`. Prefer a single
   * coin sufficient on its own; otherwise aggregate dust (caller must
   * `mergeCoins` the extras into `primary` in the tx).
   */
  const findNusdcCoinsForAmount = useCallback(
    async (
      amount: bigint,
    ): Promise<{ primary: string; extra: string[] } | null> => {
      if (!walletAddress) return null
      const client = getSuiClient()
      const coins = await client.getCoins({ owner: walletAddress, coinType: NUSDC_TYPE })
      if (coins.data.length === 0) return null

      const single = coins.data.find((c) => BigInt(c.balance) >= amount)
      if (single) return { primary: single.coinObjectId, extra: [] }

      let total = 0n
      const ordered = [...coins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      const used: string[] = []
      for (const c of ordered) {
        used.push(c.coinObjectId)
        total += BigInt(c.balance)
        if (total >= amount) break
      }
      if (total < amount) return null
      return { primary: used[0], extra: used.slice(1) }
    },
    [walletAddress],
  )

  const guard = (key: string) => {
    if (pendingRef.current) {
      setError('Another transaction is in progress.')
      return false
    }
    pendingRef.current = key
    setError(null)
    return true
  }
  const release = () => {
    pendingRef.current = null
  }

  const buyTicket = useCallback(
    async (roundId: string, numbers: number[]): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return false
      }
      if (!guard(`buy:${roundId}`)) return false

      setIsBuying(true)
      try {
        const coins = await findNusdcCoinsForAmount(LOTTERY_TICKET_PRICE)
        if (!coins) throw new Error('Insufficient NUSDC balance (need 5 NUSDC).')
        const tx = buildBuyTicket(roundId, coins.primary, numbers, coins.extra)
        await signAndExecute(tx)
        return true
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to buy ticket'
        setError(humanizeLotteryError(raw))
        return false
      } finally {
        release()
        setIsBuying(false)
      }
    },
    [isWalletConnected, findNusdcCoinsForAmount, signAndExecute],
  )

  const buyTicketBulk = useCallback(
    async (roundId: string, count: number): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return false
      }
      if (count < 1 || count > 10) {
        setError('Bulk count must be between 1 and 10')
        return false
      }
      if (!guard(`buyBulk:${roundId}:${count}`)) return false

      setIsBuying(true)
      try {
        const totalCost = LOTTERY_TICKET_PRICE * BigInt(count)
        const coins = await findNusdcCoinsForAmount(totalCost)
        if (!coins) {
          throw new Error(
            `Insufficient NUSDC balance (need ${(Number(totalCost) / 1_000_000).toFixed(2)} NUSDC).`,
          )
        }
        const bulkPicks = Array.from({ length: count }, () => autoPickNumbers())
        const tx = buildBuyTicketBulk(roundId, coins.primary, bulkPicks, coins.extra)
        await signAndExecute(tx)
        return true
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to buy tickets'
        setError(humanizeLotteryError(raw))
        return false
      } finally {
        release()
        setIsBuying(false)
      }
    },
    [isWalletConnected, findNusdcCoinsForAmount, signAndExecute],
  )

  const claimPrize = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return false
      }
      if (!guard(`claim:${ticketId}`)) return false
      setIsClaiming(true)
      try {
        await signAndExecute(buildClaimPrize(roundId, ticketId))
        return true
      } catch (e) {
        setError(humanizeLotteryError(e instanceof Error ? e.message : 'Failed to claim prize'))
        return false
      } finally {
        release()
        setIsClaiming(false)
      }
    },
    [isWalletConnected, signAndExecute],
  )

  const burnTicket = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return false
      }
      if (!guard(`burn:${ticketId}`)) return false
      try {
        await signAndExecute(buildBurnTicket(roundId, ticketId))
        return true
      } catch (e) {
        setError(humanizeLotteryError(e instanceof Error ? e.message : 'Failed to burn ticket'))
        return false
      } finally {
        release()
      }
    },
    [isWalletConnected, signAndExecute],
  )

  return {
    walletAddress,
    isWalletConnected,
    buyTicket,
    buyTicketBulk,
    claimPrize,
    burnTicket,
    isBuying,
    isClaiming,
    error,
    clearError: () => setError(null),
  }
}
