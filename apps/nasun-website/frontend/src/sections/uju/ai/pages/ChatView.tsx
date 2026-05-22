/**
 * ChatView — top-level chat surface (Agents | Chat split).
 *
 * Sessions are scoped to the wallet (not the agent) so the sidebar reads as
 * "my chats". Each session still carries an agentId that determines which
 * capability is billed for the next turn; switching sessions implicitly
 * switches the billing agent. Users can also pick the billing agent for the
 * next *new* session via the dropdown above the session list.
 */

import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { useRequestWithRetry } from "../hooks/request/useRequestWithRetry";
import { useCapability } from "../hooks/useCapability";
import { useAerRecords } from "../hooks/useAerRecords";
import { useAgentProfiles } from "../hooks/useAgentProfiles";
import { MODEL_PRICING } from "../services/network";
import { ChatInput } from "../components/input/ChatInput";
import { MessageList } from "../components/chat/MessageList";
import { SessionList } from "../components/chat/SessionList";
import { NewChatButton } from "../components/chat/NewChatButton";
import { ResultViewerModal } from "../components/modals/ResultViewerModal";
import type { CreateRequestCapability } from "../hooks/request/useCreateRequest";

interface ChatViewProps {
  walletAddress: string;
  onRegisterAgent: () => void;
}

