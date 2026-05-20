/**
 * Prediction Market Constants
 *
 * IDs imported from @nasun/devnet-config for centralized management.
 * Caps mirror the deployed Move contract's constants — keep in sync.
 * (See plan §4.1 single-source-of-truth checklist; if Move caps are tuned
 * after gas dry-run, mirror the change here.)
 *
 * 2026-05-20 v5 fresh-publish cutover:
 *   - Singular `PREDICTION_*` constants point at v5 (canonical going forward).
 *   - `LEGACY_*` mirrors freeze v1~v4 state for in-flight markets.
 *   - Type/event filters surface both as arrays (MARKET_TYPES, *_EVENTS) so
 *     discovery accepts markets from either originalId.
 *   - `getMarketPackage(marketId)` / `registerMarketPackage` is the
 *     authoritative dispatch: callers don't pass packageId, they pass
 *     marketId and the registry resolves to v5 or legacy based on what
 *     `fetchMarket` saw on-chain.
 */

import {
  PREDICTION,
  NUSDC_TYPE as DEVNET_NUSDC_TYPE,
  PREDICTION_LEGACY,
  PREDICTION_LEGACY_PACKAGE_ID as CFG_LEGACY_PACKAGE_ID,
  PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID as CFG_LEGACY_ORIGINAL_PACKAGE_ID,
  PREDICTION_LEGACY_ADMIN_CAP as CFG_LEGACY_ADMIN_CAP,
  PREDICTION_ORIGINAL_IDS as CFG_PREDICTION_ORIGINAL_IDS,
  packageIdForMarketType as cfgPackageIdForMarketType,
  adminCapForMarketType as cfgAdminCapForMarketType,
} from '@nasun/devnet-config';

// Canonical (v5) IDs. moveCall targets — used when a market has no legacy
// match (i.e. all new markets created after 2026-05-20).
export const PREDICTION_PACKAGE_ID = PREDICTION.packageId;
export const PREDICTION_ORIGINAL_PACKAGE_ID =
  PREDICTION.originalPackageId ?? PREDICTION.packageId;
export const PREDICTION_ADMIN_CAP = PREDICTION.adminCap;

// Legacy (v1~v4) IDs. Frozen 2026-05-20.
export const LEGACY_PREDICTION_PACKAGE_ID = CFG_LEGACY_PACKAGE_ID;
export const LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID = CFG_LEGACY_ORIGINAL_PACKAGE_ID;
export const LEGACY_PREDICTION_ADMIN_CAP = CFG_LEGACY_ADMIN_CAP;

// Surface the legacy block itself so admin code can decide whether to render
// legacy-only UI sections.
export { PREDICTION_LEGACY };

// Admin multisig address (acts as resolver for all markets). For dev, use the
// deployer/admin account from devnet-config. Pre-launch this becomes the real
// multisig address generated via team key ceremony.
import { ADMIN_ADDRESS } from '@nasun/devnet-config';
export const ADMIN_MULTISIG_ADDRESS: string = ADMIN_ADDRESS;

// Type names — anchored to original package ID. Sui type-tags carry the
// originalId, not the latest publish, so type filters must cover both v5 and
// legacy originalIds when querying for objects/events across the cutover.
export const MARKET_TYPE = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::AdminCap`;

export const LEGACY_MARKET_TYPE = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::Market`;
export const LEGACY_POSITION_TYPE = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::Position`;
export const LEGACY_ADMIN_CAP_TYPE = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::AdminCap`;

// Union arrays for discovery (deduped if legacy == v5).
function dedupe<T>(xs: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) if (!seen.has(x)) { seen.add(x); out.push(x); }
  return out;
}

export const PREDICTION_ORIGINAL_IDS: readonly string[] = CFG_PREDICTION_ORIGINAL_IDS;
export const MARKET_TYPES: readonly string[] = dedupe([MARKET_TYPE, LEGACY_MARKET_TYPE]);
export const POSITION_TYPES: readonly string[] = dedupe([POSITION_TYPE, LEGACY_POSITION_TYPE]);

