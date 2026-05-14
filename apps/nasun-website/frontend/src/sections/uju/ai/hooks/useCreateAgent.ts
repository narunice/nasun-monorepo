/**
 * Register an AgentProfile on-chain. Two modes:
 *   - generate: create a new Ed25519 keypair, encrypt with passphrase, store in IndexedDB
 *   - import:   user supplies an existing agent address (no key stored locally)
 *
 * Ported from baram/frontend/src/hooks/useCreateAgent.ts; uses nasun-website's
 * shared SuiClient and `@nasun/wallet` useSigner (same primitive baram used).
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import { buildCreateAgentTransaction } from '../services/transactionBuilder';
import { generateAgentKeypair, encryptAndStoreAgentKey } from '../services/agentKeyStorage';

export type AgentTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';
export type AgentCreationMode = 'generate' | 'import';

export interface CreateAgentParams {
  mode: AgentCreationMode;
  agentAddress?: string;
  passphrase?: string;
  name: string;
  role: string;
  capabilities: string[];
}

function extractProfileId(result: {
  objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> | null;
}): string | null {
  const created = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('AgentProfile') && !c.objectType?.includes('Registry'),
  );
  return created?.objectId ?? null;
}

export function useCreateAgent() {
  const { signer, address } = useSigner();
  const [txStatus, setTxStatus] = useState<AgentTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(null);
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);
  const txInFlight = useRef(false);

  const createAgent = useCallback(
    async (params: CreateAgentParams): Promise<string | null> => {
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

          const profileId = extractProfileId(result);
          if (!profileId) {
            // Agent registered on-chain but objectChanges did not surface the new
            // AgentProfile id, so we cannot key the IndexedDB record. Surface the
            // secret via state so the modal can show it; never log it.
            setFallbackKey(keypair.getSecretKey());
            setTxError('Key storage failed. Copy the key below before closing this dialog.');
            setTxStatus('error');
            return null;
          }

          // Storage failure here (IndexedDB quota, denied, private-mode, deriveKey
          // crypto error) is unrecoverable: the on-chain tx already executed, so
          // the agent exists but its private key would be lost. Catch separately
          // and surface fallbackKey so the user can copy the secret out of band.
          try {
            await encryptAndStoreAgentKey(profileId, keypair, address, params.passphrase);
          } catch (storageErr) {
            setFallbackKey(keypair.getSecretKey());
            setTxError(
              storageErr instanceof Error
                ? `Key storage failed (${storageErr.message}). Copy the key below before closing this dialog.`
                : 'Key storage failed. Copy the key below before closing this dialog.',
            );
            setTxStatus('error');
            return null;
          }

          await suiClient.waitForTransaction({ digest: result.digest });

          setTxStatus('success');
          return result.digest;
        }

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
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to create agent');
        setTxStatus('error');
        return null;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address],
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
    setGeneratedAddress(null);
    setFallbackKey(null);
  }, []);

  return { createAgent, txStatus, txError, generatedAddress, fallbackKey, resetTxStatus };
}
