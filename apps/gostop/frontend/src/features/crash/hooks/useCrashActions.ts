import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transaction } from '@mysten/sui/transactions'
import { getSuiClient } from '../../../lib/sui-client'
import { NUSDC_TYPE, CRASH_MIN_BET } from '../../../lib/gostop-config'
import { buildPlaceBetTx, buildCashOutTx } from '../transactions'
import { withStaleObjectRetry, isInputObjectDeletedError } from '../../../lib/sui-retry'
import type { WalletKind } from './useCrashWallet'

export type CrashPhase = 'idle' | 'placing_bet' | 'cashing_out'

export function useCrashActions(
  walletAddress: string | undefined,
  kind: WalletKind | null,
  zkSign: any,
  getKeypair: any,
  passkeyKeypair: any,
  roundObjectIdRef: React.MutableRefObject<string | null>,
  liveMultiplierBps: number,
  hasBetThisRound: boolean,
  setHasBetThisRound: (v: boolean) => void,
  myCashoutBps: number | null,
  setMyCashoutBps: (v: number | null) => void,
  roundState: any
) {
  const [phase, setPhase] = useState<CrashPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [autoCashOutBps, setAutoCashOutBps] = useState<number | null>(null)
  const cashOutInflightRef = useRef(false)

  const execTx = useCallback(async (tx: Transaction): Promise<string> => {
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
      options: { showEffects: true },
    })
    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error ?? 'Transaction failed')
    }
    await client.waitForTransaction({ digest: result.digest })
    return result.digest
  }, [walletAddress, kind, zkSign, getKeypair, passkeyKeypair])

  const placeBet = useCallback(async (betAmount: bigint): Promise<boolean> => {
    if (!walletAddress || !roundObjectIdRef.current) return false
    if (betAmount < CRASH_MIN_BET) { setError('Minimum bet is 1 NUSDC'); return false }
    setError(null)
    setPhase('placing_bet')
    try {
      await withStaleObjectRetry(async () => {
        const client = getSuiClient()
        const coins = await client.getCoins({ owner: walletAddress, coinType: NUSDC_TYPE })
        const enough = coins.data.find((c) => BigInt(c.balance) >= betAmount)
        if (!enough) throw new Error('Insufficient NUSDC balance')
        const roundId = roundObjectIdRef.current
        if (!roundId) throw new Error('Round unavailable')
        const tx = buildPlaceBetTx(roundId, enough.coinObjectId, betAmount)
        await execTx(tx)
      })
      setHasBetThisRound(true)
      return true
    } catch (e) {
      if (isInputObjectDeletedError(e)) {
        setError('Round ended before your bet landed. Your NUSDC was not charged. Wait a few seconds and try the next round.')
      } else {
        setError((e as Error).message)
      }
      return false
    } finally {
      setPhase('idle')
    }
  }, [walletAddress, execTx, setHasBetThisRound, roundObjectIdRef])

  const doCashOut = useCallback(async (objectId: string, currentBps: number): Promise<boolean> => {
    if (cashOutInflightRef.current || myCashoutBps !== null) return false
    cashOutInflightRef.current = true
    setPhase('cashing_out')
    try {
      const tx = buildCashOutTx(objectId, currentBps)
      await execTx(tx)
      setMyCashoutBps(currentBps)
      return true
    } catch (e) {
      cashOutInflightRef.current = false
      if (isInputObjectDeletedError(e)) {
        setError('Round crashed before your cashout reached the chain. Bet lost this round, no further action needed.')
      } else {
        setError((e as Error).message)
      }
      return false
    } finally {
      setPhase('idle')
    }
  }, [execTx, myCashoutBps, setMyCashoutBps])

  const cashOut = useCallback(async (): Promise<boolean> => {
    if (!roundObjectIdRef.current) return false
    return doCashOut(roundObjectIdRef.current, liveMultiplierBps)
  }, [doCashOut, liveMultiplierBps, roundObjectIdRef])

  // Auto cash-out
  useEffect(() => {
    if (autoCashOutBps === null || !hasBetThisRound || myCashoutBps !== null) return
    if (!roundObjectIdRef.current) return
    if (roundState?.state !== 'FLYING') return
    if (liveMultiplierBps >= autoCashOutBps) {
      doCashOut(roundObjectIdRef.current, liveMultiplierBps)
    }
  }, [liveMultiplierBps, autoCashOutBps, hasBetThisRound, myCashoutBps, roundState?.state, doCashOut, roundObjectIdRef])

  return {
    phase,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  }
}
