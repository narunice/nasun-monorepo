// On-Chain Activity Points configuration
// Changes here are forward-only: existing points are never recalculated.
// git history serves as the audit log for all config changes.

// --- Points per activity ---
//
// Two groups:
//   Base categories: ecosystem score uses COUNT(DISTINCT category)/day only.
//     Values are 1 (existence marker) or 0 (skip). final_points is always 1.
//   Score categories (governance, daily-mission): final_points are added
//     directly to ecosystem score. Values are meaningful.

export const BASE_POINTS: Record<string, Record<string, number>> = {
  // Base categories (existence markers)
  'pado-dex': { 'limit-order': 1, 'market-order': 1, 'cancel-order': 1 },
  'pado-prediction': {
    'place-order': 1,
    'fill-order': 1,
    'mint-tokens': 1,
    'cancel-order': 1,
    'claim-winnings': 1,
    // legacy activity types (stale 0x98765cc3 package, kept for historical rows)
    'place-bid': 1, 'place-ask': 1,
  },
  'pado-perp': { 'open-position': 1, 'close-position': 1, 'add-margin': 1, 'remove-margin': 1 },
  'pado-lending': { deposit: 1, withdraw: 1, borrow: 1, repay: 1 },
  'baram-ai': { 'create-request': 1, settle: 1, cancel: 1 },
  'baram-executor': { register: 1, stake: 1, unstake: 0, update: 1 },
  'wallet-transfer': { transfer: 1, 'merge-coins': 0, 'split-coins': 0 },
  staking: { delegate: 1, unstake: 0 },
  'staking-daily': { 'staking-active': 1 },
  faucet: { claim: 1 },
  // Gostop games: each game is its own category so the 1pt/day cap applies
  // per game, allowing up to 5pt/day across the GoStop suite. Renamed from
  // the old shared pado-lottery/pado-scratchcard/pado-games keys.
  'gostop-lottery': { 'buy-ticket': 1, 'claim-prize': 1 },
  'gostop-scratchcard': { 'scratchcard-purchase': 1 },
  'gostop-numbermatch': { 'numbermatch-play': 1 },
  'gostop-mines': { 'mines-session': 1 },
  'gostop-crash': { 'crash-bet': 1, 'crash-cashout': 1 },
  chat: { participation: 1 },

  // Score categories (final_points used in ecosystem score)
  governance: { vote: 10, delegate: 5 },
  'daily-mission': {
    // Game first-time bonuses (lottery-first/scratchcard-first) removed when
    // GoStop categories were split; games now only earn the 1pt/day cap per
    // category. The remaining first-time entries are the non-game categories
    // tracked by scanner/daily-mission.ts MISSION_MAP.
    'dex-first': 5,
    'prediction-first': 5,
    'governance-first': 10,
    'perp-first': 5,
    'baram-first': 5,
    'faucet-first': 5,
    // Tier thresholds re-scaled for 6 qualifying categories (down from 8).
    'tier-3': 3,
    'tier-5': 5,
    'all-clear': 10,
  },
} as const;

// Categories whose final_points are added to ecosystem score.
// For all other categories, only existence (1 per category/day) matters.
export const SCORE_CATEGORIES = new Set([
  'governance', 'daily-mission', 'referral-bonus', 'ecosystem-passive',
]);

// Default mission set applied to users with no persisted user_active_missions
// row, or with an empty array (defensive: a stale [] write would otherwise
// zero out base_score). Single source of truth for daily-snapshot.ts,
// routes/ecosystem.ts (live /score), and rpc-reconcile.ts. All three readers
// must use the same fallback or filtered base will drift between live and
// the immutable end-of-day record (the 2026-05-03 incident root cause class).
export const DEFAULT_MISSION_IDS: readonly string[] = [
  'faucet', 'wallet-transfer', 'pado-dex',
  'gostop-lottery', 'gostop-scratchcard', 'gostop-numbermatch',
];

