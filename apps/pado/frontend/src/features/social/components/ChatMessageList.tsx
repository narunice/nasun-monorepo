import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '../types';
import type { ChatTextSize } from '../hooks/useChatTextSize';

interface Props {
  messages: ChatMessageType[];
  currentAddress: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  textSize?: ChatTextSize;
}

export function ChatMessageList({ messages, currentAddress, hasMore, onLoadMore, textSize = 0 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track if user is at bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 60;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll when new messages arrive (only if at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Load more when scrolling to top
  const handleScrollTop = () => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop < 50) {
      onLoadMore();
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <p className="text-trading-xs text-theme-text-muted text-center">
          No messages yet. Be the first to say something!
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      onScroll={() => { handleScroll(); handleScrollTop(); }}
    >
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full text-center text-trading-xs text-theme-text-muted hover:text-theme-text-secondary py-1"
        >
          Load older messages
        </button>
      )}
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          isOwnMessage={
            !!currentAddress && msg.sender.toLowerCase() === currentAddress.toLowerCase()
          }
          textSize={textSize}
        />
      ))}
    </div>
  );
}
