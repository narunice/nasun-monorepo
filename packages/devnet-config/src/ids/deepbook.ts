/**
 * DeepBook V3 Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, DeepBookConfig } from '../types';

export const DEEP_TOKEN_PACKAGE_ID = config.deepbook.tokenPackageId as ObjectId;
export const DEEPBOOK_PACKAGE_ID = config.deepbook.packageId as ObjectId;
export const DEEPBOOK_REGISTRY = config.deepbook.registry as ObjectId;
export const DEEPBOOK_ADMIN_CAP = config.deepbook.adminCap as ObjectId;

export const DEEPBOOK: DeepBookConfig = {
  tokenPackageId: DEEP_TOKEN_PACKAGE_ID,
  packageId: DEEPBOOK_PACKAGE_ID,
  registry: DEEPBOOK_REGISTRY,
  adminCap: DEEPBOOK_ADMIN_CAP,
};
