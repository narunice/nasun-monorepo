/**
 * nasun_tier (Nasun Standing Index tier registry) — Phase 4 (2026-05-25).
 *
 * The TierRegistry is the on-chain source of truth for each operator's
 * NSI-derived tier (1/2/3). Off-chain tier-push-worker pushes batch updates
 * via the AdminCap; downstream Move packages (Pado fee discount, GoStop
 * max bet floor, Vault manager eligibility) read tier through
 * `nasun_tier::tier::get(registry, addr)`.
 *
 * UpgradeCap is intentionally cold-kept by the publisher (Phase 4 D6).
 */
import config from '../../devnet-ids.json';
import type { ObjectId, SuiAddress, NasunTierConfig } from '../types';

export const NASUN_TIER_PACKAGE_ID = config.nasunTier.packageId as ObjectId;
export const NASUN_TIER_ORIGINAL_PACKAGE_ID = config.nasunTier
  .originalPackageId as ObjectId;
export const NASUN_TIER_REGISTRY_ID = config.nasunTier.registry as ObjectId;
export const NASUN_TIER_ADMIN_CAP_ID = config.nasunTier.adminCap as ObjectId;
export const NASUN_TIER_UPGRADE_CAP_ID = config.nasunTier.upgradeCap as ObjectId;

export const NASUN_TIER: NasunTierConfig = {
  packageId: NASUN_TIER_PACKAGE_ID,
  originalPackageId: NASUN_TIER_ORIGINAL_PACKAGE_ID,
  registry: NASUN_TIER_REGISTRY_ID,
  adminCap: NASUN_TIER_ADMIN_CAP_ID,
  upgradeCap: NASUN_TIER_UPGRADE_CAP_ID,
  adminAddress: config.nasunTier.adminAddress as SuiAddress,
  upgradeCapHolder: config.nasunTier.upgradeCapHolder as SuiAddress,
};
