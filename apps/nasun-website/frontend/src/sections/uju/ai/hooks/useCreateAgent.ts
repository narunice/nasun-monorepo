/**
 * Register an AgentProfile on-chain together with a delegated Capability
 * and AgentEscrow, all in a single atomic PTB. Backed by the
 * `agent_profile::create_agent_with_capability` entry added in the
 * baram_agent v0.2 upgrade so the wallet signs once.
 *
 * Two modes:
 *   - generate: create a new Ed25519 keypair, encrypt with passphrase, store in IndexedDB
 *   - import:   user supplies an existing agent. They can either paste the
 *               private key / mnemonic (encrypted and stored locally with a
 *               passphrase, same as generate) or provide just the address
 *               and keep the key in an external signer.
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { DEEPBOOK_PACKAGE_ID, NBTC_TYPE, NUSDC_TYPE } from '@nasun/devnet-config';
import { suiClient } from '@/lib/sui-client';
import { buildAtomicAgentSetupTransaction } from '../services/transactionBuilder';
import {
  generateAgentKeypair,
  generateAgentMnemonicAndKeypair,
  encryptAndStoreAgentKey,
  parseImportedAgentSecret,
} from '../services/agentKeyStorage';
import { fetchAlphaStatus, type AlphaUserState } from '../alpha/alphaApiClient';

// States that may proceed to create a new AgentProfile on-chain when the
// public alpha gate is enabled. `active` is included so a user who already
// has an alpha slot can register additional agents within their per-wallet
// cap; `exempt` covers admin/santa wallets. Everything else (`none`,
// `waiting`, `expired`, `paused`) must go through the alpha waitlist first.
const ALPHA_ALLOWED_STATES: ReadonlySet<AlphaUserState> = new Set<AlphaUserState>([
  'invited',
  'active',
  'exempt',
]);

function alphaBlockedMessage(state: AlphaUserState): string {
  switch (state) {
    case 'none':
      return 'Public alpha is gated. Join the waitlist from the AI tab to request a slot.';
    case 'waiting':
      return 'You are on the alpha waitlist. We will invite you when a slot opens.';
    case 'expired':
      return 'Your alpha access has expired. Re-join the waitlist from the AI tab.';
    case 'paused':
      return 'Your existing agent is paused. Resume it instead of creating a new one.';
    default:
      return `Public alpha gate denied this action (state: ${state}).`;
  }
}

export type AgentTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';
export type AgentCreationMode = 'generate' | 'import';

export interface CreateAgentParams {
  mode: AgentCreationMode;
  agentAddress?: string;
  passphrase?: string;
  name: string;
  role: string;
  capabilities: string[];
  /** Import mode only. Bech32 private key (`suiprivkey1...`) or 12/24-word
   *  BIP39 mnemonic. When present, the address is derived from the secret
   *  (overriding `agentAddress`) and the key is encrypted with `passphrase`
   *  and stored locally so Nasun AI can sign on behalf of the agent. When
   *  omitted, only the address is registered on-chain and the user keeps the
   *  key externally. */
  importedSecret?: string;
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

interface ObjectChange {
  type: string;
  objectType?: string;
  objectId?: string;
}

