/**
 * @nasun/standing — public surface.
 *
 * The `./test-utils` entrypoint is exposed separately for source-parity tests
 * that need to read `policy.move` from disk. Production bundles MUST import
 * only from the main entry to avoid pulling node `fs` into Vite output.
 */

export {
  TIER_2_THRESHOLD,
  TIER_3_THRESHOLD,
  NSI_MAX_SCORE,
  MONOTONE_UP_DEFAULT_DAYS,
} from './thresholds.js';

export { NSI_FORMULA } from './weights.js';

export { TIER_BENEFITS } from './benefits.js';

export {
  nsiToTier,
  applyGpFloor,
  nextThreshold,
  monotoneUpDisplayTier,
} from './compute.js';

export {
  TIER_BADGE_TOOLTIP_DESC,
  TIER_BADGE_TOOLTIP_TITLE,
  TIER_BADGE_SCORE_LINE,
  TIER_BADGE_NEXT_LINE,
} from './copy.js';

export type {
  Tier,
  SubScores,
  TierBenefits,
  SubScoreWindow,
  SubScoreWindowKind,
  NsiFormula,
  PublicStandingResponse,
  PrivateStandingResponse,
} from './types.js';
