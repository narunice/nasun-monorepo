// PR2.A — minimal SuiClient wrapper to verify on-chain capability ownership.
//
// The runtime already snapshots `capability.owner` per cycle (see
// apps/nasun-ai-runtime/src/presets/trader-cycle.ts:442). chat-server
// uses the same field as the source of truth for vault upload/delete
// authorization, so a phisher who tricks a victim wallet into signing
// a vault challenge cannot bind the victim's agent if chain ownership
// disagrees.

import { SuiClient } from '@mysten/sui/client';
import { capability as capabilitySdk } from '@nasun/baram-sdk';
import { getZkLoginClient } from './baram-telegram-routes.js';

export interface CapabilityFields {
  owner: string;       // 0x… normalized lowercase
}

/**
 * Fetch a Baram capability object and return its owner field. The
 * Move struct does NOT carry the agent address (the agent is identified
 * by the keypair signing AERs against this capability), so chat-server
 * only verifies cap.owner against the wallet that initiated the vault
 * operation.
 *
 * Returns null on RPC failure or schema mismatch.
 */
export async function getCapabilityFields(
  client: SuiClient,
  capabilityId: string,
): Promise<CapabilityFields | null> {
  try {
    const obj = await client.getObject({
      id: capabilityId,
      options: { showContent: true, showType: true },
    });
    const content = obj.data?.content;
    if (!content || content.dataType !== 'moveObject') return null;
    const fields = (content as { fields: Record<string, unknown> }).fields;
    const ownerRaw = fields.owner;
    if (typeof ownerRaw !== 'string') return null;
    // Mirror the canonical Lambda normalization
    // (apps/baram/cdk/lambda-src/executor/src/services/sui.ts:580): the Sui
    // RPC sometimes returns addresses without the 0x prefix, so we add it
    // before lowercasing for comparison.
    const owner = ownerRaw.toLowerCase().startsWith('0x')
      ? ownerRaw.toLowerCase()
      : `0x${ownerRaw.toLowerCase()}`;
    return { owner };
  } catch {
    return null;
  }
}

/**
 * Verify that `capabilityId` is owned by `expectedWallet` on chain. Used
 * by agent-vault-routes both at challenge issuance (block phishing target
 * before the victim wallet is asked to sign) and at upload (re-verify in
 * case ownership changed during the 5-minute challenge window).
 */
/**
 * PR2.A.1 — fetch the on-chain Capability's linked AgentEscrow id. The
 * atomic-setup PTB stamps `escrow_id` onto the cap before sharing, so any
 * cap created via the website's agent-creation flow has this set. Throws
 * with a descriptive error if the cap exists but is unlinked (legacy
 * `new_capability` flow) — the runtime trader cycle cannot proceed
 * without an escrow.
 */
export async function fetchCapabilityEscrowId(
  capabilityId: string,
): Promise<string> {
  const ref = await capabilitySdk.fetchCapability(getZkLoginClient(), capabilityId);
  const escrowId = ref.cap.escrowId;
  if (!escrowId) {
    throw new Error(
      `capability_escrow_unlinked:${capabilityId}: cap has no AgentEscrow ` +
      `(legacy new_capability flow?). Re-create the agent via the atomic-setup PTB.`,
    );
  }
  return escrowId;
}

export async function verifyCapabilityOwner(
  capabilityId: string,
  expectedWallet: string,
): Promise<boolean> {
  const cap = await getCapabilityFields(getZkLoginClient(), capabilityId);
  if (!cap) {
    console.warn(`[vault] verifyCapabilityOwner: capability not found ${capabilityId}`);
    return false;
  }
  const expected = expectedWallet.toLowerCase().startsWith('0x')
    ? expectedWallet.toLowerCase()
    : `0x${expectedWallet.toLowerCase()}`;
  if (cap.owner !== expected) {
    console.warn(`[vault] verifyCapabilityOwner: owner mismatch capability=${capabilityId} chainOwner=${cap.owner} expected=${expected}`);
  }
  return cap.owner === expected;
}
