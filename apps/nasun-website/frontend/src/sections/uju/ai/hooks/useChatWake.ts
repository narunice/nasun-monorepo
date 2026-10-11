/**
 * State-machine integration for the agent-mode (wake) chat path.
 *
 *   idle → leasing → submitting → polling → done | error | timeout
 *           ↑                          │
 *           └── 401 expired (re-lease, max 1) ┘
 *
 * Submit ordering (matters for R6 — refresh-during-leasing must not drop the
 * idempotencyKey):
 *   1. addMessage(user) + addMessage(assistant placeholder)
 *   2. mint idemKey + write inflight row {jobId:null}
 *   3. ensureToken (may pop wallet sign)
 *   4. POST /wake
 *   5. update inflight row with jobId, attach to placeholder
 *   6. poll → finalize placeholder
 *
 * Resume ordering (mount with an inflight row that already has jobId):
 *   1. on mount, loadInflight(currentSessionId)
 *   2. if row.jobId, hand directly to usePollWakeJob (skip lease+POST)
 *   3. on done/error, flip placeholder + drop inflight
 *
 * The placeholder message lets us flip to done/error in-place without
 * inserting a second assistant turn for the same Send click. Its id is
 * stored on the inflight row so resume after refresh can find it again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { useChatStore } from '../stores/chatStore';
import {
  mintIdempotencyKey,
  postChatWake,
  postProposalCancel,
  postProposalConfirm,
  AgentChatApiError,
} from '../services/chatWakeClient';
import { deleteInflight, loadInflight, saveInflight } from '../services/chatStorage';
import { mapReason } from '../services/chatWakeReasons';
import { useChatTokenLease } from './useChatTokenLease';
import { usePollWakeJob } from './usePollWakeJob';
import type { InflightWakeJob, Message, WakeProposal } from '../types/chat';

const INFLIGHT_TTL_MS = 10 * 60 * 1000;

export type WakePhase = 'idle' | 'leasing' | 'submitting' | 'polling' | 'done' | 'error' | 'timeout';

export interface UseChatWakeInput {
  /** Capability id this session bills against. Required for wake mode. */
  capabilityId: string | null;
  /** Agent's ed25519 wallet address (AgentProfile.agentAddress). REQUIRED for
   * wake — chat-server matches `agent_keys.agent_address` on this value. The
   * frontend's notion of `agentId` (AgentProfile object id) is unrelated. */
  agentAddress: string | null;
}

export interface UseChatWakeResult {
  /** True when the agent is currently producing a response. */
  busy: boolean;
  phase: WakePhase;
  /** Current attempt's user-facing error copy, or null. */
  errorMessage: string | null;
  /** True when the last error is retryable (Retry button shown). */
  retryable: boolean;
  /** Submit a user message and start a wake job. */
  submit: (message: string) => Promise<void>;
  /** Retry the last failed turn with a fresh idempotencyKey. */
  retry: () => Promise<void>;
  /**
   * Execute a proposal the agent raised. Starts a wake job and polls it like
   * a normal turn, so the fills land as their own assistant message and the
   * proposal card above stays visible as the record of what was agreed.
   */
  confirmProposal: (proposalId: string, proposalMessageId: string) => Promise<void>;
  /** Decline a proposal and release the agent's on-chain pending lock. */
  cancelProposal: (proposalId: string, proposalMessageId: string) => Promise<void>;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function useChatWake({ capabilityId, agentAddress }: UseChatWakeInput): UseChatWakeResult {
  const { address } = useSigner();
  const walletAddress = useChatStore((s) => s.walletAddress);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );
  const agentId = currentSession?.agentId ?? null;

  const { ensureToken, onTokenExpired, resetReLease } = useChatTokenLease();

