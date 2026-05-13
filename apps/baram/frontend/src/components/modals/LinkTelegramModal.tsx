// LinkTelegramModal - wallet sig -> sid -> Telegram deep link + QR
//
// Plan D §D-8 UX flow:
//   1. User clicks "Link Telegram"
//   2. Wallet signs challenge (useLinkSession)
//   3. sid returned -> build https://t.me/nasun_ai_bot?start=<sid>
//   4. Show QR code (via qrserver.com img) + copy button
//   5. User taps link on mobile (or scans QR) -> bot sends "Linked"

import { useState, useEffect, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLinkSession } from '@/hooks/useBaramSessions';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=';

interface LinkTelegramModalProps {
  agentId: string;
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

  const deepLink = result?.deepLink ?? null;

  const handleStart = async () => {
    await link(agentAddress, capabilityId);
    // onLinked is called when user explicitly closes the modal after seeing the QR.
  };

  const handleCopy = async () => {
    if (!deepLink) return;
    await navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const isBusy = status === 'signing' || status === 'submitting';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Link Telegram"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Link Telegram
          </h2>
          <button
            onClick={() => { if (status === 'success' && onLinked) onLinked(); onClose(); }}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            aria-label="Close"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Idle: show instructions + button */}
          {status === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                Sign with your wallet to create a secure session link. Open the link in Telegram
                to connect{' '}
                <span className="font-medium text-[var(--color-text-primary)]">@nasun_ai_bot</span>{' '}
                to this agent.
              </p>
              <button
                onClick={() => void handleStart()}
                className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Sign and Generate Link
              </button>
            </div>
          )}

          {/* Signing / submitting */}
          {isBusy && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                {status === 'signing' ? 'Waiting for wallet signature...' : 'Creating session...'}
              </p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{error}</div>
              <button
                onClick={reset}
                className="w-full py-2 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Success: QR + deep link */}
          {status === 'success' && deepLink && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-[var(--color-text-secondary)] text-center">
                Scan the QR code with your phone or tap the link below to open Telegram.
              </p>

              {/* QR code via qrserver.com — deep link is not sensitive (SID requires wallet + bot verification) */}
              <img
                src={`${QR_API}${encodeURIComponent(deepLink)}`}
                alt="Telegram deep link QR code"
                width={200}
                height={200}
                className="rounded-xl border border-[var(--color-border)]"
              />

              {/* Copy / open */}
              <div className="w-full flex gap-2">
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium text-center hover:bg-blue-600 transition-colors"
                >
                  Open in Telegram
                </a>
                <button
                  onClick={() => void handleCopy()}
                  className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors shrink-0"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <p className="text-xs text-[var(--color-text-tertiary)] text-center">
                After opening the link, the bot will confirm the connection.
                This session expires in 90 days.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
