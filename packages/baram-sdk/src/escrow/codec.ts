/**
 * AgentEscrow BCS codec.
 *
 * Mirrors the Move struct in `apps/baram/contracts-aer/sources/escrow.move`.
 * Field order MUST match Move declaration order.
 *
 * Note: the dynamic-field balance entries are NOT part of this struct
 * (they live in separate child objects keyed by `TypeName`). The Move
 * struct exposes `id`, `owner`, `capability_id`, `balance_keys` —
 * decode those here. To read an individual balance, call
 * `SuiClient.getDynamicFieldObject({ parentId: escrow.id, name: { type: '0x1::type_name::TypeName', value: ... } })`.
 */

import { bcs } from '@mysten/sui/bcs';

import type { AgentEscrow } from './types';

export class EscrowCodecError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'EscrowCodecError';
  }
}

// Mirror of std::type_name::TypeName: `{ name: String }`.
const TypeNameBcs = bcs.struct('TypeName', {
  name: bcs.string(),
});

export const AgentEscrowBcs = bcs.struct('AgentEscrow', {
  id: bcs.Address,
  owner: bcs.Address,
  capability_id: bcs.Address,
  balance_keys: bcs.vector(TypeNameBcs),
});

export function decodeAgentEscrow(bytes: Uint8Array): AgentEscrow {
  const raw = AgentEscrowBcs.parse(bytes);
  return {
    id: raw.id,
    owner: raw.owner,
    capabilityId: raw.capability_id,
    balanceKeys: raw.balance_keys.map((t) => t.name),
  };
}
