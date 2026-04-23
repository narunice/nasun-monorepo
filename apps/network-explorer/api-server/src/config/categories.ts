/**
 * Categories excluded from the "meaningful on-chain engagement" DAU scope.
 *
 * Applied to queries on `activity_points` in:
 *   - GET /api/v1/stats/daily-metrics (admin Devnet Metrics chart)
 *   - POST /api/v1/stats/nasun-metrics (admin Nasun Stats download)
 *
 * Must stay in sync with the nasun-stats skill's exclusion list
 * (`.claude/skills/nasun-stats/SKILL.md`).
 *
 * Excluded: off-chain interactions (chat, daily-mission), faucet (bot-farming
 * proxy), passive/airdrop point grants, admin-granted ecosystem bonuses.
 */
export const OFFCHAIN_CATEGORIES = [
  'chat',
  'daily-mission',
  'faucet',
  'ecosystem-passive',
  'ecosystem-bonus-restoration',
  'ecosystem-bonus-earlybird',
  'ecosystem-bonus-admin',
  'ecosystem-bonus-game',
  'ecosystem-bonus-creators-appreciation',
  'ecosystem-bonus-bugreport',
  'ecosystem-bonus-creator-posts',
  'ecosystem-bonus-alliance-airdrop',
  'ecosystem-bonus-genesis-pass-airdrop',
  'ecosystem-bonus-feedback',
] as const;

export type OffchainCategory = (typeof OFFCHAIN_CATEGORIES)[number];
