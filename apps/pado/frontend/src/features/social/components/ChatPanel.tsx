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
    nickname, needsNickname, nicknameRateLimit,
  } = useChat();

  // false = closed, 'first' = first-time set (with pending message), 'edit' = change existing
  const [nicknameModalMode, setNicknameModalMode] = useState<false | 'first' | 'edit'>(false);
  const pendingMessageRef = useRef<string | null>(null);

  // Wrap sendMessage to prompt nickname modal on first attempt if needed
  const handleSend = useCallback((content: string) => {
    if (needsNickname) {
      pendingMessageRef.current = content;
      setNicknameModalMode('first');
      return;
    }
    sendMessage(content);
  }, [needsNickname, sendMessage]);

  const handleNicknameSuccess = useCallback((_name: string) => {
    const wasFirstTime = nicknameModalMode === 'first';
    setNicknameModalMode(false);
    // Send the pending message that triggered the modal (first-time only)
    if (wasFirstTime) {
      const pending = pendingMessageRef.current;
      pendingMessageRef.current = null;
      if (pending) {
        setTimeout(() => sendMessage(pending), 100);
      }
    }
  }, [sendMessage, nicknameModalMode]);

  const canEditNickname = nicknameRateLimit?.canChange !== false;

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
            <button
              onClick={() => canEditNickname && setNicknameModalMode('edit')}
              className={`text-trading-xs text-theme-text-muted truncate max-w-[100px] flex items-center gap-0.5
                ${canEditNickname ? 'hover:text-theme-text-primary cursor-pointer' : 'cursor-default'}`}
              title={canEditNickname ? `${nickname}#${addressSuffix} (click to change)` : `${nickname}#${addressSuffix}`}
            >
              {nickname}#{addressSuffix}
              {canEditNickname && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              )}
            </button>
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
      {nicknameModalMode && (
        <SetNicknameModal
          addressSuffix={addressSuffix}
          currentNickname={nicknameModalMode === 'edit' ? nickname ?? undefined : undefined}
          rateLimit={nicknameRateLimit ?? undefined}
          onSuccess={handleNicknameSuccess}
          onClose={() => {
            setNicknameModalMode(false);
            pendingMessageRef.current = null;
          }}
        />
      )}
    </div>
  );
}
