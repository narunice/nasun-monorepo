/**
 * useCreateAgent - Hook for creating agent profiles on-chain
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/config/client';
import { buildCreateAgentTransaction } from '@/features/request/services/transactionBuilder';

export type AgentTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

export function useCreateAgent() {
  const { signer, address } = useSigner();
  const [txStatus, setTxStatus] = useState<AgentTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const txInFlight = useRef(false);

  const createAgent = useCallback(
    async (params: {
      agentAddress: string;
      name: string;
      role: string;
      capabilities: string[];
    }): Promise<string | null> => {
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
        const tx = buildCreateAgentTransaction(params);
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
        const msg = err instanceof Error ? err.message : 'Failed to create agent';
        setTxError(msg);
        setTxStatus('error');
        return null;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address]
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return { createAgent, txStatus, txError, resetTxStatus };
}
