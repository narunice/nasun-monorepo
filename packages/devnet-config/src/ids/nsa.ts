/**
 * Nasun Smart Account (NSA) Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId } from '../types';

export const NSA_PACKAGE_ID = config.nsa.packageId as ObjectId;
export const NSA_UPGRADE_CAP = config.nsa.upgradeCap as ObjectId;
export const NSA_REGISTRY_ID = config.nsa.registry as ObjectId;
