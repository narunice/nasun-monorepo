/**
 * @nasun/devnet-config
 *
 * Centralized configuration for Nasun Devnet IDs.
 * This package provides type-safe access to all contract addresses and network configuration.
 *
 * Usage:
 *   import { TOKENS, DEEPBOOK, NETWORK } from '@nasun/devnet-config';
 *   // or
 *   import { NBTC_TYPE, NUSDC_TYPE } from '@nasun/devnet-config/ids';
 *
 * After devnet reset:
 *   1. Update packages/devnet-config/devnet-ids.json
 *   2. Run: pnpm devnet:sync
 */

// Re-export all types
export * from './types';

// Re-export all IDs
export * from './ids';

// Contract registry
export { createContractRegistry } from './registry';

// Export raw config for scripts
import config from '../devnet-ids.json';
export { config as devnetConfig };

// Version info
export const DEVNET_VERSION = config.version;
export const DEVNET_LAST_UPDATED = config.lastUpdated;