export const GENESIS_PASS_MULTIPLIER = 2.0; // Forward-only: existing 1.5x records remain immutable
export const VOLUME_TIER_CAP = 3.0;

// Categories that count as 2 points in base_score (heavier commitment).
// Single source of truth for the per-day distinct-category sum used by
// daily-snapshot, /score live, rpc-reconcile, and the frontend pts-today
// indicator. SQL readers must mirror this set as
// `category IN ('pado-dex','pado-prediction')`.
export const HEAVY_BASE_CATEGORIES: ReadonlySet<string> = new Set([
  'pado-dex',
  'pado-prediction',
]);

export function baseWeightFor(category: string): number {
  return HEAVY_BASE_CATEGORIES.has(category) ? 2 : 1;
}

// --- Staking emissions leaderboard ---
// final_points = STAKING_EMISSION_COEFF * LOG2(delta_mist + 1)
// Calibration: 1 NSN/week emitted (~1e9 MIST) -> LOG2(1e9+1)*0.05 ~= 1.5 pts/day.
export const STAKING_EMISSION_COEFF = 0.07;

// Forward-only guard: yesterday's date must be >= this cutoff to generate rows.
// Set to the day emissions tracking started minus 1 (i.e., 2026-04-21 passes as yesterdayStr).
export const STAKING_EMISSION_CUTOFF_DATE = '2026-04-21';

// --- Staking-v2 ---
// Active stake principal contributes a tiered per-day score that is summed with base_score
// inside the frontend formula: today = (base + staking) * mult + bonus.
// UTC date; compared lexicographically against scanner targetDate (also UTC YYYY-MM-DD).
export const STAKING_V2_CUTOFF_DATE = '2026-04-14';

export const STAKING_V2_TIERS: Array<{ minNsn: number; pts: number }> = [
  { minNsn: 5001, pts: 3 },
  { minNsn: 501, pts: 2 },
  { minNsn: 1, pts: 1 },
];

export function calcStakingTierPts(principalNsn: number): number {
  for (const tier of STAKING_V2_TIERS) {
    if (principalNsn >= tier.minNsn) return tier.pts;
  }
  return 0;
}

// --- Scanner parameters ---

export const SCAN_INTERVAL_MS = 60 * 1000; // 1 minute (fast detection for daily mission checklist)
export const BATCH_SIZE = 1000;
export const WALLET_CACHE_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

// --- Event-to-Activity mapping ---
// Key format: "${packageHexNoPrefix}::${module}::${eventTypeName}"
// package is the original package ID (stripped 0x, lowercase)
// Values: { category, activityType }

interface EventMapping {
  category: string;
  activityType: string;
}

function stripHex(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase();
}

