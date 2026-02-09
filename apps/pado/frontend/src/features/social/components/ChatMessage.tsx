import { shortenAddress } from '@nasun/wallet';
import Avatar from 'boring-avatars';
import type { ChatMessage as ChatMessageType } from '../types';
import type { ChatTextSize } from '../hooks/useChatTextSize';

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

function formatSender(message: ChatMessageType): string {
  const suffix = message.sender.slice(-4);
  if (message.senderNickname) {
    return `${message.senderNickname}#${suffix}`;
  }
  return shortenAddress(message.sender);
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
      <p className={`${sizes.content} text-theme-text-primary break-words leading-relaxed ${
        isOwnMessage ? 'text-right' : ''
      }`}>
        {message.content}
      </p>
    </div>
  );
}
