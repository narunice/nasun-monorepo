import { useEffect, useRef, useState } from 'react';
import Avatar from 'boring-avatars';
import type { ChatMessage } from '../../../lib/chat-service';
import ReactionBar, { REACTION_CODES, REACTION_EMOJI } from './ReactionBar';

function ChatAvatar({ address, imageUrl, size = 24 }: {
  address: string; imageUrl?: string | null; size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <Avatar name={address} variant="beam" size={size} />
    </div>
  );
}

// Highlight @mentions in message content
// Format: @[Display Name] for names with spaces, @nickname for simple names
function renderContent(content: string) {
  const parts = content.split(/(@\[[^\]]+\]|@[a-zA-Z0-9_#-]{2,32})/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-nasun-c4 font-medium">
        {part.startsWith('@[') ? `@${part.slice(2, -1)}` : part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatSender(msg: ChatMessage): string {
  const suffix = msg.sender.slice(-4);
  if (msg.senderNickname) {
    return `${msg.senderNickname}#${suffix}`;
  }
  return msg.senderName;
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
  onMention?: (name: string) => void;
  currentUserId?: string;
}

export default function MessageList({ messages, hasMore, onLoadMore, onToggleReaction, onMention, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [pickerMsgId, setPickerMsgId] = useState<number | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; right: number; isMine: boolean } | null>(null);

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
          <div key={msg.id} className={`group py-0.5 flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
            <div className="shrink-0 mt-0.5">
              <ChatAvatar address={msg.sender} imageUrl={msg.senderProfileImageUrl} size={24} />
            </div>
            <div className={`flex-1 min-w-0 ${isMine ? 'text-right' : ''}`}>
            <div className={`flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
              <span className={`inline-flex items-center gap-1 shrink-0 ${isMine ? '' : 'cursor-pointer'}`}>
                {msg.senderBadge === 'GP' && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none bg-amber-500/15 text-amber-400 border border-amber-500/30" title="Genesis Pass Holder">
                    <span className="text-[8px]">{'\u{1F451}'}</span>GP
                  </span>
                )}
                <span
                  className={`text-xs font-medium ${isMine ? 'text-nasun-c4' : 'text-white/70 hover:text-white hover:underline'}`}
                  onClick={!isMine && onMention ? (e) => { e.stopPropagation(); onMention(formatSender(msg)); } : undefined}
                >
                  {formatSender(msg)}
                </span>
              </span>
              <span className="text-[10px] text-white/20 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div className={`relative max-w-[85%] ${isMine ? 'ml-auto flex flex-col items-end' : ''}`}>
              <div
                onClick={(e) => {
                  if (showPicker) { setPickerMsgId(null); setPickerPos(null); return; }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPickerPos({ top: rect.top, left: rect.left, right: window.innerWidth - rect.right, isMine });
                  setPickerMsgId(msg.id);
                }}
                className={`text-sm break-words leading-relaxed cursor-pointer ${isMine ? 'w-fit text-white bg-nasun-c4/20 rounded-lg px-2.5 py-1' : 'text-white/90 hover:bg-white/5 rounded-lg px-1 -mx-1'}`}
              >
                {renderContent(msg.content)}
              </div>
              {showPicker && pickerPos && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => { setPickerMsgId(null); setPickerPos(null); }} />
                  <div
                    className="fixed z-[56] p-1.5 bg-nasun-black border border-white/15 rounded-lg shadow-xl"
                    style={{
                      bottom: window.innerHeight - pickerPos.top + 4,
                      ...(pickerPos.isMine ? { right: pickerPos.right } : { left: pickerPos.left }),
                      display: 'grid', gridTemplateColumns: 'repeat(7, 1.75rem)', gap: '0.25rem',
                    }}
                  >
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
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
