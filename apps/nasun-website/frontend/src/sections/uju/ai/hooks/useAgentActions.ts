import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import {
  buildDeactivateAgentTransaction,
  buildReactivateAgentTransaction,
} from '../services/transactionBuilder';
import type { AgentProfile } from './useAgentProfiles';

export type AgentActionStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

export function useAgentActions() {
  const { signer, address } = useSigner();
  const queryClient = useQueryClient();
  const [txStatus, setTxStatus] = useState<AgentActionStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const txInFlight = useRef(false);

  // RPC fullnodes lag a beat behind tx finality, so a refetch right after
  // success often re-reads the pre-mutation state and the UI snaps back to
  // "Active". Patch the cached profile locally so the toggle reflects intent
  // immediately; the regular refetchInterval (15s) reconciles with chain.
  const patchProfileActive = useCallback(
    (profileId: string, isActive: boolean) => {
      if (!address) return;
      queryClient.setQueryData<AgentProfile[]>(
        ['nasun-ai', 'agentProfiles', address],
        (prev) =>
          prev?.map((p) => (p.id === profileId ? { ...p, isActive } : p)) ?? prev,
      );
    },
    [queryClient, address],
  );

  const execute = useCallback(
    async (tx: ReturnType<typeof buildDeactivateAgentTransaction>): Promise<string | null> => {
      if (txInFlight.current) return null;
      if (!signer || !address) {
        setTxError('Wallet not connected');
        setTxStatus('error');
        return null;
      }
      txInFlight.current = true;
      setTxStatus('signing');
      setTxError(null);
      try {
        tx.setSender(address);
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);
        setTxStatus('executing');
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true },
        });
        if (result.effects?.status?.status !== 'success') {
          throw new Error(result.effects?.status?.error || 'Transaction failed');
        }
        setTxStatus('success');
        return result.digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Transaction failed');
        setTxStatus('error');
        return null;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address],
  );

  const deactivateAgent = useCallback(
    async (profileId: string): Promise<boolean> => {
      const tx = buildDeactivateAgentTransaction(profileId);
      const digest = await execute(tx);
      if (digest) patchProfileActive(profileId, false);
      return !!digest;
    },
    [execute, patchProfileActive],
  );

  const reactivateAgent = useCallback(
    async (profileId: string): Promise<boolean> => {
      const tx = buildReactivateAgentTransaction(profileId);
      const digest = await execute(tx);
      if (digest) patchProfileActive(profileId, true);
      return !!digest;
    },
    [execute, patchProfileActive],
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return { deactivateAgent, reactivateAgent, txStatus, txError, resetTxStatus };
}
