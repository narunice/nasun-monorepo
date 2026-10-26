import { forwardRef, type FC, type HTMLAttributes } from 'react';
import {
  NSI_MAX_SCORE,
  TIER_BADGE_NEXT_LINE,
  TIER_BADGE_SCORE_LINE,
  TIER_BADGE_TOOLTIP_DESC,
  TIER_BADGE_TOOLTIP_TITLE,
  type Tier,
} from '@nasun/standing';

import { useNasunStanding } from '../hooks/useNasunStanding';

/**
 * Nasun Standing pill, shared by nasun.io, Pado and GoStop.
 *
 * Shows the score next to the tier, and the distance to the next tier in the
 * tooltip, because the tier alone says almost nothing: 59,447 of 62,600
 * wallets sit at tier 1 (measured 2026-10-26), so a pill reading "Tier 1"
 * would be decoration for 95% of the people who see it. The number and the
 * remainder are what make it a progress indicator instead.
 *
 * Tone tokens come from @nasun/tailwind-config, which all three apps load as
 * a preset, and each app's tailwind content glob already covers this package.
 */

const TIER_STYLES: Record<Tier, string> = {
  1: 'bg-nasun-nw4/20 text-nasun-nw4 ring-nasun-nw4/40',
  2: 'bg-pado-violet/20 text-pado-violet ring-pado-violet/40',
  3: 'bg-nasun-c1/20 text-nasun-c1 ring-nasun-c1/50',
};

/** Tooltip lines, so a host that renders its own tooltip uses the same copy. */
export function standingTooltipLines(args: {
  tier: Tier;
  nsiScore: number;
  nextThreshold?: number | null;
}): { title: string; score: string; next: string | null; desc: string } {
  const { tier, nsiScore, nextThreshold } = args;
  return {
    title: TIER_BADGE_TOOLTIP_TITLE(tier),
    score: TIER_BADGE_SCORE_LINE(nsiScore, NSI_MAX_SCORE),
    next:
      nextThreshold === null || nextThreshold === undefined
        ? null
        : TIER_BADGE_NEXT_LINE(nextThreshold, nsiScore),
    desc: TIER_BADGE_TOOLTIP_DESC,
  };
}

export interface StandingPillProps extends HTMLAttributes<HTMLSpanElement> {
  tier: Tier;
  nsiScore: number;
  nextThreshold?: number | null;
  /**
   * Leave unset for a native tooltip built from the shared copy. Pass false
   * when the host wraps this in its own tooltip, so the two do not both fire.
   */
  nativeTitle?: boolean;
  className?: string;
}

/**
 * forwardRef + rest props: a host may wrap this in a Radix Tooltip.Trigger
 * with `asChild`, which clones the child and hands it a ref and its own event
 * props. A plain function component would drop both and the tooltip would not
 * position itself.
 */
export const StandingPill = forwardRef<HTMLSpanElement, StandingPillProps>(function StandingPill(
  {
    tier,
    nsiScore,
    nextThreshold = null,
    nativeTitle = true,
    className = '',
    ...rest
  },
  ref,
) {
  const score = Math.round(nsiScore);
  const lines = standingTooltipLines({ tier, nsiScore, nextThreshold });
  const title = [lines.title, lines.score, lines.next, lines.desc]
    .filter(Boolean)
    .join('\n');

  const shape = `inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold ring-1 ${TIER_STYLES[tier]}`;

  return (
    <span
      ref={ref}
      className={`${shape} ${className}`.trim()}
      data-testid="standing-pill"
      title={nativeTitle ? title : undefined}
      aria-label={`Nasun Standing tier ${tier}, score ${score} of ${NSI_MAX_SCORE}`}
      {...rest}
    >
      <span>Tier {tier}</span>
      <span className="ml-1.5 opacity-70">&middot;</span>
      <span className="ml-1.5 opacity-80">{score}</span>
    </span>
  );
});

export interface NasunStandingBadgeProps {
  walletAddress: string | null | undefined;
  /** Explorer API base, e.g. https://explorer.nasun.io/api/v1 */
  apiBase: string | null | undefined;
  className?: string;
}

/**
 * Fetches and renders in one line, for headers. Renders nothing until the
 * standing is known, so it never reserves empty space.
 */
export const NasunStandingBadge: FC<NasunStandingBadgeProps> = ({
  walletAddress,
  apiBase,
  className = '',
}) => {
  const { standing } = useNasunStanding(walletAddress, apiBase);
  if (!standing) return null;

  return (
    <StandingPill
      tier={standing.tier}
      nsiScore={standing.nsiScore}
      nextThreshold={standing.nextThreshold}
      className={className}
    />
  );
};

export default NasunStandingBadge;
