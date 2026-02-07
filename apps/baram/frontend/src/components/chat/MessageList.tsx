/**
 * MessageList - Scrollable list of messages
 */

import { useEffect, useRef, useState } from 'react';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import type { Message } from '@/types/chat';

const AUDIT_TRAIL_SHOWN_KEY = 'baram_audit_trail_shown';

interface MessageListProps {
  messages: Message[];
  isProcessing?: boolean;
  isTeeExecutor?: boolean;
}

export function MessageList({ messages, isProcessing, isTeeExecutor }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoExpandMessageId, setAutoExpandMessageId] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Auto-expand Audit Trail for the first TEE-verified response (once per tab)
  useEffect(() => {
    if (sessionStorage.getItem(AUDIT_TRAIL_SHOWN_KEY)) return;

    const firstTeeMessage = messages.find(
      (m) => m.role === 'assistant' && m.metadata?.teeVerified && m.metadata.requestId !== undefined,
    );
    if (firstTeeMessage) {
      setAutoExpandMessageId(firstTeeMessage.id);
      sessionStorage.setItem(AUDIT_TRAIL_SHOWN_KEY, '1');
    }
  }, [messages]);

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
            autoShowAuditTrail={message.id === autoExpandMessageId}
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
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
