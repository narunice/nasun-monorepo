import { useCallback, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import { getSuiClient } from '../../lib/sui-client'
import { LOTTERY_TICKET_PRICE, NUSDC_TYPE } from '../../lib/gostop-config'
import {
  buildBuyTicket,
  buildBurnTicket,
  buildClaimPrize,
} from './transactions'
import { humanizeLotteryError } from './errors'

export interface UseLotteryActionsResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buyTicket: (roundId: string, numbers: number[]) => Promise<boolean>
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
   * Returns coin ids sufficient to pay one ticket price. Prefer a single
   * coin >= TICKET_PRICE; otherwise return all coins that sum to >= price
   * (caller must mergeCoins them in the tx).
   */
  const findNusdcCoins = useCallback(async (): Promise<{
    primary: string
    extra: string[]
  } | null> => {
    if (!walletAddress) return null
    const client = getSuiClient()
    const coins = await client.getCoins({ owner: walletAddress, coinType: NUSDC_TYPE })
    if (coins.data.length === 0) return null

    // Single sufficient coin (cheapest path)
    const single = coins.data.find((c) => BigInt(c.balance) >= LOTTERY_TICKET_PRICE)
    if (single) return { primary: single.coinObjectId, extra: [] }

    // Aggregate dust
    let total = 0n
    const ordered = [...coins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
    const used: string[] = []
    for (const c of ordered) {
      used.push(c.coinObjectId)
      total += BigInt(c.balance)
      if (total >= LOTTERY_TICKET_PRICE) break
    }
    if (total < LOTTERY_TICKET_PRICE) return null
    return { primary: used[0], extra: used.slice(1) }
  }, [walletAddress])

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
        const coins = await findNusdcCoins()
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
    [isWalletConnected, findNusdcCoins, signAndExecute],
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
    claimPrize,
    burnTicket,
    isBuying,
    isClaiming,
    error,
    clearError: () => setError(null),
  }
}
