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
  /** Wake-mode: handler for Retry button on a failed assistant turn. */
  onRetry?: () => void;
  /** Wake-mode: answer a trade proposal attached to an assistant turn. Both
   * take the message id so the hook can settle that card in place. Omitting
   * them renders proposals read-only. */
  onConfirmProposal?: (proposalId: string, messageId: string) => void;
  onCancelProposal?: (proposalId: string, messageId: string) => void;
}

export function MessageList({
  messages,
  isProcessing,
  isTeeExecutor,
  requestStatus,
  onOpenAer,
  onRetry,
  onConfirmProposal,
  onCancelProposal,
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
            wakePhase={message.wakePhase}
            proposal={message.proposal}
            proposalStatus={message.proposalStatus}
            onConfirmProposal={
              message.proposal && onConfirmProposal
                ? () => onConfirmProposal(message.proposal!.proposal_id, message.id)
                : undefined
            }
            onCancelProposal={
              message.proposal && onCancelProposal
                ? () => onCancelProposal(message.proposal!.proposal_id, message.id)
                : undefined
            }
            retryable={message.retryable}
            onRetry={onRetry}
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
