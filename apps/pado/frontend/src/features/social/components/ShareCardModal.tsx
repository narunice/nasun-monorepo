/**
 * ShareCardModal
 * Modal overlay showing a canvas share card preview with download/copy/share actions.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/components/common';
import { downloadShareCard, copyShareCardToClipboard } from '../utils/canvasRenderer';

const TWEET_TEXT = encodeURIComponent(
  'Just traded on @PadoFinance \u2014 a full on-chain CLOB DEX on Nasun L1!\n\npado.finance',
);
const TWITTER_URL = `https://x.com/intent/tweet?text=${TWEET_TEXT}`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  canvas: HTMLCanvasElement | null;
  filename?: string;
}

export function ShareCardModal({ isOpen, onClose, canvas, filename = 'pado-share.png' }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const [copying, setCopying] = useState(false);

  // Mount canvas into preview container
  useEffect(() => {
    if (!isOpen || !canvas || !previewRef.current) return;

    const container = previewRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Copy canvas pixels into a display canvas
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = canvas.width;
    displayCanvas.height = canvas.height;
    const destCtx = displayCanvas.getContext('2d');
    if (destCtx) {
      destCtx.drawImage(canvas, 0, 0);
    }
    displayCanvas.style.width = '100%';
    displayCanvas.style.height = 'auto';
    displayCanvas.style.borderRadius = '12px';
    container.appendChild(displayCanvas);

    return () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [isOpen, canvas]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleDownload = useCallback(async () => {
    if (!canvas) return;
    try {
      await downloadShareCard(canvas, filename);
      showToast('Image downloaded', 'success');
    } catch {
      showToast('Download failed. Try right-clicking the image to save instead.', 'error');
    }
  }, [canvas, filename, showToast]);

  const handleCopy = useCallback(async () => {
    if (!canvas || copying) return;
    setCopying(true);
    try {
      const success = await copyShareCardToClipboard(canvas);
      if (success) {
        showToast('Copied to clipboard', 'success');
      } else {
        showToast('Copy not supported in this browser', 'warning');
      }
    } catch {
      showToast('Copy failed. Try downloading the image instead.', 'error');
    } finally {
      setCopying(false);
    }
  }, [canvas, copying, showToast]);

  const handleShareToChat = useCallback(() => {
    if (!canvas) return;
    // Dispatch a custom event that ChatInput can listen to for image sharing
    // For now, copy to clipboard as fallback
    handleCopy();
  }, [canvas, handleCopy]);

  if (!isOpen || !canvas) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-theme-bg-secondary rounded-xl shadow-2xl border border-theme-border max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
          <h3 className="font-semibold text-sm">Share Card Preview</h3>
          <button
            onClick={onClose}
            className="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Canvas preview */}
        <div className="p-4" ref={previewRef} />

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-pd1 hover:bg-pd2 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download
          </button>
          <button
            onClick={handleCopy}
            disabled={copying}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-theme-bg-tertiary hover:bg-theme-bg-quaternary text-theme-text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {copying ? 'Copying...' : 'Copy'}
          </button>
          <a
            href={TWITTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-theme-bg-tertiary hover:bg-theme-bg-quaternary text-theme-text-primary rounded-lg text-sm font-medium transition-colors"
            title="Share on X"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <button
            onClick={handleShareToChat}
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-theme-bg-tertiary hover:bg-theme-bg-quaternary text-theme-text-primary rounded-lg text-sm font-medium transition-colors"
            title="Share to Chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
