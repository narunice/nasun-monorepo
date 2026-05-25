/**
 * LinkTelegramModal - wallet sig -> sid -> Telegram deep link + QR.
 *
 * Flow:
 *   1. User clicks "Link Telegram".
 *   2. Wallet signs challenge (useLinkSession).
 *   3. sid returned -> build https://t.me/nasun_ai_bot?start=<sid>.
 *   4. Show QR code + copy/open buttons.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useLinkSession } from '../../hooks/useNasunAiSessions';

// Telegram deep link (which embeds the session id) MUST be rendered locally.
// A third-party QR service would leak the sid to that service and let anyone
// holding it bind their own Telegram account to the user's agent.

interface LinkTelegramModalProps {
  agentAddress: string;
  capabilityId: string;
  onClose: () => void;
  onLinked?: () => void;
}

export function LinkTelegramModal({
  agentAddress,
  capabilityId,
  onClose,
  onLinked,
}: LinkTelegramModalProps) {
  const { link, status, error, result, reset } = useLinkSession();
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const deepLink = result?.deepLink ?? null;

  useEffect(() => {
    if (!deepLink || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, deepLink, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {
      // Surface failure quietly — the user can still tap "Open in Telegram".
    });
  }, [deepLink]);
  const isBusy = status === 'signing' || status === 'submitting';

  const handleStart = async () => {
    await link(agentAddress, capabilityId);
  };

  const handleCopy = async () => {
    if (!deepLink) return;
    await navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fire onLinked the moment the deep link is generated, not just on
  // close. The Quickstart wizard uses this signal to mark the TG step
  // done and persist tgLinkedFlag to localStorage. If the user opens
  // the TG deep link and never returns to this tab (the happy path in
  // the new wizard order), the parent's completion state is still
  // captured so a later visit re-renders the 🎉 screen instead of
  // stranding them on a dead modal.
  useEffect(() => {
    if (status === 'success' && onLinked) onLinked();
    // onLinked is intentionally omitted from deps: callers pass a fresh
    // closure each render and we want exactly one fire per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  useEffect(() => () => reset(), [reset]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-telegram-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2 id="link-telegram-title" className="text-base font-semibold text-white">
            Link Telegram
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            aria-label="Close"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {status === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-uju-secondary leading-relaxed">
                Sign with your wallet to create a secure session link. Open the link in Telegram to
                connect{' '}
                <span className="font-medium text-white">@nasun_ai_bot</span> to this agent.
              </p>
              <button
                type="button"
                onClick={() => void handleStart()}
                className="w-full py-2.5 rounded-xl bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 transition-colors"
              >
                Sign and Generate Link
              </button>
            </div>
          )}

          {isBusy && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-8 h-8 border-2 border-pado-2 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-uju-secondary">
                {status === 'signing' ? 'Waiting for wallet signature...' : 'Creating session...'}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{error}</div>
              <button
                type="button"
                onClick={reset}
                className="w-full py-2 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {status === 'success' && deepLink && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-uju-secondary text-center">
                Scan the QR code with your phone or tap the link below to open Telegram.
              </p>
              <canvas
                ref={canvasRef}
                aria-label="Telegram deep link QR code"
                width={200}
                height={200}
                className="rounded-xl border border-uju-border/60 bg-white"
              />
              <div className="w-full flex gap-2">
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl bg-pado-2 text-uju-bg text-sm font-medium text-center hover:bg-pado-3 transition-colors"
                >
                  Open in Telegram
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="px-4 py-2.5 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors shrink-0"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-uju-secondary/70 text-center">
                After opening the link, Nasun AI will confirm the connection. This session expires
                in 90 days.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
