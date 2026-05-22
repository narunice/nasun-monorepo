/**
 * Derives whether the connected wallet is currently blocked from creating a
 * new AgentProfile by the public-alpha gate, with a UI-ready message.
 *
 * Single source of truth for both the form-level disable (CreateAgentModal)
 * and the entry-point disables (QuickstartView Register CTAs, AgentsList
 * Register button). The functional gate lives in useCreateAgent.ts and
 * enforces the same predicate at submit time, so any divergence here only
 * affects UX, never safety.
 *
 * The predicate mirrors `ALPHA_ALLOWED_STATES` in useCreateAgent.ts. Keep
 * the two in sync when adding new states.
 */

import { useMemo } from 'react';
import { useAlphaStatus } from './useAlphaStatus';
import type { AlphaUserState } from './alphaApiClient';

export interface CreateAgentBlocked {
  blocked: boolean;
  message: string | null;
  /** True while the alpha status is still loading; callers may want to
   *  keep the Create button enabled (or show a spinner) instead of
   *  flashing a blocked state during the initial fetch. */
  loading: boolean;
}

function messageForState(state: AlphaUserState): string {
  switch (state) {
    case 'none':
      return 'Public alpha is gated. Join the waitlist from the AI tab to request a slot.';
    case 'waiting':
      return 'You are on the alpha waitlist. We will invite you when a slot opens.';
    case 'expired':
      return 'Your alpha access has expired. Re-join the waitlist from the AI tab.';
    case 'paused':
      return 'Your existing agent is paused. Resume it instead of creating a new one.';
    default:
      return `Public alpha gate denied this action (state: ${state}).`;
  }
}

export function useCreateAgentBlocked(
  walletAddress: string | null | undefined,
): CreateAgentBlocked {
  const { status, loading } = useAlphaStatus(walletAddress);
  return useMemo<CreateAgentBlocked>(() => {
    if (!status) return { blocked: false, message: null, loading };
    if (!status.capacity.gate_enabled) {
      return { blocked: false, message: null, loading };
    }
    const ok =
      status.state === 'invited' ||
      status.state === 'active' ||
      status.state === 'exempt';
    if (!ok) {
      return { blocked: true, message: messageForState(status.state), loading };
    }
    // State allows creation, but the wallet may have already filled its
    // per-wallet cap. The backend re-checks at vault upload (race-safe), but
    // blocking here prevents the user from signing the on-chain
    // create_agent_with_capability PTB and paying gas only to hit
    // `per_wallet_cap_reached` (HTTP 409) at activation time.
    if (status.perWallet && !status.perWallet.canCreate) {
      return {
        blocked: true,
        message:
          'You already have an active alpha agent on this wallet. Deactivate it first to register a new one.',
        loading,
      };
    }
    return { blocked: false, message: null, loading };
  }, [status, loading]);
}
