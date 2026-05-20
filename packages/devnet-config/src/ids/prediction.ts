/**
 * Prediction Market Configuration
 *
 * `packageId` (latest published-at) — used as moveCall target.
 * `originalPackageId` (first publish, Immutable) — used to identify Position /
 *   Market / event types. Sui anchors object types to the original Package ID,
 *   so after an upgrade existing Position NFTs still report the original ID
 *   in their type signature.
 *
 * 2026-05-20 v5 fresh publish:
 *   `PREDICTION_*`           — v5 (canonical, used for all new markets).
 *   `PREDICTION_LEGACY_*`    — v1~v4 frozen state (markets created before
 *                              cutover still resolve via these IDs).
 *   `PREDICTION_ORIGINAL_IDS` — discovery filter; markets may carry either
 *                              originalId in their type tag.
 *   `packageIdForMarketType()` — dispatch moveCall target by market type.
 */
import config from '../../devnet-ids.json';
import type {
  ObjectId,
  PredictionConfig,
  PredictionLegacyConfig,
} from '../types';

export const PREDICTION_PACKAGE_ID = config.prediction.packageId as ObjectId;
export const PREDICTION_ORIGINAL_PACKAGE_ID = (
  config.prediction.originalPackageId ?? config.prediction.packageId
) as ObjectId;
export const PREDICTION_ADMIN_CAP = config.prediction.adminCap as ObjectId;

export const PREDICTION: PredictionConfig = {
  packageId: PREDICTION_PACKAGE_ID,
  originalPackageId: PREDICTION_ORIGINAL_PACKAGE_ID,
  adminCap: PREDICTION_ADMIN_CAP,
};

// ===== Legacy (pre-2026-05-20 cutover) =====
//
// Surfaced even when prediction_legacy block is absent so consumers can branch
// safely; fields default to the current PREDICTION values, which makes the
// "two-id discovery" path collapse to a single-id path when no legacy exists.
const legacyRaw = (config as { prediction_legacy?: PredictionLegacyConfig })
  .prediction_legacy;

export const PREDICTION_LEGACY_PACKAGE_ID = (legacyRaw?.packageId ??
  PREDICTION_PACKAGE_ID) as ObjectId;
export const PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID = (legacyRaw?.originalPackageId ??
  PREDICTION_ORIGINAL_PACKAGE_ID) as ObjectId;
export const PREDICTION_LEGACY_ADMIN_CAP = (legacyRaw?.adminCap ??
  PREDICTION_ADMIN_CAP) as ObjectId;

export const PREDICTION_LEGACY: PredictionLegacyConfig | null = legacyRaw
  ? {
      packageId: legacyRaw.packageId as ObjectId,
      originalPackageId: legacyRaw.originalPackageId as ObjectId,
      adminCap: legacyRaw.adminCap as ObjectId,
      upgradeCap: legacyRaw.upgradeCap as ObjectId,
      cutoverDate: legacyRaw.cutoverDate,
      notes: legacyRaw.notes,
    }
  : null;

/**
 * Discovery filter: a Sui Market/Position object's type tag is anchored to
 * the originalPackageId at creation time. After a fresh v5 publish, two
 * distinct originalIds coexist on chain, so consumers that listen for
 * `<originalId>::prediction_market::Market` must accept both.
 *
 * Deduplicated when legacy is absent.
 */
export const PREDICTION_ORIGINAL_IDS: readonly ObjectId[] =
  PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID === PREDICTION_ORIGINAL_PACKAGE_ID
    ? [PREDICTION_ORIGINAL_PACKAGE_ID]
    : [PREDICTION_ORIGINAL_PACKAGE_ID, PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID];

/**
 * Dispatch the correct moveCall package for a market based on its on-chain
 * object type. Sui type-tags carry originalPackageId, not the latest
 * published-at, so this is the authoritative source of "which package owns
 * this market".
 *
 * Throws on unknown type to fail loud rather than silently route to the wrong
 * package (which would either revert in Move or — worse — succeed in an
 * unintended package).
 */
export function packageIdForMarketType(marketObjectType: string): ObjectId {
  if (marketObjectType.startsWith(`${PREDICTION_ORIGINAL_PACKAGE_ID}::`)) {
    return PREDICTION_PACKAGE_ID;
  }
  if (
    PREDICTION_LEGACY &&
    marketObjectType.startsWith(`${PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID}::`)
  ) {
    return PREDICTION_LEGACY_PACKAGE_ID;
  }
  throw new Error(
    `Unknown prediction market package origin in type: ${marketObjectType}`,
  );
}

/**
 * Same dispatch but returns the AdminCap appropriate for a given market.
 * Admin functions on legacy markets require the legacy AdminCap; v5 markets
 * require the v5 AdminCap. Cross-using will fail with type mismatch.
 */
export function adminCapForMarketType(marketObjectType: string): ObjectId {
  if (marketObjectType.startsWith(`${PREDICTION_ORIGINAL_PACKAGE_ID}::`)) {
    return PREDICTION_ADMIN_CAP;
  }
  if (
    PREDICTION_LEGACY &&
    marketObjectType.startsWith(`${PREDICTION_LEGACY_ORIGINAL_PACKAGE_ID}::`)
  ) {
    return PREDICTION_LEGACY_ADMIN_CAP;
  }
  throw new Error(
    `Unknown prediction market package origin in type: ${marketObjectType}`,
  );
}
