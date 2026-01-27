/**
 * Lottery Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, LotteryConfig } from '../types';

export const LOTTERY_PACKAGE_ID = config.lottery.packageId as ObjectId;
export const LOTTERY_REGISTRY = config.lottery.registry as ObjectId;
export const LOTTERY_ADMIN_CAP = config.lottery.adminCap as ObjectId;
export const LOTTERY_UPGRADE_CAP = config.lottery.upgradeCap as ObjectId;

export const LOTTERY: LotteryConfig = {
  packageId: LOTTERY_PACKAGE_ID,
  registry: LOTTERY_REGISTRY,
  adminCap: LOTTERY_ADMIN_CAP,
  upgradeCap: LOTTERY_UPGRADE_CAP,
};
