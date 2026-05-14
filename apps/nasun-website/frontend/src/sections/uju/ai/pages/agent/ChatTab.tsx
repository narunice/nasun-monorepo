/**
 * ChatTab - per-agent conversational chat surface.
 *
 * Each agent owns one conversation persisted in IndexedDB (per-wallet) and a
 * model selector that lets the user dial in cloud vs TEE per turn. Submits
 * route through useRequestWithRetry which weighted-random-picks an executor,
 * pays in NUSDC, optionally encrypts to TEE, and writes the assistant reply
 * back into the store.
 *
 * The trader-loop is server-side (nasun-ai-runtime). This tab is purely
 * user-driven chat: no scheduler, no NFT gate, no Budget escrow setup (the
 * Escrow sub-tab handles funding).
 */

import { useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useRequestWithRetry } from '../../hooks/request/useRequestWithRetry';
import { MODEL_PRICING } from '../../services/network';
import { ChatInput } from '../../components/input/ChatInput';
import { MessageList } from '../../components/chat/MessageList';

interface ChatTabProps {
  walletAddress: string;
  agentId: string;
}

export function ChatTab({ walletAddress, agentId }: ChatTabProps) {
  const load = useChatStore((s) => s.load);
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);

  useEffect(() => {
    void load(walletAddress, agentId);
  }, [walletAddress, agentId, load]);

  const {
    submit,
    isProcessing,
    selectedExecutor,
    requestStatus,
    executorsLoading,
    executorsError,
  } = useRequestWithRetry();

  const isTeeExecutor =
    (selectedExecutor?.teeType ?? 0) > 0 && MODEL_PRICING[selectedModel]?.provider === 'tee';

  const hasMessages = messages.length > 0 || isProcessing;

  const placeholder = executorsLoading
    ? 'Loading executors...'
    : executorsError
      ? 'Failed to load executors'
      : !selectedExecutor
        ? 'No eligible executors available'
        : 'Ask anything...';

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[480px]">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-1 py-4">
          {isLoading ? (
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
            />
          )}
        </div>
      </div>

      <div className="border-t border-uju-border/60 bg-uju-bg/40 pt-3">
        <div className="max-w-3xl mx-auto px-1">
          <ChatInput
            onSubmit={submit}
            disabled={isProcessing || !selectedExecutor}
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
  );
}
