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
  'pado-prediction': { 'mint-tokens': 1, 'place-bid': 1, 'place-ask': 1, 'claim-winnings': 1 },
  'pado-lottery': { 'buy-ticket': 1, 'claim-prize': 1 },
  'pado-perp': { 'open-position': 1, 'close-position': 1, 'add-margin': 1, 'remove-margin': 1 },
  'pado-lending': { deposit: 1, withdraw: 1, borrow: 1, repay: 1 },
  'baram-ai': { 'create-request': 1, settle: 1, cancel: 1 },
  'baram-executor': { register: 1, stake: 1, unstake: 0, update: 1 },
  'wallet-transfer': { transfer: 1, 'merge-coins': 0, 'split-coins': 0 },
  staking: { delegate: 1, unstake: 0 },
  'staking-daily': { 'staking-active': 1 },
  faucet: { claim: 1 },
  'pado-scratchcard': { 'scratchcard-purchase': 1 },
  'pado-games': { 'numbermatch-play': 1 },
  chat: { participation: 1 },

  // Score categories (final_points used in ecosystem score)
  governance: { vote: 10, delegate: 5 },
  'daily-mission': {
    'dex-first': 5,
    'prediction-first': 5,
    'lottery-first': 5,
    'governance-first': 10,
    'perp-first': 5,
    'scratchcard-first': 5,
    'baram-first': 5,
    'faucet-first': 5,
    'tier-4': 3,
    'tier-5': 5,
    'all-clear': 10,
  },
} as const;

// Categories whose final_points are added to ecosystem score.
// For all other categories, only existence (1 per category/day) matters.
export const SCORE_CATEGORIES = new Set([
  'governance', 'daily-mission', 'referral-bonus', 'ecosystem-passive',
]);

export const GENESIS_PASS_MULTIPLIER = 2.0; // Forward-only: existing 1.5x records remain immutable
export const VOLUME_TIER_CAP = 3.0;

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
  prediction: stripHex(
    '0x98765cc3765324148db9815da8bce85e6ca895e94eed910b6cc9bec55cc22895',
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
  'prediction', 'lottery', 'scratchcard', 'numbermatch',
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
  [PKG.deepbook, 'order', 'OrderCanceled', { category: 'pado-dex', activityType: 'cancel-order' }],
  // OrderInfo is a companion event emitted with OrderPlaced, skip to avoid double-counting

  // Pado Prediction
  [PKG.prediction, 'prediction', 'TokensMinted', { category: 'pado-prediction', activityType: 'mint-tokens' }],
  [PKG.prediction, 'prediction', 'BidPlaced', { category: 'pado-prediction', activityType: 'place-bid' }],
  [PKG.prediction, 'prediction', 'AskPlaced', { category: 'pado-prediction', activityType: 'place-ask' }],
  [PKG.prediction, 'prediction', 'WinningsClaimed', { category: 'pado-prediction', activityType: 'claim-winnings' }],

  // Pado Lottery
  [PKG.lottery, 'lottery', 'TicketPurchased', { category: 'pado-lottery', activityType: 'buy-ticket' }],
  [PKG.lottery, 'lottery', 'PrizeClaimed', { category: 'pado-lottery', activityType: 'claim-prize' }],

  // Pado Perp
  [PKG.perp, 'perp', 'PositionOpened', { category: 'pado-perp', activityType: 'open-position' }],
  [PKG.perp, 'perp', 'PositionClosed', { category: 'pado-perp', activityType: 'close-position' }],
  [PKG.perp, 'perp', 'MarginAdded', { category: 'pado-perp', activityType: 'add-margin' }],
  [PKG.perp, 'perp', 'MarginRemoved', { category: 'pado-perp', activityType: 'remove-margin' }],

  // Pado Scratchcard
  [PKG.scratchcard, 'scratchcard', 'ScratchCardPurchased', { category: 'pado-scratchcard', activityType: 'scratchcard-purchase' }],

  // Pado NumberMatch (Games)
  [PKG.numbermatch, 'numbermatch', 'NumberMatchPlayed', { category: 'pado-games', activityType: 'numbermatch-play' }],

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
