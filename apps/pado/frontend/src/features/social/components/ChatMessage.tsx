import { shortenAddress } from '@nasun/wallet';
import Avatar from 'boring-avatars';
import type { ChatMessage as ChatMessageType } from '../types';
import { isTradeShare, parseTradeShare } from '../types';
import type { ChatTextSize } from '../hooks/useChatTextSize';
import { NETWORK_CONFIG } from '../../../config/network';

// Text size presets: [content, sender, system, avatar]
const SIZE_PRESETS: Record<ChatTextSize, { content: string; sender: string; system: string; avatar: number }> = {
  0: { content: 'text-[12px]', sender: 'text-[11px]', system: 'text-[10px]', avatar: 16 },
  1: { content: 'text-[14px]', sender: 'text-[13px]', system: 'text-[12px]', avatar: 20 },
  2: { content: 'text-[16px]', sender: 'text-[15px]', system: 'text-[14px]', avatar: 24 },
};

interface Props {
  message: ChatMessageType;
  isOwnMessage: boolean;
  textSize?: ChatTextSize;
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
  return shortenAddress(message.sender);
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

export function ChatMessage({ message, isOwnMessage, textSize = 0 }: Props) {
  const sizes = SIZE_PRESETS[textSize];

  if (message.messageType === 'system') {
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
    <div className={`group ${message.pending ? 'opacity-60' : ''} ${
      isOwnMessage ? 'flex flex-col items-end' : ''
    }`}>
      <div className={`flex items-center gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        <Avatar name={message.sender} variant="beam" size={sizes.avatar} />
        <span
          className={`${sizes.sender} font-medium shrink-0 ${
            isOwnMessage ? 'text-theme-text-secondary' : 'text-theme-accent'
          }`}
        >
          {formatSender(message)}
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
          {message.content}
        </p>
      )}
    </div>
  );
}
