/**
 * Register an AgentProfile on-chain together with a delegated Capability
 * and AgentEscrow, all in a single atomic PTB. Backed by the
 * `agent_profile::create_agent_with_capability` entry added in the
 * baram_agent v0.2 upgrade so the wallet signs once.
 *
 * Two modes:
 *   - generate: create a new Ed25519 keypair, encrypt with passphrase, store in IndexedDB
 *   - import:   user supplies an existing agent address (no key stored locally)
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { DEEPBOOK_PACKAGE_ID, NBTC_TYPE, NUSDC_TYPE } from '@nasun/devnet-config';
import { suiClient } from '@/lib/sui-client';
import { buildAtomicAgentSetupTransaction } from '../services/transactionBuilder';
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

// Defaults for the auto-linked Capability. Mirrors Plan E1 Slice 1 spec.
// `trade.swap.v1`, `analysis.v1`, `noop.v1` are the action_types the
// trader cycle emits today; assets are the only spot pair the heartbeat
// loop trades; targets is the DeepBook package (only allowed callee).
// `cognition.chat.v1` is required by the Overview chat surface: the v2
// gated AER entry asserts action_type ∈ cap.allowed_actions, so a freshly
// created agent must already permit chat without a follow-up mutation tx.
const DEFAULT_ALLOWED_ACTIONS = ['trade.swap.v1', 'analysis.v1', 'noop.v1', 'cognition.chat.v1'];
const DEFAULT_ALLOWED_ASSETS = [NBTC_TYPE, NUSDC_TYPE];
const DEFAULT_ALLOWED_TARGETS = [DEEPBOOK_PACKAGE_ID];
const DEFAULT_RISK_LIMITS = {
  maxNotionalPerAction: 2_000_000n, // 2 NUSDC raw
  maxDailyLoss: 20_000_000n, // 20 NUSDC raw
  maxSlippageBps: 50,
  stopLossBps: 500,
  takeProfitBps: 1000,
};

function extractProfileId(result: {
  objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> | null;
}): string | null {
  for (const change of result.objectChanges ?? []) {
    if (
      change.type === 'created' &&
      change.objectType?.includes('::agent_profile::AgentProfile') &&
      change.objectId
    ) {
      return change.objectId;
    }
  }
  return null;
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
        let keypair: ReturnType<typeof generateAgentKeypair> | null = null;

        if (params.mode === 'generate') {
          if (!params.passphrase || params.passphrase.length < 6) {
            throw new Error('Agent passphrase must be at least 6 characters');
          }
          keypair = generateAgentKeypair();
          agentAddress = keypair.toSuiAddress();
          setGeneratedAddress(agentAddress);
        } else {
          if (!params.agentAddress) {
            throw new Error('Agent address is required for import mode');
          }
          agentAddress = params.agentAddress;
        }

        const tx = buildAtomicAgentSetupTransaction({
          agentAddress,
          name: params.name,
          role: params.role,
          capabilities: params.capabilities,
          allowedActions: DEFAULT_ALLOWED_ACTIONS,
          allowedAssets: DEFAULT_ALLOWED_ASSETS,
          allowedTargets: DEFAULT_ALLOWED_TARGETS,
          ...DEFAULT_RISK_LIMITS,
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
          throw new Error(result.effects?.status?.error || 'Setup transaction failed');
        }

        const profileId = extractProfileId(result);
        if (!profileId) {
          if (keypair) {
            // On-chain tx succeeded but we cannot find the new AgentProfile
            // in objectChanges, so we cannot key the IndexedDB record.
            // Surface the secret so the modal can show it.
            setFallbackKey(keypair.getSecretKey());
            setTxError('Setup tx succeeded but profile id could not be parsed. Copy the key below.');
            setTxStatus('error');
            return null;
          }
          throw new Error('Setup tx succeeded but could not parse profile id');
        }

        // For 'generate' mode, persist the encrypted key now that we
        // know the profile_id. Storage failure here is unrecoverable
        // (on-chain agent already exists), so surface fallbackKey.
        if (keypair && params.mode === 'generate') {
          try {
            await encryptAndStoreAgentKey(profileId, keypair, address, params.passphrase!);
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
