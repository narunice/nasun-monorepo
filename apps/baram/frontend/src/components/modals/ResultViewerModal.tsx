/**
 * ResultViewerModal - Displays full AI execution result text with
 * markdown rendering, hash verification, copy and download.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useAERResult } from '@/features/aer/hooks/useAERResult';
import { formatTimeDetailed } from '@/utils/format';
import type { AERRecord } from '@/features/aer/hooks/useAERRecords';

interface ResultViewerModalProps {
  requestId: number;
  record: AERRecord;
  authorizer: string;
  onClose: () => void;
}

async function verifyResultHash(result: string, expectedHash: string): Promise<boolean> {
  const data = new TextEncoder().encode(result);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === expectedHash;
}

export function ResultViewerModal({ requestId, record, authorizer, onClose }: ResultViewerModalProps) {
  const { data, isLoading, error } = useAERResult(requestId, authorizer);
  const [copied, setCopied] = useState(false);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Verify result hash against on-chain hash
  useEffect(() => {
    if (data?.result && data?.resultHash) {
      verifyResultHash(data.result, data.resultHash).then(setHashValid);
    }
  }, [data?.result, data?.resultHash]);

  const handleCopy = () => {
    if (!data?.result) return;
    navigator.clipboard.writeText(data.result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for non-secure contexts (HTTP localhost)
      const textarea = document.createElement('textarea');
      textarea.value = data.result;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!data?.result) return;
    const blob = new Blob([data.result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baram-result-${requestId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isExpired = error?.message === 'EXPIRED';
  const isAccessDenied = error?.message === 'ACCESS_DENIED';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-viewer-title"
        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] shrink-0">
          <h2 id="result-viewer-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
            AI Execution Result — #{requestId}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata (renders immediately from record prop) */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[var(--color-text-muted)]">Model: </span>
              <span className="text-[var(--color-text-primary)]">{record.modelName || '-'}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Purpose: </span>
              {record.purpose === 'lambda_verified' ? (
                <span className="px-1.5 py-0.5 rounded text-2xs bg-blue-500/10 text-blue-400">Lambda Verified</span>
              ) : record.purpose === 'self_reported' ? (
                <span className="px-1.5 py-0.5 rounded text-2xs bg-amber-500/10 text-amber-400">Self-Reported</span>
              ) : (
                <span className="text-[var(--color-text-primary)]">{record.purpose || '-'}</span>
              )}
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Generated: </span>
              <span className="text-[var(--color-text-primary)]">{formatTimeDetailed(record.settledAt)}</span>
            </div>
            {data?.expiresAt && (
              <div>
                <span className="text-[var(--color-text-muted)]">Expires: </span>
                <span className="text-[var(--color-text-primary)]">{formatTimeDetailed(data.expiresAt)}</span>
              </div>
            )}
          </div>
          {/* Hash verification badge */}
          {hashValid !== null && (
            <div className="mt-2">
              {hashValid ? (
                <span className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Hash Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Hash Mismatch
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading result...</span>
            </div>
          )}

          {isExpired && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[var(--color-text-muted)]">Result Expired</p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
                AI results are stored for 7 days after execution.
                The on-chain execution report remains permanently available.
              </p>
            </div>
          )}

          {isAccessDenied && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-sm text-[var(--color-error)]">Access Denied</p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
                Only the wallet that created this request can view the result.
                Make sure the correct wallet is connected.
              </p>
            </div>
          )}

          {error && !isExpired && !isAccessDenied && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Result temporarily unavailable</p>
              <p className="text-xs text-[var(--color-text-muted)]">Please try again later.</p>
            </div>
          )}

          {data?.result && (
            <div className="prose-baram text-sm text-[var(--color-text-secondary)] leading-relaxed break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {data.result}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        {data?.result && (
          <div className="flex items-center justify-between p-4 border-t border-[var(--color-border)] shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download .md
              </button>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
