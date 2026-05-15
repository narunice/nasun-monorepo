// PR2.A — minimal SuiClient wrapper to verify on-chain capability ownership.
//
// The runtime already snapshots `capability.owner` per cycle (see
// apps/nasun-ai-runtime/src/presets/trader-cycle.ts:442). chat-server
// uses the same field as the source of truth for vault upload/delete
// authorization, so a phisher who tricks a victim wallet into signing
// a vault challenge cannot bind the victim's agent if chain ownership
// disagrees.

import { SuiClient } from '@mysten/sui/client';
import { getZkLoginClient } from './baram-telegram-routes.js';

export interface CapabilityFields {
  owner: string;       // 0x… normalized lowercase
  agent: string;       // 0x… normalized lowercase
}

/**
 * Fetch a Baram capability object and return its owner+agent fields.
 * Returns null if the object is missing, mistyped, or unparseable.
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
    const owner = typeof fields.owner === 'string' ? fields.owner.toLowerCase() : null;
    const agent = typeof fields.agent === 'string' ? fields.agent.toLowerCase() : null;
    if (!owner || !agent) return null;
    return { owner, agent };
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
export async function verifyCapabilityOwner(
  capabilityId: string,
  expectedWallet: string,
): Promise<boolean> {
  const cap = await getCapabilityFields(getZkLoginClient(), capabilityId);
  if (!cap) return false;
  return cap.owner === expectedWallet.toLowerCase();
}