// Package original IDs from devnet-ids.json
const PKG = {
  deepbook: stripHex(
    '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
  ),
  // Unified margin contract (new pado perp/margin product, 2026-04)
  unifiedMargin: stripHex(
    '0x1a1a6e86712a866e8bf7b2d6320b364282b5b257f8f9419db652914cf2d7a472',
  ),
  // Alliance NFT (new NFT contract, 2026-04)
  allianceNft: stripHex(
    '0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b',
  ),
  // Prediction package: superseded 2026-05 (was 0x98765cc3..., now 0xbe6d8f69...).
  // Mirrors packages/devnet-config/devnet-ids.json prediction.packageId.
  prediction: stripHex(
    '0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d',
  ),
  lottery: stripHex(
    '0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c',
  ),
  governance: stripHex(
    '0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3',
  ),
  governanceMultiChoice: stripHex(
    '0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a',
  ),
  baram: stripHex(
    '0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6',
  ),
  baramExecutor: stripHex(
    '0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd',
  ),
  baramAer: stripHex(
    '0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0',
  ),
  lending: stripHex(
    '0xdd1e36881a1d47ad4f0f331b6a949948f308ded71c1d46802f23e258ca1ebafe',
  ),
  perp: stripHex(
    '0x6821a73cfc3cd45dc6318db379c2c88f0acb61ec6a26060f4de8cbe4718d3658',
  ),
  scratchcard: stripHex(
    '0xd70d650aae2a313faf6ec4a56744a9fb1bab8c289bfef57838bc5e336296ddff',
  ),
  numbermatch: stripHex(
    '0xf1087293200f23afdcce3415fcf025943bb22708b6b29588be671629dcb92758',
  ),
  // Gostop game contracts (apps/gostop/devnet-ids.json). Same Move event
  // names as pado equivalents — mapped to the same categories so daily caps
  // dedup across both products.
  gostopLottery: stripHex(
    '0xc0be188b342c4ee7c6cb3cef351a800b1b549cac75311a3d9a80a0a3f54634a3',
  ),
  gostopScratchcard: stripHex(
    '0xbd496f89148dfcd1f2bf9da19c9e5b053f97ebe0332df59289cb5ccfde6b6f7e',
  ),
  gostopNumbermatch: stripHex(
    '0xa111b54021094504d91fffd6e46ae6d4e4824e0341490004e4474aca03c8d314',
  ),
  // Mines and crash: must use originalPackageId (event subscription identity).
  // crash has been upgraded to v5; packageId field in devnet-ids.json reflects
  // the current upgrade, not the origin. Using packageId here would silently
  // drop matches.
  gostopMines: stripHex(
    '0x57ba939cf26c6bc52a8ab4db81b8f07077cb5f41ceab0d08b497f98e4a2f3d54',
  ),
  gostopCrash: stripHex(
    '0x6fc868a6dabc2081cd47ea71ee8d2f8314c57102179eafd2ce0fce8e9edc5188',
  ),
  tokens: stripHex(
    '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731',
  ),
  tokensV2: stripHex(
    '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2',
  ),
  sui: stripHex(
    '0x0000000000000000000000000000000000000000000000000000000000000003',
  ),
} as const;

// Packages whose presence in a PTB disqualifies the tx from counting toward the
// "send tokens" daily mission. Intent: a legitimate peer transfer is a PTB
// whose *only* substantive command is a TransferObjects to another user. Any
// MoveCall into one of these contracts implies a contract interaction (faucet
// claim, Pado spot trade auto-deposit, staking, etc.) and the TransferObjects
// present in such PTBs is typically a return-object hand-back, not a send.
//
// Also excludes Sui framework 0x2/0x3 to avoid false positives from system
// helpers like `0x2::pay::split_and_transfer` being chained with staking etc.
// Pure `0x2::pay::split_and_transfer` sends without Pado/faucet calls are
// still credited because frontend and scanner both require TransferObjects
// presence — `pay` helpers that hand the coin to TransferObjects still pass.
// Module names whose MoveCall presence in a PTB disqualifies the tx from
// counting toward the "send tokens" daily mission. Used by the indexer-SQL
// wallet-transfer scanner (wallet-transfer-scanner.ts) — module-name
// matching is upgrade-safe (package upgrades change the address but keep
// module names stable).
//
// SYNC WARNING: Must stay in lockstep with frontend's
// CONTRACT_MODULES_EXCLUDING_TRANSFER in
// apps/nasun-website/frontend/src/hooks/useDailyMissions.ts. Out-of-sync
// entries cause the UI checkbox and pts-today to diverge — exactly the
// drift this PR was written to eliminate.
//
// List derived from observed `tx_calls_fun.module` values for Nasun
// packages on devnet as of 2026-04-14. Add new modules here AND in the
// frontend when new Nasun contracts ship.
export const WALLET_TRANSFER_EXCLUDED_MODULES: readonly string[] = [
  // Faucet (tokens V1 + V2)
  'faucet', 'faucet_v2',
  // Pado DEX / Perp / Margin
  'order_info', 'order', 'pool', 'deep', 'balance_manager',
  'unified_margin',
  // Pado games
  'prediction_market', 'lottery', 'scratchcard', 'numbermatch',
  // Gostop games
  'mines', 'crash',
  // Nasun website / admin
  'alliance_nft', 'battalion_nft', 'smart_account',
  'dev_oracle',
  // Governance
  'governance',
  // Baram AI Settlement
  'baram', 'executor', 'aer',
  // Sui system (0x3)
  'staking_pool', 'sui_system',
] as const;

