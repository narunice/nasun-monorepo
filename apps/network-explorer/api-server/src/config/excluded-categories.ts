/**
 * Categories excluded from "real user activity" checks.
 *
 * Used by: daily-nft-check.ts, health-update.ts, routes/ecosystem.ts.
 * SQL sites (matview, daily-snapshot.ts inline SQL) must be hand-synced.
 * See ecosystem-schema.sql matview definition for the canonical SQL form.
 */
export const EXCLUDED_CATEGORIES: readonly string[] = [
  'referral-bonus',
  'daily-mission',
  'ecosystem-passive',
  'staking-daily',
  'staking-reward',
  'ecosystem-bonus-pnl',
  'ecosystem-bonus-rank',
  'ecosystem-bonus-game',
  'ecosystem-bonus-diversity',
  'ecosystem-bonus-admin',
  'ecosystem-bonus-bugreport',
  'ecosystem-bonus-feedback',
  'ecosystem-bonus-restoration',
];
