import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import { getSuiClient } from '../../lib/sui-client'
import { NUSDC_TYPE } from '../../lib/gostop-config'
import {
  fetchSession,
  getMyActiveSession,
  type MinesSession,
} from './mines-client'
import { humanizeMinesError } from './mines-config'
import {
  buildCreateSession,
  buildRevealCell,
  buildCashout,
} from './transactions'

export type MinesPhase = 'idle' | 'creating' | 'cashing_out'

export interface UseMinesResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  session: MinesSession | null
  phase: MinesPhase
  pendingCells: Set<number>
  createSession: (betAmount: bigint, mineCount: number) => Promise<boolean>
  revealCell: (cellIndex: number) => Promise<void>
  cashout: () => Promise<boolean>
  refresh: () => Promise<void>
  error: string | null
  clearError: () => void
  /** Last cashout payout / last explosion bet for post-finish UI. */
  lastFinish: { kind: 'cashed_out' | 'exploded'; payout: bigint; bet: bigint } | null
  clearLastFinish: () => void
}

export function useMines(): UseMinesResult {
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

  const [session, setSession] = useState<MinesSession | null>(null)
  const [phase, setPhase] = useState<MinesPhase>('idle')
  const [pendingCells, setPendingCells] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [lastFinish, setLastFinish] = useState<UseMinesResult['lastFinish']>(null)
  const phaseLockRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setSession(null)
      return
    }
    try {
      const s = await getMyActiveSession(walletAddress)
      setSession(s)
    } catch (e) {
      console.warn('[mines] refresh failed', e)
    }
  }, [walletAddress])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signAndExecute = useCallback(
    async (tx: Transaction) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      const client = getSuiClient()
      tx.setSender(walletAddress)
      const bytes = await tx.build({ client })

      let signature: string
      if (kind === 'zk') signature = await zkSign(bytes)
      else if (kind === 'local') {
        const kp = getKeypair()
        if (!kp) throw new Error('Local keypair unavailable')
        signature = (await kp.signTransaction(bytes)).signature
      } else if (kind === 'passkey') {
        if (!passkeyKeypair) throw new Error('Passkey keypair unavailable')
        signature = (await passkeyKeypair.signTransaction(bytes)).signature
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
      const ordered = [...coins.data].sort((a, b) =>
        Number(BigInt(b.balance) - BigInt(a.balance)),
      )
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

  const createSession = useCallback(
    async (betAmount: bigint, mineCount: number): Promise<boolean> => {
      if (!isWalletConnected) {
        setError('Wallet not connected')
        return false
      }
      if (phaseLockRef.current) {
        setError('Another transaction is in progress.')
        return false
      }
      phaseLockRef.current = 'create'
      setPhase('creating')
      setError(null)
      setLastFinish(null)
      try {
        const coins = await findNusdcCoins(betAmount)
        if (!coins) {
          throw new Error(
            `Insufficient NUSDC balance (need ${(Number(betAmount) / 1_000_000).toFixed(2)} NUSDC).`,
          )
        }
        const tx = buildCreateSession(coins.primary, betAmount, mineCount, coins.extra)
        await signAndExecute(tx)
        await refresh()
        return true
      } catch (e) {
        setError(humanizeMinesError(e instanceof Error ? e.message : 'Failed to start'))
        return false
      } finally {
        phaseLockRef.current = null
        setPhase('idle')
      }
    },
    [isWalletConnected, findNusdcCoins, signAndExecute, refresh],
  )

  const revealCell = useCallback(
    async (cellIndex: number) => {
      if (!session || session.status !== 0) return
      if (pendingCells.has(cellIndex)) return
      if (phase === 'creating' || phase === 'cashing_out') return
      // Serialize all session-mutating ops. Two reveals racing on the same
      // owned MinesSession object would target the same object version and
      // the second tx is rejected by validators with a version mismatch.
      // The ref lock is synchronous, unlike `pendingCells` (state).
      if (phaseLockRef.current) return
      phaseLockRef.current = 'reveal'

      setPendingCells((prev) => new Set(prev).add(cellIndex))
      setError(null)
      try {
        const tx = buildRevealCell(session.id, cellIndex)
        const result = await signAndExecute(tx)
        // Determine outcome from events: SessionFinished => explosion.
        const finished = (result.events ?? []).find((e) =>
          e.type.endsWith('::mines::SessionFinished'),
        )
        if (finished) {
          const pj = finished.parsedJson as {
            payout: string | number
            bet_amount: string | number
            outcome: string | number
          }
          const outcome = Number(pj.outcome)
          setLastFinish({
            kind: outcome === 2 ? 'exploded' : 'cashed_out',
            payout: BigInt(pj.payout),
            bet: BigInt(pj.bet_amount),
          })
          setSession(null)
        } else {
          // Safe reveal — refetch latest session state.
          const next = await fetchSession(session.id)
          if (next) setSession(next)
        }
      } catch (e) {
        setError(humanizeMinesError(e instanceof Error ? e.message : 'Reveal failed'))
      } finally {
        setPendingCells((prev) => {
          const next = new Set(prev)
          next.delete(cellIndex)
          return next
        })
        phaseLockRef.current = null
      }
    },
    [session, pendingCells, phase, signAndExecute],
  )

  const cashout = useCallback(async (): Promise<boolean> => {
    if (!session) return false
    if (phaseLockRef.current) {
      setError('Another transaction is in progress.')
      return false
    }
    phaseLockRef.current = 'cashout'
    setPhase('cashing_out')
    setError(null)
    try {
      const tx = buildCashout(session.id)
      const result = await signAndExecute(tx)
      const finished = (result.events ?? []).find((e) =>
        e.type.endsWith('::mines::SessionFinished'),
      )
      if (finished) {
        const pj = finished.parsedJson as {
          payout: string | number
          bet_amount: string | number
          outcome: string | number
        }
        setLastFinish({
          kind: Number(pj.outcome) === 2 ? 'exploded' : 'cashed_out',
          payout: BigInt(pj.payout),
          bet: BigInt(pj.bet_amount),
        })
      }
      setSession(null)
      return true
    } catch (e) {
      setError(humanizeMinesError(e instanceof Error ? e.message : 'Cashout failed'))
      return false
    } finally {
      phaseLockRef.current = null
      setPhase('idle')
    }
  }, [session, signAndExecute])

  return {
    walletAddress,
    isWalletConnected,
    session,
    phase,
    pendingCells,
    createSession,
    revealCell,
    cashout,
    refresh,
    error,
    clearError: () => setError(null),
    lastFinish,
    clearLastFinish: () => setLastFinish(null),
  }
}
