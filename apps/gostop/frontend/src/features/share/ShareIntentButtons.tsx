/**
 * ShareIntentButtons — round share affordance for replay pages.
 *
 * Tier 0.5 v0.5 (review-locked):
 *   - 3 buttons: Twitter intent, Telegram intent, Copy link.
 *   - Game-agnostic interface; pass `shareUrl` + `message` so the call site
 *     decides per-game URL/copy.
 *   - Caller decides whether to render at all (see `canShareRound` in
 *     shareUrl.ts) — this component does NOT re-validate ownership.
 *
 * Clipboard handling reuses the prompt() fallback pattern from the inline
 * CopyLinkButton this component replaces (handles non-secure contexts and
 * browsers without `navigator.clipboard`).
 */

import { useState } from 'react';
import { useToast } from '../../store/useToastStore';

export interface ShareIntentButtonsProps {
  /** Server-validated share URL (e.g. https://gostop.app/replay/lottery/0x...). */
  shareUrl: string;
  /** Plain text used as the tweet/TG message body. */
  message: string;
}

export default function ShareIntentButtons({
  shareUrl,
  message,
}: ShareIntentButtonsProps) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedMsg = encodeURIComponent(message);

  const twitterHref = `https://twitter.com/intent/tweet?text=${encodedMsg}&url=${encodedUrl}`;
  const telegramHref = `https://t.me/share/url?url=${encodedUrl}&text=${encodedMsg}`;

  const handleCopy = async () => {
    if (typeof window === 'undefined') return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        showToast('Link copied', 'success');
        window.setTimeout(() => setCopied(false), 1500);
      } else {
        // Best-effort fallback for non-secure contexts (e.g. http staging).
        window.prompt('Copy this round link:', shareUrl);
      }
    } catch {
      window.prompt('Copy this round link:', shareUrl);
    }
  };

  const buttonClass =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gold-subtle text-neutral-200 hover:text-gold-200 hover:border-gold-300/40 min-h-[36px] transition-colors';

  return (
    <div className="inline-flex flex-wrap gap-2" role="group" aria-label="Share this round">
      <a
        href={twitterHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share this round on X (Twitter)"
        className={buttonClass}
      >
        <TwitterIcon />
        <span>Share on X</span>
      </a>
      <a
        href={telegramHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share this round on Telegram"
        className={buttonClass}
      >
        <TelegramIcon />
        <span>Telegram</span>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy round link to clipboard"
        aria-live="polite"
        className={buttonClass}
      >
        <CopyIcon />
        <span>{copied ? 'Link copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}

function TwitterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21l-6.52 7.452L22.5 22h-6.81l-5.337-6.978L4.27 22H1.51l6.99-7.988L1.5 2h6.97l4.82 6.376L18.244 2zm-1.193 18h1.882L7.04 4h-2L17.05 20z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.5 4.2L2.9 11.4c-1.3.5-1.3 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.6c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.8-1.3-1.5zM9 15.8l9.5-6c.5-.3.9 0 .5.3l-7.8 7.1-.3 3.3-.4-3.4-1.5-1.3z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V7a2 2 0 012-2h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