  // 'submitting' is persisted with the message, so an answer interrupted by a
  // refresh or a closed tab would leave its card disabled on "Submitting..."
  // for good. On mount, hand those cards back to the user: the server
  // re-checks state on every answer, and a confirm replays its original job
  // rather than executing twice.
  const messages = useChatStore((st) => st.messages);
  useEffect(() => {
    for (const m of messages) {
      if (m.proposalStatus === 'submitting') {
        updateMessage(m.id, { proposalStatus: 'pending' });
      }
    }
    // Mount-only: during a live answer this must not fight the in-flight
    // 'submitting' it just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  const [phase, setPhase] = useState<WakePhase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState<boolean>(false);
  const [placeholderId, setPlaceholderId] = useState<string | null>(null);
  // Last failed turn's message, retained so Retry can resubmit verbatim.
  const lastMessageRef = useRef<string | null>(null);

  // ---- Resume on mount / session switch ----
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!walletAddress || !currentSessionId || !currentSession || !capabilityId) {
        setPhase('idle');
        setJobId(null);
        return;
      }
      if (currentSession.sessionKind !== 'agent') {
        // Generic session — useChatWake is inert. ChatTurnAgent only mounts
        // for agent sessions but we double-guard here so a misuse doesn't
        // accidentally poll a generic session's nonexistent inflight row.
        setPhase('idle');
        setJobId(null);
        return;
      }
      try {
        const row = await loadInflight(walletAddress, currentSessionId);
        if (cancelled) return;
        if (!row || !row.jobId) {
          setPhase('idle');
          setJobId(null);
          return;
        }
        // We have a token-cap mismatch tolerance: a stored token is fine if
        // its capabilityId still matches the row's. ensureToken returns the
        // cached entry without re-signing.
        if (!agentAddress) {
          setPhase('idle');
          setJobId(null);
          return;
        }
        const lease = await ensureToken({
          wallet: walletAddress,
          agentAddress,
          capabilityId,
        });
        if (cancelled) return;
        setChatToken(lease.token.chatToken);
        setJobId(row.jobId);
        setPlaceholderId(row.placeholderMessageId);
        setPhase('polling');
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
        const mapped = mapReason(code);
        setErrorMessage(mapped.user);
        setRetryable(mapped.retryable);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, currentSessionId, capabilityId, agentAddress]);

  // ---- Polling ----
  const handleTokenExpired = useCallback(async () => {
    if (!walletAddress || !agentAddress || !capabilityId) return;
    try {
      const lease = await onTokenExpired({ wallet: walletAddress, agentAddress, capabilityId });
      setChatToken(lease.token.chatToken);
    } catch (err) {
      const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
      const mapped = mapReason(code);
      setErrorMessage(mapped.user);
      setRetryable(mapped.retryable);
      setPhase('error');
    }
  }, [walletAddress, agentAddress, capabilityId, onTokenExpired]);

  const pollState = usePollWakeJob({
    jobId,
    chatToken,
    enabled: phase === 'polling',
    onTokenExpired: handleTokenExpired,
  });

  // Track the latest in-flight phase from the poller, so the placeholder
  // assistant message reflects soft-wait / hard-wait / timeout copy.
  useEffect(() => {
    if (!placeholderId || phase !== 'polling') return;
    updateMessage(placeholderId, { wakePhase: pollState.phase });
  }, [pollState.phase, placeholderId, phase, updateMessage]);

