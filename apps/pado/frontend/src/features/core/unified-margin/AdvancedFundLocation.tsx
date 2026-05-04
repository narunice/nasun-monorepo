/**
 * AdvancedFundLocation
 *
 * Collapsible advanced view that exposes how the user's Pado deposit is split
 * across the spot trading account and the margin account. Hidden by default;
 * intended for power users.
 */

import { useState } from 'react';
import { usePadoAccount } from './usePadoAccount';
import { TOKENS } from '../../../config/network';

function formatNusdc(raw: bigint): string {
  const v = Number(raw) / Math.pow(10, TOKENS.NUSDC.decimals);
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNbtc(raw: bigint): string {
  if (raw === 0n) return '0';
  const v = Number(raw) / Math.pow(10, TOKENS.NBTC.decimals);
  return v.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function AdvancedFundLocation() {
  const [open, setOpen] = useState(false);
  const padoAccount = usePadoAccount();

  if (!padoAccount.isEnabled && !padoAccount.isPartiallyEnabled) {
    return null;
  }

  const bm = padoAccount.breakdown.bm;
  const ma = padoAccount.breakdown.ma;
  const bmEmpty = bm.quoteRaw === 0n && bm.baseRaw === 0n;
  const maEmpty = ma.nusdcRaw === 0n && ma.nbtcRaw === 0n;

  return (
    <div className="border border-theme-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-theme-bg-secondary hover:bg-theme-bg-tertiary transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-text-muted">Advanced</span>
          <span className="text-sm text-theme-text-secondary">
            Where these funds live
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-theme-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 py-4 bg-theme-bg-primary/40 space-y-4 text-sm">
          <p className="text-xs text-theme-text-muted leading-relaxed">
            Pado splits your deposit across two specialized accounts under your
            wallet's ownership. You don't need to manage them separately.
          </p>

          <div>
            <div className="text-xs font-medium text-theme-text-secondary mb-1">
              Spot trading account
            </div>
            {bmEmpty ? (
              <div className="text-xs text-theme-text-muted">No funds here.</div>
            ) : (
              <div className="text-sm text-theme-text-primary">
                {formatNusdc(bm.quoteRaw)} NUSDC
                {bm.baseRaw > 0n && <> {' + '} {formatNbtc(bm.baseRaw)} NBTC</>}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-theme-text-secondary mb-1">
              Margin account
            </div>
            {maEmpty ? (
              <div className="text-xs text-theme-text-muted">No funds here.</div>
            ) : (
              <div className="text-sm text-theme-text-primary">
                {formatNusdc(ma.nusdcRaw)} NUSDC
                {ma.nbtcRaw > 0n && <> {' + '} {formatNbtc(ma.nbtcRaw)} NBTC</>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
