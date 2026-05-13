/**
 * Proposal artifact schema — shared between chat-server, agent-runner,
 * and indexer.
 *
 * A `Proposal` is the structured artifact created when the agent's
 * analyst preset produces a trade proposal in response to a user
 * message. It is stored off-chain in `baram_pending_proposals` while the
 * user reviews and acts on it (confirm/cancel/expire).
 *
 * Spec: Plan D v3 §A10. The on-chain pending lock
 * (`Capability.pending_proposal_id`) holds only the proposal ULID; the
 * full artifact lives in this schema off-chain.
 *
 * Analytics use cases enabled by this artifact:
 * - Acceptance ratio (confirmed / total proposals per agent)
 * - Confidence calibration over time
 * - Drift between proposed action and final execution AER
 * - Replay reconciliation (cognition AER reasoning_hash ↔ proposal)
 */

import { z } from 'zod';

const HEX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const proposalSideSchema = z.enum(['BUY', 'SELL']);
export type ProposalSide = z.infer<typeof proposalSideSchema>;

export const proposalStatusSchema = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'expired',
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

/**
 * Persisted proposal artifact. Stored in chat-server DB
 * `baram_pending_proposals.proposal` JSONB column.
 */
export const proposalSchema = z.object({
  proposal_id: z.string().regex(ULID_PATTERN, 'proposal_id must be ULID'),
  /** Cognition AER that introduced this proposal. */
  intent_id: z.string().regex(ULID_PATTERN, 'intent_id must be ULID'),
  /** Versioned discriminator matching contract `action_type`. */
  action_type: z.string().min(1).max(64),
  /** Human-readable one-liner (Telegram message + dashboard render). */
  summary: z.string().min(1).max(280),
  side: proposalSideSchema,
  /** Symbol pair (e.g., "NBTC", "NUSDC"). */
  symbol: z.string().min(1).max(32),
  /** Quote-token amount in raw smallest units (BigInt as string). */
  size_quote_raw: z.string().regex(/^[0-9]+$/, 'size_quote_raw must be unsigned integer string'),
  /** Slippage tolerance in basis points (0..10000). */
  max_slippage_bps: z.number().int().min(0).max(10_000),
  /** Model confidence (0..1). */
  confidence: z.number().min(0).max(1),
  /** SHA-256 of cognition AER `payload_bytes`. Allows hash-level audit. */
  reasoning_hash: z.string().regex(HEX_HASH, 'reasoning_hash must be 32-byte hex'),
  /** SHA-256 of market snapshot fed to the LLM. */
  market_snapshot_hash: z.string().regex(HEX_HASH, 'market_snapshot_hash must be 32-byte hex'),
  /** LLM model identifier (matches AER `model_version`). */
  model_version: z.string().min(1).max(128),
  /** SHA-256 of system prompt + strategy preset + policy. */
  prompt_template_hash: z.string().regex(HEX_HASH, 'prompt_template_hash must be 32-byte hex'),
  /** Lock expiration. ISO-8601 UTC. */
  expires_at: z.string().datetime({ offset: false, message: 'expires_at must be ISO-8601 UTC' }),
});
export type Proposal = z.infer<typeof proposalSchema>;

/**
 * Row shape for the `baram_pending_proposals` table.
 */
export const pendingProposalRowSchema = z.object({
  proposal_id: z.string().regex(ULID_PATTERN),
  agent_address: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  session_id: z.string().uuid(),
  intent_id: z.string().regex(ULID_PATTERN),
  proposal: proposalSchema,
  expires_at: z.string().datetime({ offset: false }),
  status: proposalStatusSchema,
  created_at: z.string().datetime({ offset: false }),
});
export type PendingProposalRow = z.infer<typeof pendingProposalRowSchema>;

/**
 * Default pending-lock window. The on-chain `pending_expires_at` MUST
 * match the off-chain expires_at to keep heartbeat skip behavior
 * consistent across processes.
 */
export const DEFAULT_PROPOSAL_TTL_MS = 15 * 60 * 1000;