  // Finalize when polling reaches done/error/timeout.
  useEffect(() => {
    if (phase !== 'polling') return;
    const res = pollState.response;
    if (!res && pollState.phase !== 'timeout' && !pollState.pollError) return;
    void (async () => {
      if (pollState.phase === 'timeout') {
        // 120s ceiling: keep the inflight row alive (10-min server TTL) so
        // a refresh within the window can resume polling. Surface a soft
        // hint and stop the spinner.
        if (placeholderId) {
          const mapped = mapReason('client_timeout');
          updateMessage(placeholderId, {
            wakePhase: 'timeout',
            content: mapped.user,
            failed: true,
            wakeReason: 'client_timeout',
            retryable: false,
          });
        }
        setPhase('timeout');
        return;
      }
      if (!res && pollState.pollError) {
        const code = pollState.pollError.code;
        const mapped = mapReason(code);
        if (placeholderId) {
          updateMessage(placeholderId, {
            content: mapped.user,
            failed: true,
            wakeReason: code,
            retryable: mapped.retryable,
            wakePhase: undefined,
          });
        }
        if (walletAddress && currentSessionId) {
          await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
        }
        setErrorMessage(mapped.user);
        setRetryable(mapped.retryable);
        setPhase('error');
        return;
      }
      if (!res) return;

      if (res.status === 'done') {
        const proposal: WakeProposal | undefined = res.outcome?.proposal;
        const summary = res.userMessage ?? res.outcome?.summary ?? '';
        if (placeholderId) {
          updateMessage(placeholderId, {
            content: summary || 'Done.',
            proposal,
            wakePhase: undefined,
            failed: false,
            wakeReason: undefined,
          });
        }
        if (walletAddress && currentSessionId) {
          await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
        }
        resetReLease();
        setPhase('done');
        return;
      }
      // status === 'error'
      const code = res.reason ?? 'wake_failed';
      const mapped = mapReason(code);
      if (placeholderId) {
        updateMessage(placeholderId, {
          content: res.userMessage ?? mapped.user,
          failed: true,
          wakeReason: code,
          retryable: mapped.retryable,
          wakePhase: undefined,
        });
      }
      if (walletAddress && currentSessionId) {
        await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
      }
      setErrorMessage(res.userMessage ?? mapped.user);
      setRetryable(mapped.retryable);
      setPhase('error');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollState.response, pollState.phase, pollState.pollError]);

  const submit = useCallback(
    async (message: string) => {
      if (
        !walletAddress ||
        !address ||
        !agentId ||
        !agentAddress ||
        !currentSessionId ||
        !capabilityId
      ) {
        setErrorMessage(mapReason('wallet_not_authorized').user);
        setRetryable(false);
        setPhase('error');
        return;
      }
      if (!message.trim()) return;
      setErrorMessage(null);
      lastMessageRef.current = message;

      // 1. user message + placeholder assistant turn. Placeholder lets us
      //    update content/proposal in-place when the wake finishes.
      addMessage({ role: 'user', content: message });
      const placeholder = addMessage({
        role: 'assistant',
        content: '',
        wakePhase: 'submitting',
      });
      setPlaceholderId(placeholder);

      // 2. inflight row with jobId:null first. Refresh in the next ~50ms
      //    sees a row without a jobId and drops it on resume — no orphan
      //    idemKey burned.
      const idemKey = mintIdempotencyKey();
      const messageHash = await sha256Hex(message);
      const baseRow: InflightWakeJob = {
        sessionId: currentSessionId,
        agentId,
        jobId: null,
        idempotencyKey: idemKey,
        messageHash,
        placeholderMessageId: placeholder,
        createdAt: Date.now(),
        expiresAt: Date.now() + INFLIGHT_TTL_MS,
      };
      try {
        await saveInflight(walletAddress, baseRow);
      } catch (err) {
        // IDB write failure shouldn't block the user — we'll still POST,
        // just lose resume-after-refresh on this turn.
        console.warn('[useChatWake] inflight save failed', err);
      }

      // 3. token lease (may pop wallet sign)
      setPhase('leasing');
      let tokenPayload;
      try {
        const lease = await ensureToken({
          wallet: walletAddress,
          agentAddress,
          capabilityId,
        });
        tokenPayload = lease.token;
        setChatToken(lease.token.chatToken);
      } catch (err) {
        const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
        const mapped = mapReason(code);
        updateMessage(placeholder, {
          content: mapped.user,
          failed: true,
          wakeReason: code,
          retryable: mapped.retryable,
          wakePhase: undefined,
        });
        await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
        setErrorMessage(mapped.user);
        setRetryable(mapped.retryable);
        setPhase('error');
        return;
      }

      // 4. POST /wake
      setPhase('submitting');
      let wakeRes;
      try {
        wakeRes = await postChatWake({
          chatToken: tokenPayload.chatToken,
          message,
          idempotencyKey: idemKey,
        });
      } catch (err) {
        // 401 here means the cached token expired between lease and post.
        // Re-lease once and retry the POST.
        if (err instanceof AgentChatApiError && err.code === 'expired') {
          try {
            const re = await onTokenExpired({
              wallet: walletAddress,
              agentAddress,
              capabilityId,
            });
            setChatToken(re.token.chatToken);
            wakeRes = await postChatWake({
              chatToken: re.token.chatToken,
              message,
              idempotencyKey: idemKey,
            });
          } catch (innerErr) {
            const code =
              innerErr instanceof AgentChatApiError ? innerErr.code : 'wake_failed';
            const mapped = mapReason(code);
            updateMessage(placeholder, {
              content: mapped.user,
              failed: true,
              wakeReason: code,
              retryable: mapped.retryable,
              wakePhase: undefined,
            });
            await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
            setErrorMessage(mapped.user);
            setRetryable(mapped.retryable);
            setPhase('error');
            return;
          }
        } else {
          const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
          const mapped = mapReason(code);
          updateMessage(placeholder, {
            content: mapped.user,
            failed: true,
            wakeReason: code,
            retryable: mapped.retryable,
            wakePhase: undefined,
          });
          await deleteInflight(walletAddress, currentSessionId).catch(() => undefined);
          setErrorMessage(mapped.user);
          setRetryable(mapped.retryable);
          setPhase('error');
          return;
        }
      }

      // 5. attach jobId to placeholder + inflight row, start polling
      updateMessage(placeholder, { wakeJobId: wakeRes.jobId, wakePhase: 'pending' });
      try {
        await saveInflight(walletAddress, { ...baseRow, jobId: wakeRes.jobId });
      } catch (err) {
        console.warn('[useChatWake] inflight jobId save failed', err);
      }
      setJobId(wakeRes.jobId);

      // Server can already short-circuit to 'error' (e.g. daily_cap_reached
      // is finalized synchronously). Honor that without an extra poll.
      if (wakeRes.status === 'error') {
        setPhase('polling'); // poll once to read userMessage
      } else {
        setPhase('polling');
      }
    },
    [
      walletAddress,
      address,
      agentId,
      agentAddress,
      currentSessionId,
      capabilityId,
      addMessage,
      updateMessage,
      ensureToken,
      onTokenExpired,
    ],
  );

  /**
   * Lease a chatToken, run `fn` with it, and re-lease once if the token
   * turned out to be expired between lease and call.
   *
   * submit() carries its own inline copy of this dance. It is left alone
   * deliberately: it is the well-tested path, and folding it in here would
   * put a refactor of message sending inside a change about proposals.
   */
  const callWithToken = useCallback(
    async <T,>(fn: (chatToken: string) => Promise<T>): Promise<T> => {
      if (!walletAddress || !agentAddress || !capabilityId) {
        throw new AgentChatApiError('wallet_not_authorized', 0);
      }
      const lease = await ensureToken({ wallet: walletAddress, agentAddress, capabilityId });
      setChatToken(lease.token.chatToken);
      try {
        return await fn(lease.token.chatToken);
      } catch (err) {
        if (err instanceof AgentChatApiError && err.code === 'expired') {
          const re = await onTokenExpired({ wallet: walletAddress, agentAddress, capabilityId });
          setChatToken(re.token.chatToken);
          return await fn(re.token.chatToken);
        }
        throw err;
      }
    },
    [walletAddress, agentAddress, capabilityId, ensureToken, onTokenExpired],
  );

  const confirmProposal = useCallback(
    async (proposalId: string, proposalMessageId: string) => {
      if (!walletAddress || !currentSessionId || !agentId) {
        // Say so rather than no-opping: a silent return makes Confirm look
        // like a dead button.
        setErrorMessage(mapReason('wallet_not_authorized').user);
        setRetryable(false);
        setPhase('error');
        return;
      }
      // One job per session at a time. placeholderId / jobId / the inflight
      // row are all single-slot, so confirming mid-turn would strand the
      // turn already polling and lose its result.
      if (phase === 'leasing' || phase === 'submitting' || phase === 'polling') {
        setErrorMessage('Your agent is still working on the previous message.');
        setRetryable(false);
        return;
      }
      setErrorMessage(null);
      updateMessage(proposalMessageId, { proposalStatus: 'submitting' });

      // The execution result is its own turn: overwriting the proposal card
      // would erase what the user agreed to.
      const placeholder = addMessage({
        role: 'assistant',
        content: '',
        wakePhase: 'submitting',
      });
      setPlaceholderId(placeholder);
      setPhase('submitting');

      // Derived from the proposal, not minted per click. A proposal can be
      // confirmed exactly once, so the key is a property of the proposal:
      // a retry after a lost response replays the original job server side
      // instead of being told "already answered".
      const idemKey = `confirm-${proposalId}`;
      // Written before the POST, like submit(), so a response lost in flight
      // still leaves something to resume from.
      const baseRow: InflightWakeJob = {
        sessionId: currentSessionId,
        agentId,
        jobId: null,
        idempotencyKey: idemKey,
        messageHash: await sha256Hex(`confirm:${proposalId}`),
        placeholderMessageId: placeholder,
        createdAt: Date.now(),
        expiresAt: Date.now() + INFLIGHT_TTL_MS,
      };
      try {
        await saveInflight(walletAddress, baseRow);
      } catch (err) {
        console.warn('[useChatWake] confirm inflight save failed', err);
      }

      let res;
      try {
        res = await callWithToken((chatToken) =>
          postProposalConfirm({ chatToken, proposalId, idempotencyKey: idemKey }),
        );
      } catch (err) {
        const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
        const mapped = mapReason(code);
        updateMessage(placeholder, {
          content: mapped.user,
          failed: true,
          wakeReason: code,
          retryable: false,
          wakePhase: undefined,
        });
        // A rejected confirm leaves the proposal answerable only if the
        // server said so; proposal_not_pending / _expired are terminal.
        updateMessage(proposalMessageId, {
          proposalStatus:
            code === 'proposal_not_pending' || code === 'proposal_expired'
              ? 'resolved'
              : 'pending',
        });
        setErrorMessage(mapped.user);
        setRetryable(false);
        setPhase('error');
        return;
      }

      updateMessage(proposalMessageId, { proposalStatus: 'confirmed' });
      updateMessage(placeholder, { wakeJobId: res.jobId, wakePhase: 'pending' });
      try {
        await saveInflight(walletAddress, { ...baseRow, jobId: res.jobId });
      } catch (err) {
        console.warn('[useChatWake] confirm inflight jobId save failed', err);
      }
      setJobId(res.jobId);
      setPhase('polling');
    },
    [
      walletAddress,
      currentSessionId,
      agentId,
      phase,
      addMessage,
      updateMessage,
      callWithToken,
    ],
  );

  const cancelProposal = useCallback(
    async (proposalId: string, proposalMessageId: string) => {
      // Cancel starts no job, but it does flip the card's state, so refuse
      // while an answer for it may already be in flight.
      if (phase === 'leasing' || phase === 'submitting') {
        return;
      }
      setErrorMessage(null);
      updateMessage(proposalMessageId, { proposalStatus: 'submitting' });
      try {
        await callWithToken((chatToken) => postProposalCancel({ chatToken, proposalId }));
      } catch (err) {
        const code = err instanceof AgentChatApiError ? err.code : 'wake_failed';
        const mapped = mapReason(code);
        // An already-answered proposal is not something the user can act on
        // again, so settle the card rather than inviting another attempt.
        updateMessage(proposalMessageId, {
          proposalStatus:
            code === 'proposal_not_pending' || code === 'proposal_expired'
              ? 'resolved'
              : 'pending',
        });
        setErrorMessage(mapped.user);
        setRetryable(false);
        return;
      }
      updateMessage(proposalMessageId, { proposalStatus: 'cancelled' });
    },
    [phase, updateMessage, callWithToken],
  );

  const retry = useCallback(async () => {
    const last = lastMessageRef.current;
    if (!last) return;
    setRetryable(false);
    setErrorMessage(null);
    await submit(last);
  }, [submit]);

  const busy = phase === 'leasing' || phase === 'submitting' || phase === 'polling';

  return { busy, phase, errorMessage, retryable, submit, retry, confirmProposal, cancelProposal };
}

// Re-export for tests that want the raw Message shape without importing types/chat
export type { Message };
