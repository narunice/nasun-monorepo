import { useEffect, useRef } from 'react';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import type { Message } from '../../types/chat';
import type { RequestStatus } from '../../hooks/request/useCreateRequest';

interface MessageListProps {
  messages: Message[];
  isProcessing?: boolean;
  isTeeExecutor?: boolean;
  requestStatus?: RequestStatus;
  onOpenAer?: (requestId: number) => void;
}

export function MessageList({
  messages,
  isProcessing,
  isTeeExecutor,
  requestStatus,
  onOpenAer,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isProcessing]);

  if (messages.length === 0 && !isProcessing) return null;

  return (
    <div className="space-y-4">
      {messages.map((message) =>
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
            onOpenAer={onOpenAer}
          />
        ),
      )}

      {isProcessing && (
        <AssistantMessage
          content=""
          timestamp={Date.now()}
          isProcessing
          isTeeExecutor={isTeeExecutor}
          requestStatus={requestStatus}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
