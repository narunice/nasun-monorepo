/**
 * useTraderScheduler — start/stop the in-browser trader bot for one agent.
 *
 * Lifecycle:
 *   start(passphrase) -> decrypt agent keypair -> kick off interval timer.
 *   Each tick calls runOneCycle. Stops if a fatal error occurs (e.g. budget
 *   inactive). Browser tab must stay open; closing the tab pauses the bot.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { suiClient } from '../config/client';
import { loadAgentKeypair } from '../services/agentKeyStorage';
import { runOneCycle, loadState, type TradeRecord, type CycleResult } from '../services/traderRunner';
import type { TraderConfig } from '../types/trader';
import { useWalletSession } from './useWalletSession';

export type SchedulerStatus = 'idle' | 'starting' | 'running' | 'cycling' | 'stopped' | 'error';

export interface UseTraderSchedulerResult {
  status: SchedulerStatus;
  log: string[];
  trades: TradeRecord[];
  lastResult: CycleResult | null;
  nextCycleAt: number | null;
  error: string | null;
  start: (agentId: string, passphrase: string, config: TraderConfig) => Promise<boolean>;
  stop: () => void;
  runNow: () => Promise<void>;
}

export function useTraderScheduler(): UseTraderSchedulerResult {
  const { walletAddress } = useWalletSession();
  const [status, setStatus] = useState<SchedulerStatus>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [lastResult, setLastResult] = useState<CycleResult | null>(null);
  const [nextCycleAt, setNextCycleAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keypairRef = useRef<Ed25519Keypair | null>(null);
  const configRef = useRef<TraderConfig | null>(null);
  const timerRef = useRef<number | null>(null);
  const cyclingRef = useRef(false);
  const stoppedRef = useRef(false);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cycleOnce = useCallback(async () => {
    if (cyclingRef.current) return;
    if (!keypairRef.current || !configRef.current) return;
    cyclingRef.current = true;
    setStatus('cycling');
    try {
      const result = await runOneCycle({
        client: suiClient,
        keypair: keypairRef.current,
        config: configRef.current,
        hooks: {
          onLog: appendLog,
          onTrade: (t) => setTrades((prev) => [...prev, t].slice(-50)),
          onRequest: (id) => appendLog(`Baram request id=${id}`),
        },
      });
      setLastResult(result);
      if (result.error) {
        appendLog(`[error] ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`[fatal] ${msg}`);
      setError(msg);
      setStatus('error');
      stoppedRef.current = true;
      cyclingRef.current = false;
      return;
    } finally {
      cyclingRef.current = false;
    }
    if (stoppedRef.current) {
      setStatus('stopped');
      return;
    }
    const intervalMs = (configRef.current?.intervalMinutes ?? 30) * 60_000;
    setNextCycleAt(Date.now() + intervalMs);
    setStatus('running');
    clearTimer();
    timerRef.current = window.setTimeout(() => { void cycleOnce(); }, intervalMs);
  }, [appendLog]);

  const start = useCallback<UseTraderSchedulerResult['start']>(
    async (agentId, passphrase, config) => {
      if (!walletAddress) { setError('Wallet not connected'); return false; }
      setError(null);
      setStatus('starting');
      stoppedRef.current = false;

      try {
        const kp = await loadAgentKeypair(agentId, walletAddress, passphrase);
        if (!kp) { setError('Agent key not found in this browser'); setStatus('idle'); return false; }
        if (kp.toSuiAddress() !== config.agentAddress) {
          setError(`Decrypted key derives to ${kp.toSuiAddress().slice(0,10)}…, expected ${config.agentAddress.slice(0,10)}…`);
          setStatus('idle');
          return false;
        }
        keypairRef.current = kp;
        configRef.current = config;

        // Hydrate trade history from local state
        const s = loadState(config.agentAddress);
        setTrades(s.trades);

        appendLog(`Started for ${config.name} (${config.agentAddress.slice(0,10)}…). Interval ${config.intervalMinutes}min.`);
        // Kick off first cycle immediately
        void cycleOnce();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Decrypt failed: ${msg}`);
        setStatus('idle');
        return false;
      }
    },
    [walletAddress, appendLog, cycleOnce],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    keypairRef.current = null;
    configRef.current = null;
    setStatus('stopped');
    setNextCycleAt(null);
    appendLog('Stopped.');
  }, [appendLog]);

  const runNow = useCallback(async () => {
    if (!keypairRef.current || !configRef.current) return;
    clearTimer();
    await cycleOnce();
  }, [cycleOnce]);

  useEffect(() => () => { stoppedRef.current = true; clearTimer(); }, []);

  return { status, log, trades, lastResult, nextCycleAt, error, start, stop, runNow };
}