// Event type identifiers — also anchored to original package ID.
//
// DO NOT use the singular `*_EVENT` constants below for runtime filtering of
// SuiEvent.type or SuiObjectChange.objectType. They cover v5 only, so any
// comparison against legacy markets silently drops events. Always use the
// plural `*_EVENTS` arrays (or `POSITION_TYPES` / `MARKET_TYPES`) defined
// below; they include both v5 and legacy originalIds. The singulars exist
// only to compose those arrays and to build moveCall targets for v5-only
// admin paths. (Lesson from the 2026-05-21 silent-drop incident, where
// `parseFillsFromEvents` filtered with the singular constant and zeroed out
// every legacy-market trade's success modal.)
export const MARKET_CREATED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketCreated`;
export const ORDER_PLACED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderPlaced`;
export const ORDER_FILLED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderFilled`;
export const ORDER_CANCELLED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderCancelled`;
export const MARKET_RESOLVED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketResolved`;
export const MARKET_CANCELLED_EVENT = `${PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketCancelled`;

export const LEGACY_MARKET_CREATED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketCreated`;
export const LEGACY_ORDER_PLACED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderPlaced`;
export const LEGACY_ORDER_FILLED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderFilled`;
export const LEGACY_ORDER_CANCELLED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::OrderCancelled`;
export const LEGACY_MARKET_RESOLVED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketResolved`;
export const LEGACY_MARKET_CANCELLED_EVENT = `${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::prediction_market::MarketCancelled`;

export const MARKET_CREATED_EVENTS: readonly string[] =
  dedupe([MARKET_CREATED_EVENT, LEGACY_MARKET_CREATED_EVENT]);
export const ORDER_PLACED_EVENTS: readonly string[] =
  dedupe([ORDER_PLACED_EVENT, LEGACY_ORDER_PLACED_EVENT]);
export const ORDER_FILLED_EVENTS: readonly string[] =
  dedupe([ORDER_FILLED_EVENT, LEGACY_ORDER_FILLED_EVENT]);
export const ORDER_CANCELLED_EVENTS: readonly string[] =
  dedupe([ORDER_CANCELLED_EVENT, LEGACY_ORDER_CANCELLED_EVENT]);
export const MARKET_RESOLVED_EVENTS: readonly string[] =
  dedupe([MARKET_RESOLVED_EVENT, LEGACY_MARKET_RESOLVED_EVENT]);
export const MARKET_CANCELLED_EVENTS: readonly string[] =
  dedupe([MARKET_CANCELLED_EVENT, LEGACY_MARKET_CANCELLED_EVENT]);

/**
 * Module-level (per-tab) registry mapping marketId -> packageId of the
 * package that owns that market. Populated lazily by `fetchMarket` /
 * `fetchMarketsByEvents` as markets are observed on-chain. Transaction
 * builders consult this to dispatch moveCalls to the right package without
 * forcing every call-site to thread `packageId` through.
 *
 * Defaults to v5 when the registry has no entry (safer than aborting,
 * because: (1) the user could not have a Position in an unknown market, so
 * the only realistic miss is a brand-new v5 market the registry hasn't seen
 * yet; (2) a wrong packageId aborts at dryRun time, not silently).
 */
const marketPackageRegistry = new Map<string, string>();

export function registerMarketPackage(marketId: string, packageId: string): void {
  if (!marketId || !packageId) return;
  marketPackageRegistry.set(marketId, packageId);
}

export function getMarketPackage(marketId: string): string | undefined {
  return marketPackageRegistry.get(marketId);
}

export function packageForMarket(
  marketId: string,
  override?: string,
): string {
  return override ?? marketPackageRegistry.get(marketId) ?? PREDICTION_PACKAGE_ID;
}

/**
 * Same idea for AdminCap. v5 admin functions require the v5 AdminCap; legacy
 * admin functions require the legacy AdminCap. Cross-using triggers a Move
 * type-mismatch abort.
 */
const marketAdminCapRegistry = new Map<string, string>();

export function registerMarketAdminCap(marketId: string, adminCap: string): void {
  if (!marketId || !adminCap) return;
  marketAdminCapRegistry.set(marketId, adminCap);
}

export function getMarketAdminCap(marketId: string): string | undefined {
  return marketAdminCapRegistry.get(marketId);
}

export function adminCapForMarket(
  marketId: string,
  override?: string,
): string {
  return (
    override ?? marketAdminCapRegistry.get(marketId) ?? PREDICTION_ADMIN_CAP
  );
}

// Re-export the type-tag dispatch helpers from @nasun/devnet-config so
// callers that *do* have a full market object can dispatch off it directly.
export const packageIdForMarketType = cfgPackageIdForMarketType;
export const adminCapForMarketType = cfgAdminCapForMarketType;

// Price constants (basis points)
export const MAX_PRICE = 10000;       // 100%
export const PRICE_DECIMALS = 4;

// Caps mirroring Move contract (round-6 plan §1.4).
// If Move caps are reduced after gas dry-run, mirror here.
export const MAX_WALK_LEVELS = 10;
export const MAX_FIFO_PER_LEVEL = 20;
export const MAX_PRICE_LEVELS_PER_SIDE = 200;
export const MAX_PAYMENT_AMOUNT_BASE = 100_000_000_000n; // 100k NUSDC at 6 decimals
export const MAX_MINT_AMOUNT_BASE = 100_000_000_000n;

// NUSDC
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// Clock
export const CLOCK_ID = '0x6';

// Active markets (empty — markets discovered via on-chain events)
export const TEST_MARKETS: string[] = [];
