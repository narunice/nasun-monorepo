/**
 * nasun_vault (Phase 5 tier-3-gated DeepBook vault) — published 2026-06-01.
 *
 * `create_vault` is gated by `nasun_tier::policy::can_create_vault` (tier 3
 * only); the manager binds their AgentProfile + Capability so an agent can
 * trade vault funds via capability-constrained `execute_trade`. The
 * VaultFactory shared object whitelists a single base pool (NBTC/NUSDC).
 *
 * UpgradeCap is intentionally cold-kept by the publisher.
 */
import config from '../../devnet-ids.json';
import type { ObjectId, SuiAddress, NasunVaultConfig } from '../types';

export const NASUN_VAULT_PACKAGE_ID = config.nasunVault.packageId as ObjectId;
export const NASUN_VAULT_ORIGINAL_PACKAGE_ID = config.nasunVault
  .originalPackageId as ObjectId;
export const NASUN_VAULT_FACTORY_ID = config.nasunVault.factory as ObjectId;
export const NASUN_VAULT_FACTORY_ADMIN_CAP_ID = config.nasunVault
  .factoryAdminCap as ObjectId;
export const NASUN_VAULT_UPGRADE_CAP_ID = config.nasunVault.upgradeCap as ObjectId;
export const NASUN_VAULT_ALLOWED_BASE_POOL_ID = config.nasunVault
  .allowedBasePool as ObjectId;
export const NASUN_VAULT_WITNESS_TYPE = config.nasunVault.witnessType as string;

export const NASUN_VAULT: NasunVaultConfig = {
  packageId: NASUN_VAULT_PACKAGE_ID,
  originalPackageId: NASUN_VAULT_ORIGINAL_PACKAGE_ID,
  factory: NASUN_VAULT_FACTORY_ID,
  factoryAdminCap: NASUN_VAULT_FACTORY_ADMIN_CAP_ID,
  upgradeCap: NASUN_VAULT_UPGRADE_CAP_ID,
  upgradeCapHolder: config.nasunVault.upgradeCapHolder as SuiAddress,
  allowedBasePool: NASUN_VAULT_ALLOWED_BASE_POOL_ID,
  witnessType: NASUN_VAULT_WITNESS_TYPE,
};