function extractProfileId(result: { objectChanges?: ObjectChange[] | null }): string | null {
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

// Step ② Fund needs the escrow id to call escrow::deposit. The escrow is
// share_object'd inside escrow::new_escrow_linked (Cmd 1 of the atomic
// setup), so it shows up in objectChanges as a created shared object whose
// type ends with `::escrow::AgentEscrow`.
function extractEscrowId(result: { objectChanges?: ObjectChange[] | null }): string | null {
  for (const change of result.objectChanges ?? []) {
    if (
      change.type === 'created' &&
      change.objectType?.endsWith('::escrow::AgentEscrow') &&
      change.objectId
    ) {
      return change.objectId;
    }
  }
  return null;
}

// Capability is share_object'd in Cmd 4 of the atomic setup. Resume flows
// derive the escrow id from `capability.escrow_id` so the wallet only needs
// to remember the capability address, not both.
function extractCapabilityId(result: { objectChanges?: ObjectChange[] | null }): string | null {
  for (const change of result.objectChanges ?? []) {
    if (
      change.type === 'created' &&
      change.objectType?.endsWith('::capability::Capability') &&
      change.objectId
    ) {
      return change.objectId;
    }
  }
  return null;
}

export interface AgentSetupIds {
  profileId: string;
  escrowId: string;
  capabilityId: string;
  digest: string;
}

export function useCreateAgent() {
  const { signer, address } = useSigner();
  const [txStatus, setTxStatus] = useState<AgentTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(null);
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);
  // Quickstart Step ② reads escrowId from here to build the fund PTB.
  // Persists across renders so a remount (e.g. modal close) does not lose
  // the just-minted escrow address before IndexedDB / chain query is ready.
  const [lastSetup, setLastSetup] = useState<AgentSetupIds | null>(null);
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
        // Public-alpha preflight. The on-chain entry function has no GP
        // ownership check, so without this gate a non-invited user can land
        // an AgentProfile on Nasun network but never get the inference
        // layer (chat-server vault upload is gated separately), leaving a
        // dormant profile. See 2026-05-22 incident.
        let alphaState: AlphaUserState;
        let gateEnabled: boolean;
        let perWalletCanCreate: boolean;
        try {
          const alpha = await fetchAlphaStatus(address);
          alphaState = alpha.state;
          gateEnabled = alpha.capacity.gate_enabled;
          // Optional field: a chat-server that predates the perWallet patch
          // will omit it. Treat as canCreate=true so we don't regress on
          // older deploys; the vault upload guard is still authoritative.
          perWalletCanCreate = alpha.perWallet ? alpha.perWallet.canCreate : true;
        } catch (statusErr) {
          // Fail-closed when the alpha API cannot be reached: the gate is
          // currently ON in prod and a transient failure must not silently
          // open the create path.
          throw new Error(
            `Alpha status check failed (${(statusErr as Error).message || 'unknown'}). Please try again.`,
          );
        }
        if (gateEnabled && !ALPHA_ALLOWED_STATES.has(alphaState)) {
          throw new Error(alphaBlockedMessage(alphaState));
        }
        // Defense-in-depth against the per-wallet cap. Catches a user who
        // bypassed `useCreateAgentBlocked` (stale React tree, race between
        // tabs, devtools edit) before they sign the on-chain PTB. Mirrors
        // the message in useCreateAgentBlocked / ActivateAgentModal so the
        // user sees a consistent reason across surfaces.
        if (gateEnabled && !perWalletCanCreate) {
          throw new Error(
            'You already have an active alpha agent on this wallet. Deactivate it first to register a new one.',
          );
        }

        let agentAddress: string;
        let keypair: ReturnType<typeof generateAgentKeypair> | null = null;
        let mnemonic: string | null = null;

        if (params.mode === 'generate') {
          if (!params.passphrase || params.passphrase.length < 6) {
            throw new Error('Agent passphrase must be at least 6 characters');
          }
          // Generate via BIP39 mnemonic so the user can later export a recovery
          // phrase alongside the raw private key (Export Key modal).
          const generated = generateAgentMnemonicAndKeypair();
          keypair = generated.keypair;
          mnemonic = generated.mnemonic;
          agentAddress = keypair.toSuiAddress();
          setGeneratedAddress(agentAddress);
        } else if (params.importedSecret) {
          // Import-with-key: parse the secret, derive the address, and treat
          // the rest of the flow the same as generate so the key gets
          // encrypted and stored locally for in-browser signing.
          if (!params.passphrase || params.passphrase.length < 6) {
            throw new Error('Agent passphrase must be at least 6 characters');
          }
          const parsed = parseImportedAgentSecret(params.importedSecret);
          if (!parsed) {
            throw new Error('Could not parse the imported secret. Expecting a bech32 private key (suiprivkey1...) or a 12/24-word recovery phrase.');
          }
          keypair = parsed.keypair;
          mnemonic = parsed.mnemonic ?? null;
          agentAddress = parsed.address;
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

        // Persist the encrypted key now that we know the profile_id.
        // This applies to both 'generate' mode and 'import' mode when the
        // user supplied a secret. Storage failure here is unrecoverable
        // (on-chain agent already exists), so surface fallbackKey.
        if (keypair) {
          try {
            await encryptAndStoreAgentKey(
              profileId,
              keypair,
              address,
              params.passphrase!,
              mnemonic ?? undefined,
            );
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

        // Surface the freshly-minted ids so Step ② Fund can build its PTB
        // without re-querying chain. extractEscrowId/CapabilityId are best-
        // effort: a parse miss does not fail the setup (Resume can recover
        // via capability.escrow_id chain lookup), but logging helps detect
        // contract upgrade regressions.
        const escrowId = extractEscrowId(result);
        const capabilityId = extractCapabilityId(result);
        if (escrowId && capabilityId) {
          setLastSetup({ profileId, escrowId, capabilityId, digest: result.digest });
        }

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
    setLastSetup(null);
  }, []);

  return {
    createAgent,
    txStatus,
    txError,
    generatedAddress,
    fallbackKey,
    lastSetup,
    resetTxStatus,
  };
}
