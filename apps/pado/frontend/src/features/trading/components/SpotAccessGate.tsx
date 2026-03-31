/**
 * SpotAccessGate
 * Soft gate for invited testers during closed spot trading test.
 * Validates access code against VITE_SPOT_ACCESS_CODE env var.
 * Not a security boundary -- code is visible in client bundle.
 *
 * TEMPORARY: Remove after 2026-04-07
 */

import { useState, type FormEvent } from 'react';
import { NETWORK_CONFIG } from '../../../config/network';

const STORAGE_KEY = 'pado:spot-access';
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function SpotAccessGate({ onSuccess, featureName = 'Spot Trading' }: { onSuccess: () => void; featureName?: string }) {
  const [accessId, setAccessId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(false);
    const input = `${accessId}:${password}`;
    if (input === NETWORK_CONFIG.spotAccessCode) {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      onSuccess();
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-theme-bg-secondary border border-theme-border rounded-2xl p-8 shadow-lg">
          {/* Wordmark */}
          <h1 className="text-2xl font-brand tracking-wider text-pd3 text-center mb-1">
            PADO
          </h1>

          <h2 className="text-base font-semibold text-theme-text-primary text-center mb-2">
            {featureName} Access
          </h2>
          <p className="text-sm text-theme-text-muted text-center mb-6">
            This feature is currently available to invited testers only.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="spot-access-id" className="block text-xs font-medium text-theme-text-secondary mb-1.5">
                Access ID
              </label>
              <input
                id="spot-access-id"
                type="text"
                value={accessId}
                onChange={(e) => setAccessId(e.target.value)}
                className="w-full px-3 py-2.5 bg-theme-bg-primary border border-theme-border rounded-lg
                  text-sm text-theme-text-primary placeholder-theme-text-muted
                  focus:outline-none focus:ring-1 focus:ring-pd3/50 focus:border-pd3/50
                  transition-colors"
                placeholder="Enter access ID"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="spot-access-pw" className="block text-xs font-medium text-theme-text-secondary mb-1.5">
                Password
              </label>
              <input
                id="spot-access-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-theme-bg-primary border border-theme-border rounded-lg
                  text-sm text-theme-text-primary placeholder-theme-text-muted
                  focus:outline-none focus:ring-1 focus:ring-pd3/50 focus:border-pd3/50
                  transition-colors"
                placeholder="Enter password"
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center">
                Invalid credentials. Please check your DM for the correct access code.
              </p>
            )}

            <button
              type="submit"
              disabled={!accessId || !password}
              className="w-full py-2.5 bg-pd3 text-white text-sm font-semibold rounded-lg
                hover:bg-pd3/90 disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Check localStorage with TTL expiry.
 * TEMPORARY: Remove after 2026-04-07
 */
export function isSpotAccessGranted(): boolean {
  try {
    const ts = localStorage.getItem(STORAGE_KEY);
    if (!ts) return false;
    const parsed = Number(ts);
    if (Number.isNaN(parsed) || Date.now() - parsed > ACCESS_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
