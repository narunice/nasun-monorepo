/**
 * Number Match Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, NumberMatchConfig } from '../types';

export const NUMBERMATCH_PACKAGE_ID = config.numbermatch.packageId as ObjectId;
export const NUMBERMATCH_ORIGINAL_PACKAGE_ID = (config.numbermatch.originalPackageId ?? config.numbermatch.packageId) as ObjectId;
export const NUMBERMATCH_POOL = config.numbermatch.pool as ObjectId;
export const NUMBERMATCH_ADMIN_CAP = config.numbermatch.adminCap as ObjectId;
export const NUMBERMATCH_UPGRADE_CAP = config.numbermatch.upgradeCap as ObjectId;

export const NUMBERMATCH: NumberMatchConfig = {
  packageId: NUMBERMATCH_PACKAGE_ID,
  originalPackageId: NUMBERMATCH_ORIGINAL_PACKAGE_ID,
  pool: NUMBERMATCH_POOL,
  adminCap: NUMBERMATCH_ADMIN_CAP,
  upgradeCap: NUMBERMATCH_UPGRADE_CAP,
};
