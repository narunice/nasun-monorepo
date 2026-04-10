import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../../lib/chat-service';
import ReactionBar from './ReactionBar';

// Highlight @mentions in message content
function renderContent(content: string) {
  const parts = content.split(/(@[a-zA-Z0-9_]{2,16})/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-nasun-c4 font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

interface MessageListProps {
  messages: ChatMessage[];
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleReaction: (messageId: number, emojiCode: string) => void;
  currentUserId?: string;
}

export default function MessageList({ messages, hasMore, onLoadMore, onToggleReaction, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
    >
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full text-center text-xs text-white/40 hover:text-white/60 py-1 transition-colors"
        >
          Load older messages
        </button>
      )}

      {messages.map((msg) => {
        const isSystem = msg.messageType === 'system';
        const isMine = msg.sender === currentUserId;
        const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

        if (isSystem) {
          return (
            <div key={msg.id} className="text-center text-xs text-white/30 py-1">
              {msg.content}
            </div>
          );
        }

        return (
          <div key={msg.id} className={`group py-0.5 ${isMine ? 'flex flex-col items-end' : ''}`}>
            <div className={`flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
              <span className={`text-xs font-medium shrink-0 ${isMine ? 'text-nasun-c4' : 'text-white/70'}`}>
                {msg.senderName}
              </span>
              <span className="text-[10px] text-white/20 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div className="flex items-end gap-1">
              <div className="shrink-0 pb-0.5">
                <ReactionBar
                  reactions={msg.reactions ?? {}}
                  myReaction={msg.myReaction}
                  onToggle={(code) => onToggleReaction(msg.id, code)}
                />
              </div>
              <div className={`text-sm break-words leading-relaxed max-w-[85%] ${isMine ? 'text-white bg-nasun-c4/20 rounded-lg px-2.5 py-1' : 'text-white/90'}`}>
                {renderContent(msg.content)}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