export function ChatView({ walletAddress, onRegisterAgent }: ChatViewProps) {
  const { data: agents, isLoading: agentsLoading } =
    useAgentProfiles(walletAddress);

  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.isActive),
    [agents],
  );

  // Pick a starting "billing" agent: first active. Falls back to first
  // existing agent so the user can still browse history when none are active.
  const initialDefault = useMemo(() => {
    if (!agents || agents.length === 0) return null;
    return activeAgents[0]?.id ?? agents[0].id;
  }, [agents, activeAgents]);

  const loadForWallet = useChatStore((s) => s.loadForWallet);
  const sessions = useChatStore((s) => s.sessions);
  const messages = useChatStore((s) => s.messages);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const defaultAgentId = useChatStore((s) => s.defaultAgentId);
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const setDefaultAgentId = useChatStore((s) => s.setDefaultAgentId);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const removeSession = useChatStore((s) => s.removeSession);

  useEffect(() => {
    void loadForWallet(walletAddress, initialDefault);
  }, [walletAddress, initialDefault, loadForWallet]);

  // Resolve which agent owns the active session — its capability is what
  // signs the next turn. Falls back to the wallet's default billing agent
  // when no session is active yet.
  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );
  const billingAgentId = currentSession?.agentId ?? defaultAgentId;
  const billingAgent = useMemo(
    () => (agents ?? []).find((a) => a.id === billingAgentId) ?? null,
    [agents, billingAgentId],
  );
  const capabilityId = billingAgent?.capabilityId ?? null;

  const { data: capabilityData, isLoading: capabilityLoading } =
    useCapability(capabilityId);

  const capability: CreateRequestCapability | null = useMemo(() => {
    if (!capabilityId || !capabilityData) return null;
    return {
      capabilityId,
      expectedCapabilityVersion: capabilityData.version.toString(),
      actionType: "cognition.chat.v1",
      eventClass: 1,
      triggeredByType: 4,
    };
  }, [capabilityId, capabilityData]);

  const {
    submit,
    isProcessing,
    selectedExecutor,
    requestStatus,
    executorsLoading,
    executorsError,
  } = useRequestWithRetry({ capability });

  const isTeeExecutor =
    (selectedExecutor?.teeType ?? 0) > 0 &&
    MODEL_PRICING[selectedModel]?.provider === "tee";

  const [aerRequestId, setAerRequestId] = useState<number | null>(null);
  const { data: aerRecords } = useAerRecords(
    aerRequestId !== null ? walletAddress : null,
  );
  const selectedAerRecord = useMemo(() => {
    if (aerRequestId === null) return null;
    return aerRecords?.find((r) => r.requestId === aerRequestId) ?? null;
  }, [aerRecords, aerRequestId]);

  const hasAnyAgent = (agents?.length ?? 0) > 0;
  const noActiveAgent = hasAnyAgent && activeAgents.length === 0;
  const hasMessages = messages.length > 0 || isProcessing;
  const capabilityNotReady =
    !!capabilityId && (capabilityLoading || !capabilityData);

  const placeholder = !hasAnyAgent
    ? "Register an agent to start chatting"
    : noActiveAgent
      ? "No active agent — activate one to chat"
      : !capabilityId
        ? "Select a billing agent above"
        : capabilityNotReady
          ? "Loading capability..."
          : executorsLoading
            ? "Loading executors..."
            : executorsError
              ? "Failed to load executors"
              : !selectedExecutor
                ? "No eligible executors available"
                : "Ask anything...";

  const inputDisabled =
    isProcessing ||
    !selectedExecutor ||
    !capability ||
    !hasAnyAgent ||
    noActiveAgent ||
    capabilityNotReady;

  if (agentsLoading) {
    return <div className="h-32 rounded-xl bg-uju-card/60 animate-pulse" />;
  }

  if (!hasAnyAgent) {
    return (
      <div className="py-12 text-center space-y-3 bg-uju-card/40 rounded-xl border border-uju-border/40">
        <p className="text-sm text-white">No agent yet.</p>
        <p className="text-sm text-uju-secondary/70 max-w-sm mx-auto">
          Chat runs on top of an agent's on-chain capability. Register one to
          start your first conversation.
        </p>
        <button
          type="button"
          onClick={onRegisterAgent}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
        >
          Register agent
        </button>
      </div>
    );
  }

  // Only active agents appear in the dropdown — inactive ones can't actually
  // sign a request, so offering them as a "billing" option would mislead.
  // Their past sessions still show up in the sidebar (read-only).
  const billingOptions = (agents ?? []).filter((a) => a.isActive);

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6 h-[calc(100vh-260px)] min-h-[480px]">
      {/* Sidebar — borderless panel; the divider with the main pane is
          provided by the gap, not a card frame. */}
      <aside className="flex flex-col min-h-0 border-r border-uju-border/60 pr-3">
        <div className="space-y-2 pb-3 border-b border-uju-border/60">
          <div className="space-y-1">
            <label className="text-[10px] tracking-wider text-uju-secondary/70">
              Select Agent for New Chats
            </label>
            <select
              value={defaultAgentId ?? ""}
              onChange={(e) => setDefaultAgentId(e.target.value || null)}
              className="w-full text-sm bg-uju-bg border border-uju-border/60 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-pado-2"
            >
              {billingOptions.length === 0 && (
                <option value="" disabled>
                  No active agent
                </option>
              )}
              {billingOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <NewChatButton
            onClick={() => void createSession()}
            disabled={!defaultAgentId}
          />
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

      {/* Main pane */}
      <div className="flex flex-col min-w-0 min-h-0">
        {billingAgent && (
          <div className="mb-2 text-xs text-uju-secondary/70 px-1">
            Billed via <span className="text-white">{billingAgent.name}</span>
            {!billingAgent.isActive && (
              <span className="ml-1 text-amber-300/80">(inactive)</span>
            )}
          </div>
        )}
        {noActiveAgent && (
          <div className="mb-3 px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
            All agents are paused. Activate one to send new messages — past
            chats stay readable.
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-1 py-4">
            {isLoading && messages.length === 0 ? (
              <div className="h-32 rounded-xl bg-uju-card/60 animate-pulse" />
            ) : !hasMessages ? (
              <div className="py-12 text-center rounded-xl border border-uju-border/60 border-dashed">
                <p className="text-sm text-white">Start a conversation.</p>
                <p className="text-sm text-uju-secondary/70 mt-1">
                  Each prompt creates an on-chain AER receipt, billed to the
                  selected agent.
                </p>
              </div>
            ) : (
              <MessageList
                messages={messages}
                isProcessing={isProcessing}
                isTeeExecutor={isTeeExecutor}
                requestStatus={requestStatus}
                onOpenAer={(id) => setAerRequestId(id)}
              />
            )}
          </div>
        </div>

        <div className="border-t border-uju-border/60 bg-uju-bg/40 pt-3">
          <div className="max-w-3xl mx-auto px-1">
            <ChatInput
              onSubmit={submit}
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

      {aerRequestId !== null && selectedAerRecord && (
        <ResultViewerModal
          requestId={aerRequestId}
          record={selectedAerRecord}
          authorizer={walletAddress}
          onClose={() => setAerRequestId(null)}
        />
      )}
    </div>
  );
}
