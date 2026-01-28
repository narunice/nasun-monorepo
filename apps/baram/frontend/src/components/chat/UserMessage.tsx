/**
 * UserMessage - User's message bubble
 */

interface UserMessageProps {
  content: string;
  timestamp?: Date;
}

export function UserMessage({ content, timestamp }: UserMessageProps) {
  const timeString = timestamp?.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-[var(--color-bg-tertiary)] rounded-2xl rounded-tr-md px-4 py-3">
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-xs text-[var(--color-text-muted)]">You</span>
          {timeString && (
            <span className="text-xs text-[var(--color-text-muted)]">{timeString}</span>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
          {content}
        </p>
      </div>
    </div>
  );
}
