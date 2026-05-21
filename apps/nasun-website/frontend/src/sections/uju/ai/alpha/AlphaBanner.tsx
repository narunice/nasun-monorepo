/**
 * Top-of-page banner that surfaces alpha lifecycle events the user
 * shouldn't miss:
 *   - invited        → "claim within Xh" with a CTA
 *   - active warned  → "session ends in Xh, deactivate to withdraw early"
 *   - paused         → "session ended, your funds are safe"
 *
 * Every other state renders nothing so this banner does not clutter the
 * normal AI tab UX. Subscribe via `useAlphaStatus` — separate from
 * AlphaGate's subscription (different mount points), browsers de-dupe
 * the underlying fetch automatically over a short window.
 */

import { useAlphaStatus } from './useAlphaStatus';

interface Props {
  walletAddress: string;
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '< 1m';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function AlphaBanner({ walletAddress }: Props) {
  const { status } = useAlphaStatus(walletAddress);
  if (!status) return null;

  if (status.state === 'invited') {
    return (
      <Banner tone="accent">
        Your alpha slot is ready — activate within {fmtRemaining((status.invite_expires_at ?? 0) - Date.now())}
        {' '}or you'll be re-queued.
      </Banner>
    );
  }

  if (status.state === 'active' && status.warned && status.expires_at) {
    return (
      <Banner tone="warn">
        Alpha session ends in {fmtRemaining(status.expires_at - Date.now())}.
        Your agent will pause automatically — open Deactivate to withdraw early.
      </Banner>
    );
  }

  if (status.state === 'paused') {
    return (
      <Banner tone="muted">
        Alpha session ended. Your agent is paused; funds and signing key are
        preserved.
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: 'accent' | 'warn' | 'muted';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-pado-2/60 bg-pado-2/10 text-white'
      : tone === 'warn'
      ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-100'
      : 'border-uju-border bg-uju-surface text-uju-secondary';
  return (
    <div
      className={`rounded-xl border px-4 py-2 text-sm ${toneClass}`}
      role="status"
    >
      {children}
    </div>
  );
}
