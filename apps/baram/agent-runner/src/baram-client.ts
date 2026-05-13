/**
 * Baram on-chain client — Budget check and request creation
 *
 * Based on demo-agent.ts:spendFromBudget() pattern (L393-432)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { createHash } from 'crypto';
import type { Config } from './config.js';

export interface BudgetState {
  balance: number;
  totalSpent: number;
  requestCount: number;
  isActive: boolean;
}

export function sha256(input: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(input).digest());
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface CreateRequestResult {
  requestId: number;
  promptHashHex: string;
}

/**
 * Read budget state from chain (balance, limits, active status)
 */
export async function checkBudget(client: SuiClient, budgetId: string): Promise<BudgetState> {
  const obj = await client.getObject({
    id: budgetId,
    options: { showContent: true },
  });

  if (obj.data?.content?.dataType !== 'moveObject') {
    throw new Error(`Budget ${budgetId} not found or not a Move object`);
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return {
    balance: Number(fields.balance as string ?? 0),
    totalSpent: Number(fields.total_spent as string ?? 0),
    requestCount: Number(fields.request_count as string ?? 0),
    isActive: Boolean(fields.is_active),
  };
}

/**
 * Create an on-chain request with budget (auto-deducts from budget)
 * Returns the requestId from the emitted event.
 */
export async function createRequest(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: Config,
  prompt: string,
  category: string,
  modelOverride?: string,
): Promise<CreateRequestResult> {
  const promptHash = sha256(prompt);
  const promptHashHex = sha256Hex(prompt);
  const model = modelOverride ?? config.model;

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::baram::create_request_with_budget_v2`,
    arguments: [
      tx.object(config.registryId),
      tx.object(config.budgetId),
      tx.pure.vector('u8', Array.from(promptHash)),
      tx.pure.string(model),
      tx.pure.address(config.executorAddress),
      tx.pure.u64(config.price),
      tx.pure.string(category),
      tx.object(config.clockId),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  const event = result.events?.find(e => e.type.includes('RequestCreated'));
  if (!event) {
    throw new Error('RequestCreated event not found in transaction result');
  }

  const raw = (event.parsedJson as Record<string, unknown>).request_id;
  const requestId = Number(raw);
  if (!Number.isFinite(requestId)) {
    throw new Error(`RequestCreated event has invalid request_id: ${JSON.stringify(raw)}`);
  }
  return { requestId, promptHashHex };
}

/**
 * Heartbeat skip predicate (Plan D §A5'). devInspect query against the
 * capability's `is_pending_active(cap, now_ms): bool` view. Returns false
 * when no pending proposal is installed OR the lock has expired — agent-runner
 * is free to enter a new wake cycle. Returns true when a live proposal lock
 * blocks the cycle (the next confirm/cancel/expire frees it).
 *
 * `aerPackageId` is `BARAM_AER_PACKAGE_ID` (baram_aer v1.4.0 onwards).
 * When unset, the function returns false (legacy: no lock concept) so
 * heartbeat keeps running on old capabilities that pre-date Plan D §A5'.
 */
export async function isPendingActive(
  client: SuiClient,
  aerPackageId: string,
  capabilityId: string,
  nowMs: number,
  senderAddress: string,
): Promise<boolean> {
  if (!aerPackageId) return false;
  const tx = new Transaction();
  tx.setSender(senderAddress);
  tx.moveCall({
    target: `${aerPackageId}::capability::is_pending_active`,
    arguments: [tx.object(capabilityId), tx.pure.u64(nowMs)],
  });
  const result = await client.devInspectTransactionBlock({
    sender: senderAddress,
    transactionBlock: tx,
  });
  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length === 0) {
    throw new Error('is_pending_active returned no values');
  }
  const [rawBytes] = returnValues[0];
  return bcs.bool().parse(Uint8Array.from(rawBytes));
}

/**
 * Categorize on-chain Move error codes into human-readable messages
 * Based on demo-agent.ts:categorizeError()
 */
export function categorizeError(error: string): { code: string; message: string; fatal: boolean } {
  const abortMatch = error.match(/,\s*(\d+)\)\s*in\s+command/);
  const code = abortMatch?.[1] ?? '';

  switch (code) {
    case '105': return { code, message: 'Exceeds max per request limit', fatal: false };
    case '111': return { code, message: 'Category not allowed', fatal: true };
    case '112': return { code, message: 'Daily spending limit exceeded', fatal: false };
    case '113': return { code, message: 'Weekly spending limit exceeded', fatal: false };
    case '114': return { code, message: 'Monthly spending limit exceeded', fatal: false };
    case '115': return { code, message: 'Rate limited (too frequent)', fatal: false };
    case '104': return { code, message: 'Insufficient budget balance', fatal: false };
    case '102': return { code, message: 'Budget expired', fatal: true };
    case '103': return { code, message: 'Budget inactive', fatal: true };
    // E_NOT_AGENT from budget validation
    case '101': return { code, message: 'Not authorized agent for this budget', fatal: true };
    default: return { code, message: error, fatal: false };
  }
}
