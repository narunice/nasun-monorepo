import { shortenAddress } from '@nasun/wallet';
import Avatar from 'boring-avatars';
import type { ChatMessage as ChatMessageType } from '../types';

interface Props {
  message: ChatMessageType;
  isOwnMessage: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatSender(message: ChatMessageType): string {
  const suffix = message.sender.slice(-4);
  if (message.senderNickname) {
    return `${message.senderNickname}#${suffix}`;
  }
  return shortenAddress(message.sender);
}

export function ChatMessage({ message, isOwnMessage }: Props) {
  if (message.messageType === 'system') {
    return (
      <div className="text-center py-1">
        <span className="text-[10px] text-theme-text-muted italic">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`group ${message.pending ? 'opacity-60' : ''} ${
      isOwnMessage ? 'flex flex-col items-end' : ''
    }`}>
      <div className={`flex items-center gap-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        <Avatar name={message.sender} variant="beam" size={16} />
        <span
          className={`text-trading-xs font-medium shrink-0 ${
            isOwnMessage ? 'text-pd3' : 'text-theme-accent'
          }`}
        >
          {formatSender(message)}
        </span>
        <span className="text-[10px] text-theme-text-muted shrink-0">
          {formatTime(message.timestamp)}
        </span>
      </div>
      <p className={`text-trading-sm text-theme-text-primary break-words leading-relaxed ${
        isOwnMessage ? 'text-right' : ''
      }`}>
        {message.content}
      </p>
    </div>
  );
}
