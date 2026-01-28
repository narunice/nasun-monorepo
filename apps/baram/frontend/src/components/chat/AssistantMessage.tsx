/**
 * AssistantMessage - AI response with Gemini-style layout (no bubble)
 */

import { NETWORK_CONFIG } from '@/config/network';

interface MessageMetadata {
  requestId?: number;
  executionTimeMs?: number;
  teeVerified?: boolean;
  txDigest?: string;
}

interface AssistantMessageProps {
  content: string;
  timestamp?: Date;
  metadata?: MessageMetadata;
  isProcessing?: boolean;
  isTeeExecutor?: boolean;
}

export function AssistantMessage({
  content,
  timestamp,
  metadata,
  isProcessing = false,
  isTeeExecutor = false,
}: AssistantMessageProps) {
  const timeString = timestamp?.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const explorerUrl = metadata?.txDigest
    ? `${NETWORK_CONFIG.explorerUrl}/tx/${metadata.txDigest}`
    : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="w-full py-3">
      {/* Header - Icon + Name */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-baram-1/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">Baram AI</span>
        {timeString && (
          <span className="text-xs text-[var(--color-text-muted)]">{timeString}</span>
        )}
      </div>

      {/* Content - aligned with icon */}
      {isProcessing ? (
        <div className="pl-8 py-2">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{isTeeExecutor ? 'Processing with TEE protection...' : 'Processing your request...'}</span>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap mb-3 pl-8">
            {content}
          </p>

          {/* Metadata Footer */}
          {metadata && (
            <div className="pt-3 pl-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {metadata.teeVerified && (
                  <span className="flex items-center gap-1 text-[var(--color-success)]">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    TEE Verified
                  </span>
                )}
                {metadata.executionTimeMs !== undefined && (
                  <span className="text-[var(--color-text-muted)]">
                    {(metadata.executionTimeMs / 1000).toFixed(2)}s
                  </span>
                )}
                {metadata.requestId !== undefined && (
                  <span className="text-[var(--color-text-muted)]">
                    Request #{metadata.requestId}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" />
                  </svg>
                  Copy
                </button>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-baram-1 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View on Explorer
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
