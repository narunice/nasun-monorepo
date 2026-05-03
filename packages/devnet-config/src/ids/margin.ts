/**
 * Unified Margin Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId } from '../types';

export const MARGIN_PACKAGE_ID = config.margin.packageId as ObjectId;
export const MARGIN_REGISTRY_ID = config.margin.registry as ObjectId;
