/**
 * useNasunSmartAccount Hook
 *
 * Main hook for Nasun Smart Account operations.
 * Manages account creation, state fetching, deposits, withdrawals,
 * and signer/guardian configuration.
 */

import { useCallback, useEffect } from 'react';
import { useNsaStore } from '../stores/nsaStore';
import {
  fetchAccountState,
  buildCreateAccount,
  buildDeposit,
  buildWithdraw,
  buildProposeAddSigner,
  buildAcceptSignerProposal,
  buildCancelSignerProposal,
  buildDeclineSignerProposal,
  buildRemoveSigner,
  buildSetGuardians,
  buildUpdateThreshold,
  findActiveProposalsForAccount,
  findProposalsForPendingSigner,
  discoverExistingAccount,
} from '../core/nsa/client';
import { validateGuardianConfig } from '../core/nsa/recovery';
import { NsaError } from '../types/nsa';
import type { NsaSignerType, NsaAccountState, NsaSignerProposal } from '../types/nsa';
import type { SignerAdapter } from '../core/signer/types';
import { getSuiClient } from '../sui/client';

export interface UseNasunSmartAccountResult {
  /** Whether NSA is initialized for this user */
  isInitialized: boolean;
  /** SmartAccount object ID */
  accountObjectId: string | null;
  /** Cached account state */
  accountState: NsaAccountState | null;
  /** Whether account state is loading */
  isLoading: boolean;
  /** Create a new SmartAccount */
  createAccount: (signerType: NsaSignerType, label: string, signer: SignerAdapter) => Promise<string>;
  /** Refresh account state from chain */
  refreshState: () => Promise<void>;
  /** Deposit coins to SmartAccount */
  deposit: (coinType: string, coinObjectId: string, signer: SignerAdapter) => Promise<string>;
  /** Withdraw coins from SmartAccount */
  withdraw: (coinType: string, amount: bigint, recipient: string, signer: SignerAdapter) => Promise<string>;
  /** Propose adding a new signer (Phase 1: creates proposal) */
  proposeAddSigner: (pendingSigner: string, signerType: NsaSignerType, weight: number, label: string, signer: SignerAdapter) => Promise<string>;
  /** Accept a signer proposal (Phase 2: proof of ownership) */
  acceptSignerProposal: (proposalObjectId: string, accountObjectId: string, signer: SignerAdapter) => Promise<void>;
  /** Cancel a pending signer proposal */
  cancelSignerProposal: (proposalObjectId: string, signer: SignerAdapter) => Promise<void>;
  /** Decline a signer proposal (called by pending signer) */
  declineSignerProposal: (proposalObjectId: string, signer: SignerAdapter) => Promise<void>;
  /** Remove a signer from the account */
  removeSigner: (signerToRemove: string, signer: SignerAdapter) => Promise<void>;
  /** Pending signer proposals */
  pendingProposals: NsaSignerProposal[];
  /** Refresh pending proposals from chain */
  refreshProposals: () => Promise<void>;
  /** Incoming signer invitations for current address */
  incomingInvitations: NsaSignerProposal[];
  /** Refresh incoming invitations from chain */
  refreshIncomingInvitations: (address: string) => Promise<void>;
  /** Set guardian configuration */
  setGuardians: (guardians: string[], threshold: number, recoveryOwner: string, signer: SignerAdapter) => Promise<void>;
  /** Update signing threshold */
  updateThreshold: (newThreshold: number, signer: SignerAdapter) => Promise<void>;
  /** Reset NSA state (for logout) */
  reset: () => void;
  /** Discover existing SmartAccount on-chain and initialize if found */
  discoverAndInitialize: (address: string) => Promise<boolean>;
}

