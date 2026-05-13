import { describe, expect, it } from 'vitest';

import { AgentEscrowBcs, decodeAgentEscrow } from '../codec';

describe('AgentEscrow codec', () => {
  it('round-trips canonical fields', () => {
    const raw = {
      id: '0x0000000000000000000000000000000000000000000000000000000000000010',
      owner: '0x0000000000000000000000000000000000000000000000000000000000000abc',
      capability_id: '0x0000000000000000000000000000000000000000000000000000000000000020',
      balance_keys: [
        { name: '0xabc::nusdc::NUSDC' },
        { name: '0xabc::nbtc::NBTC' },
      ],
    };
    const bytes = AgentEscrowBcs.serialize(raw).toBytes();
    const decoded = decodeAgentEscrow(bytes);
    expect(decoded.id).toEqual(raw.id);
    expect(decoded.owner).toEqual(raw.owner);
    expect(decoded.capabilityId).toEqual(raw.capability_id);
    expect(decoded.balanceKeys).toEqual(['0xabc::nusdc::NUSDC', '0xabc::nbtc::NBTC']);
  });

  it('handles empty balance_keys (freshly-created escrow)', () => {
    const raw = {
      id: '0x0000000000000000000000000000000000000000000000000000000000000010',
      owner: '0x0000000000000000000000000000000000000000000000000000000000000abc',
      capability_id: '0x0000000000000000000000000000000000000000000000000000000000000020',
      balance_keys: [],
    };
    const bytes = AgentEscrowBcs.serialize(raw).toBytes();
    const decoded = decodeAgentEscrow(bytes);
    expect(decoded.balanceKeys).toEqual([]);
  });
});
