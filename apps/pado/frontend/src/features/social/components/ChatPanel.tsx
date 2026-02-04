import { useSignerAddress } from '@nasun/wallet';
import { useChat } from '../hooks/useChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface Props {
  onMinimize?: () => void;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'bg-green-500' :
    status === 'connecting' || status === 'authenticating' ? 'bg-yellow-500' :
    'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

export function ChatPanel({ onMinimize }: Props) {
  const address = useSignerAddress();
  const { messages, sendMessage, loadMore, isConnected, status, onlineCount, hasMore } = useChat();

  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary rounded-lg overflow-hidden border border-theme-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-trading-sm font-medium text-theme-text-primary">Chat</span>
          <StatusDot status={status} />
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="text-trading-xs text-theme-text-muted">
              {onlineCount} online
            </span>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-0.5 text-theme-text-muted hover:text-theme-text-primary transition-colors"
              title="Minimize chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        currentAddress={address}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={!isConnected}
        disabledPlaceholder={address ? 'Connecting...' : undefined}
      />
    </div>
  );
}
