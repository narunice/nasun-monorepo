import { useCallback, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import { getSuiClient } from '../../lib/sui-client'
import {
  NUSDC_TYPE,
  SCRATCH_CARD_PRICE,
  SCRATCH_PURCHASED_EVENT_TYPE,
} from '../../lib/gostop-config'
import {
  buildBuyScratchCard,
  buildBuyScratchCardsBulk,
} from './transactions'
import { withStaleObjectRetry } from '../../lib/sui-retry'

export interface ScratchResult {
  cardId: number
  cardNftId: string | null
  multiplier: number
  prizeAmount: bigint
  bulkIndex: number
}

export interface UseScratchCardResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buy: (count: number) => Promise<ScratchResult[] | null>
  isBuying: boolean
  error: string | null
  clearError: () => void
}

/**
 * Resolves the active wallet (zk > local > passkey) and exposes a single
 * `buy(count)` helper. Result list covers both winners and losers so the
 * page can render per-card reveal animations without a follow-up query.
 */
export function useScratchCard(): UseScratchCardResult {
  const { status, account, getKeypair } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSign } =
    useZkLogin()
  const passkeyKeypair = usePasskeyStore((s) => s.keypair)
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

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
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  const signAndExecute = useCallback(
    async (tx: Transaction) => {
      if (!walletAddress) throw new Error('Wallet not connected')

      const client = getSuiClient()
      tx.setSender(walletAddress)
      const bytes = await tx.build({ client })

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
        options: { showEffects: true, showEvents: true },
      })
      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed')
      }
      await client.waitForTransaction({ digest: result.digest })
      return result
    },
    [walletAddress, kind, zkSign, getKeypair, passkeyKeypair],
  )

  const findNusdcCoins = useCallback(
    async (amount: bigint): Promise<{ primary: string; extra: string[] } | null> => {
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

  const buy = useCallback(
    async (count: number): Promise<ScratchResult[] | null> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return null
      }
      if (pendingRef.current) {
        setError('Another transaction is in progress.')
        return null
      }
      pendingRef.current = `buy:${count}`
      setIsBuying(true)
      setError(null)
      try {
        const totalCost = SCRATCH_CARD_PRICE * BigInt(count)
        const result = await withStaleObjectRetry(async () => {
          const coins = await findNusdcCoins(totalCost)
          if (!coins) {
            throw new Error(
              `Insufficient NUSDC balance (need ${(Number(totalCost) / 1_000_000).toFixed(2)} NUSDC).`,
            )
          }
          const tx =
            count === 1
              ? buildBuyScratchCard(coins.primary, coins.extra)
              : buildBuyScratchCardsBulk(coins.primary, count, coins.extra)
          return signAndExecute(tx)
        })

        const events = result.events ?? []
        const results: ScratchResult[] = events
          .filter((e) => e.type === SCRATCH_PURCHASED_EVENT_TYPE)
          .map((e) => {
            const pj = e.parsedJson as {
              card_id: string | number
              card_nft_id: string | { vec: string[] } | null
              multiplier: string | number
              prize_amount: string | number
              bulk_index: string | number
            }
            // `Option<ID>` serializes in various shapes depending on SDK
            // version; normalize both `null`, `{vec: []}`, `{vec: [id]}`,
            // and plain string forms.
            let nftId: string | null = null
            const raw = pj.card_nft_id as unknown
            if (typeof raw === 'string') {
              nftId = raw
            } else if (raw && typeof raw === 'object' && 'vec' in raw) {
              const vec = (raw as { vec: string[] }).vec
              if (Array.isArray(vec) && vec.length > 0) nftId = vec[0]
            }
            return {
              cardId: Number(pj.card_id),
              cardNftId: nftId,
              multiplier: Number(pj.multiplier),
              prizeAmount: BigInt(pj.prize_amount),
              bulkIndex: Number(pj.bulk_index),
            }
          })
          .sort((a, b) => a.bulkIndex - b.bulkIndex)

        return results
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to buy'
        setError(humanizeScratchError(raw))
        return null
      } finally {
        pendingRef.current = null
        setIsBuying(false)
      }
    },
    [isWalletConnected, findNusdcCoins, signAndExecute],
  )

  return {
    walletAddress,
    isWalletConnected,
    buy,
    isBuying,
    error,
    clearError: () => setError(null),
  }
}

function humanizeScratchError(raw: string): string {
  if (raw.includes('MoveAbort')) {
    if (raw.includes(', 0)')) return 'Invalid card count (must be 1-10).'
    if (raw.includes(', 1)')) return 'Payment amount does not match card price exactly.'
    if (raw.includes(', 2)')) return 'Bankroll pool is temporarily low. Try again shortly.'
    if (raw.includes(', 4)')) return 'Scratch card module is not ready (game cap not installed).'
  }
  return raw
}
