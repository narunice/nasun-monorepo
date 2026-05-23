/**
 * AgentChat — per-agent wake-mode chat surface, mounted as a sub-tab inside
 * AgentDetail. Talks to the on-chain agent via chat-server's web chat-wake:
 *
 *   challenge → wallet sign → /session → /wake → poll /wake/:jobId
 *
 * This surface is *exclusive* to a single (wallet, agent, capability). Unlike
 * the top-level "AI Chat" tab — which lists every generic-kind session a
 * wallet owns — here we only render `sessionKind='agent'` rows that belong
 * to this specific agent. Filtering happens client-side off the shared
 * chatStore so both surfaces share IDB storage without polluting each other.
 *
 * Why nested inside AgentDetail (not a top-level tab):
 *   - capability resolution is trivial — this page already knows the agent
 *     and its capabilityId, no agent-picker dropdown needed
 *   - the conversation is about THIS agent (positions, budget, recent
 *     activity), so the surrounding tabs (Overview/Activity/Settings) are
 *     the right context to switch back to
 *   - alpha-gate / paused-agent banners can reuse what AgentDetail already
 *     shows for the same agent
 *
 * Generic LLM chat (the legacy useRequestWithRetry path) lives in the
 * top-level "AI Chat" tab and is intentionally NOT reachable from here.
 */

import { useEffect, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChatWake } from '../../hooks/useChatWake';
import { ChatInput } from '../../components/input/ChatInput';
import { MessageList } from '../../components/chat/MessageList';
import { SessionList } from '../../components/chat/SessionList';
import { NewChatButton } from '../../components/chat/NewChatButton';
import { MODEL_PRICING } from '../../services/network';
import { alphaGateTooltip } from '../../services/chatWakeReasons';
import type { AlphaStatusResponse } from '../../alpha/alphaApiClient';

interface AgentChatProps {
  walletAddress: string;
  agentId: string;
  agentAddress: string;
  capabilityId: string | null;
  /** Pass-through alpha state from the parent (AiTab → AgentDetail). When
   * not active/exempt we render a non-blocking banner and disable input;
   * server-side guards remain authoritative. */
  alphaStatus: AlphaStatusResponse | null;
  /** Whether the parent has determined the agent is paused (server-side
   * pause flag). Independent of alpha gate. */
  isAgentActive: boolean;
}

export function AgentChat({
  walletAddress,
  agentId,
  agentAddress,
  capabilityId,
  alphaStatus,
  isAgentActive,
}: AgentChatProps) {
  const load = useChatStore((s) => s.load);
  const allSessions = useChatStore((s) => s.sessions);
  const messages = useChatStore((s) => s.messages);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const removeSession = useChatStore((s) => s.removeSession);

  // Filter the wallet-scoped store down to wake-mode sessions for THIS agent.
  // Both ChatView and AgentChat read from the same store; the discriminator
  // keeps the two lists hermetic.
  const sessions = useMemo(
    () =>
      allSessions.filter(
        (s) => s.sessionKind === 'agent' && s.agentId === agentId,
      ),
    [allSessions, agentId],
  );

  // Load this wallet+agent's sessions on mount / wallet+agent switch.
  // The store's `load(wallet, agent)` is per-agent-scoped, so the agent
  // dropdown ChatView uses for billing is irrelevant here.
  useEffect(() => {
    void load(walletAddress, agentId);
  }, [walletAddress, agentId, load]);

  const { busy, submit, retry, retryable, errorMessage } = useChatWake({
    capabilityId,
    agentAddress,
  });

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  // If the wallet+agent has no agent-kind sessions yet, surface a clear empty
  // state instead of silently auto-creating. The user clicks "New chat" to
  // make the wake-mode intent explicit.
  const hasMessages = messages.length > 0 || busy;
  const alphaState = alphaStatus?.state ?? 'none';
  const alphaActive = alphaState === 'active' || alphaState === 'exempt';
  const gateBanner = !alphaActive ? alphaGateTooltip(alphaState) : null;

  const placeholder = !isAgentActive
    ? 'Agent paused — activate to chat'
    : !alphaActive
      ? gateBanner ?? 'Alpha access required'
      : !capabilityId
        ? 'Missing capability — re-register agent'
        : !currentSession
          ? 'Start a new chat to talk to this agent'
          : busy
            ? 'Working...'
            : 'Tell your agent what to do...';

  const inputDisabled =
    busy || !alphaActive || !isAgentActive || !capabilityId || !currentSession;

  const handleNewChat = () => {
    if (!capabilityId) return;
    void createSession({ agentId, kind: 'agent', capabilityId });
  };

  // Retry is only meaningful on the last failed assistant turn — useChatWake
  // tracks the in-flight message itself.
  const handleRetry = () => {
    if (!retryable) return;
    void retry();
  };

  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[480px]">
      <aside className="self-start sticky top-[58px] h-[calc(100dvh-72px)] flex flex-col min-h-0 border-r border-uju-border/60 pr-3">
        <div className="pb-3 border-b border-uju-border/60">
          <NewChatButton onClick={handleNewChat} disabled={!capabilityId || !alphaActive} />
        </div>
        <div className="flex-1 overflow-y-auto py-2 -mx-1">
          <SessionList
            sessions={sessions}
            activeSessionId={currentSessionId}
            isLoading={isLoading}
            onSelect={(id) => void switchSession(id)}
            onDelete={(id) => void removeSession(id)}
          />
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        {gateBanner && (
          <div className="mb-3 px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
            {gateBanner}
          </div>
        )}
        {!isAgentActive && (
          <div className="mb-3 px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
            This agent is paused. Activate it from the Settings tab to send messages.
          </div>
        )}
        {errorMessage && (
          <div className="mb-3 px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex-1">
          <div className="max-w-3xl mx-auto px-1 py-4">
            {isLoading && messages.length === 0 ? (
              <div className="h-32 rounded-xl bg-uju-card/60 animate-pulse" />
            ) : !currentSession ? (
              <div className="py-12 text-center rounded-xl border border-uju-border/60 border-dashed">
                <p className="text-sm text-white">Talk to your agent.</p>
                <p className="text-sm text-uju-secondary/70 mt-1 max-w-md mx-auto">
                  Agent mode forwards your message to this agent's on-chain runtime.
                  A wallet signature is required once per 10-minute session.
                </p>
              </div>
            ) : !hasMessages ? (
              <div className="py-12 text-center rounded-xl border border-uju-border/60 border-dashed">
                <p className="text-sm text-white">Ask your agent anything.</p>
                <p className="text-sm text-uju-secondary/70 mt-1">
                  The agent can read its positions, budget, and recent activity to answer.
                </p>
              </div>
            ) : (
              <MessageList messages={messages} onRetry={handleRetry} />
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-1 border-t border-uju-border/60 bg-uju-bg/95 backdrop-blur-sm px-1 pt-3 pb-3">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSubmit={(msg) => void submit(msg)}
              disabled={inputDisabled}
              placeholder={placeholder}
              selectedModel={selectedModel}
              onSelectModel={(modelId) => {
                if (modelId in MODEL_PRICING) {
                  setSelectedModel(modelId as keyof typeof MODEL_PRICING);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
