import type { NsiFormula } from './types.js';

/**
 * NSI formula metadata.
 *
 * Treated as the off-chain SSOT for sub-score weights and time windows.
 * `nsi-compute.ts` reads from here so that the formula version is recorded
 * with each cycle in the `nsi_compute_events` audit table.
 *
 * Version semantics:
 *   - bump `version` on any weight / window change
 *   - bump triggers a `formula_version_cutover` audit row + Telegram alert
 *   - coordinate with `NSI_MONOTONE_UP_UNTIL` reset to smooth transitions
 *
 * Phase 1 caveat: `tx` window is currently `current_state` because the
 * production query is lifetime distinct-tx count. Migration to a 30d sliding
 * window is deferred to Phase 1.5 (covering-index pre-flight required). UI
 * copy avoids time-window claims until that migration lands.
 */
export const NSI_FORMULA: NsiFormula = {
  version: '1.0',
  weights: {
    staking: 0.35,
    lp: 0.20,
    tx: 0.20,
    diversity: 0.15,
    nft: 0.10,
  },
  windows: {
    staking: { kind: 'sliding', days: 30 },
    lp: { kind: 'sliding', days: 30 },
    tx: { kind: 'current_state' }, // Phase 1.5 → { kind: 'sliding', days: 30 }
    diversity: { kind: 'sliding', days: 30 },
    nft: { kind: 'current_state' },
  },
};
