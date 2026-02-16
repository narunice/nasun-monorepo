/**
 * NSA Client - On-chain query and transaction builder
 *
 * Provides methods to query SmartAccount state and build
 * transactions for account operations.
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../sui/client';
import {
  NSA_PACKAGE_ID,
  NSA_REGISTRY_ID,
  NSA_SIGNER_TYPE_MAP,
  NsaError,
} from '../../types/nsa';
import type {
  NsaAccountState,
  NsaSignerInfo,
  NsaSignerType,
  NsaSignerProposal,
  NsaRecoveryRequestState,
} from '../../types/nsa';
import type {
  CreateAccountParams,
  DepositParams,
  WithdrawParams,
  ProposeAddSignerParams,
  AcceptSignerProposalParams,
  CancelSignerProposalParams,
  DeclineSignerProposalParams,
  RemoveSignerParams,
  SetGuardiansParams,
  UpdateThresholdParams,
  InitiateRecoveryParams,
  ApproveRecoveryParams,
  ExecuteRecoveryParams,
  CancelRecoveryParams,
} from './types';

const MODULE_SMART_ACCOUNT = `${NSA_PACKAGE_ID}::smart_account`;
const MODULE_RECOVERY = `${NSA_PACKAGE_ID}::recovery`;

// Must match MAX_LABEL_LENGTH in smart_account.move
const MAX_LABEL_LENGTH = 64;

// === Query Functions ===

/**
 * Fetch SmartAccount state from chain
 */
export async function fetchAccountState(objectId: string): Promise<NsaAccountState> {
  const client = getSuiClient();

  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new NsaError('ACCOUNT_NOT_FOUND', `SmartAccount not found: ${objectId}`);
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return parseAccountFields(objectId, fields);
}

/**
 * Fetch RecoveryRequest state from chain
 */
export async function fetchRecoveryRequest(objectId: string): Promise<NsaRecoveryRequestState> {
  const client = getSuiClient();

  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new NsaError('ACCOUNT_NOT_FOUND', `RecoveryRequest not found: ${objectId}`);
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return parseRecoveryFields(objectId, fields);
}

/**
 * Find SmartAccount objects where the given address is a signer.
 * Uses AccountCreated/SignerAdded events for discovery, then verifies
 * current on-chain state. Replaces the broken getOwnedObjects approach
 * since SmartAccounts are shared objects.
 */
export async function findAccountsForAddress(address: string): Promise<string[]> {
  const client = getSuiClient();
  const normalizedAddress = address.toLowerCase();

  const seen = new Set<string>();
  const candidateIds: string[] = [];

  // Check AccountCreated events (creator/initial_signer)
  const createdEvents = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::smart_account::AccountCreated`,
    },
    order: 'descending',
    limit: 50,
  });

  for (const event of createdEvents.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const creator = (parsed.creator as string || '').toLowerCase();
    const initialSigner = (parsed.initial_signer as string || '').toLowerCase();
    if (creator !== normalizedAddress && initialSigner !== normalizedAddress) continue;

    const accountId = parsed.account_id as string;
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    candidateIds.push(accountId);
  }

  // Check SignerAdded events (user may have been added later)
  const signerEvents = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::smart_account::SignerAdded`,
    },
    order: 'descending',
    limit: 50,
  });

  for (const event of signerEvents.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const signerAddress = (parsed.signer_address as string || '').toLowerCase();
    if (signerAddress !== normalizedAddress) continue;

    const accountId = parsed.account_id as string;
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    candidateIds.push(accountId);
  }

  // Verify each candidate still has this address as a signer
  const verifiedIds: string[] = [];
  const settled = await Promise.allSettled(
    candidateIds.map(async (accountId) => {
      const state = await fetchAccountState(accountId);
      const isSigner = state.signers.some(
        (s) => s.address.toLowerCase() === normalizedAddress,
      );
      return isSigner ? accountId : null;
    }),
  );

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      verifiedIds.push(result.value);
    }
  }

  return verifiedIds;
}

/**
 * Look up SmartAccount ID via on-chain AccountRegistry.
 * Uses devInspectTransactionBlock for gas-free read.
 * Returns null if address has no registered account or registry is unavailable.
 */
