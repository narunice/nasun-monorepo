/**
 * ResolutionMetaPanel (round-6 plan §2.12)
 *
 * Collapsible panel showing the market's resolution source + criteria. Renders
 * criteria as plain text with newlines preserved (markdown rendering deferred
 * to v1.1 to avoid pulling in a sanitizer dependency).
 */

import { useState } from 'react';
import type { PredictionMarket } from '../types';

interface Props {
  market: PredictionMarket;
}

const URL_REGEX = /^https?:\/\//i;

export function ResolutionMetaPanel({ market }: Props) {
  const [open, setOpen] = useState(false);

  if (!market.resolutionSource && !market.resolutionCriteria) return null;
  const isUrl = URL_REGEX.test(market.resolutionSource.trim());

  return (
    <div className="bg-theme-bg-secondary rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-theme-text-primary">Resolution criteria</span>
        <span className="text-xs text-theme-text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {market.resolutionSource && (
            <div>
              <p className="text-xs text-theme-text-muted mb-1">Source</p>
              {isUrl ? (
                <a
                  href={market.resolutionSource}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pd3 hover:underline break-all text-sm"
                >
                  {market.resolutionSource}
                </a>
              ) : (
                <p className="text-sm text-theme-text-primary break-words">{market.resolutionSource}</p>
              )}
            </div>
          )}

          {market.resolutionCriteria && (
            <div>
              <p className="text-xs text-theme-text-muted mb-1">Criteria</p>
              <p className="text-sm text-theme-text-secondary whitespace-pre-wrap break-words">
                {market.resolutionCriteria}
              </p>
            </div>
          )}

          <div className="text-xs text-theme-text-muted pt-2 border-t border-theme-border/50">
            Resolved by: <span className="font-mono">{market.resolver.slice(0, 8)}...{market.resolver.slice(-6)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
