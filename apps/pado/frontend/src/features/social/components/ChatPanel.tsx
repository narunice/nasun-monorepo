import { useRef } from 'react';
import { useSignerAddress } from '@nasun/wallet';
import { useChat } from '../hooks/useChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import { ChatRoomTabs } from './ChatRoomTabs';
import { useChatTextSize } from '../hooks/useChatTextSize';

interface Props {
  onMinimize?: () => void;
  onPopOut?: () => void;
  hideHeader?: boolean;
}

function StatusDot({ status, loggedIn }: { status: string; loggedIn: boolean }) {
  const color =
    !loggedIn ? 'bg-theme-text-muted/40' :
    status === 'connected' ? 'bg-green-500' :
    status === 'connecting' || status === 'authenticating' || status === 'reconnecting' ? 'bg-yellow-500' :
    'bg-red-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

export function ChatPanel({ onMinimize, onPopOut, hideHeader }: Props) {
  const address = useSignerAddress();
  const {
    messages, sendMessage, loadMore, isConnected, displayStatus, onlineCount, hasMore,
    toggleReaction,
    marketRooms, languageRooms, activeRoomId, setActiveRoom,
    unreadCounts,
  } = useChat();

  const chatInputRef = useRef<ChatInputHandle>(null);

  const { textSize, increase, decrease, isMin, isMax } = useChatTextSize();

  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary rounded-lg overflow-hidden border border-[color:var(--color-card-border)]">
      {/* Header (hidden in floating mode where FloatingChatPopup provides its own) */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-trading-sm font-medium text-theme-text-primary">Chat</span>
            <StatusDot status={displayStatus} loggedIn={!!address} />
            {!address ? null :
              displayStatus === 'connecting' || displayStatus === 'authenticating' ? (
                <span className="text-trading-xs text-yellow-500">Connecting...</span>
              ) : displayStatus === 'reconnecting' ? (
                <span className="text-trading-xs text-yellow-500">Reconnecting...</span>
              ) : displayStatus !== 'connected' ? (
                <span className="text-trading-xs text-red-400">Offline</span>
              ) : null
            }
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <span className="text-trading-xs text-theme-text-muted">
                {onlineCount} online
              </span>
            )}
            {/* Text size controls */}
            <div className="flex items-center border-l border-theme-border pl-1.5 ml-0.5">
              <button
                onClick={decrease}
                disabled={isMin}
                className={`px-0.5 font-semibold leading-none transition-colors ${
                  isMin ? 'text-theme-text-muted/30 cursor-default' : 'text-theme-text-muted hover:text-theme-text-primary'
                }`}
                title="Decrease text size"
                style={{ fontSize: '10px' }}
              >A</button>
              <button
                onClick={increase}
                disabled={isMax}
                className={`px-0.5 font-semibold leading-none transition-colors ${
                  isMax ? 'text-theme-text-muted/30 cursor-default' : 'text-theme-text-muted hover:text-theme-text-primary'
                }`}
                title="Increase text size"
                style={{ fontSize: '14px' }}
              >A</button>
            </div>
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
      )}

      {/* Room tabs */}
      {(languageRooms.length > 0 || marketRooms.length > 0) && (
        <ChatRoomTabs
          rooms={[...languageRooms, ...marketRooms]}
          activeRoomId={activeRoomId}
          unreadCounts={unreadCounts}
          onSelectRoom={setActiveRoom}
        />
      )}

      {/* Messages or login prompt */}
      {!address ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-theme-text-muted/50">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-trading-sm text-theme-text-muted">Connect your wallet to join the chat</p>
        </div>
      ) : (
        <ChatMessageList
          messages={messages}
          currentAddress={address}
          hasMore={hasMore}
          onLoadMore={loadMore}
          textSize={textSize}
          onToggleReaction={toggleReaction}
          onMention={(name) => chatInputRef.current?.insertMention(name)}
        />
      )}

      {/* Input */}
      <ChatInput
        ref={chatInputRef}
        onSend={sendMessage}
        disabled={!isConnected}
        disabledPlaceholder={!address ? 'Connect wallet to chat' : 'Connecting...'}
      />
    </div>
  );
}
