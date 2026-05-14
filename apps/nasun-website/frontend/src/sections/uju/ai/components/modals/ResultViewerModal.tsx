/**
 * ResultViewerModal - Displays stored AI execution result text with hash
 * verification, copy, and download.
 *
 * Markdown rendering deferred for S5 (nasun-website doesn't yet depend on
 * react-markdown). For S4, the result is shown in a pre-wrap monospace block.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAerResult } from '../../hooks/useAerResult';
import type { AERRecord } from '../../hooks/useAerRecords';
import { formatTimeDetailed } from '../../utils/format';

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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex === expectedHash;
}

export function ResultViewerModal({ requestId, record, authorizer, onClose }: ResultViewerModalProps) {
  const { data, isLoading, error } = useAerResult(requestId, authorizer);
  const [copied, setCopied] = useState(false);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (data?.result && data?.resultHash) {
      verifyResultHash(data.result, data.resultHash).then(setHashValid);
    }
  }, [data?.result, data?.resultHash]);

  const handleCopy = () => {
    if (!data?.result) return;
    navigator.clipboard
      .writeText(data.result)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
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
    a.download = `nasun-ai-result-${requestId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errMsg = (error as Error | null)?.message;
  const isExpired = errMsg === 'EXPIRED';
  const isAccessDenied = errMsg === 'ACCESS_DENIED';

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
        tabIndex={-1}
        className="bg-uju-bg border border-uju-border/60 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-uju-border/60 shrink-0">
          <h2 id="result-viewer-title" className="text-sm font-semibold text-white">
            AI Execution Result - #{requestId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-uju-card/60 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-uju-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-uju-border/60 shrink-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-uju-secondary/60">Model: </span>
              <span className="text-white">{record.modelName || '-'}</span>
            </div>
            <div>
              <span className="text-uju-secondary/60">Purpose: </span>
              {record.purpose === 'lambda_verified' ? (
                <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">Lambda Verified</span>
              ) : record.purpose === 'self_reported' ? (
                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400">Self-Reported</span>
              ) : (
                <span className="text-white">{record.purpose || '-'}</span>
              )}
            </div>
            <div>
              <span className="text-uju-secondary/60">Generated: </span>
              <span className="text-white">{formatTimeDetailed(record.settledAt)}</span>
            </div>
            {data?.expiresAt ? (
              <div>
                <span className="text-uju-secondary/60">Expires: </span>
                <span className="text-white">{formatTimeDetailed(data.expiresAt)}</span>
              </div>
            ) : null}
          </div>
          {hashValid !== null && (
            <div className="mt-2">
              {hashValid ? (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  Hash Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                  Hash Mismatch
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-uju-secondary">
              Loading result...
            </div>
          )}
          {isExpired && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <p className="text-sm text-uju-secondary">Result Expired</p>
              <p className="text-sm text-uju-secondary/60 max-w-xs">
                AI results are stored for 7 days. The on-chain execution report remains permanently
                available.
              </p>
            </div>
          )}
          {isAccessDenied && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <p className="text-sm text-red-400">Access Denied</p>
              <p className="text-sm text-uju-secondary/60 max-w-xs">
                Only the wallet that created this request can view the result. Make sure the correct
                wallet is connected.
              </p>
            </div>
          )}
          {error && !isExpired && !isAccessDenied && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <p className="text-sm text-uju-secondary">Result temporarily unavailable</p>
              <p className="text-sm text-uju-secondary/60">Please try again later.</p>
            </div>
          )}
          {data?.result && (
            <pre className="whitespace-pre-wrap break-words text-sm text-uju-secondary leading-relaxed font-sans">
              {data.result}
            </pre>
          )}
        </div>

        {data?.result && (
          <div className="flex items-center justify-between p-4 border-t border-uju-border/60 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
              >
                Download .md
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-card/60 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