export const WALLET_TRANSFER_EXCLUDED_PACKAGES: ReadonlySet<string> = new Set([
  PKG.tokens,
  PKG.tokensV2,
  PKG.deepbook,
  PKG.prediction,
  PKG.lottery,
  PKG.governance,
  PKG.governanceMultiChoice,
  PKG.baram,
  PKG.baramExecutor,
  PKG.baramAer,
  PKG.lending,
  PKG.perp,
  PKG.scratchcard,
  PKG.numbermatch,
  PKG.gostopLottery,
  PKG.gostopScratchcard,
  PKG.gostopNumbermatch,
  PKG.gostopMines,
  PKG.gostopCrash,
  PKG.sui, // 0x3 Sui system (staking)
]);

// Build event mapping table
// NOTE: Event type names must match exactly what the Move contracts emit.
// After first scan, check logs for "[Points] Unmatched event" to discover
// missing mappings and update this table.
//
// SYNC WARNING: The Mission UI keeps an independent RPC-based detection list
// at apps/nasun-website/frontend/src/hooks/useDailyMissions.ts
// (EVENT_MISSION_MAP). When adding or renaming an event that maps to a
// mission category (pado-dex, pado-lottery, pado-scratchcard, pado-games),
// mirror the change there. Out-of-sync entries cause points to be credited
// correctly while the daily-mission checkbox stays empty.
// Precedent: commit aa3e7a7b added OrderFilled here only, UI drift followed.
const EVENT_MAP_ENTRIES: [string, string, string, EventMapping][] = [
  // [packageHex, module, typeName, mapping]

  // Pado DEX (DeepBook v2)
  // Actual modules: order_info (OrderPlaced, OrderInfo), order (OrderCanceled)
  [PKG.deepbook, 'order_info', 'OrderPlaced', { category: 'pado-dex', activityType: 'limit-order' }],
  [PKG.deepbook, 'order_info', 'OrderFilled', { category: 'pado-dex', activityType: 'market-order' }],
  [PKG.deepbook, 'order_info', 'OrderFullyFilled', { category: 'pado-dex', activityType: 'market-order' }],
  [PKG.deepbook, 'order', 'OrderCanceled', { category: 'pado-dex', activityType: 'cancel-order' }],
  // OrderInfo is a companion event emitted with OrderPlaced, skip to avoid double-counting

  // Pado Prediction (module: prediction_market — emits OrderPlaced from maker
  // resting paths and OrderFilled from taker fast-fill paths; mapping both is
  // required so taker-only fills still credit the taker. The 1pt/day category
  // cap collapses any duplicate same-tx events.)
  [PKG.prediction, 'prediction_market', 'TokensMinted', { category: 'pado-prediction', activityType: 'mint-tokens' }],
  [PKG.prediction, 'prediction_market', 'OrderPlaced', { category: 'pado-prediction', activityType: 'place-order' }],
  [PKG.prediction, 'prediction_market', 'OrderFilled', { category: 'pado-prediction', activityType: 'fill-order' }],
  [PKG.prediction, 'prediction_market', 'OrderCancelled', { category: 'pado-prediction', activityType: 'cancel-order' }],
  [PKG.prediction, 'prediction_market', 'WinningsClaimed', { category: 'pado-prediction', activityType: 'claim-winnings' }],

  // GoStop games: split into per-game categories so each carries its own
  // 1pt/day cap (up to 5pt/day across the suite). Pado-side lottery /
  // scratchcard / numbermatch entries dropped: traffic was 0 (the games are
  // hosted on gostop.app), and keeping the legacy PKG mappings would make
  // either category resolution ambiguous if the pado packages ever re-emit.

  // Gostop Lottery
  [PKG.gostopLottery, 'lottery', 'TicketPurchased', { category: 'gostop-lottery', activityType: 'buy-ticket' }],
  [PKG.gostopLottery, 'lottery', 'PrizeClaimed', { category: 'gostop-lottery', activityType: 'claim-prize' }],

  // Pado Perp
  [PKG.perp, 'perp', 'PositionOpened', { category: 'pado-perp', activityType: 'open-position' }],
  [PKG.perp, 'perp', 'PositionClosed', { category: 'pado-perp', activityType: 'close-position' }],
  [PKG.perp, 'perp', 'MarginAdded', { category: 'pado-perp', activityType: 'add-margin' }],
  [PKG.perp, 'perp', 'MarginRemoved', { category: 'pado-perp', activityType: 'remove-margin' }],

  // Gostop Scratchcard
  [PKG.gostopScratchcard, 'scratchcard', 'ScratchCardPurchased', { category: 'gostop-scratchcard', activityType: 'scratchcard-purchase' }],

  // Gostop NumberMatch
  [PKG.gostopNumbermatch, 'numbermatch', 'NumberMatchPlayed', { category: 'gostop-numbermatch', activityType: 'numbermatch-play' }],

  // Gostop Mines: SessionFinished is emitted on every session end (bust at
  // L307, cashout at L382 in mines.move). Both count as a completed game
  // session for daily-mission purposes; bust still represents a session
  // played.
  [PKG.gostopMines, 'mines', 'SessionFinished', { category: 'gostop-mines', activityType: 'mines-session' }],

  // Gostop Crash: BetPlaced fires when a player bets into a round; the
  // keeper always auto-finalizes the round, so a bet alone is enough to
  // count the game as completed (a player who busts still played a full
  // round). CashOutRecorded fires on a successful cashout. Both map to
  // gostop-crash so a bet+cashout combo only credits 1pt/day.
  [PKG.gostopCrash, 'crash', 'BetPlaced', { category: 'gostop-crash', activityType: 'crash-bet' }],
  [PKG.gostopCrash, 'crash', 'CashOutRecorded', { category: 'gostop-crash', activityType: 'crash-cashout' }],

  // Pado Lending
  [PKG.lending, 'lending', 'DepositEvent', { category: 'pado-lending', activityType: 'deposit' }],
  [PKG.lending, 'lending', 'WithdrawEvent', { category: 'pado-lending', activityType: 'withdraw' }],
  [PKG.lending, 'lending', 'BorrowEvent', { category: 'pado-lending', activityType: 'borrow' }],
  [PKG.lending, 'lending', 'RepayEvent', { category: 'pado-lending', activityType: 'repay' }],

  // Baram AI
  [PKG.baram, 'aer', 'RequestCreated', { category: 'baram-ai', activityType: 'create-request' }],
  [PKG.baram, 'aer', 'RequestSettled', { category: 'baram-ai', activityType: 'settle' }],
  [PKG.baram, 'aer', 'RequestCanceled', { category: 'baram-ai', activityType: 'cancel' }],
  [PKG.baramAer, 'aer', 'RequestCreated', { category: 'baram-ai', activityType: 'create-request' }],
  [PKG.baramAer, 'aer', 'RequestSettled', { category: 'baram-ai', activityType: 'settle' }],
  [PKG.baramAer, 'aer', 'RequestCanceled', { category: 'baram-ai', activityType: 'cancel' }],

  // Baram Executor
  [PKG.baramExecutor, 'executor', 'ExecutorRegistered', { category: 'baram-executor', activityType: 'register' }],
  [PKG.baramExecutor, 'staking', 'StakeAdded', { category: 'baram-executor', activityType: 'stake' }],
  [PKG.baramExecutor, 'staking', 'StakeRemoved', { category: 'baram-executor', activityType: 'unstake' }],
  [PKG.baramExecutor, 'executor', 'ExecutorUpdated', { category: 'baram-executor', activityType: 'update' }],

  // Governance (module names must match Move sources, not the package-level namespace)
  [PKG.governance, 'proposal', 'VoteRegistered', { category: 'governance', activityType: 'vote' }],
  [PKG.governance, 'delegation', 'DelegationCreated', { category: 'governance', activityType: 'delegate' }],
  [PKG.governance, 'delegation', 'DelegationRevoked', { category: 'governance', activityType: 'delegate' }],
  [PKG.governanceMultiChoice, 'multi_choice_proposal', 'MultiChoiceVoteRegistered', { category: 'governance', activityType: 'vote' }],

  // Faucet: excluded from EVENT_MAP (0 points, never inserted).
  // Kept in BASE_POINTS for documentation only.

  // Staking (Sui system package 0x3)
  [PKG.sui, 'validator', 'StakingRequestEvent', { category: 'staking', activityType: 'delegate' }],
  [PKG.sui, 'validator', 'UnstakingRequestEvent', { category: 'staking', activityType: 'unstake' }],
];

