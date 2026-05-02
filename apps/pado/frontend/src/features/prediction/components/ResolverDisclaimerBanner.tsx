/**
 * ResolverDisclaimerBanner (round-6 plan §2.18)
 *
 * Inline disclaimer warning that the admin resolver decides outcomes. Users
 * dismiss per session via sessionStorage.
 */

import { useState } from 'react';

const STORAGE_KEY = 'prediction-resolver-disclaimer-dismissed';

export function ResolverDisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  });

  if (dismissed) return null;

  return (
    <div className="bg-pd2/10 border border-pd2/30 rounded-xl p-3 flex items-start justify-between gap-3">
      <div className="text-sm text-theme-text-secondary">
        Markets settle based on the criteria below, decided by Nasun's resolver. If the
        resolver does not settle by the deadline, anyone can cancel and every participant
        recovers their collateral.
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, '1');
          setDismissed(true);
        }}
        className="shrink-0 text-theme-text-muted hover:text-theme-text-primary text-sm"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