export async function lookupAccountInRegistry(address: string): Promise<string | null> {
  const client = getSuiClient();

  const tx = new Transaction();
  tx.moveCall({
    target: `${NSA_PACKAGE_ID}::smart_account::has_account`,
    arguments: [
      tx.object(NSA_REGISTRY_ID),
      tx.pure.address(address),
    ],
  });

  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: address,
    });

    const returnValues = result.results?.[0]?.returnValues;
    if (!returnValues || returnValues.length === 0) return null;

    // has_account returns bool: [1] = true, [0] = false
    const bytes = returnValues[0][0] as number[];
    if (!bytes || bytes[0] !== 1) return null;

    // Now call lookup_account to get the actual ID
    const tx2 = new Transaction();
    tx2.moveCall({
      target: `${NSA_PACKAGE_ID}::smart_account::lookup_account`,
      arguments: [
        tx2.object(NSA_REGISTRY_ID),
        tx2.pure.address(address),
      ],
    });

    const result2 = await client.devInspectTransactionBlock({
      transactionBlock: tx2,
      sender: address,
    });

    const rv2 = result2.results?.[0]?.returnValues;
    if (!rv2 || rv2.length === 0) return null;

    // Option<ID> BCS: [1, ...32 bytes] = Some(ID), [0] = None
    const optionBytes = rv2[0][0] as number[];
    if (!optionBytes || optionBytes.length < 33 || optionBytes[0] !== 1) return null;

    const idBytes = optionBytes.slice(1, 33);
    if (idBytes.length !== 32) return null;

    const hex = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `0x${hex}`;
  } catch (error) {
    console.warn('[NSA] Registry lookup failed, falling back to events:', error);
    return null;
  }
}

/**
 * Discover existing SmartAccount for an address.
 * Primary: registry lookup (O(1), deterministic).
 * Fallback: event-based scan (for pre-registry accounts).
 */
export async function discoverExistingAccount(address: string): Promise<string | null> {
  // Primary: registry lookup
  const registryResult = await lookupAccountInRegistry(address);
  if (registryResult) return registryResult;

  // Fallback: event-based discovery
  const accounts = await findAccountsForAddress(address);
  return accounts.length > 0 ? accounts[0] : null;
}

// === Transaction Builders ===

/**
 * Build create_account transaction
 */
export function buildCreateAccount(params: CreateAccountParams): Transaction {
  const labelBytes = new TextEncoder().encode(params.label);
  if (labelBytes.length > MAX_LABEL_LENGTH) {
    throw new NsaError('TX_BUILD_FAILED', `Label exceeds ${MAX_LABEL_LENGTH} bytes (got ${labelBytes.length})`);
  }

  const tx = new Transaction();
  const signerTypeNum = NSA_SIGNER_TYPE_MAP[params.initialSignerType];

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::create_account_v2`,
    arguments: [
      tx.object(NSA_REGISTRY_ID), // AccountRegistry shared object
      tx.pure.u8(signerTypeNum),
      tx.pure.vector('u8', Array.from(labelBytes)),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build deposit transaction
 */
export function buildDeposit(params: DepositParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::deposit`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.accountObjectId),
      tx.object(params.coinObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build withdraw transaction
 */
export function buildWithdraw(params: WithdrawParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::withdraw`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.u64(params.amount),
      tx.pure.address(params.recipient),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build propose_add_signer transaction (Phase 1: create proposal)
 */
export function buildProposeAddSigner(params: ProposeAddSignerParams): Transaction {
  const tx = new Transaction();
  const signerTypeNum = NSA_SIGNER_TYPE_MAP[params.signerType];

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::propose_add_signer`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.address(params.pendingSigner),
      tx.pure.u8(signerTypeNum),
      tx.pure.u8(params.weight),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(params.label))),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build accept_signer_proposal transaction (Phase 2: proof of ownership)
 */
