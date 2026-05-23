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
import { mintIdempotencyKey, postChatWake, AgentChatApiError } from '../services/chatWakeClient';
import { deleteInflight, loadInflight, saveInflight } from '../services/chatStorage';
import { mapReason } from '../services/chatWakeReasons';
import { useChatTokenLease } from './useChatTokenLease';
import { usePollWakeJob } from './usePollWakeJob';
import type { InflightWakeJob, Message, WakeProposal } from '../types/chat';
import { generateId } from '../types/chat';

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

  const retry = useCallback(async () => {
    const last = lastMessageRef.current;
    if (!last) return;
    setRetryable(false);
    setErrorMessage(null);
    await submit(last);
  }, [submit]);

  const busy = phase === 'leasing' || phase === 'submitting' || phase === 'polling';

  return { busy, phase, errorMessage, retryable, submit, retry };
}

// Re-export for tests that want the raw Message shape without importing types/chat
export type { Message };