// Build lookup map
export const EVENT_MAPPING = new Map<string, EventMapping>();
for (const [pkg, mod, typeName, mapping] of EVENT_MAP_ENTRIES) {
  EVENT_MAPPING.set(`${pkg}::${mod}::${typeName}`, mapping);
}

// Helper to look up mapping for an event
export function getEventMapping(
  packageHex: string,
  module: string,
  typeName: string,
): EventMapping | undefined {
  return EVENT_MAPPING.get(`${packageHex}::${module}::${typeName}`);
}

// Events that are explicitly known but should not award points.
// Checked before recordUnmappedEvent() to suppress log noise.
//
// Categories:
//   A) DeepBook protocol events (auto-emitted by contract internals)
//   B) Sui system epoch events (auto-emitted at epoch boundaries)
//   C) New product events pending category/points decision (suppress until mapped)
export const IGNORED_EVENT_KEYS = new Set<string>([
  // A) DeepBook protocol events
  `${PKG.deepbook}::order_info::OrderInfo`,            // companion to OrderPlaced, skip double-count
  `${PKG.deepbook}::order_info::OrderExpired`,          // order TTL expiry, no user action
  `${PKG.deepbook}::balance_manager::BalanceManagerEvent`,
  `${PKG.deepbook}::balance_manager::BalanceEvent`,
  `${PKG.deepbook}::governance::TradeParamsUpdateEvent`, // protocol param update, not user governance
  `${PKG.deepbook}::history::EpochData`,
  `${PKG.deepbook}::history::Volumes`,
  `${PKG.deepbook}::ewma::EWMAUpdate`,

  // B) Sui system epoch events (emitted by 0x3 at each epoch boundary)
  `${PKG.sui}::validator_set::ValidatorEpochInfoEventV2`,
  `${PKG.sui}::sui_system_state_inner::SystemEpochInfoEvent`,

  // C) New product events pending points decision
  //    unified_margin: new pado margin product (2026-04). Categorize before awarding points.
  `${PKG.unifiedMargin}::unified_margin::AccountCreated`,
  `${PKG.unifiedMargin}::unified_margin::NusdcDeposited`,
  //    alliance_nft: new NFT contract (2026-04). No category defined yet.
  `${PKG.allianceNft}::alliance_nft::AllianceMinted`,
]);

// Get base points for a category + activity type
export function getBasePoints(category: string, activityType: string): number {
  return BASE_POINTS[category]?.[activityType] ?? 0;
}

// Phase 2: Calculate volume tier (log scale, capped).
// Currently unused - scanner hardcodes volumeTier = 1.0.
// Will be integrated when event amount parsing is implemented.
export function calcVolumeTier(amount: bigint, baseThreshold: bigint): number {
  if (amount <= 0n || baseThreshold <= 0n) return 1.0;
  const ratio = Number(amount) / Number(baseThreshold);
  if (ratio <= 1) return 1.0;
  return Math.min(1.0 + Math.log10(ratio), VOLUME_TIER_CAP);
}
