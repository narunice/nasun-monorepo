/**
 * Baram AI Settlement Layer Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, BaramConfig } from '../types';
import { NUSDC_TYPE } from './tokens';

export const BARAM_PACKAGE_ID = config.baram.packageId as ObjectId;
export const BARAM_REGISTRY = config.baram.registry as ObjectId;
export const BARAM_UPGRADE_CAP = config.baram.upgradeCap as ObjectId;

export const EXECUTOR_PACKAGE_ID = config.baram.executorPackageId as ObjectId;
export const EXECUTOR_REGISTRY = config.baram.executorRegistry as ObjectId;
export const EXECUTOR_ADMIN_CAP = config.baram.executorAdminCap as ObjectId;

// Baram now uses the unified devnet_tokens NUSDC
// Note: Requires baram contract redeployment to use devnet_tokens::nusdc::NUSDC
export const BARAM: BaramConfig = {
  packageId: BARAM_PACKAGE_ID,
  registry: BARAM_REGISTRY,
  upgradeCap: BARAM_UPGRADE_CAP,
  executorPackageId: EXECUTOR_PACKAGE_ID,
  executorRegistry: EXECUTOR_REGISTRY,
  executorAdminCap: EXECUTOR_ADMIN_CAP,
  nusdcType: NUSDC_TYPE,
};
