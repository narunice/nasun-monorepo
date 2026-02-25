/**
 * OnboardingChecklist - Context-aware setup checklist for new users.
 *
 * Only shows when the user needs to claim tokens. Returning users
 * who already have tokens skip this entirely. Auto-dismisses after
 * tokens are claimed with a brief success confirmation.
 */

import { useState, useEffect, useRef } from 'react';
import { ClaimAllButton } from '@nasun/wallet-ui';

interface OnboardingChecklistProps {
  hasTokens: boolean;
}

export function OnboardingChecklist({ hasTokens }: OnboardingChecklistProps) {
  // Skip entirely if user already had tokens on first render (returning user)
  const wasTokensOnMount = useRef(hasTokens);
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss after tokens are claimed (brief delay for visual confirmation)
  useEffect(() => {
    if (hasTokens && !wasTokensOnMount.current) {
      const timer = setTimeout(() => setDismissed(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasTokens]);

  // Don't render for returning users or after dismissal
  if (wasTokensOnMount.current || dismissed) return null;

  return (
    <div className="w-full max-w-lg mx-auto mb-6 p-4 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Getting started
        </h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          aria-label="Dismiss checklist"
        >
          Dismiss
        </button>
      </div>

      <ul className="space-y-2.5">
        {/* Step 1: Wallet connected (always done at this point) */}
        <li className="flex items-center gap-3">
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[var(--color-success)]/15">
            <svg className="w-3 h-3 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-sm text-[var(--color-text-muted)] line-through">Wallet connected</span>
        </li>

        {/* Step 2: Get test tokens */}
        <li className="flex items-center gap-3">
          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
            hasTokens
              ? 'bg-[var(--color-success)]/15'
              : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]'
          }`}>
            {hasTokens ? (
              <svg className="w-3 h-3 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]/30" />
            )}
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <span className={`text-sm ${
              hasTokens ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-primary)]'
            }`}>
              Get test tokens
            </span>
            {!hasTokens && (
              <div className="w-36">
                <ClaimAllButton />
              </div>
            )}
          </div>
        </li>

        {/* Step 3: Send your first query (always pending — completing this dismisses WelcomeScreen) */}
        <li className="flex items-center gap-3">
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
            <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]/30" />
          </div>
          <span className="text-sm text-[var(--color-text-primary)]">Send your first query</span>
        </li>
      </ul>

      {hasTokens && (
        <p className="mt-3 text-xs text-[var(--color-success)] text-center font-medium">
          Tokens received! Try one of the suggestions below.
        </p>
      )}
    </div>
  );
}
