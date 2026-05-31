/**
 * NSI score-to-tier thresholds (off-chain SSOT).
 *
 * Tier boundaries are derived from measured distribution. T3 was lowered
 * 600 → 500 on 2026-05-23 after the first cron cycle showed only 14 users
 * reaching 600; 500 produces a small-but-credible Tier 3 cohort suitable
 * for VC demos. See `docs/nsi-phase1-runbook.md` for distribution data.
 *
 * Changing these requires:
 *   1. Update boundary tests in `__tests__/compute.test.ts`
 *   2. Emit a `formula_version_cutover` row in `nsi_compute_events`
 *   3. Consider reactivating monotone-up via `NSI_MONOTONE_UP_UNTIL` env to
 *      smooth the user-visible transition
 */
export const TIER_2_THRESHOLD = 250;
export const TIER_3_THRESHOLD = 500;

/**
 * NSI score is normalized to the inclusive range [0, NSI_MAX_SCORE]. Display
 * surfaces format as `X / 1000`.
 */
export const NSI_MAX_SCORE = 1000;

/**
 * Default monotone-up window length applied on formula version cutovers and
 * Phase launches. Actual window-until timestamp is configured via the
 * `NSI_MONOTONE_UP_UNTIL` env var read by the cron worker.
 */
export const MONOTONE_UP_DEFAULT_DAYS = 7;
