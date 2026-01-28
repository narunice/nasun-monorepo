/**
 * StatusIndicator - Display request processing status
 */

import type { RequestStatus } from '../hooks/useCreateRequest';

interface StatusIndicatorProps {
  status: RequestStatus;
}

const statusConfig = {
  idle: null,
  creating: {
    text: 'Creating request...',
    color: 'text-baram-1',
    animate: true,
  },
  executing: {
    text: 'AI processing...',
    color: 'text-baram-2',
    animate: true,
  },
  completed: {
    text: 'Completed',
    color: 'text-[var(--color-success)]',
    animate: false,
  },
  error: {
    text: 'Failed',
    color: 'text-[var(--color-error)]',
    animate: false,
  },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  if (status === 'idle') return null;

  const config = statusConfig[status];
  if (!config) return null;

  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      {config.animate && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
}
