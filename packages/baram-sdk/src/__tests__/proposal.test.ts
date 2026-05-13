import { describe, expect, it } from 'vitest';

import { newIntentId } from '../intent-ids';
import {
  DEFAULT_PROPOSAL_TTL_MS,
  pendingProposalRowSchema,
  proposalSchema,
} from '../proposal';

const VALID_PROPOSAL = {
  proposal_id: newIntentId(),
  intent_id: newIntentId(),
  action_type: 'trade.swap.v1',
  summary: 'Buy 1 NBTC at ~$50,300',
  side: 'BUY' as const,
  symbol: 'NBTC',
  size_quote_raw: '1000000',
  max_slippage_bps: 100,
  confidence: 0.71,
  reasoning_hash: '0x' + 'a'.repeat(64),
  market_snapshot_hash: '0x' + 'b'.repeat(64),
  model_version: 'llama-3.3-70b-versatile',
  prompt_template_hash: '0x' + 'c'.repeat(64),
  expires_at: new Date(Date.now() + DEFAULT_PROPOSAL_TTL_MS).toISOString(),
};

describe('proposal schema', () => {
  it('accepts a well-formed proposal artifact', () => {
    const result = proposalSchema.safeParse(VALID_PROPOSAL);
    expect(result.success).toBe(true);
  });

  it('rejects non-ULID proposal_id', () => {
    const bad = { ...VALID_PROPOSAL, proposal_id: 'not-a-ulid' };
    expect(proposalSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-hex reasoning_hash', () => {
    const bad = { ...VALID_PROPOSAL, reasoning_hash: '0xnothex' };
    expect(proposalSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects confidence outside [0,1]', () => {
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, confidence: -0.1 }).success).toBe(false);
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, confidence: 1.1 }).success).toBe(false);
  });

  it('rejects max_slippage_bps outside [0,10000]', () => {
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, max_slippage_bps: -1 }).success).toBe(false);
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, max_slippage_bps: 10_001 }).success).toBe(false);
  });

  it('rejects non-integer size_quote_raw', () => {
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, size_quote_raw: '1.5' }).success).toBe(false);
    expect(proposalSchema.safeParse({ ...VALID_PROPOSAL, size_quote_raw: '-1' }).success).toBe(false);
  });

  it('accepts large size_quote_raw beyond Number range', () => {
    const big = { ...VALID_PROPOSAL, size_quote_raw: '99999999999999999999' };
    expect(proposalSchema.safeParse(big).success).toBe(true);
  });
});

describe('pendingProposalRow schema', () => {
  const VALID_ROW = {
    proposal_id: VALID_PROPOSAL.proposal_id,
    agent_address: '0x' + 'd'.repeat(64),
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    intent_id: VALID_PROPOSAL.intent_id,
    proposal: VALID_PROPOSAL,
    expires_at: VALID_PROPOSAL.expires_at,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };

  it('accepts well-formed pending row', () => {
    expect(pendingProposalRowSchema.safeParse(VALID_ROW).success).toBe(true);
  });

  it('rejects non-64-hex agent_address', () => {
    const bad = { ...VALID_ROW, agent_address: '0xshort' };
    expect(pendingProposalRowSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-uuid session_id', () => {
    const bad = { ...VALID_ROW, session_id: 'not-uuid' };
    expect(pendingProposalRowSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts each ProposalStatus value', () => {
    for (const status of ['pending', 'confirmed', 'cancelled', 'expired'] as const) {
      expect(pendingProposalRowSchema.safeParse({ ...VALID_ROW, status }).success).toBe(true);
    }
  });
});
