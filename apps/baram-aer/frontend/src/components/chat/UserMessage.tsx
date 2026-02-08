/**
 * UserMessage - User's message bubble
 */

interface UserMessageProps {
  content: string;
  timestamp?: number;
  failed?: boolean;
}

export function UserMessage({ content, timestamp, failed }: UserMessageProps) {
  const timeString = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : undefined;

  return (
    <div className="flex justify-end">
      <div className={`max-w-[85%] rounded-2xl rounded-tr-md px-4 py-3 ${
        failed
          ? 'bg-[var(--color-bg-tertiary)] opacity-60'
          : 'bg-[var(--color-bg-tertiary)]'
      }`}>
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-xs text-[var(--color-text-muted)]">You</span>
          {timeString && (
            <span className="text-xs text-[var(--color-text-muted)]">{timeString}</span>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
          {content}
        </p>
        {failed && (
          <div className="flex items-center justify-end gap-1 mt-1.5">
            <svg className="w-3 h-3 text-[var(--color-error)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs text-[var(--color-error)]">Failed to send</span>
          </div>
        )}
      </div>
    </div>
  );
}
