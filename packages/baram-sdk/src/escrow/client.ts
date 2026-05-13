/**
 * AgentEscrow client helpers.
 *
 * Fetch + decode a shared `AgentEscrow` object. Mirrors
 * `capability.fetchCapability` in shape: returns the decoded body plus
 * the `initialSharedVersion` the host needs for explicit `&mut`
 * sharedObjectRef construction in PTBs.
 */

import type { SuiClient } from '@mysten/sui/client';

import { decodeAgentEscrow } from './codec';
import type { AgentEscrowRef } from './types';

/**
 * Type-tag suffix every AgentEscrow object must report. Anchors on the
 * `<module>::<struct>` suffix so devnet republishes don't require
 * regenerating consumers. F6-style hardening from the Capability
 * fetcher: forces the indexer's reply to be a real escrow, not some
 * unrelated object that happens to BCS-decode under the same layout.
 */
const ESCROW_TYPE_SUFFIX = '::escrow::AgentEscrow';

export async function fetchEscrow(
  client: SuiClient,
  escrowId: string,
  options?: { expectedPackageId?: string },
): Promise<AgentEscrowRef> {
  const resp = await client.getObject({
    id: escrowId,
    options: { showBcs: true, showType: true, showOwner: true },
  });
  if (resp.error || !resp.data) {
    throw new Error(`AgentEscrow ${escrowId} not found: ${JSON.stringify(resp.error)}`);
  }
  const bcsData = resp.data.bcs;
  if (!bcsData || bcsData.dataType !== 'moveObject') {
    throw new Error(`AgentEscrow ${escrowId} has no BCS data on response`);
  }
  const moveType = resp.data.type;
  if (typeof moveType !== 'string' || !moveType.endsWith(ESCROW_TYPE_SUFFIX)) {
    throw new Error(
      `AgentEscrow ${escrowId} has unexpected type "${moveType}"; expected *${ESCROW_TYPE_SUFFIX}`,
    );
  }
  if (options?.expectedPackageId) {
    const expectedType = `${options.expectedPackageId}${ESCROW_TYPE_SUFFIX}`;
    if (moveType !== expectedType) {
      throw new Error(
        `AgentEscrow ${escrowId} type "${moveType}" does not match expected "${expectedType}"`,
      );
    }
  }
  const owner = resp.data.owner;
  const sharedOwner =
    owner && typeof owner === 'object' && 'Shared' in owner ? owner.Shared : null;
  if (!sharedOwner) {
    throw new Error(`AgentEscrow ${escrowId} is not a Shared object: ${JSON.stringify(owner)}`);
  }
  const raw = base64ToBytes(bcsData.bcsBytes);
  const escrow = decodeAgentEscrow(raw);
  return {
    escrow,
    objectId: escrowId,
    initialSharedVersion: BigInt(sharedOwner.initial_shared_version),
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
