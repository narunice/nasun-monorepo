import { formatMessageTime } from '../../utils/format';

interface UserMessageProps {
  content: string;
  timestamp?: number;
  failed?: boolean;
}

export function UserMessage({ content, timestamp, failed }: UserMessageProps) {
  const timeString = timestamp ? formatMessageTime(timestamp) : undefined;

  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] rounded-2xl rounded-tr-md px-4 py-3 ${
          failed ? 'bg-uju-card/40 opacity-60' : 'bg-uju-card/70'
        }`}
      >
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-xs text-uju-secondary">You</span>
          {timeString && <span className="text-xs text-uju-secondary/70">{timeString}</span>}
        </div>
        <p className="text-sm text-white whitespace-pre-wrap">{content}</p>
        {failed && (
          <div className="flex items-center justify-end gap-1 mt-1.5">
            <svg className="w-3 h-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs text-red-400">Failed to send</span>
          </div>
        )}
      </div>
    </div>
  );
}
