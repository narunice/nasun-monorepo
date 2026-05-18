/**
 * Assistant message bubble with markdown rendering (react-markdown + remark-gfm
 * + rehype-sanitize). Surfaces request metadata (TEE verified, latency,
 * request id) and a "View on Explorer" deep link when the transaction digest
 * is available.
 *
 * Adapted from baram AssistantMessage. Drops the inline ExecutionReport modal
 * in favor of the AER timeline (Activity sub-tab) for full receipts.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { NETWORK_CONFIG } from '../../services/network';
import { formatMessageTime } from '../../utils/format';
import type { MessageMetadata } from '../../types/chat';
import type { RequestStatus } from '../../hooks/request/useCreateRequest';

interface AssistantMessageProps {
  content: string;
  timestamp?: number;
  metadata?: MessageMetadata;
  isProcessing?: boolean;
  isTeeExecutor?: boolean;
  failed?: boolean;
  requestStatus?: RequestStatus;
}

function getProcessingLabel(requestStatus?: RequestStatus, isTeeExecutor?: boolean): string {
  switch (requestStatus) {
    case 'creating':
      return 'Signing transaction...';
    case 'executing':
      // The isTeeExecutor branch is kept for forward compatibility. Alpha
      // runs every model on a general LLM; TEE attestation is roadmap
      // (project_baram_no_tee_v1.md) so the copy must not claim active
      // protection even when the future TEE provider is selected.
      return isTeeExecutor ? 'Executing on a private-inference executor (TEE roadmap)...' : 'Running AI model...';
    case 'cancelling':
      return 'Cancelling and refunding...';
    default:
      return isTeeExecutor ? 'Processing on a private-inference executor (TEE roadmap)...' : 'Processing your request...';
  }
}

export function AssistantMessage({
  content,
  timestamp,
  metadata,
  isProcessing = false,
  isTeeExecutor = false,
  failed = false,
  requestStatus,
}: AssistantMessageProps) {
  const timeString = timestamp ? formatMessageTime(timestamp) : undefined;
  const explorerUrl = metadata?.txDigest
    ? `${NETWORK_CONFIG.explorerUrl}/tx/${metadata.txDigest}`
    : null;

  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText(content);
    } catch {
      // ignore
    }
  };

  return (
    <div className="w-full py-3">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
            failed ? 'bg-red-500/10' : 'bg-pado-2/10'
          }`}
        >
          {failed ? (
            <svg
              className="w-4 h-4 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-pado-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          )}
        </div>
        <span className="text-sm font-medium text-white">Nasun AI</span>
        {timeString && <span className="text-xs text-uju-secondary/70">{timeString}</span>}
      </div>

      {isProcessing ? (
        <div className="pl-8 py-2">
          <div className="flex items-center gap-2 text-sm text-uju-secondary">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{getProcessingLabel(requestStatus, isTeeExecutor)}</span>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`pl-8 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:bg-uju-bg prose-pre:border prose-pre:border-uju-border/60 prose-code:text-pado-2 prose-a:text-pado-2 ${
              failed ? 'text-red-400' : 'text-white'
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {content}
            </ReactMarkdown>
          </div>

          {metadata && (
            <div className="pt-3 pl-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {metadata.teeVerified && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    TEE Verified
                  </span>
                )}
                {metadata.executionTimeMs !== undefined && (
                  <span className="text-uju-secondary/70">
                    {(metadata.executionTimeMs / 1000).toFixed(2)}s
                  </span>
                )}
                {metadata.requestId !== undefined && (
                  <span className="text-uju-secondary/70">Request #{metadata.requestId}</span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-uju-secondary hover:text-white transition-colors"
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
                    className="flex items-center gap-1 text-xs text-uju-secondary hover:text-pado-2 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
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
