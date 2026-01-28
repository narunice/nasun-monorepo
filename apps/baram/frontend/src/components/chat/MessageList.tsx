/**
 * MessageList - Scrollable list of messages
 */

import { useEffect, useRef } from 'react';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import type { RequestResult, RequestStatus } from '@/features/request/hooks/useCreateRequest';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    requestId?: number;
    executionTimeMs?: number;
    teeVerified?: boolean;
    txDigest?: string;
  };
}

interface MessageListProps {
  messages: Message[];
  isProcessing?: boolean;
  processingStatus?: RequestStatus;
  isTeeExecutor?: boolean;
}

export function MessageList({ messages, isProcessing, processingStatus, isTeeExecutor }: MessageListProps) {
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
          />
        ) : (
          <AssistantMessage
            key={message.id}
            content={message.content}
            timestamp={message.timestamp}
            metadata={message.metadata}
          />
        )
      ))}

      {/* Processing indicator */}
      {isProcessing && (
        <AssistantMessage
          content=""
          timestamp={new Date()}
          isProcessing={true}
          isTeeExecutor={isTeeExecutor}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
