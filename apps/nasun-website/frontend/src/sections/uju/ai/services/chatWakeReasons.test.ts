/**
 * chatWakeReasons whitelist coverage. The chat-server may emit any code in
 * its `mapRuntimeReason` switch plus the inline 4xx returns; this test
 * pins down the front-end mirror so a server-side addition doesn't fall
 * back to the generic copy unnoticed.
 *
 * If you add a new code on chat-server, mirror it in chatWakeReasons.ts and
 * add it to the expected map below.
 */

import { describe, it, expect } from 'vitest';
import { alphaGateTooltip, isKnownReason, mapReason } from './chatWakeReasons';

const SERVER_CODES = [
  // /challenge
  'invalid_wallet',
  'invalid_agent',
  'invalid_capability_id',
  'challenge_capacity',
  // /session
  'missing_fields',
  'unknown_challenge',
  'expired',
  'wrong_purpose',
  'bad_signature',
  'internal_state',
  'agent_capability_mismatch',
  'capability_owner_mismatch',
  'capability_check_failed',
  'session_inactive',
  // alpha gate (4 codes — must be present per plan R9)
  'wallet_not_authorized',
  'no_active_agent',
  'agent_paused',
  'alpha_gate_off_but_no_agent',
  // /wake
  'missing_token',
  'invalid_token',
  'empty_message',
  'message_too_long',
  'invalid_idempotency_key',
  'idempotency_race',
  'agent_offline',
  'budget_insufficient',
  'budget_inactive',
  // /wake/:jobId mapRuntimeReason
  'gas_insufficient',
  'escrow_insufficient',
  'notional_cap_exceeded',
  'rate_limited',
  'infer_failed',
  'pending_lock',
  'runtime_error',
  'runtime_rejected',
  'agent_unreachable',
  'daily_cap_reached',
  'server_restarted',
  'dispatch_error',
  'wake_failed',
];

describe('chatWakeReasons whitelist', () => {
  it.each(SERVER_CODES)('knows the server reason "%s"', (code) => {
    expect(isKnownReason(code)).toBe(true);
    const m = mapReason(code);
    expect(m.user.length).toBeGreaterThan(0);
    expect(typeof m.retryable).toBe('boolean');
  });

  it('falls back to a generic retryable copy for unknown codes', () => {
    const m = mapReason('some_brand_new_server_code');
    expect(m.user).toMatch(/something/i);
    expect(m.retryable).toBe(true);
  });

  it('treats null/undefined as fallback', () => {
    expect(mapReason(null).user).toMatch(/something/i);
    expect(mapReason(undefined).user).toMatch(/something/i);
  });

  it('marks alpha-gate denials as non-retryable', () => {
    expect(mapReason('wallet_not_authorized').retryable).toBe(false);
    expect(mapReason('no_active_agent').retryable).toBe(false);
    expect(mapReason('agent_paused').retryable).toBe(false);
    expect(mapReason('alpha_gate_off_but_no_agent').retryable).toBe(false);
  });

  it('marks daily_cap_reached as non-retryable (hard daily limit)', () => {
    expect(mapReason('daily_cap_reached').retryable).toBe(false);
  });

  it('marks budget_insufficient as non-retryable (user must top up)', () => {
    expect(mapReason('budget_insufficient').retryable).toBe(false);
  });
});

describe('alphaGateTooltip', () => {
  it('returns a hint for each known alpha state', () => {
    expect(alphaGateTooltip('invited')).toMatch(/create an agent/i);
    expect(alphaGateTooltip('paused')).toMatch(/paused/i);
    expect(alphaGateTooltip('expired')).toMatch(/expired/i);
    expect(alphaGateTooltip('waiting')).toMatch(/waitlist/i);
    expect(alphaGateTooltip('none')).toMatch(/alpha/i);
  });

  it('returns empty string for active/exempt (no tooltip needed)', () => {
    expect(alphaGateTooltip('active')).toBe('');
    expect(alphaGateTooltip('exempt')).toBe('');
  });
});
