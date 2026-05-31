/**
 * User-facing strings for Nasun Standing surfaces.
 *
 * EN-only. i18n is intentionally not used for nasun-website Standing surfaces
 * — see project memory `nasun-website i18n 폐기`. Keep these honest about the
 * underlying formula state; do not claim a "30 days" window until the tx
 * sub-score migrates to a sliding window (Phase 1.5).
 */

export const TIER_BADGE_TOOLTIP_DESC =
  'Reflects your on-chain activity. Refreshed hourly.';

export const TIER_BADGE_TOOLTIP_TITLE = (tier: 1 | 2 | 3) =>
  `Nasun Standing — Tier ${tier}`;

export const TIER_BADGE_SCORE_LINE = (score: number, max: number) =>
  `Score ${Math.round(score)} / ${max}`;

export const TIER_BADGE_NEXT_LINE = (next: number, current: number) =>
  `Next tier at ${next} (+${Math.max(0, Math.round(next - current))})`;
