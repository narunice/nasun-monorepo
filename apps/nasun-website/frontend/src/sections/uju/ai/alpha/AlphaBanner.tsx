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
    const claimIn = fmtRemaining((status.invite_expires_at ?? 0) - Date.now());
    return (
      <Banner tone="accent">
        {status.resume
          ? <>Your turn is back. Resume your agent within {claimIn} to start a fresh session.</>
          : <>Your alpha slot is ready. Activate within {claimIn} or you'll be re-queued.</>}
      </Banner>
    );
  }

  if (status.state === 'active' && status.warned && status.expires_at) {
    return (
      <Banner tone="warn">
        Your alpha turn ends in {fmtRemaining(status.expires_at - Date.now())}.
        The agent pauses automatically and you go back in the waitlist for your
        next turn. Want to exit and withdraw instead? Open Deactivate.
      </Banner>
    );
  }

  if (status.state === 'paused') {
    return (
      <Banner tone="muted">
        Your alpha turn ended. You are back in the waitlist
        {status.queue_position
          ? <> at position #{status.queue_position}{status.queue_depth ? ` of ${status.queue_depth}` : ''}</>
          : ''}
        ; your funds and agent are preserved and you can resume in one tap when
        your turn comes around.
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