export function useNasunSmartAccount(): UseNasunSmartAccountResult {
  const store = useNsaStore();

  // Auto-fetch account state when objectId is set but state is stale
  useEffect(() => {
    if (store.accountObjectId && !store.accountState && !store.isLoading) {
      refreshState();
    }
  }, [store.accountObjectId]);

  const refreshState = useCallback(async () => {
    const objectId = useNsaStore.getState().accountObjectId;
    if (!objectId) return;

    useNsaStore.getState().setLoading(true);
    try {
      const state = await fetchAccountState(objectId);
      useNsaStore.getState().setAccountState(state);
    } catch (error) {
      console.error('Failed to fetch SmartAccount state:', error);
      // If account is not found (e.g. network reset), clear the stale ID
      if (error instanceof NsaError && error.type === 'ACCOUNT_NOT_FOUND') {
        console.warn('SmartAccount not found (likely network reset). Resetting local NSA state.');
        useNsaStore.getState().clearState();
      }
    } finally {
      useNsaStore.getState().setLoading(false);
    }
  }, []);

  const createAccount = useCallback(async (
    signerType: NsaSignerType,
    label: string,
    signer: SignerAdapter,
  ): Promise<string> => {
    // Optimistic lock: prevent concurrent creation attempts
    const currentState = useNsaStore.getState();
    if (currentState.isInitialized) {
      return currentState.accountObjectId!;
    }
    if (currentState.isLoading) {
      throw new NsaError('TX_BUILD_FAILED', 'Account creation already in progress');
    }
    useNsaStore.getState().setLoading(true);

    try {
      return await _executeCreateAccount(signerType, label, signer);
    } finally {
      useNsaStore.getState().setLoading(false);
    }
  }, []);

  const _executeCreateAccount = async (
    signerType: NsaSignerType,
    label: string,
    signer: SignerAdapter,
  ): Promise<string> => {
    // Best-effort client-side dedup check. The on-chain create_account_v2
    // enforces uniqueness via AccountRegistry — if this check passes but
    // another tab already created, the TX will abort on-chain.
    const existingId = await discoverExistingAccount(signer.address);
    if (existingId) {
      const existingState = await fetchAccountState(existingId);
      useNsaStore.getState().initialize(existingId, existingState, signer.address);
      return existingId;
    }

    const tx = buildCreateAccount({ initialSignerType: signerType, label });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    let result;
    try {
      result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });
    } catch (err) {
      // On-chain abort: EAccountAlreadyExists (code 17) — re-discover and return
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('17') || errMsg.includes('AccountAlreadyExists')) {
        const retryId = await discoverExistingAccount(signer.address);
        if (retryId) {
          const retryState = await fetchAccountState(retryId);
          useNsaStore.getState().initialize(retryId, retryState, signer.address);
          return retryId;
        }
      }
      throw err;
    }

    // Find the created SmartAccount object
    const created = result.objectChanges?.find(
      (change: { type: string; objectType?: string; objectId?: string }) =>
        change.type === 'created' && change.objectType?.includes('SmartAccount')
    );

    if (!created || created.type !== 'created') {
      throw new Error('SmartAccount creation failed: object not found in effects');
    }

    const objectId = created.objectId;

    // Shared objects may not be immediately queryable after creation.
    // Wait for the transaction to be fully indexed before fetching state.
    await client.waitForTransaction({ digest: result.digest });

    // Retry fetchAccountState with backoff for eventual consistency
    let accountState;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        accountState = await fetchAccountState(objectId);
        break;
      } catch {
        if (attempt === 4) throw new Error(`SmartAccount created (${objectId}) but not yet queryable. Try refreshing.`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    useNsaStore.getState().initialize(objectId, accountState!, signer.address);

    return objectId;
  };

  const deposit = useCallback(async (
    coinType: string,
    coinObjectId: string,
    signer: SignerAdapter,
  ): Promise<string> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildDeposit({ accountObjectId, coinType, coinObjectId });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
    return result.digest;
  }, [refreshState]);

  const withdraw = useCallback(async (
    coinType: string,
    amount: bigint,
    recipient: string,
    signer: SignerAdapter,
  ): Promise<string> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildWithdraw({ accountObjectId, coinType, amount, recipient });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
    return result.digest;
  }, [refreshState]);

  const proposeAddSigner = useCallback(async (
    pendingSigner: string,
    signerType: NsaSignerType,
    weight: number,
    label: string,
    signer: SignerAdapter,
  ): Promise<string> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildProposeAddSigner({
      accountObjectId,
      pendingSigner,
      signerType,
      weight,
      label,
    });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true, showObjectChanges: true },
    });

    // Find the created SignerProposal object
    const created = result.objectChanges?.find(
      (change: { type: string; objectType?: string }) =>
        change.type === 'created' && change.objectType?.includes('SignerProposal')
    );

    if (!created || created.type !== 'created') {
      throw new Error('SignerProposal creation failed: object not found in effects');
    }

    await refreshProposals();
    return created.objectId;
  }, []);

  const acceptSignerProposal = useCallback(async (
    proposalObjectId: string,
    accountObjectId: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const tx = buildAcceptSignerProposal({ proposalObjectId, accountObjectId });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
    await refreshProposals();
  }, [refreshState]);

  const cancelSignerProposal = useCallback(async (
    proposalObjectId: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildCancelSignerProposal({ proposalObjectId, accountObjectId });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshProposals();
  }, []);

  const declineSignerProposal = useCallback(async (
    proposalObjectId: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const tx = buildDeclineSignerProposal({ proposalObjectId });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    // Refresh incoming invitations after declining
    await refreshIncomingInvitations(signer.address);
  }, []);

  const refreshProposals = useCallback(async () => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) return;

    try {
      const proposals = await findActiveProposalsForAccount(accountObjectId);
      useNsaStore.getState().setPendingProposals(proposals);
    } catch {
      // Silently fail - proposals are supplementary info
    }
  }, []);

  const refreshIncomingInvitations = useCallback(async (address: string) => {
    if (!address) return;

    try {
      const invitations = await findProposalsForPendingSigner(address);
      useNsaStore.getState().setIncomingInvitations(invitations);
    } catch {
      // Silently fail - invitations are supplementary info
    }
  }, []);

  const removeSigner = useCallback(async (
    signerToRemove: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildRemoveSigner({ accountObjectId, signerToRemove });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
  }, [refreshState]);

  const setGuardians = useCallback(async (
    guardians: string[],
    threshold: number,
    recoveryOwner: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const state = useNsaStore.getState();
    if (!state.accountObjectId) throw new Error('No SmartAccount configured');

    const signerAddresses = state.accountState?.signers.map((s) => s.address) ?? [];
    const validation = validateGuardianConfig(guardians, threshold, signerAddresses);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const tx = buildSetGuardians({
      accountObjectId: state.accountObjectId,
      guardians,
      guardianThreshold: threshold,
      recoveryOwner,
    });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
  }, [refreshState]);

  const updateThreshold = useCallback(async (
    newThreshold: number,
    signer: SignerAdapter,
  ): Promise<void> => {
    const accountObjectId = useNsaStore.getState().accountObjectId;
    if (!accountObjectId) throw new Error('No SmartAccount configured');

    const tx = buildUpdateThreshold({ accountObjectId, newThreshold });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    await refreshState();
  }, [refreshState]);

  const discoverAndInitialize = useCallback(async (address: string): Promise<boolean> => {
    const state = useNsaStore.getState();

    // Validate persisted state matches current wallet address
    state.validateOwner(address);

    const freshState = useNsaStore.getState();
    if (freshState.isInitialized || freshState.isLoading) return freshState.isInitialized;

    useNsaStore.getState().setLoading(true);
    try {
      const accountId = await discoverExistingAccount(address);
      if (accountId) {
        const accountState = await fetchAccountState(accountId);
        useNsaStore.getState().initialize(accountId, accountState, address);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[NSA] Auto-discovery failed:', error);
      return false;
    } finally {
      useNsaStore.getState().setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    useNsaStore.getState().clearState();
  }, []);

  return {
    isInitialized: store.isInitialized,
    accountObjectId: store.accountObjectId,
    accountState: store.accountState,
    isLoading: store.isLoading,
    createAccount,
    refreshState,
    deposit,
    withdraw,
    proposeAddSigner,
    acceptSignerProposal,
    cancelSignerProposal,
    declineSignerProposal,
    removeSigner,
    pendingProposals: store.pendingProposals,
    refreshProposals,
    incomingInvitations: store.incomingInvitations,
    refreshIncomingInvitations,
    setGuardians,
    updateThreshold,
    reset,
    discoverAndInitialize,
  };
}
