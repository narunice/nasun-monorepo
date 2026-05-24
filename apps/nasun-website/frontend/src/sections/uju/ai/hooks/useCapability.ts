/**
 * useCapability — read a Capability object's onchain state and expose
 * wallet-signed mutation functions (pause, risk limits, allowed actions,
 * revoke).
 *
 * Pattern follows useAgentActions: signing → executing → success/error,
 * with `txInFlight` guard against double-submit. Mutations auto-refetch
 * capability state so the UI reflects the new pauseMode/version/etc.
 *
 * Read path uses the baram-sdk's `fetchCapability` which decodes the
 * Capability struct via BCS and asserts the shared-owner shape.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { capability as capabilitySdk } from '@nasun/baram-sdk';
type Capability = ReturnType<typeof capabilitySdk.decodeCapability>;
import { suiClient } from '@/lib/sui-client';
import {
  buildSetPauseModeTransaction,
  buildUpdateRiskLimitsTransaction,
  buildReplaceAllowedActionsTransaction,
  buildRevokeCapabilityTransaction,
  buildKillSwitchTransaction,
  buildDeactivateAgentTransaction,
  type CapabilityPauseMode,
  type CapabilityRiskLimits,
} from '../services/transactionBuilder';
import type { AgentProfile } from './useAgentProfiles';

export type CapabilityTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

export interface UseCapabilityResult {
  data: Capability | null;
  isLoading: boolean;
  fetchError: string | null;
  txStatus: CapabilityTxStatus;
  txError: string | null;
  setPauseMode: (mode: CapabilityPauseMode) => Promise<boolean>;
  updateRiskLimits: (limits: CapabilityRiskLimits) => Promise<boolean>;
  replaceAllowedActions: (actions: string[]) => Promise<boolean>;
  /**
   * Revoke the capability. When `agentProfileId` is provided, the same PTB
   * also flips AgentProfile.is_active=false so the sidebar/Overview badge
   * stops showing this agent as "paused". Single wallet signature for both.
   */
  revoke: (agentProfileId?: string) => Promise<boolean>;
  /**
   * Finalize-kill for zombie agents whose capability was already revoked by
   * an older client (before Kill switch combined the two move calls) but
   * whose AgentProfile.is_active is still true. Calls deactivate_agent only.
   */
  finalizeDeactivate: (agentProfileId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
  resetTxStatus: () => void;
}

export function useCapability(capabilityId: string | null): UseCapabilityResult {
  const { signer, address } = useSigner();
  const queryClient = useQueryClient();
  const [data, setData] = useState<Capability | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<CapabilityTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const txInFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (!capabilityId) {
      setData(null);
      setFetchError(null);
      return;
    }
    // Clear stale data synchronously so consumers can't observe one frame
    // where `data` is from the previous capabilityId. Without this, switching
    // chat sessions between agents could build a PTB with `capabilityId`
    // pointing at agent B and `expectedCapabilityVersion` taken from agent
    // A's cached cap, which on-chain would revert (the user just sees an
    // error, no funds at risk, but the failure is confusing).
    const requestedId = capabilityId;
    setData(null);
    setIsLoading(true);
    setFetchError(null);
    try {
      const ref = await capabilitySdk.fetchCapability(suiClient, requestedId);
      // Guard against races: if capabilityId changed underneath us during
      // the await, drop the response so we never publish data tagged with
      // the wrong id.
      if (requestedId !== capabilityId) return;
      setData(ref.cap);
    } catch (err) {
      if (requestedId !== capabilityId) return;
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch capability');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [capabilityId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const execute = useCallback(
    async (tx: ReturnType<typeof buildSetPauseModeTransaction>): Promise<boolean> => {
      if (txInFlight.current) return false;
      if (!signer || !address) {
        setTxError('Wallet not connected');
        setTxStatus('error');
        return false;
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
        await suiClient.waitForTransaction({ digest: result.digest });
        setTxStatus('success');
        // Refetch so caller sees new pauseMode/version/etc.
        await refetch();
        return true;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Transaction failed');
        setTxStatus('error');
        return false;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address, refetch],
  );

  const setPauseMode = useCallback(
    async (mode: CapabilityPauseMode): Promise<boolean> => {
      if (!capabilityId) return false;
      return execute(buildSetPauseModeTransaction(capabilityId, mode));
    },
    [capabilityId, execute],
  );

  const updateRiskLimits = useCallback(
    async (limits: CapabilityRiskLimits): Promise<boolean> => {
      if (!capabilityId) return false;
      return execute(buildUpdateRiskLimitsTransaction(capabilityId, limits));
    },
    [capabilityId, execute],
  );

  const replaceAllowedActions = useCallback(
    async (actions: string[]): Promise<boolean> => {
      if (!capabilityId) return false;
      return execute(buildReplaceAllowedActionsTransaction(capabilityId, actions));
    },
    [capabilityId, execute],
  );

  const revoke = useCallback(
    async (agentProfileId?: string): Promise<boolean> => {
      if (!capabilityId) return false;
      const tx = agentProfileId
        ? buildKillSwitchTransaction(capabilityId, agentProfileId)
        : buildRevokeCapabilityTransaction(capabilityId);
      const ok = await execute(tx);
      // Eager-patch the cached AgentProfile so the sidebar's amber "paused"
      // dot flips to "inactive" immediately instead of waiting on the 15s
      // useAgentProfiles refetch. Without this the user sees the success
      // banner but the sidebar lies for up to 15s and Settings > Agent
      // status keeps polling chat-server which can't resolve unvaulted
      // agents anyway.
      if (ok && agentProfileId && address) {
        queryClient.setQueryData<AgentProfile[]>(
          ['nasun-ai', 'agentProfiles', address],
          (prev) =>
            prev?.map((p) => (p.id === agentProfileId ? { ...p, isActive: false } : p)) ??
            prev,
        );
      }
      return ok;
    },
    [capabilityId, execute, queryClient, address],
  );

  const finalizeDeactivate = useCallback(
    async (agentProfileId: string): Promise<boolean> => {
      const ok = await execute(buildDeactivateAgentTransaction(agentProfileId));
      if (ok && address) {
        queryClient.setQueryData<AgentProfile[]>(
          ['nasun-ai', 'agentProfiles', address],
          (prev) =>
            prev?.map((p) => (p.id === agentProfileId ? { ...p, isActive: false } : p)) ??
            prev,
        );
      }
      return ok;
    },
    [execute, queryClient, address],
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return {
    data,
    isLoading,
    fetchError,
    txStatus,
    txError,
    setPauseMode,
    updateRiskLimits,
    replaceAllowedActions,
    revoke,
    finalizeDeactivate,
    refetch,
    resetTxStatus,
  };
}
