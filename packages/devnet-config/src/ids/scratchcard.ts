/**
 * Scratchcard Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, ScratchcardConfig } from '../types';

export const SCRATCHCARD_PACKAGE_ID = config.scratchcard.packageId as ObjectId;
export const SCRATCHCARD_POOL = config.scratchcard.pool as ObjectId;
export const SCRATCHCARD_ADMIN_CAP = config.scratchcard.adminCap as ObjectId;
export const SCRATCHCARD_UPGRADE_CAP = config.scratchcard.upgradeCap as ObjectId;

export const SCRATCHCARD: ScratchcardConfig = {
  packageId: SCRATCHCARD_PACKAGE_ID,
  pool: SCRATCHCARD_POOL,
  adminCap: SCRATCHCARD_ADMIN_CAP,
  upgradeCap: SCRATCHCARD_UPGRADE_CAP,
};
