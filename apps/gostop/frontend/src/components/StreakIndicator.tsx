/**
 * Game-screen streak indicator.
 *
 * Renders nothing unless the player is on a streak of length >= 3 (anti-spam).
 * Polls /api/gostop/streak/:player every 10s via useStreak.
 *
 * Drop into any game page header:
 *   <StreakIndicator player={walletAddress} />
 */

import { useStreak } from '../lib/api/queries';

interface StreakIndicatorProps {
  player: string | undefined;
  minLength?: number;
}

export function StreakIndicator({ player, minLength = 3 }: StreakIndicatorProps) {
  const { data } = useStreak(player);

  if (!player || !data) return null;
  if (data.kind === 'none') return null;
  if (data.length < minLength) return null;

  const isWin = data.kind === 'win';
  const tone = isWin
    ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-200'
    : 'border-rose-400/60 bg-rose-950/40 text-rose-200';
  const label = isWin ? 'Win streak' : 'Loss streak';
  const dot = isWin ? 'bg-emerald-400' : 'bg-rose-400';

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${tone}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="font-mono font-semibold">{data.length}</span>
      <span className="text-xs uppercase tracking-widest opacity-90">{label}</span>
    </div>
  );
}
