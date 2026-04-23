/**
 * useCreateAgent - Hook for creating agent profiles on-chain
 *
 * Supports two modes:
 * - Generate Keypair: Baram creates a new keypair, registers agent, stores encrypted key
 * - Import Existing Key: User provides an existing agent address (no key storage)
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/config/client';
import { buildCreateAgentTransaction } from '@/features/request/services/transactionBuilder';
import {
  generateAgentKeypair,
  encryptAndStoreAgentKey,
} from '@/services/agentKeyStorage';

export type AgentTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

export type AgentCreationMode = 'generate' | 'import';

export function useCreateAgent() {
  const { signer, address } = useSigner();
  const [txStatus, setTxStatus] = useState<AgentTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(null);
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);
  const txInFlight = useRef(false);

  const createAgent = useCallback(
    async (params: {
      mode: AgentCreationMode;
      agentAddress?: string;       // Required for 'import' mode
      passphrase?: string;         // Required for 'generate' mode
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
      setGeneratedAddress(null);
      setFallbackKey(null);

      try {
        let agentAddress: string;

        if (params.mode === 'generate') {
          if (!params.passphrase || params.passphrase.length < 6) {
            throw new Error('Agent passphrase must be at least 6 characters');
          }
          const keypair = generateAgentKeypair();
          agentAddress = keypair.toSuiAddress();
          setGeneratedAddress(agentAddress);

          // Register on-chain first
          const tx = buildCreateAgentTransaction({
            agentAddress,
            name: params.name,
            role: params.role,
            capabilities: params.capabilities,
          });
          tx.setSender(address);
          const txBytes = await tx.build({ client: suiClient });
          const { signature } = await signer.sign(txBytes);

          setTxStatus('executing');
          const result = await suiClient.executeTransactionBlock({
            transactionBlock: txBytes,
            signature,
            options: { showEffects: true, showObjectChanges: true },
          });

          if (result.effects?.status?.status !== 'success') {
            throw new Error(result.effects?.status?.error || 'Transaction failed');
          }

          // Find the created AgentProfile ID for key storage
          const profileId = extractProfileId(result);

          if (!profileId) {
            // Agent registered on-chain but key cannot be stored (objectChanges missing).
            // Surface the key via state so the modal can display it securely.
            // NEVER log the key to console — it would be visible to extensions/error collectors.
            setGeneratedAddress(agentAddress);
            setFallbackKey(keypair.getSecretKey());
            setTxError('Key storage failed. Copy the key below before closing this dialog.');
            setTxStatus('error');
            return null;
          }

          await encryptAndStoreAgentKey(profileId, keypair, address, params.passphrase);

          // Wait for indexer to index the new AgentProfile so subsequent
          // getOwnedObjects queries reflect it without a page reload.
          await suiClient.waitForTransaction({ digest: result.digest });

          setTxStatus('success');
          return result.digest;
        } else {
          // Import mode: user provides existing address
          if (!params.agentAddress) {
            throw new Error('Agent address is required for import mode');
          }
          agentAddress = params.agentAddress;

          const tx = buildCreateAgentTransaction({
            agentAddress,
            name: params.name,
            role: params.role,
            capabilities: params.capabilities,
          });
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

          await suiClient.waitForTransaction({ digest: result.digest });

          setTxStatus('success');
          return result.digest;
        }
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
    setGeneratedAddress(null);
    setFallbackKey(null);
  }, []);

  return { createAgent, txStatus, txError, generatedAddress, fallbackKey, resetTxStatus };
}

function extractProfileId(result: { objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> | null }): string | null {
  const created = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('AgentProfile') && !c.objectType?.includes('Registry')
  );
  return created?.objectId ?? null;
}
