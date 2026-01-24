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
  NSA_SIGNER_TYPE_MAP,
  NsaError,
} from '../../types/nsa';
import type {
  NsaAccountState,
  NsaSignerInfo,
  NsaSignerType,
  NsaRecoveryRequestState,
} from '../../types/nsa';
import type {
  CreateAccountParams,
  DepositParams,
  WithdrawParams,
  AddSignerParams,
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
 * Find SmartAccount objects owned by or associated with a given address
 */
export async function findAccountsForAddress(address: string): Promise<string[]> {
  const client = getSuiClient();

  const objects = await client.getOwnedObjects({
    owner: address,
    filter: {
      StructType: `${NSA_PACKAGE_ID}::smart_account::SmartAccount`,
    },
    options: { showContent: false },
  });

  const ids: string[] = [];
  for (const obj of objects.data) {
    const id = obj.data?.objectId;
    if (id) ids.push(id);
  }
  return ids;
}

// === Transaction Builders ===

/**
 * Build create_account transaction
 */
export function buildCreateAccount(params: CreateAccountParams): Transaction {
  const tx = new Transaction();
  const signerTypeNum = NSA_SIGNER_TYPE_MAP[params.initialSignerType];

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::create_account`,
    arguments: [
      tx.pure.u8(signerTypeNum),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(params.label))),
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
 * Build add_signer transaction
 */
export function buildAddSigner(params: AddSignerParams): Transaction {
  const tx = new Transaction();
  const signerTypeNum = NSA_SIGNER_TYPE_MAP[params.signerType];

  tx.moveCall({
    target: `${MODULE_SMART_ACCOUNT}::add_signer`,
    arguments: [
      tx.object(params.accountObjectId),
      tx.pure.address(params.newSigner),
      tx.pure.u8(signerTypeNum),
      tx.pure.u8(params.weight),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(params.label))),
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

// === Internal Helpers ===

const SIGNER_TYPE_REVERSE: Record<number, NsaSignerType> = {
  0: 'zklogin',
  1: 'passkey',
  2: 'local',
  3: 'hardware',
};

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
