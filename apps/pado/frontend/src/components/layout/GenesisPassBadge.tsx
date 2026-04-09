/**
 * GenesisPassBadge - Crown + "GP" badge for Genesis Pass holders.
 * Shown in Header right side, hidden on mobile (< sm).
 */

import { useGenesisPass } from '../../hooks/useGenesisPass';

export function GenesisPassBadge() {
  const hasGenesisPass = useGenesisPass();

  if (!hasGenesisPass) return null;

  return (
    <div
      className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-default bg-amber-500/10 text-amber-400"
      title="Genesis Pass Holder"
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 1l3 5 5 1.5L14 12l.5 6L10 15.5 5.5 18l.5-6L2 7.5 7 6l3-5z" />
      </svg>
      GP
    </div>
  );
}
