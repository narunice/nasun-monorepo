/**
 * FirstRunChecklist: 3-step onboarding banner shown above the agent
 * overview on first visit. Persists dismissal in localStorage so it
 * does not return for the same wallet on the same browser.
 *
 * Intentionally lightweight: no DOM-anchored tour, no overlay coach
 * marks. The three steps map to where the user should look next:
 * the Funds card below this banner, and the Activity tab on the
 * sidebar. The user dismisses when ready.
 */

import { useState } from 'react';

const STORAGE_KEY = 'nasun-ai-first-run-dismissed-v1';

function isDismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  } catch {
    // localStorage unavailable; banner reappears next visit which is OK.
  }
}

interface FirstRunChecklistProps {
  onJumpToActivity: () => void;
}

export function FirstRunChecklist({ onJumpToActivity }: FirstRunChecklistProps) {
  const [dismissed, setDismissed] = useState<boolean>(isDismissed());

  if (dismissed) return null;

  const handleDismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  return (
    <section
      className="bg-uju-card rounded-xl p-4 border border-pado-2/40 space-y-3"
      aria-label="Getting started"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white">Getting started</h3>
          <p className="text-sm text-uju-secondary">
            Three steps to take your agent through its first trade.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-sm text-uju-secondary hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>

      <ol className="space-y-2 text-sm">
        <li className="flex items-start gap-3">
          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium">
            1
          </span>
          <div>
            <p className="text-white">Agent created</p>
            <p className="text-uju-secondary">You are here.</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-pado-2/20 text-pado-2 text-xs font-medium">
            2
          </span>
          <div>
            <p className="text-white">Fund the trading wallet</p>
            <p className="text-uju-secondary">
              Use the Funds card below. The agent needs NUSDC to trade and NASUN to pay its own gas.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-pado-2/20 text-pado-2 text-xs font-medium">
            3
          </span>
          <div>
            <p className="text-white">Watch the first trade</p>
            <p className="text-uju-secondary">
              The runtime emits an AER every cycle. Open{' '}
              <button
                type="button"
                onClick={onJumpToActivity}
                className="text-pado-2 hover:underline"
              >
                Activity
              </button>{' '}
              to follow it live.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
