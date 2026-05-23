/**
 * Wallet-signature-backed chat token lease for the agent-mode (wake) path.
 *
 * Lifecycle:
 *   ensureToken({wallet, agent, capability}) →
 *     sessionStorage hit? → return cached
 *     miss/expired → POST /challenge → personalSign → POST /session →
 *       persist + return
 *
 *   onTokenExpired() → reLeaseCount++, refresh once, then hard-error if it
 *     happens a second time within this lifecycle. Prevents a flapping
 *     server from looping the user through endless wallet sign prompts.
 *
 * The 401 loop guard counter resets when a successful wake outcome lands
 * (the parent useChatWake hook calls `resetReLease()`), or when the user
 * triggers an explicit Retry. Tab-internal switches between sessions don't
 * reset it — that's intentional: the guard is per-lease-attempt, not
 * per-session.
 */

import { useCallback, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import {
  AgentChatApiError,
  postChatChallenge,
  postChatSession,
} from '../services/chatWakeClient';
import {
  clearToken,
  getToken,
  saveToken,
  type StoredChatToken,
} from '../services/chatTokenStorage';

const MAX_RELEASE_COUNT = 1;

export interface LeaseInput {
  wallet: string;
  /** Sui address of the agent's ed25519 wallet (`AgentProfile.agentAddress`).
   * NOT the AgentProfile object id — chat-server's `agent_keys.agent_address`
   * column stores the wallet address, so passing the object id by mistake
   * lands a `agent_capability_mismatch` 403 from chat-wake. */
  agentAddress: string;
  capabilityId: string;
}

export interface LeaseResult {
  token: StoredChatToken;
  /** True when a wallet sign just happened (caller may want to surface UX
   * such as "Sign requested in your wallet"). */
  fresh: boolean;
}

interface UseChatTokenLeaseResult {
  ensureToken: (input: LeaseInput) => Promise<LeaseResult>;
  onTokenExpired: (input: LeaseInput) => Promise<LeaseResult>;
  resetReLease: () => void;
  /** Current sign-in phase. 'idle' between attempts, 'signing' while the
   * wallet popup is open, 'submitting' while POST /session is in flight. */
  phase: 'idle' | 'signing' | 'submitting';
  /** Last error from the lease pipeline. Cleared on next ensureToken call. */
  error: AgentChatApiError | Error | null;
}

export function useChatTokenLease(): UseChatTokenLeaseResult {
  const { signer, address } = useSigner();
  const [phase, setPhase] = useState<'idle' | 'signing' | 'submitting'>('idle');
  const [error, setError] = useState<AgentChatApiError | Error | null>(null);
  const reLeaseCount = useRef<number>(0);

  const performLease = useCallback(
    async (input: LeaseInput): Promise<LeaseResult> => {
      if (!signer || !address) {
        const err = new Error('wallet_not_connected');
        setError(err);
        throw err;
      }
      if (address.toLowerCase() !== input.wallet.toLowerCase()) {
        // Defensive: caller passed a wallet that no longer matches the
        // connected signer. Refuse rather than sign with the wrong key.
        const err = new Error('wallet_mismatch');
        setError(err);
        throw err;
      }
      setError(null);
      setPhase('signing');
      let challenge: string;
      try {
        const ch = await postChatChallenge({
          wallet: input.wallet,
          agent: input.agentAddress,
          capabilityId: input.capabilityId,
        });
        challenge = ch.challenge;
      } catch (err) {
        setPhase('idle');
        setError(err as Error);
        throw err;
      }

      let signature: string;
      try {
        const msgBytes = new TextEncoder().encode(challenge);
        const signed = await signer.signPersonal(msgBytes);
        signature = signed.signature;
      } catch (err) {
        setPhase('idle');
        setError(err as Error);
        throw err;
      }

      setPhase('submitting');
      try {
        const session = await postChatSession({ challenge, signature });
        const stored: StoredChatToken = {
          chatToken: session.chatToken,
          sid: session.sid,
          expiresAt: session.expiresAt,
          wallet: input.wallet,
          agentAddress: input.agentAddress,
          capabilityId: input.capabilityId,
        };
        saveToken(stored);
        setPhase('idle');
        return { token: stored, fresh: true };
      } catch (err) {
        setPhase('idle');
        setError(err as Error);
        throw err;
      }
    },
    [signer, address],
  );

  const ensureToken = useCallback(
    async (input: LeaseInput): Promise<LeaseResult> => {
      const cached = getToken(input.wallet, input.agentAddress, input.capabilityId);
      if (cached) return { token: cached, fresh: false };
      reLeaseCount.current = 0;
      return performLease(input);
    },
    [performLease],
  );

  const onTokenExpired = useCallback(
    async (input: LeaseInput): Promise<LeaseResult> => {
      clearToken(input.wallet, input.agentAddress, input.capabilityId);
      if (reLeaseCount.current >= MAX_RELEASE_COUNT) {
        // Loop guard — a token that expires again immediately after a fresh
        // lease points at a clock-skew or server-side issue. Bail out and
        // let the caller surface a hard error rather than keep looping the
        // user through wallet signs.
        const err = new AgentChatApiError('client_reLease_exceeded', 401);
        setError(err);
        throw err;
      }
      reLeaseCount.current += 1;
      return performLease(input);
    },
    [performLease],
  );

  const resetReLease = useCallback(() => {
    reLeaseCount.current = 0;
  }, []);

  return { ensureToken, onTokenExpired, resetReLease, phase, error };
}
