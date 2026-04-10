import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../../lib/chat-service';
import ReactionBar, { REACTION_CODES, REACTION_EMOJI } from './ReactionBar';

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
  const [pickerMsgId, setPickerMsgId] = useState<number | null>(null);

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

        const showPicker = pickerMsgId === msg.id;

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
            <div className={`relative max-w-[85%] ${isMine ? 'ml-auto' : ''}`}>
              <div
                onClick={() => setPickerMsgId(showPicker ? null : msg.id)}
                className={`text-sm break-words leading-relaxed cursor-pointer ${isMine ? 'text-white bg-nasun-c4/20 rounded-lg px-2.5 py-1' : 'text-white/90 hover:bg-white/5 rounded-lg px-1 -mx-1'}`}
              >
                {renderContent(msg.content)}
              </div>
              {showPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerMsgId(null)} />
                  <div className={`absolute z-20 flex gap-1 p-1.5 bg-nasun-black border border-white/15 rounded-lg shadow-xl mt-1 ${isMine ? 'right-0' : 'left-0'}`}>
                    {REACTION_CODES.map((code) => (
                      <button
                        key={code}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleReaction(msg.id, code);
                          setPickerMsgId(null);
                        }}
                        className={`w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-base ${
                          msg.myReaction === code ? 'bg-nasun-c4/20' : ''
                        }`}
                      >
                        {REACTION_EMOJI[code]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {hasReactions && (
                <div className={`mt-0.5 ${isMine ? 'flex justify-end' : ''}`}>
                  <ReactionBar
                    reactions={msg.reactions!}
                    myReaction={msg.myReaction}
                    onToggle={(code) => onToggleReaction(msg.id, code)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
