/**
 * Registry index — builds dual-key lookup map from all protocol registries.
 * Maps both current and original packageIds to the same ProtocolEventGroup.
 */
import type { ProtocolEventGroup } from '../types';
import { PREDICTION_EVENTS } from './prediction';
import { LOTTERY_EVENTS } from './lottery';
import { PERPETUALS_EVENTS } from './perpetuals';
import {
  BARAM_ESCROW_EVENTS,
  BARAM_EXECUTOR_EVENTS,
  BARAM_EXECUTOR_STAKING_EVENTS,
  BARAM_EXECUTOR_TIER_EVENTS,
  BARAM_AER_EVENTS,
} from './baram';

// All protocol event groups
const ALL_GROUPS: ProtocolEventGroup[] = [
  PREDICTION_EVENTS,
  LOTTERY_EVENTS,
  PERPETUALS_EVENTS,
  BARAM_ESCROW_EVENTS,
  BARAM_EXECUTOR_EVENTS,
  BARAM_EXECUTOR_STAKING_EVENTS,
  BARAM_EXECUTOR_TIER_EVENTS,
  BARAM_AER_EVENTS,
];

// Lookup key: `${packageId}::${module}`
type LookupKey = string;

// Build lookup map: packageId::module → ProtocolEventGroup
const lookupMap = new Map<LookupKey, ProtocolEventGroup>();

for (const group of ALL_GROUPS) {
  for (const pkgId of group.packageIds) {
    // Normalize: remove leading 0x prefix differences
    const key = `${pkgId}::${group.module}`;
    lookupMap.set(key, group);
  }
}

/**
 * Find a protocol event group by packageId and module name.
 */
export function findEventGroup(packageId: string, module: string): ProtocolEventGroup | null {
  return lookupMap.get(`${packageId}::${module}`) ?? null;
}
