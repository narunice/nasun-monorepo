/**
 * Baram pending proposals — DB CRUD (Plan D §D-5).
 *
 * Manages the `baram_pending_proposals` SQLite table. One active (status='pending')
 * row is allowed per agent at a time (enforced by the partial unique index).
 *
 * Onchain set/clear of the capability pending lock is NOT performed here.
 * That is the agent-runner's responsibility (it owns the keypair). The chat-server
 * only maintains the off-chain proposal artifact for Telegram UX routing.
 */

import { type Proposal } from '@nasun/baram-sdk';
import { getDb } from './store.js';

interface ProposalDbRow {
  proposal_id: string;
  agent: string;
  session_id: string;
  intent_id: string;
  proposal: string; // JSON
  expires_at: number; // ms
  status: string;
  created_at: number; // ms
}

/**
 * Insert a new pending proposal row. Fails if the partial unique index is
 * violated (agent already has a 'pending' row). Callers should check with
 * getActivePendingProposal first if they need graceful handling.
 */
export function createPendingProposal(opts: {
  proposalId: string;
  agent: string;
  sessionId: string;
  intentId: string;
  proposal: Proposal;
  expiresAtMs: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO baram_pending_proposals
         (proposal_id, agent, session_id, intent_id, proposal, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      opts.proposalId,
      opts.agent,
      opts.sessionId,
      opts.intentId,
      JSON.stringify(opts.proposal),
      opts.expiresAtMs,
      Date.now(),
    );
}

/**
 * Return the active (status='pending') proposal for an agent, or null if none.
 * Also returns null for rows whose expires_at has already passed — callers
 * should treat those as expired even before the background expiry sweep runs.
 */
export function getActivePendingProposal(agent: string): Proposal | null {
  const row = getDb()
    .prepare(
      `SELECT proposal, expires_at FROM baram_pending_proposals
       WHERE agent = ? AND status = 'pending'`,
    )
    .get(agent) as Pick<ProposalDbRow, 'proposal' | 'expires_at'> | undefined;

  if (!row) return null;
  if (row.expires_at <= Date.now()) return null;
  try {
    return JSON.parse(row.proposal) as Proposal;
  } catch {
    return null;
  }
}

/**
 * Return a proposal by its proposal_id, regardless of status.
 */
export function getProposalById(proposalId: string): { proposal: Proposal; agent: string; sessionId: string; status: string } | null {
  const row = getDb()
    .prepare(
      `SELECT proposal, agent, session_id, status FROM baram_pending_proposals
       WHERE proposal_id = ?`,
    )
    .get(proposalId) as Pick<ProposalDbRow, 'proposal' | 'agent' | 'session_id' | 'status'> | undefined;

  if (!row) return null;
  try {
    return {
      proposal: JSON.parse(row.proposal) as Proposal,
      agent: row.agent,
      sessionId: row.session_id,
      status: row.status,
    };
  } catch {
    return null;
  }
}

/**
 * Transition a proposal to a terminal status (confirmed/cancelled/expired).
 * No-ops if the proposal is already in a terminal state.
 */
export function finalizeProposal(proposalId: string, status: 'confirmed' | 'cancelled' | 'expired'): boolean {
  const result = getDb()
    .prepare(
      `UPDATE baram_pending_proposals
       SET status = ?
       WHERE proposal_id = ? AND status = 'pending'`,
    )
    .run(status, proposalId);
  return result.changes > 0;
}

/**
 * Sweep expired pending rows. Should be called periodically (e.g., on each
 * incoming Telegram update) to keep the partial unique index unblocked.
 */
export function expireStaleProposals(): number {
  const result = getDb()
    .prepare(
      `UPDATE baram_pending_proposals
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= ?`,
    )
    .run(Date.now());
  return result.changes;
}
