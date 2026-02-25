/**
 * MessageList - Scrollable list of messages
 */

import { useEffect, useRef } from 'react';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import type { RequestStatus } from '@/features/request/hooks/useCreateRequest';
import type { Message } from '@/types/chat';

interface MessageListProps {
  messages: Message[];
  isProcessing?: boolean;
  isTeeExecutor?: boolean;
  requestStatus?: RequestStatus;
}

export function MessageList({ messages, isProcessing, isTeeExecutor, requestStatus }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  if (messages.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        message.role === 'user' ? (
          <UserMessage
            key={message.id}
            content={message.content}
            timestamp={message.timestamp}
            failed={message.failed}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            content={message.content}
            timestamp={message.timestamp}
            metadata={message.metadata}
            failed={message.failed}
          />
        )
      ))}

      {/* Processing indicator */}
      {isProcessing && (
        <AssistantMessage
          content=""
          timestamp={Date.now()}
          isProcessing={true}
          isTeeExecutor={isTeeExecutor}
          requestStatus={requestStatus}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
