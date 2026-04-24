import { useCallback, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import { getSuiClient } from '../../lib/sui-client'
import {
  NUSDC_TYPE,
  NM_PRICE_PER_PICK,
  NM_PLAYED_EVENT_TYPE,
} from '../../lib/gostop-config'
import { buildPlayGame } from './transactions'

export interface NumberMatchResult {
  gameId: number
  picks: number[]
  winningNumber: number
  isWin: boolean
  cost: bigint
  payout: bigint
}

export interface UseNumberMatchResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  play: (picks: number[]) => Promise<NumberMatchResult | null>
  isPlaying: boolean
  error: string | null
  clearError: () => void
}

export function useNumberMatch(): UseNumberMatchResult {
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

  const [isPlaying, setIsPlaying] = useState(false)
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

  const play = useCallback(
    async (picks: number[]): Promise<NumberMatchResult | null> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return null
      }
      if (pendingRef.current) {
        setError('Another transaction is in progress.')
        return null
      }
      pendingRef.current = 'play'
      setIsPlaying(true)
      setError(null)
      try {
        const totalCost = NM_PRICE_PER_PICK * BigInt(picks.length)
        const coins = await findNusdcCoins(totalCost)
        if (!coins) {
          throw new Error(
            `Insufficient NUSDC balance (need ${(Number(totalCost) / 1_000_000).toFixed(2)} NUSDC).`,
          )
        }
        const tx = buildPlayGame(coins.primary, picks, coins.extra)
        const result = await signAndExecute(tx)

        const ev = (result.events ?? []).find((e) => e.type === NM_PLAYED_EVENT_TYPE)
        if (!ev) throw new Error('Result event missing from transaction')
        const pj = ev.parsedJson as {
          game_id: string | number
          picks: number[]
          winning_number: string | number
          is_win: boolean
          cost: string | number
          payout: string | number
        }
        return {
          gameId: Number(pj.game_id),
          picks: pj.picks.map((n) => Number(n)),
          winningNumber: Number(pj.winning_number),
          isWin: pj.is_win,
          cost: BigInt(pj.cost),
          payout: BigInt(pj.payout),
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to play'
        setError(humanizeNmError(raw))
        return null
      } finally {
        pendingRef.current = null
        setIsPlaying(false)
      }
    },
    [isWalletConnected, findNusdcCoins, signAndExecute],
  )

  return {
    walletAddress,
    isWalletConnected,
    play,
    isPlaying,
    error,
    clearError: () => setError(null),
  }
}

function humanizeNmError(raw: string): string {
  if (raw.includes('MoveAbort')) {
    if (raw.includes(', 0)')) return 'Invalid pick count (1-3).'
    if (raw.includes(', 1)')) return 'Number out of range (1-5).'
    if (raw.includes(', 2)')) return 'Duplicate number in picks.'
    if (raw.includes(', 3)')) return 'Payment amount does not match cost exactly.'
    if (raw.includes(', 4)')) return 'Bankroll pool is temporarily low. Try again shortly.'
    if (raw.includes(', 6)')) return 'Number match module is not ready (game cap not installed).'
  }
  return raw
}
