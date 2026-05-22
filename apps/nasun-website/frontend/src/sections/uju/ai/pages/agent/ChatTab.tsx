/**
 * ChatTab — per-agent conversational chat surface.
 *
 * Multi-session UX: left sidebar lists past sessions (most-recent first) with
 * a "New chat" button on top; right pane shows the current session's messages
 * and the input. Each agent owns its own session list.
 *
 * The trader loop is server-side (nasun-ai-runtime). This tab is purely
 * user-driven chat: no scheduler, no NFT gate, no Budget escrow setup (the
 * Escrow sub-tab handles funding).
 */

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useRequestWithRetry } from '../../hooks/request/useRequestWithRetry';
import { useCapability } from '../../hooks/useCapability';
import { useAerRecords } from '../../hooks/useAerRecords';
import { MODEL_PRICING } from '../../services/network';
import { ChatInput } from '../../components/input/ChatInput';
import { MessageList } from '../../components/chat/MessageList';
import { SessionList } from '../../components/chat/SessionList';
import { NewChatButton } from '../../components/chat/NewChatButton';
import { ResultViewerModal } from '../../components/modals/ResultViewerModal';
import type { CreateRequestCapability } from '../../hooks/request/useCreateRequest';

interface ChatTabProps {
  walletAddress: string;
  agentId: string;
  capabilityId: string | null;
}

export function ChatTab({ walletAddress, agentId, capabilityId }: ChatTabProps) {
  const load = useChatStore((s) => s.load);
  const messages = useChatStore((s) => s.messages);
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const removeSession = useChatStore((s) => s.removeSession);

  useEffect(() => {
    void load(walletAddress, agentId);
  }, [walletAddress, agentId, load]);

  const { data: capabilityData, isLoading: capabilityLoading } = useCapability(capabilityId);

  const capability: CreateRequestCapability | null = useMemo(() => {
    if (!capabilityId || !capabilityData) return null;
    return {
      capabilityId,
      expectedCapabilityVersion: capabilityData.version.toString(),
      actionType: 'cognition.chat.v1',
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
    (selectedExecutor?.teeType ?? 0) > 0 && MODEL_PRICING[selectedModel]?.provider === 'tee';

  const [aerRequestId, setAerRequestId] = useState<number | null>(null);
  const { data: aerRecords } = useAerRecords(aerRequestId !== null ? walletAddress : null);
  const selectedAerRecord = useMemo(() => {
    if (aerRequestId === null) return null;
    return aerRecords?.find((r) => r.requestId === aerRequestId) ?? null;
  }, [aerRecords, aerRequestId]);

  const hasMessages = messages.length > 0 || isProcessing;
  const isLegacy = capabilityId === null;
  const capabilityNotReady = !isLegacy && (capabilityLoading || !capabilityData);

  const placeholder = isLegacy
    ? 'Legacy agent: re-register to enable chat'
    : capabilityNotReady
      ? 'Loading capability...'
      : executorsLoading
        ? 'Loading executors...'
        : executorsError
          ? 'Failed to load executors'
          : !selectedExecutor
            ? 'No eligible executors available'
            : 'Ask anything...';

  const inputDisabled =
    isProcessing || !selectedExecutor || isLegacy || capabilityNotReady;

  // Layout: fixed-height grid with sidebar on the left. The whole tab is
  // capped to (viewport - chrome) so the sidebar scrolls independently of
  // the messages pane and the input stays pinned to the bottom.
  return (
    <div className="grid grid-cols-[220px_1fr] gap-3 h-[calc(100vh-300px)] min-h-[480px]">
      {/* Sidebar */}
      <aside className="flex flex-col min-h-0 rounded-xl border border-uju-border/60 bg-uju-card/40 overflow-hidden">
        <div className="p-2 border-b border-uju-border/60">
          <NewChatButton
            onClick={() => void createSession()}
            disabled={!walletAddress || !agentId}
          />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
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
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-1 py-4">
            {isLoading && messages.length === 0 ? (
              <div className="h-32 rounded-xl bg-uju-card/60 animate-pulse" />
            ) : !hasMessages ? (
              <div className="py-12 text-center rounded-xl border border-uju-border/60 border-dashed">
                <p className="text-sm text-white">Start a conversation with this agent.</p>
                <p className="text-sm text-uju-secondary/70 mt-1">
                  Each prompt creates an on-chain AER receipt visible in the Activity tab.
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
