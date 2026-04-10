import { useState, useRef, useCallback } from 'react';
import { shortenAddress } from '@nasun/wallet';
import Avatar from 'boring-avatars';
import type { ChatMessage as ChatMessageType } from '../types';

function ChatAvatar({ address, imageUrl, size = 18 }: {
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
  return <Avatar name={address} variant="beam" size={size} />;
}
import { isTradeShare, parseTradeShare } from '../types';
import type { ChatTextSize } from '../hooks/useChatTextSize';
import { NETWORK_CONFIG } from '../../../config/network';
import { ReactionBar } from './ReactionBar';

// Text size presets: [content, sender, system, avatar]
const SIZE_PRESETS: Record<ChatTextSize, { content: string; sender: string; system: string; avatar: number }> = {
  0: { content: 'text-[10px]', sender: 'text-[9px]', system: 'text-[8px]', avatar: 16 },
  1: { content: 'text-[12px]', sender: 'text-[11px]', system: 'text-[10px]', avatar: 18 },
  2: { content: 'text-[14px]', sender: 'text-[13px]', system: 'text-[12px]', avatar: 22 },
};

interface Props {
  message: ChatMessageType;
  isOwnMessage: boolean;
  textSize?: ChatTextSize;
  onToggleReaction?: (messageId: number, emojiCode: string) => void;
  onMention?: (name: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Date key for grouping (YYYY-MM-DD in user's local timezone) */
export function getDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date label for divider: "Today", "Yesterday", or "Wed, Feb 5, 2026" */
export function formatDateLabel(timestamp: number): string {
  const msgDate = new Date(timestamp);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());

  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';

  return msgDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatSender(message: ChatMessageType): string {
  const suffix = message.sender.slice(-4);
  if (message.senderNickname) {
    return `${message.senderNickname}#${suffix}`;
  }
  if (message.senderName) {
    return message.senderName;
  }
  return shortenAddress(message.sender);
}

// Highlight @mentions: @[Display Name] or @nickname#suffix
function renderContent(content: string, _sizes: typeof SIZE_PRESETS[0]) {
  const parts = content.split(/(@\[[^\]]+\]|@[a-zA-Z0-9_#-]{2,32})/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-theme-accent font-medium">
        {part.startsWith('@[') ? `@${part.slice(2, -1)}` : part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function TradeShareCard({ content, sizes }: { content: string; sizes: typeof SIZE_PRESETS[0] }) {
  const data = parseTradeShare(content);
  if (!data) return <p className={`${sizes.content} text-theme-text-muted italic`}>Invalid trade data</p>;

  const isBuy = data.side === 'BUY';
  const hasPnl = data.pnl !== undefined && data.pnl !== null;
  const pnlPositive = hasPnl && data.pnl! > 0;
  const pnlNegative = hasPnl && data.pnl! < 0;
  const explorerUrl = NETWORK_CONFIG.explorerUrl;

  return (
    <div className="bg-theme-bg-primary rounded border border-theme-border p-2 mt-0.5 max-w-[260px]">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isBuy ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {data.side}
          </span>
          <span className="text-[11px] font-medium text-theme-text-primary">{data.pair}</span>
        </div>
        {explorerUrl && data.tx.length > 8 && (
          <a
            href={`${explorerUrl}/tx/${data.tx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-pd3 hover:text-pd3/80 transition-colors"
          >
            View TX
          </a>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div>
          <div className="text-theme-text-muted">Price</div>
          <div className="font-mono text-theme-text-primary">${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div className="text-theme-text-muted">Qty</div>
          <div className="font-mono text-theme-text-primary">{data.qty.toFixed(5)}</div>
        </div>
        <div>
          <div className="text-theme-text-muted">Total</div>
          <div className="font-mono text-theme-text-primary">${data.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
      {hasPnl && (
        <div className={`mt-1.5 pt-1 border-t border-theme-border/50 text-[10px] font-mono ${
          pnlPositive ? 'text-green-400' : pnlNegative ? 'text-red-400' : 'text-theme-text-muted'
        }`}>
          P&L: {data.pnl! > 0 ? '+' : ''}${data.pnl!.toFixed(2)}
          {data.pnlPct !== undefined && ` (${data.pnlPct > 0 ? '+' : ''}${data.pnlPct.toFixed(2)}%)`}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message, isOwnMessage, textSize = 0, onToggleReaction, onMention }: Props) {
  const sizes = SIZE_PRESETS[textSize];

  // Long-press for mobile reaction picker
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showMobilePicker, setShowMobilePicker] = useState(false);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowMobilePicker(true), 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  if (message.messageType === 'system') {
    const isBot = message.content.startsWith('[BOT] ');

    if (isBot) {
      const botContent = message.content.slice(6);
      return (
        <div className="group">
          <div className="flex items-center gap-1.5">
            <Avatar name="WAVI_BOT" variant="beam" size={sizes.avatar} />
            <span className={`${sizes.sender} font-medium shrink-0 text-theme-accent`}>
              Wavi
            </span>
            <span className={`${sizes.system} text-theme-text-muted shrink-0`}>
              {formatTime(message.timestamp)}
            </span>
          </div>
          <p className={`${sizes.content} text-theme-text-primary break-words leading-relaxed`}>
            {botContent}
          </p>
        </div>
      );
    }

    return (
      <div className="text-center py-1">
        <span className={`${sizes.system} text-theme-text-muted italic`}>
          {message.content}
        </span>
      </div>
    );
  }

  const tradeShare = isTradeShare(message.content);

  return (
    <div
      className={`group ${message.pending ? 'opacity-60' : ''} ${
        isOwnMessage ? 'flex flex-col items-end' : ''
      }`}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <div className={`flex items-center gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        <ChatAvatar address={message.sender} imageUrl={message.senderProfileImageUrl} size={sizes.avatar} />
        <span className={`inline-flex items-center gap-1 shrink-0`}>
          {message.senderBadge === 'GP' && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-bold leading-none bg-amber-500/15 text-amber-400 border border-amber-500/30" title="Genesis Pass Holder">
              <span className="text-[7px]">{'\u{1F451}'}</span>GP
            </span>
          )}
          <span
            className={`${sizes.sender} font-medium ${
              isOwnMessage ? 'text-theme-text-secondary' : 'text-theme-accent hover:underline cursor-pointer'
            }`}
            onClick={!isOwnMessage && onMention ? (e) => { e.stopPropagation(); onMention(formatSender(message)); } : undefined}
          >
            {formatSender(message)}
          </span>
        </span>
        <span className={`${sizes.system} text-theme-text-muted shrink-0`}>
          {formatTime(message.timestamp)}
        </span>
      </div>
      {tradeShare ? (
        <TradeShareCard content={message.content} sizes={sizes} />
      ) : (
        <p className={`${sizes.content} text-theme-text-primary break-words leading-relaxed ${
          isOwnMessage ? 'text-right' : ''
        }`}>
          {renderContent(message.content, sizes)}
        </p>
      )}
      {onToggleReaction && (message.reactions || showMobilePicker) && (
        <ReactionBar
          messageId={message.id}
          reactions={message.reactions ?? {}}
          myReaction={message.myReaction ?? null}
          onToggle={(code) => { onToggleReaction(message.id, code); setShowMobilePicker(false); }}
          compact={textSize === 0}
        />
      )}
    </div>
  );
}
