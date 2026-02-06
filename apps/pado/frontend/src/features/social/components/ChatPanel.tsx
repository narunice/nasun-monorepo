import { useState, useCallback, useRef } from 'react';
import { useSignerAddress } from '@nasun/wallet';
import { useChat } from '../hooks/useChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { SetNicknameModal } from './SetNicknameModal';

interface Props {
  onMinimize?: () => void;
  onPopOut?: () => void;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'bg-green-500' :
    status === 'connecting' || status === 'authenticating' ? 'bg-yellow-500' :
    'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

export function ChatPanel({ onMinimize, onPopOut }: Props) {
  const address = useSignerAddress();
  const {
    messages, sendMessage, loadMore, isConnected, status, onlineCount, hasMore,
    nickname, needsNickname,
  } = useChat();

  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);

  // Wrap sendMessage to prompt nickname modal on first attempt if needed
  const handleSend = useCallback((content: string) => {
    if (needsNickname) {
      pendingMessageRef.current = content;
      setShowNicknameModal(true);
      return;
    }
    sendMessage(content);
  }, [needsNickname, sendMessage]);

  const handleNicknameSuccess = useCallback((_name: string) => {
    setShowNicknameModal(false);
    // Send the pending message that triggered the modal
    const pending = pendingMessageRef.current;
    pendingMessageRef.current = null;
    if (pending) {
      // Small delay to let the nickname state propagate
      setTimeout(() => sendMessage(pending), 100);
    }
  }, [sendMessage]);

  const addressSuffix = address ? address.slice(-4) : '0000';

  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary rounded-lg overflow-hidden border border-theme-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-trading-sm font-medium text-theme-text-primary">Chat</span>
          <StatusDot status={status} />
        </div>
        <div className="flex items-center gap-2">
          {isConnected && nickname && (
            <span className="text-trading-xs text-theme-text-muted truncate max-w-[80px]" title={`${nickname}#${addressSuffix}`}>
              {nickname}#{addressSuffix}
            </span>
          )}
          {isConnected && (
            <span className="text-trading-xs text-theme-text-muted">
              {onlineCount} online
            </span>
          )}
          {onPopOut && (
            <button
              onClick={onPopOut}
              className="p-0.5 text-theme-text-muted hover:text-theme-text-primary transition-colors"
              title="Pop out chat"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M14 10l6.1-6.1M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
              </svg>
            </button>
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
        onSend={handleSend}
        disabled={!isConnected}
        disabledPlaceholder={address ? 'Connecting...' : undefined}
      />

      {/* Nickname modal */}
      {showNicknameModal && (
        <SetNicknameModal
          addressSuffix={addressSuffix}
          onSuccess={handleNicknameSuccess}
          onClose={() => {
            setShowNicknameModal(false);
            pendingMessageRef.current = null;
          }}
        />
      )}
    </div>
  );
}
