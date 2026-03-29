// On-Chain Activity Points configuration
// Changes here are forward-only: existing points are never recalculated.
// git history serves as the audit log for all config changes.

// --- Base Points per activity ---

export const BASE_POINTS: Record<string, Record<string, number>> = {
  'pado-dex': { 'limit-order': 5, 'market-order': 5, 'cancel-order': 1 },
  'pado-prediction': {
    'mint-tokens': 8,
    'place-bid': 6,
    'place-ask': 6,
    'claim-winnings': 3,
  },
  'pado-lottery': { 'buy-ticket': 2, 'claim-prize': 1 },
  'pado-perp': {
    'open-position': 10,
    'close-position': 5,
    'add-margin': 3,
    'remove-margin': 3,
  },
  'pado-lending': { deposit: 10, withdraw: 5, borrow: 8, repay: 5 },
  'baram-ai': { 'create-request': 12, settle: 8, cancel: 1 },
  'baram-executor': { register: 30, stake: 50, unstake: 0, update: 5 },
  governance: { vote: 15, delegate: 5 },
  'wallet-transfer': { transfer: 1, 'merge-coins': 0, 'split-coins': 0 },
  staking: { delegate: 10, unstake: 0 },
  faucet: { claim: 0 },
  'pado-scratchcard': { 'scratchcard-purchase': 2 },
  'daily-mission': {
    'dex-first': 10,
    'lottery-first': 10,
    'governance-first': 20,
    'perp-first': 10,
    'scratchcard-first': 10,
    'baram-first': 12,
    'tier-4': 5,
    'tier-5': 10,
    'all-clear': 20,
  },
} as const;

export const GENESIS_PASS_MULTIPLIER = 2.0; // Forward-only: existing 1.5x records remain immutable
export const VOLUME_TIER_CAP = 3.0;

// --- Scanner parameters ---

export const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (reduced for daily mission freshness)
export const BATCH_SIZE = 1000;
export const WALLET_CACHE_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours

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
    '0xd56f405af7127a15e30a5104ec91574a7483699e5ac1d74383ed5478aee43900',
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

// Build event mapping table
// NOTE: Event type names must match exactly what the Move contracts emit.
// After first scan, check logs for "[Points] Unmatched event" to discover
// missing mappings and update this table.
const EVENT_MAP_ENTRIES: [string, string, string, EventMapping][] = [
  // [packageHex, module, typeName, mapping]

  // Pado DEX (DeepBook v2)
  // Actual modules: order_info (OrderPlaced, OrderInfo), order (OrderCanceled)
  [PKG.deepbook, 'order_info', 'OrderPlaced', { category: 'pado-dex', activityType: 'limit-order' }],
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