export function buildAcceptSignerProposal(params: AcceptSignerProposalParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::accept_signer_proposal`,
    arguments: [
      tx.object(params.proposalObjectId),
      tx.object(params.accountObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build cancel_signer_proposal transaction
 */
export function buildCancelSignerProposal(params: CancelSignerProposalParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::cancel_signer_proposal`,
    arguments: [
      tx.object(params.proposalObjectId),
      tx.object(params.accountObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build decline_signer_proposal transaction (called by pending signer)
 */
export function buildDeclineSignerProposal(params: DeclineSignerProposalParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::decline_signer_proposal`,
    arguments: [
      tx.object(params.proposalObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build remove_signer transaction
 */
export function buildRemoveSigner(params: RemoveSignerParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::remove_signer`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.address(params.signerToRemove),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build set_guardians transaction
 */
export function buildSetGuardians(params: SetGuardiansParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::set_guardians`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.vector('address', params.guardians),
      tx.pure.u8(params.guardianThreshold),
      tx.pure.address(params.recoveryOwner),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build update_threshold transaction
 */
export function buildUpdateThreshold(params: UpdateThresholdParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::update_threshold`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.u8(params.newThreshold),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build initiate_recovery transaction
 */
export function buildInitiateRecovery(params: InitiateRecoveryParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_RECOVERY}::initiate_recovery`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.address(params.newOwner),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build approve_recovery transaction
 */
export function buildApproveRecovery(params: ApproveRecoveryParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_RECOVERY}::approve_recovery`,
    arguments: [
      tx.object(params.requestObjectId),
      tx.object(params.accountObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build execute_recovery transaction
 */
export function buildExecuteRecovery(params: ExecuteRecoveryParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_RECOVERY}::execute_recovery`,
    arguments: [
      tx.object(params.requestObjectId),
      tx.object(params.accountObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build cancel_recovery transaction
 */
export function buildCancelRecovery(params: CancelRecoveryParams): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${MODULE_RECOVERY}::cancel_recovery`,
    arguments: [
      tx.object(params.requestObjectId),
      tx.object(params.accountObjectId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

// === Proposal Queries ===

/**
 * Fetch SignerProposal state from chain
 */
export async function fetchSignerProposal(objectId: string): Promise<NsaSignerProposal> {
  const client = getSuiClient();

  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new NsaError('ACCOUNT_NOT_FOUND', `SignerProposal not found: ${objectId}`);
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return parseProposalFields(objectId, fields);
}

/**
 * Find active (not executed, not cancelled, not expired) proposals for an account.
 * Uses queryEvents to find SignerProposalCreated events, then filters by current state.
 */
export async function findActiveProposalsForAccount(accountObjectId: string): Promise<NsaSignerProposal[]> {
  const client = getSuiClient();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::smart_account::SignerProposalCreated`,
    },
    order: 'descending',
    limit: 50,
  });

  const proposals: NsaSignerProposal[] = [];
  const now = Date.now();

  for (const event of events.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const eventAccountId = parsed.account_id as string;
    if (eventAccountId !== accountObjectId) continue;

    const proposalId = parsed.proposal_id as string;
    if (!proposalId) continue;

    try {
      const proposal = await fetchSignerProposal(proposalId);
      if (!proposal.isExecuted && !proposal.isCancelled && proposal.expiresAt > now) {
        proposals.push(proposal);
      }
    } catch {
      // Proposal may have been deleted or not accessible
    }
  }

  return proposals;
}

/**
 * Find active proposals where the given address is the pending signer.
 * This enables automatic discovery of invitations without needing Proposal ID.
 */
export async function findProposalsForPendingSigner(address: string): Promise<NsaSignerProposal[]> {
  const client = getSuiClient();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::smart_account::SignerProposalCreated`,
    },
    order: 'descending',
    limit: 50,
  });

  const proposals: NsaSignerProposal[] = [];
  const now = Date.now();

  for (const event of events.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const eventPendingSigner = parsed.pending_signer as string;
    if (eventPendingSigner?.toLowerCase() !== address.toLowerCase()) continue;

    const proposalId = parsed.proposal_id as string;
    if (!proposalId) continue;

    try {
      const proposal = await fetchSignerProposal(proposalId);
      if (!proposal.isExecuted && !proposal.isCancelled && proposal.expiresAt > now) {
        proposals.push(proposal);
      }
    } catch {
      // Proposal may have been deleted or not accessible
    }
  }

  return proposals;
}

/**
 * Find active (not executed, not cancelled) recovery request for an account.
 * Uses queryEvents to find RecoveryInitiated events, then verifies current state.
 */
export async function findActiveRecoveryForAccount(
  accountObjectId: string,
): Promise<string | null> {
  const client = getSuiClient();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::recovery::RecoveryInitiated`,
    },
    order: 'descending',
    limit: 20,
  });

  for (const event of events.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const eventAccountId = parsed.account_id as string;
    if (eventAccountId !== accountObjectId) continue;

    const requestId = parsed.request_id as string;
    if (!requestId) continue;

    try {
      const request = await fetchRecoveryRequest(requestId);
      if (!request.isExecuted && !request.isCancelled) {
        return requestId;
      }
    } catch {
      // Request may have been deleted or not accessible
    }
  }

  return null;
}

/** Discovered account where the current user is a guardian */
export interface GuardedAccountInfo {
  accountState: NsaAccountState;
  activeRecoveryId: string | null;
}

/**
 * Find SmartAccounts where the given address is currently a guardian.
 * Uses GuardiansUpdated events for discovery, then verifies current on-chain state.
 * Only checks the 50 most recent events; returns at most MAX_GUARDIAN_RESULTS accounts.
 */
export async function findAccountsWhereGuardian(
  guardianAddress: string,
): Promise<GuardedAccountInfo[]> {
  const MAX_RESULTS = 10;
  const client = getSuiClient();
  const normalizedAddress = guardianAddress.toLowerCase();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${NSA_PACKAGE_ID}::smart_account::GuardiansUpdated`,
    },
    order: 'descending',
    limit: 50,
  });

  // Collect unique candidate account IDs from events
  const seen = new Set<string>();
  const candidateIds: string[] = [];

  for (const event of events.data) {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) continue;

    const guardians = parsed.guardians as string[] | undefined;
    if (!guardians?.some((g) => g.toLowerCase() === normalizedAddress)) continue;

    const accountId = parsed.account_id as string;
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    candidateIds.push(accountId);

    if (candidateIds.length >= MAX_RESULTS) break;
  }

  // Verify candidates in parallel
  const settled = await Promise.allSettled(
    candidateIds.map(async (accountId): Promise<GuardedAccountInfo | null> => {
      const accountState = await fetchAccountState(accountId);
      if (!accountState.guardians.some((g) => g.toLowerCase() === normalizedAddress)) return null;

      let activeRecoveryId: string | null = null;
      try {
        activeRecoveryId = await findActiveRecoveryForAccount(accountId);
      } catch { /* Non-critical */ }

      return { accountState, activeRecoveryId };
    }),
  );

  const results: GuardedAccountInfo[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  return results;
}

// === Internal Helpers ===

const SIGNER_TYPE_REVERSE: Record<number, NsaSignerType> = {
  0: 'zklogin',
  1: 'passkey',
  2: 'local',
  3: 'hardware',
};

function parseProposalFields(objectId: string, fields: Record<string, unknown>): NsaSignerProposal {
  return {
    objectId,
    accountId: (fields.account_id as { bytes?: string })?.bytes || fields.account_id as string || '',
    proposer: fields.proposer as string,
    pendingSigner: fields.pending_signer as string,
    signerType: SIGNER_TYPE_REVERSE[Number(fields.signer_type)] || 'local',
    weight: Number(fields.weight),
    label: decodeLabel(fields.label as number[] | string),
    createdAt: Number(fields.created_at),
    expiresAt: Number(fields.expires_at),
    isExecuted: Boolean(fields.is_executed),
    isCancelled: Boolean(fields.is_cancelled),
  };
}

function parseAccountFields(objectId: string, fields: Record<string, unknown>): NsaAccountState {
  const signersRaw = fields.signers as { fields: { contents: Array<{ fields: { key: string; value: { fields: Record<string, unknown> } } }> } } | undefined;

  const signers: NsaSignerInfo[] = [];
  if (signersRaw?.fields?.contents) {
    for (const entry of signersRaw.fields.contents) {
      const key = entry.fields.key;
      const value = entry.fields.value.fields;
      signers.push({
        address: key,
        signerType: SIGNER_TYPE_REVERSE[Number(value.signer_type)] || 'local',
        weight: Number(value.weight),
        addedAt: Number(value.added_at),
        label: decodeLabel(value.label as number[] | string),
      });
    }
  }

  return {
    objectId,
    signers,
    threshold: Number(fields.threshold),
    guardians: (fields.guardians as string[]) || [],
    guardianThreshold: Number(fields.guardian_threshold),
    recoveryOwner: (fields.recovery_owner as string) || '0x0',
    nonce: Number(fields.nonce),
    createdAt: Number(fields.created_at),
  };
}

function parseRecoveryFields(objectId: string, fields: Record<string, unknown>): NsaRecoveryRequestState {
  return {
    objectId,
    accountId: fields.account_id as string,
    requester: fields.requester as string,
    newOwner: fields.new_owner as string,
    approvals: (fields.approvals as string[]) || [],
    requiredApprovals: Number(fields.required_approvals),
    timelockEnd: Number(fields.timelock_end),
    isExecuted: Boolean(fields.is_executed),
    isCancelled: Boolean(fields.is_cancelled),
    createdAt: Number(fields.created_at),
  };
}

function decodeLabel(raw: number[] | string): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return new TextDecoder().decode(new Uint8Array(raw));
  }
  return '';
}
